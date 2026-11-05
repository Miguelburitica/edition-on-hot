# Design

## Context

See proposal.md (Why). Relevant current state:

- `addCss` is applied by `DomPageGateway.addCss`, which wraps rules with `scopeCss(css, '[data-hew-cs="<id>"]')` (`editing/infrastructure/scoped-css.ts`). Only elements inserted by the changeset carry that attribute, so rules about existing elements match nothing.
- The reserved-attribute, `on*` and `javascript:` checks live only in Editing's `validatePatchOp` (`editing/domain/patch-op.ts`). The Editing application runs them after the AI context has returned a proposal, so the AI retry loop never sees them.
- The prompt (`ai/infrastructure/prompt-builder.ts`) says "Prefer the smallest set of operations", and the wire schemas cap `ops` at 30.
- `EditSession` keeps history as an ordered list where applied changesets form a prefix and undone ones a suffix. Undo and redo move the boundary one step at a time.
- `SessionSnapshot.changesets` carries id, prompt, summary, status, time and op count only.

## Goals / Non-Goals

**Goals:**
- Selection-scoped CSS stays reversible to the exact original HTML.
- Jumping between versions reuses the existing undo/redo invariants; there is no second history model.
- Visibility checks run in the gateway (infrastructure); the domain only stores and reports warnings.

**Non-Goals:**
- Exact visual diffing, or screenshot comparison between versions.
- Branching histories.

## Decisions

### D1. Selection-scoped stylesheet rules (Editing)

- `PatchOp` `addCss` gains `scope?: ElementAnchor`. `AiPatchSourceAdapter` sets it to the selection anchor (`t0`) for every `addCss` op, so the AI wire format doesn't change.
- `DomPageGateway.addCss` resolves the scope element, adds the changeset id to its `data-hew-scope` attribute (space-separated, because several changesets can scope the same element), and records the previous attribute value for revert.
- `scopeCss` takes a list of scope selectors: `[data-hew-scope~="<id>"]` and `[data-hew-cs="<id>"]`. Each selector gets descendant and compound forms for each scope, so `li` becomes `[data-hew-scope~="cs1"] li, [data-hew-cs="cs1"] li, …` and a selector whose first compound names the scope element also matches it: `.list li` becomes `[scope].list li`, and a leading type selector gets the scope glued after it, so `ul.list li` becomes `ul[scope].list li`. (The first real-model eval found that tag-led selectors such as `ul.list li` matched nothing; this form fixes it.)
- Revert removes the `<style>` element and restores the exact previous `data-hew-scope` value (or removes the attribute), keeping the "revert restores HTML exactly" guarantee.
- `data-hew-scope` joins the reserved prefix, so the existing reserved-attribute rule covers it.
- If the scope can't be resolved, the op fails with `anchor-not-found` like any other targeted op, and the changeset rolls back.

*Alternative:* let rules apply page-wide. Rejected: one prompt could restyle the whole site, and the spec keeps rules from leaking.

### D2. Visibility warnings (Editing)

- New domain type `OpWarning = { kind: 'no-match' | 'hidden-target'; detail: string }`.
- `AppliedOp` gains `warning?: OpWarning`. `Changeset.warnings` lists them (with op index), and `ChangesetView` exposes them.
- `PageGateway` gains `review(applied)`, called by `EditSession` once every op of a changeset is applied, so a rule that styles an element inserted by a *later* op is not flagged. Stylesheet checks run there; target checks run in `apply`, before the op, so only already-hidden targets are flagged:
  - `addCss`: each top-level scoped selector list (after scoping) is run with `querySelectorAll`. If none matches, the warning names the first 80 characters of the original rule.
  - `setStyle` / `setAttr` / `setText` / `replace`: `hidden-target` when the target, or for `replace` every inserted element, is not rendered. "Rendered" is `checkVisibility()` where available; otherwise (jsdom) it falls back to walking ancestors for `display: none`, `visibility: hidden` and the `hidden` attribute.
  - `insert`: `hidden-target` when none of the inserted elements is rendered.
  - `remove`: never warns.
  - `setStyle` that itself sets `display: none` or `visibility: hidden`: not flagged, because the check compares the target's visibility before and after, and only flags targets that were already hidden before the op.
- Warnings never fail a changeset (spec).

### D2b. Anchors stay resolvable during a changeset (found during implementation)

A changeset that prepends into the selection and then targets the selection again (another style op, or the scope of an `addCss`) failed with `anchor-not-found`: the selection's text fingerprint now included the inserted text. Two fixes:
- `pageText` (dom-utils) skips text inside `[data-hew-cs]`. Both `buildAnchor` and `DomAnchorResolver` use it, so fingerprints describe the page's own content before and after edits.
- `DomPageGateway` remembers, per changeset id, the element each anchor resolved to and reuses it while it is still connected. This also covers ops that change a target's own text (`setText` and then `setStyle` on the same target).

### D3. Unsafe-op policy in the AI context

`PatchProposal.fromDraft` adds issues for `setAttr` names matching `on*` or `data-hew*`, for values starting with `javascript:`, and for `setStyle` properties that aren't valid CSS property names. The messages tell the model what to do instead, for example "data-hew-* attributes are reserved for the extension; use a data- attribute without the hew prefix or a class". The Editing domain keeps its own checks as defense in depth, so each context owns its rules (no shared kernel).

### D4. Broader edits (AI infrastructure)

- The `ops` limit becomes 60 in both wire schemas. The strict schema has no `maxItems` (strict modes vary on it); the parser enforces the limit.
- The system prompt's rules change:
  - "Prefer the smallest set of operations" is replaced with "Apply the request completely, to every element it concerns. Bold, visible changes are welcome when the request asks for them."
  - addCss: "addCss rules apply to the selected element (t0), everything inside it, and elements you insert; use them for repeated items (e.g. `li`, `:nth-child(odd)`) instead of styling items one by one."
  - "Use replace on t0 to restructure layout when the request implies it."
  - "Never invent data-hew-* attributes."
- The `prompted` example shows a selection-scoped rule.

### D5. Version timeline (Editing)

- A version number `v` in `0..n`, where `n = history.length` and `v` is the number of applied changesets (always a prefix).
- `EditSession.currentVersion` = count of applied changesets.
- `EditSession.goTo(v, page, now)` calls `undo` while `current > v` and `redo` while `current < v`. A failed redo stops there and returns the error; the session stays at the last good version (spec).
- Events are recorded per step, as today.
- New use case `GoToVersion { sessionId, version }`. `SessionSnapshot` gains `currentVersion` and `versionCount`.
- Applying a new changeset already discards the undone suffix (existing invariant), so "new change from an earlier version" needs no new domain logic.
- The UI warning is presentation: it shows when `currentVersion < versionCount`.

### D6. Side panel history

- History is rendered oldest-first as a timeline:
  - The first row is **Original**.
  - Each changeset row shows its summary, status and an expand toggle.
  - The current row has a "viewing" marker; rows after it are dimmed (undone).
- Clicking a row sends `editing/goToVersion`.
- Expanded rows list ops as `type → target` labels from `ChangesetView.ops` (`{ type, target: string | null }`, where the target is `ElementAnchor` tag plus selector shortened to 60 characters), followed by warnings.
- Status reads "applied with warnings" when there are warnings.
- When viewing an earlier version, a note sits above **Apply**: "Applying will replace N later versions."
- Undo and Redo stay as shortcuts for ±1.

### D7. Eval cases

Three new cases on the demo fixture:
- **`alternating-borders`** (select `ul.list`): every `li` has a non-zero border, and odd and even items have different border colors.
- **`card-every-item`** (select `ul.list`): every `li` has a border and a border radius > 0. This exercises the repeated-items path where styling only the first item fails.
- **`form-fills-space`** (select `section.card`): "make this form use all the available space, inputs grow as much as they can". Both inputs end up with `width: 100%` or `flex-grow ≥ 1`.

Each case gets a reference patch for `--dry-run`. The reference patches use the new selection-scoped `addCss`, so the dry run proves D1 end to end.

### D8. Ancestor layout in the context (found by the eval)

The first real-model eval failed `form-fills-space` in every run: the model saw the parent only as `main`, so it could not know that filling the row means spanning a two-column grid. `buildSelectionContext` (Editing infrastructure) now describes each ancestor that is a grid or flex container with its layout, for example `main (display: grid; grid-template-columns: 1fr 1fr; gap: 24px)`, and adds the selection's own layout properties (`width`, `max-width`, `flex`, `flex-direction`, `grid-column`, `grid-template-columns`) to its computed styles. `SelectionContext.ancestors` stays a list of strings, so no port or DTO changes. The prompt (AI infrastructure) says the ancestors carry their layout and tells the model to use it when a request is about space or size, for example `grid-column: 1 / -1` to span a grid row or `flex: 1` inside a flex row.

The eval now also saves each result's final ops and raw model output in the results file, so failures can be diagnosed without re-running.

The saved ops showed the remaining "every item" failures: models wrote stylesheet rules against target ids (`t0 li`, `[data-hew-target="t0"] > li`), which exist only in the HTML they were shown. The repair step (AI domain, new kind `scope-selector`) rewrites references to t0 into the standard `:scope`, and `scopeCss` maps `:scope` to the selection. Any other target id or `data-hew` in a rule, and a `setAttr` whose name is an op type (GLM sent `name: "addCss"`), become issues that the retry explains. The prompt says to write `:scope` for t0.

## Risks / Trade-offs

- [Selection-scoped rules lose to page rules with higher specificity] → scoped selectors add one attribute selector of specificity, which beats most class-based page rules. The prompt allows `!important` for overrides. no-match warnings don't detect "matched but overridden", which is accepted for now.
- [Broader prompts make larger, riskier edits] → undo, the timeline and warnings make them cheap to revert. The eval cases measure regressions on the existing 10 cases.
- [Visibility checks can be wrong for elements rendered off-screen or in closed `<details>`] → warnings are advisory and never fail a changeset.
- [Jumping across many versions re-applies ops one changeset at a time] → fine for typical histories; there's no batching.
- [`checkVisibility()` is unavailable in jsdom] → the fallback is used in unit tests; Chrome uses the native API.

## Migration Plan

No stored data changes; sessions live in memory.

## Open Questions

- Whether broad requests need the standard context profile for OpenRouter models. To be decided from the new eval cases.
