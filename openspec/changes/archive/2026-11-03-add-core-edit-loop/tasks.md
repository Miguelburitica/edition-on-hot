# Tasks

## 1. Workspace setup

- [x] 1.1 Create `packages/core`, `packages/extension` (WXT + React) and `fixtures/demo-app` (Vite + React) with TypeScript strict configs; verify `pnpm install` and `pnpm -r typecheck` succeed
- [x] 1.2 Add root scripts `lint`, `test`, `typecheck`, `spec:validate`, `dev`, `fixture`; verify each runs (possibly with no tests yet)
- [x] 1.3 Configure ESLint with `eslint-plugin-boundaries` and restricted imports/globals per design D8, plus `packages/core/test/boundaries.test.ts`, which lints deliberate violations in memory; verify those tests pass and `pnpm lint` is clean

## 2. Shared kernel and Editing domain

- [x] 2.1 Implement `shared/domain` (Result, Entity, AggregateRoot, DomainEvent, Id) with unit tests; verify `pnpm test` passes
- [x] 2.2 Implement Editing value objects `Prompt`, `ElementAnchor`, `Selection`, `PatchOp` (including the on* attribute rule) with unit tests for each factory's validation
- [x] 2.3 Implement `Changeset` and the `EditSession` aggregate (apply/undo/redo stack invariants, events `ChangesetApplied/Undone/Redone`) against the `PageGateway` port using a fake; verify tests for atomic rollback, undo order, redo clearing (change-history spec scenarios)

## 3. Editing application

- [x] 3.1 Define the ports `PageGateway`, `EditSessionRepository`, `PatchSource` and DTOs; implement `SelectElement`, `ApplyPromptToSelection`, `UndoChangeset`, `RedoChangeset`, `ListChangesets` with unit tests using in-memory fakes, covering the prompt-editing "requires a selection" and "blank request" scenarios
- [x] 3.2 Export the context's public API from `editing/application/index.ts`; verify lint blocks deep imports from outside the context

## 4. Editing infrastructure (DOM)

- [x] 4.1 Implement `DomAnchorResolver` and the anchor builder (design D5), skipping the overlay subtree; verify jsdom tests for the element-selection anchor scenarios (unchanged, sibling inserted, removed)
- [x] 4.2 Implement `HtmlSanitizer` (DOMPurify) and `ScopedStyleInjector`; verify jsdom tests for the script/on* stripping and scoped-rule-does-not-leak scenarios
- [x] 4.3 Implement `DomPageGateway` apply/revert for all seven op types; verify a jsdom test per op that apply-then-revert restores the original subtree HTML exactly
- [x] 4.4 Implement `InMemoryEditSessionRepository`; verify with the use-case test suite run against it

## 5. AI Assistance context

- [x] 5.1 Implement the domain: `ProviderConfig`, `ModelId` (sonnet default, opus), `EditContext` (with trimming and input-value stripping), `PatchProposal`, errors, ports `PatchGenerator` and `ProviderSettingsRepository`; verify unit tests for the trimming and value-stripping scenarios
- [x] 5.2 Implement the application `GeneratePatch` (missing-key refusal, one retry on invalid output) and `TestProviderConnection` with fakes; verify tests for the valid, retry and fail-after-retry scenarios
- [x] 5.3 Implement infrastructure: Zod patch schema + JSON-schema tool definition, prompt builder, `AnthropicPatchGenerator` (forced tool use, timeout, error mapping for 401/429/network); verify tests with mocked `fetch` for success, invalid JSON, 401 and timeout
- [x] 5.4 Implement Editing's `AiPatchSourceAdapter` (anti-corruption layer mapping target ids → anchors, rejecting unknown ids); verify unit tests

## 6. Extension

- [x] 6.1 Implement `messages.ts` (Zod-checked union), `createHandler` and `bridgedPatchRequester`; verify unit tests with a fake `chrome.runtime`
- [x] 6.2 Implement `ChromeLocalSettingsRepository` and the options page (save masked key, model select, test, clear); verify with unit tests on a fake storage area and the e2e options flow
- [x] 6.3 Implement the content-script picker overlay in a closed Shadow DOM (hover outline + tag label, click select, Escape cancel); verify with the e2e picker steps
- [x] 6.4 Implement the side panel (selection summary, prompt box with errors, history list, undo/redo with disabled states) (state comes from the content script; see design D7); verify with the e2e tests
- [x] 6.5 Implement the composition roots for content, background and side panel; verify `pnpm lint` passes and the production build reaches the real API from the service worker (a placeholder key returns the "key rejected" error)

## 7. Fixture and integration

- [x] 7.1 Build `fixtures/demo-app` with a sign-up form, a button row, a list and an element using a `.banner` class (for the scoping check); verify `pnpm fixture` serves it
- [x] 7.2 Add a Playwright e2e test that loads the unpacked extension with a stubbed `PatchGenerator`, then selects the form, submits "add a red banner above this form", checks the banner, undoes, redoes; verify `pnpm e2e` passes
- [x] 7.3 Run `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm spec:validate`, `pnpm e2e`; verify all pass

## Workflow follow-up

- Archive the change with `openspec archive add-core-edit-loop` after review, so the deltas become `openspec/specs/`.
- Verify `openspec list --specs` shows the five capabilities.
