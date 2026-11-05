# Proposal

## Why

The first real-world use, on GitHub's repository list and profile page, showed the editor falls short exactly where product owners need it:
- **Requests about every item can't be expressed.** "Give every card alternating borders" became a stylesheet rule that matched nothing, because added CSS only applies to elements the changeset inserted. "Make each item a card" styled only the first item.
- **"Applied" doesn't mean visible.** Both changes above were reported as applied while nothing (or almost nothing) changed on screen. A six-operation layout change showed no visible effect, and there was no way to see what it touched.
- **Model mistakes leak to the user.** The model copied our `data-hew-` prefix into an attribute name. The page side rejected it, but only after the AI side had accepted the answer, so the retry was never used and the user saw "Attribute "data-hew-submit-hook" is reserved."
- **Edits are too timid.** The prompt tells the model to prefer the smallest set of operations.
- **Versions can't be compared.** The user wants to click "Original" or any step in the history and see the page as it was at that point.

## What Changes

- **Stylesheet rules can style the selection.** Added CSS applies to the selected element, everything inside it, and the elements the changeset inserted. It still never affects the rest of the page. The selection is marked while the change is applied, and undo removes the mark.
- **Edits may be broad.** The prompt asks for complete changes covering every element the request concerns, explains selection-scoped CSS for repeated items, and allows restructuring. The operation limit rises from 30 to 60.
- **Unsafe operations are rejected during proposal validation.** Reserved `data-hew-*` attributes, event-handler attributes and `javascript:` URLs become validation issues on the AI side, so the one retry handles them like any other invalid output.
- **Changes with no visible effect are flagged.** After applying, each operation is checked: a stylesheet rule that matches no element, or an edit that lands on a hidden element, adds a warning to the changeset. The history shows "applied with warnings" and the reasons.
- **History shows operations.** Each history entry expands to list its operations, the elements they target, and any warnings.
- **Version timeline.** The history becomes Original → step 1 → step 2 …, with the current version marked. Clicking an entry shows the page at that version. Applying a new change while viewing an earlier version discards the later versions, and the panel says so first.
- **Eval cases for broad requests:** alternating borders on every item, a card for every item, and a form that fills the available space.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `patch-application`: added styles are scoped to the selection subtree as well as inserted elements; operations without a visible effect are flagged.
- `prompt-editing`: unsafe operations become validation issues before the retry; proposals may contain up to 60 operations.
- `change-history`: jump to any version, including the original; history lists each changeset's operations and warnings.

## Bounded contexts and layers touched

- **Editing**: domain (`addCss` op carries a scope anchor; `OpWarning` on applied ops and changesets; `EditSession.goTo(version)`), application (`GoToVersion` use case; snapshot gains ops, warnings and the current version), infrastructure (selection-scoped CSS with reversible marking, visibility checks in `DomPageGateway`, ACL adapter sets the `addCss` scope).
- **AI Assistance**: domain (unsafe-op policy in `PatchProposal.fromDraft`), infrastructure (prompt rewrite, op limit 60).
- **Extension**: presentation (timeline history with expandable entries and warnings), infrastructure (`editing/goToVersion` command).
- **Eval**: three new cases.

## Out of scope

- Branching histories. Applying a change from an earlier version replaces the later versions, as redo does today.
- Side-by-side or overlay comparison views, and press-and-hold "peek at original".
- Persisting versions across reloads, and re-applying after framework re-renders (still phase 2).
- Fixing the possible GitHub duplicate-element anchor issue. The new operation list and hidden-target warnings will show whether it happens, and it gets its own change if it does.
- Changing the context budgets. The new eval cases will show whether broad requests need the standard profile.

## Impact

- `PatchOp` `addCss` gains an optional scope anchor. The Anthropic and OpenRouter wire formats do not change, because the adapter fills the scope in.
- `PageGateway.apply` results gain an optional warning; `SessionSnapshot` gains per-changeset ops and warnings and the current version.
- New content-script command `editing/goToVersion`.
- No new dependencies or permissions.
