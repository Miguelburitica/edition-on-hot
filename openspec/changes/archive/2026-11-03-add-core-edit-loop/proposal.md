# Proposal

## Why

Product owners have no fast way to try a UI idea on the real running product. Today an idea goes into a mockup or a ticket and waits for a developer. This change delivers the core loop that proves the product works: select an element on any page, describe a change, see it applied live, and undo it. The rest of the system (design system, persistence, handoff to PRs) is built on this loop.

## What Changes

- New pnpm monorepo with `packages/core` (bounded contexts in DDD layers), `packages/extension` (Chrome MV3 via WXT + React) and `fixtures/demo-app` (a test page).
- Element picker: the user hovers and clicks to select an element on the current page. The selection becomes a durable `ElementAnchor`.
- Prompt editing: the user writes a natural-language request for the selection. The AI Assistance context sends it, together with the trimmed element context, to the configured LLM and gets back a validated `PatchProposal` made of structured patch ops. The model's output is never executed as JavaScript.
- Patch application: the Editing context applies the ops to the live DOM, with HTML sanitized and CSS scoped, and records an inverse op for each one.
- Change history: every applied prompt is a `Changeset` in the tab's `EditSession`, with undo/redo in stack order.
- LLM provider settings: the user stores their own Anthropic API key and picks a model. The key never leaves the extension except in calls to the provider.
- Layer boundaries are enforced by lint. Unit tests (Vitest + jsdom) and one Playwright e2e test cover the loop.

## Capabilities

### New Capabilities
- `element-selection`: selecting an element on the page and describing it as an anchor that can be resolved again.
- `prompt-editing`: turning a natural-language request and the selection context into a validated patch proposal through the configured LLM.
- `patch-application`: applying, sanitizing and inverting structured patch ops on the live DOM.
- `change-history`: recording changesets per edit session, with undo/redo.
- `llm-provider-settings`: storing the user's API key and model choice, and checking that they are present before generating.

### Modified Capabilities
None (greenfield).

## Bounded contexts and layers touched

- **Editing**: domain (EditSession, Changeset, PatchOp, ElementAnchor, Selection, ports `PageGateway` and `ChangesetRepository`), application (SelectElement, ApplyPromptToSelection, UndoChangeset, RedoChangeset, ListChangesets), infrastructure (DOM page gateway, anchor resolver, repositories).
- **AI Assistance**: domain (PatchProposal, ProviderConfig, EditContext, port `PatchGenerator`, port `ProviderSettingsRepository`), application (GeneratePatch), infrastructure (Anthropic adapter).
- **Extension** (presentation + composition): picker overlay, side panel, options page, message bridge, chrome storage adapters.

## Out of scope

- Persistence across page reloads, and re-applying after SPA re-renders (phase 2).
- Variants / A-B alternatives of a changeset (phase 2).
- Design system import or inference, and the token linter (phase 3).
- Change Spec export, GitHub issue and the adapter Action (phase 4).
- The source-mapping build plugin and MCP server (phase 5).
- LLM providers other than Anthropic; browsers other than Chrome/Chromium.
- Multi-element selection and screenshots sent to the model (the screenshot adapter can come later).

## Impact

- New repository; no existing code is affected.
- Dependencies: wxt, @vitejs/plugin-react, react, react-dom, zod, dompurify, @anthropic-ai/sdk, vitest, jsdom, @playwright/test, eslint + typescript-eslint + eslint-plugin-boundaries + eslint-import-resolver-typescript, typescript 6.0 (typescript-eslint does not support 7 yet).
- External system: Anthropic Messages API, called from the extension service worker with the user's key.
- Chrome permissions: `storage`, `sidePanel`; host permission for `https://api.anthropic.com/*`; a content script declared on `<all_urls>` so the editor is ready on any page without per-tab injection.
