# Design

## Context

This is a greenfield repository. See proposal.md (Why) for motivation and the capability specs for required behavior. The design is constrained by:

- Chrome MV3: the DOM is reachable only from the content script. Network calls holding secrets belong in the service worker. The side panel is a separate extension page. All three talk through `chrome.runtime` messaging.
- The DDD layering rules in `openspec/config.yaml`.
- The model must never ship executable code to the page.

## Goals / Non-Goals

**Goals:**
- Keep domain and application code pure and fully unit-testable without a browser.
- Make adding a second LLM provider, persistent storage (IndexedDB) or new op types an infrastructure-only change.
- Keep the layer and context boundaries checked by a machine, not by convention.

**Non-Goals:**
- An event bus or CQRS infrastructure. Domain events are returned from aggregates and dispatched synchronously by the use case.
- Generic plugin systems. There is one provider and one storage backend per context.

## Decisions

### D1. Packages and layers

```
packages/core/src/
  shared/domain/            Result<T,E>, Entity, AggregateRoot, DomainEvent, Id (branded string)
  editing/
    domain/                 EditSession (aggregate root), Changeset (entity), PatchOp (union VO),
                            ElementAnchor (VO), Selection (VO), Prompt (VO), errors, events
                            ports: PageGateway, ChangesetRepository (EditSessionRepository)
    application/            use cases + DTOs; index.ts = context public API
    infrastructure/         DomPageGateway, DomAnchorResolver, HtmlSanitizer (DOMPurify),
                            ScopedStyleInjector, InMemoryEditSessionRepository
  ai/
    domain/                 PatchProposal, ProviderConfig, EditContext, ModelId; errors
                            ports: PatchGenerator, ProviderSettingsRepository
    application/            GeneratePatch, TestProviderConnection; index.ts
    infrastructure/         AnthropicPatchGenerator, patchSchema (Zod), prompt builder
packages/extension/src/
  infrastructure/           ChromeLocalSettingsRepository, ChromeSessionEditSessionRepository,
                            RuntimeMessageBridge, BridgedPatchGenerator (PatchGenerator proxy)
  presentation/{content,sidepanel,options}/
  composition/              contentRoot.ts, backgroundRoot.ts, sidepanelRoot.ts
  entrypoints/              WXT entrypoints (thin: call the composition roots)
```

`core` exports one entry per context and layer through package.json `exports` (`@hew/core/editing/application`, `@hew/core/editing/infrastructure`, ...). Deep imports are blocked.
*Alternative considered:* one package per context per layer (8+ packages). Rejected for now because it adds build overhead with no extra safety, since lint already enforces the boundaries.

### D2. Cross-context collaboration

`ApplyPromptToSelection` (Editing/application) needs a patch from the AI context. Editing/domain defines its own port, `PatchSource.propose(selection, prompt, context) → Result<PatchOp[]>`, in Editing's language. The composition root wires it to an adapter (Editing/infrastructure `AiPatchSourceAdapter`) that calls the AI context's public application API (`GeneratePatch`) and maps `PatchProposal` → `PatchOp[]`. This is an anti-corruption layer, so neither domain imports the other.
*Alternative:* a shared-kernel `PatchOp` type. Rejected: it couples the contexts' evolution, and the op schema the LLM sees should be free to differ from the engine's.

### D3. Runtime placement

- **Content script**: the Editing context (all use cases plus `DomPageGateway`) and the picker overlay. Its `AiPatchSourceAdapter` takes a `PatchRequester` function; in the content script that function is `bridgedPatchRequester`, which sends the `GeneratePatchRequest` to the background.
- **Background service worker**: the AI context (`GeneratePatch`, `AnthropicPatchGenerator`, settings repository). It is the only place that reads the key.
- **Side panel**: presentation only. It sends commands (`startPicker`, `submitPrompt`, `undo`, `redo`) to the active tab's content script and renders the `EditSession` snapshots it receives.
- **Messages**: a discriminated union typed in `extension/infrastructure/messages.ts`, checked with Zod on receipt.

### D4. Patch ops and inverses

`PatchOp` is a discriminated union VO: `insert{anchor, position, html}`, `replace{anchor, html}`, `setStyle{anchor, styles}`, `setAttr{anchor, name, value|null}`, `setText{anchor, text}`, `remove{anchor}`, `addCss{css}`. Domain-level invariants (such as an attribute name not starting with `on`) are checked by the VO factory. `DomPageGateway.apply(op)` returns an `AppliedOp` holding an infrastructure-opaque inverse: for structural ops, a reference to the original node(s) and their parent/next-sibling position; for attribute and style ops, the previous values. `EditSession.apply(changeset)` stays transactional by asking the gateway to revert the already-applied ops in reverse order when one fails.
Inserted nodes get `data-hew-cs="<changesetId>"`. `addCss` rules are rewritten to be prefixed with `[data-hew-cs="<id>"]` and injected in one `<style data-hew>` element per changeset (scoping per the patch-application spec).

### D5. Anchors

`ElementAnchor` = { selector (shortest unique path built from id → data-testid → classes → nth-of-type), tag, role?, textFingerprint (first 80 normalized chars) }. Resolution: try the selector and accept a match whose tag+fingerprint agree. Otherwise search candidates by tag and pick the best fingerprint match above a threshold. Otherwise `AnchorNotFound`. The model refers to targets by ids we assign in the context (`t0` = selection, `t1..n` = labeled descendants), never by free-form selectors. The adapter maps the ids back to anchors, so the model cannot target elements outside the context it was shown.

### D6. LLM call

Official `@anthropic-ai/sdk` from the service worker (`dangerouslyAllowBrowser: true`, which sends `anthropic-dangerous-direct-browser-access`; `baseURL` and `authToken: null` are pinned so ambient credentials never apply). One tool, `apply_patch`, whose JSON schema is generated from the Zod schema. Current models reject forced `tool_choice`, so the request uses `tool_choice: auto` and the system prompt requires the call; a missing call counts as invalid output and is retried once with the validation issues (spec: prompt-editing). Models: `claude-opus-5-5` (default), `claude-sonnet-5-5`; `output_config.effort: medium`; server-side refusal fallbacks on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); a `refusal` stop reason maps to `provider-refusal`. Timeout 120 s, one SDK retry. Typed SDK errors map to `provider-auth`, `provider-rate-limit`, `provider-timeout`, `provider-network`, `provider-unknown`.
*Alternative:* raw `fetch` for a smaller bundle. Rejected: the SDK's typed errors and request types are worth the ~460 KB background bundle.

### D7. Storage

`EditSession`s live in an in-memory repository in the content script, because their revert tokens hold DOM nodes. The side panel holds no copy: on open it asks the tab's content script for a snapshot, and the content script broadcasts `editing/stateChanged` after every change. A reload starts a new session (persistence and re-apply come in phase 2). Settings go in `chrome.storage.local`.

### D8. Boundary enforcement

`eslint-plugin-boundaries` element types: `shared-domain`, `{ctx}-domain`, `{ctx}-application`, `{ctx}-infrastructure`, `ext-infrastructure`, `ext-presentation`, `ext-composition`, `ext-entrypoint`. Rules follow the config.yaml layering. `no-restricted-imports` in domain and application blocks `zod`, `dompurify`, `react` and `chrome` globals (`no-restricted-globals` for `document`, `window`, `chrome`, `fetch`). One deliberate violation lives in a lint fixture test to prove that the rules fire.

### D9. Overlay isolation

The picker UI is rendered into a closed Shadow DOM root attached to a host element marked `data-hew-overlay`. The anchor builder and the resolver skip that subtree. Pointer events are captured at `document` in the capture phase while picking.

## Risks / Trade-offs

- [Pages with a strict `style-src` CSP may block the injected `<style>` for `addCss`] → not handled in phase 1. Inline `style` attributes from `setStyle` are unaffected. Phase 2 can move `addCss` to constructed stylesheets (`adoptedStyleSheets`), which CSP does not govern.
- [Framework re-renders (React) can overwrite applied changes] → accepted for phase 1 and documented in the side panel. MutationObserver re-apply comes in phase 2.
- [The model returns ops targeting ids it wasn't shown] → rejected at schema mapping as invalid output, which triggers the retry.
- [The key sits in `chrome.storage.local` unencrypted] → the threat model is the inspected page, which cannot reach extension storage. Documented in settings; there is no remote sync.
- [Opaque inverses hold DOM references, so history can't survive a reload] → accepted (D7), addressed with serializable inverses in phase 2.

## Migration Plan

Not applicable (greenfield). Rollback means removing the unpacked extension.

### D10. Build tooling notes

- React is registered as a plain Vite plugin in `wxt.config.ts`. WXT resolves `modules` from its own install path, which pnpm's strict layout hides, so `@wxt-dev/module-react` is not used.
- `wxt build --mode e2e` (output `.output/chrome-mv3-e2e`) swaps in `E2ePatchGenerator` at the background composition root. Production builds tree-shake it out.
- The side panel accepts `?tabId=` to pin itself to one tab when opened as a page; the e2e tests use this.

## Open Questions

- Exact maximum context size (initial value 12 KB of HTML) can be tuned after trying it on real pages.
