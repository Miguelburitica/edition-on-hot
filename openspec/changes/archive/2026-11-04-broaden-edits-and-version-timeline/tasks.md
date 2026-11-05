# Tasks

## 1. Editing domain

- [x] 1.1 Add `scope?: ElementAnchor` to the `addCss` op and `OpWarning`; extend `AppliedOp` with `warning?` and `Changeset` with `warnings`; verify domain tests for validation of a scoped addCss and for warnings surviving undo/redo bookkeeping
- [x] 1.2 Add `EditSession.currentVersion` and `goTo(version)` built on undo/redo; verify tests for jumping to 0, jumping forward, out-of-range versions, a failed redo stopping at the last good version, and that applying a new changeset from an earlier version discards later ones

## 2. Editing application

- [x] 2.1 Add `GoToVersion`; extend `SessionSnapshot` with `currentVersion`, `versionCount`, and per-changeset `ops` (`{ type, target }`) and `warnings`; verify use-case tests with the fake gateway, including warnings reported by the gateway

## 3. Editing infrastructure

- [x] 3.1 Make `scopeCss` take several scopes and have `DomPageGateway.addCss` mark the scope element with `data-hew-scope` (space-separated) and restore it exactly on revert; verify jsdom tests for "rule styles every item in the selection", "rule styles inserted elements outside the selection", "scoped rule does not leak", and "undo removes the selection mark" (HTML equality)
- [x] 3.2 Add visibility checks and warnings to `DomPageGateway` per design D2; verify jsdom tests for a no-match rule, a hidden target, an insert into a hidden container, intentional hiding not flagged, and remove never flagged
- [x] 3.3 Make `AiPatchSourceAdapter` set the selection anchor as scope on every `addCss` op; verify an adapter test
- [x] 3.4 Fix anchor resolution inside a changeset (found by the new eval reference patches): fingerprints ignore extension-inserted content in both the anchor builder and the resolver, and the gateway reuses the element an anchor resolved to for the rest of the changeset; verify jsdom tests for prepend-then-restyle of the same target, a new changeset after an earlier insert, and builder/resolver fingerprint agreement

## 4. AI Assistance

- [x] 4.1 Add the unsafe-op policy to `PatchProposal.fromDraft` (design D3); verify domain tests for `data-hew-*`, `on*` and `javascript:` issues, and a `GeneratePatch` test showing a reserved attribute triggers the retry with that issue
- [x] 4.2 Raise the op limit to 60 in the parser and Anthropic schema, rewrite the prompt rules and prompted example (design D4); verify tests that 45 ops parse, 61 do not, and the system prompt contains the selection-scoped addCss guidance and not "smallest set"

## 5. Extension

- [x] 5.1 Add the `editing/goToVersion` command (Zod schema, content-root handler); verify the messages unit test and `pnpm lint`
- [x] 5.2 Rebuild the side panel history as a timeline (Original row, current marker, dimmed later versions, click to jump), with expandable ops and warnings, "applied with warnings" status, and the "Applying will replace N later versions" note; verify with the e2e tests in 5.3
- [x] 5.3 Extend e2e: apply two changes, jump to Original and to step 1 checking the page each time, apply a new change from step 1 and see later versions replaced; make the e2e fake answer with a selection-scoped rule for an "every item" prompt and a no-match rule for another, then check every item is styled and the warning shows; verify `pnpm e2e` passes

## 6. Eval

- [x] 6.1 Add the `alternating-borders`, `card-every-item` and `form-fills-space` cases with reference patches (design D7); verify `pnpm eval --dry-run` passes all 13 cases and the "checks fail on the untouched page" test covers the new ones

## 7. Integration

- [x] 7.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm spec:validate`, `pnpm e2e`; verify all pass
- [x] 7.2 With the user's OpenRouter key, run `pnpm eval --model z-ai/glm-5.3-flash --model anthropic/claude-haiku-5.5 --repeat 3` and report the results, comparing the original 10 cases with the previous run

## 8. Ancestor layout (design D8)

- [x] 8.1 `buildSelectionContext` describes grid and flex ancestors with their layout and adds the selection's layout properties to its styles; unit tests for a grid parent, a flex parent and a block parent (no layout suffix)
- [x] 8.2 The prompt says ancestors carry their layout and how to use it for space and size requests; prompt-builder test
- [x] 8.3 The eval saves each result's ops and raw output in the results file; eval test
- [x] 8.5 Repair rewrites t0 references in addCss to `:scope`, which `scopeCss` maps to the selection; other target ids or `data-hew` in rules and op types used as attribute names become retry issues; the prompt says to use `:scope`; unit tests for each
- [x] 8.4 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm spec:validate`, `pnpm e2e`, then the real eval with `--repeat 3`, and report `form-fills-space`

## Workflow follow-up

- Archive the change after review.
- Decide from 7.2 whether OpenRouter should default to the standard context profile.
