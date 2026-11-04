# Design

## Context

See proposal.md (Why). Phase 1 (archived as `2026-11-03-add-core-edit-loop`) left these seams:

- `PatchGenerator` port (`ai/domain/ports.ts`) with a single adapter, `AnthropicPatchGenerator`. It validates with Zod inside the adapter and returns either a `ProposalDraft` or an `InvalidProposalError` carrying only issue strings. The raw output is lost, so nothing outside the adapter can repair it.
- `ProviderSettings` holds one key and a fixed `ModelId` union (Anthropic only). `ProviderConfig.provider` is the literal `'anthropic'`.
- Context limits are constants in two contexts: `EditContext.MAX_HTML_CHARS = 12_000` (AI domain) and `MAX_TARGETS = 40` (`editing/infrastructure/selection-context.ts`). The content script builds the context before the AI context is involved.
- `GeneratePatch` already retries once on `InvalidProposalError` and on targets outside the context.

## Goals / Non-Goals

**Goals:**
- Adding OpenRouter, repair and budgets touches no Editing domain or application code.
- Repair and output-mode choice are domain policy (pure, unit-tested). Zod and HTTP stay in infrastructure.
- One harness serves the extension and the eval, so eval numbers describe what users get.

**Non-Goals:**
- A generic multi-provider abstraction beyond what two providers need.
- Tuning prompts per model. The eval makes that measurable later.

## Decisions

### D1. Settings model (AI domain)

```
ProviderId          = 'anthropic' | 'openrouter'
ContextProfile      = 'standard' | 'compact'
AnthropicModelId    = existing union (opus default, sonnet)
OpenRouterModelId   = VO, /^~?[a-z0-9][\w.-]*\/[a-z0-9][\w.:-]*$/i, default 'z-ai/glm-5.3-flash'
ModelCapabilities   = VO { known: boolean; structuredOutputs; tools; contextLength? }
ProviderSettings    = { active: ProviderId;
                        anthropic:  { apiKey|null, model: AnthropicModelId, profile };
                        openrouter: { apiKey|null, model: OpenRouterModelId, profile, capabilities } }
ProviderConfig      = discriminated union on provider, built by settings.toConfig() for the active provider
```

Capabilities are stored with the OpenRouter settings when the user saves or re-checks the model, so generation needs no catalog call. Suggestions (`z-ai/glm-5.3-flash`, `anthropic/claude-haiku-5.5`) are a constant in the AI domain and are exposed through `ProviderSettingsView`. Both IDs were confirmed in the live catalog on 2026-11-03; both list `structured_outputs` and `tools`.
*Alternative:* one key per settings object, with a provider switch that overwrites it. Rejected because switching would lose the other key (spec: keys are kept per provider).

### D2. Raw output, parser port, repair flow

`PatchGenerator.generate` changes to return `Result<GeneratorOutput, ProviderError>`, where `GeneratorOutput = { raw: unknown; diagnostics: { latencyMs; costUsd? } }`. `raw` is the parsed JSON value (tool arguments, JSON-schema content, or JSON extracted from text). Text that is not JSON becomes `{ unparsedText }`.

A new port, `ProposalParser.parse(raw, provider): Result<ProposalDraft, InvalidProposalError>`, is implemented in infrastructure with Zod. One parser serves both wire formats, because the only difference is `styles` (a record for Anthropic, `{property, value}` pairs for OpenRouter) and the Zod schema accepts either, mapping pairs to a record. The generator router implements the port.

`GeneratePatch` per attempt: `generate` → `parse` → on failure `repairDraft(raw)` (domain) → `parse` again → `PatchProposal.fromDraft` (target check) → on failure, record the issues and retry. `GeneratePatchResponse` gains `diagnostics: { attempts, repairs: RepairKind[], latencyMs, costUsd? }`. The UI ignores it; the eval reads it.

`repairDraft` (pure, `ai/domain/proposal-repair.ts`) handles these cases:
- `{ unparsedText }` with a fenced or embedded JSON object: extract it.
- A single op object, or `{ op: … }`: wrap it as `{ summary, ops: [op] }`.
- Missing `summary`: use `"Applied change"`.
- target `"2"` or `2` → `"t2"`; `"#t2"` / `"[data-hew-target=t2]"` → `"t2"`.
- Position aliases: above/top → before, below/bottom → after, start/first → prepend, end/last → append.
- `type` case and aliases: `insertHTML` → insert, `style` → setStyle, `css` → addCss.
- camelCase CSS properties → kebab-case.

Each applied rule is reported as a `RepairKind`. The rules never add ops or targets, and `fromDraft` still rejects unknown targets.
*Alternative:* repair inside each adapter. Rejected: the policy would be duplicated per provider and could not be measured on its own.

### D3. Output mode policy (AI domain)

`chooseOutputMode(config)`: Anthropic → `tool`. OpenRouter: `capabilities.structuredOutputs` → `json_schema`; else `capabilities.tools` → `tool`; else `prompted`. The mode is passed to the generator in `PatchGenerationRequest`. The system prompt gets a mode-specific last paragraph (the `prompted` mode spells out the JSON shape with an example).

### D4. OpenRouter wire format and adapter (AI infrastructure)

Strict JSON-schema modes reject open records and optional keys, so OpenRouter uses a **strict wire schema**. Every op object has `additionalProperties: false` and all keys required; ops are combined with `anyOf`; `styles` is `[{ property, value }]`; `setAttr.value` is `string | null`. The same schema is used for tool parameters and as the documented shape in `prompted` mode, so one parser covers all three modes. The Anthropic wire schema stays as it is.

`OpenRouterPatchGenerator` calls `POST https://openrouter.ai/api/v1/chat/completions` with `fetch`, `Authorization: Bearer <key>`, a 60 s `AbortController` timeout, `max_tokens: 4096`, and `usage: { include: true }` so cost is reported when the API provides it. By mode:
- `json_schema`: `response_format: { type: 'json_schema', json_schema: { name: 'apply_patch', strict: true, schema } }` and `provider: { require_parameters: true }`. Read `choices[0].message.content` and `JSON.parse` it.
- `tool`: `tools: [{ type: 'function', function: { name: 'apply_patch', parameters } }]`, `tool_choice` forcing that function, and `provider.require_parameters`. Read `tool_calls[0].function.arguments`.
- `prompted`: no format parameters. Extract JSON from `content`.

Errors map by status: 401 → `auth`; 402 → `credits`; 403 → `moderation`; 408 → `timeout`; 429 → `rate-limit`; 502 → `unavailable`; 503 → `no-provider`; other → `unknown`. Errors in a 200 body (`error` field) map the same way using `error.code`. `ProviderError` gains the kinds `credits`, `moderation`, `unavailable` and `no-provider`, each with its message.

`ping` sends a one-message request with `max_tokens: 1`. `PatchGeneratorRouter` implements `PatchGenerator` and `ProposalParser` by delegating on `config.provider`. It is the only generator the composition roots wire.
*Alternative:* the `openai` SDK pointed at OpenRouter. Rejected: it adds a dependency for one endpoint, and the OpenRouter-specific fields (`provider`, `usage.include`) would need casts anyway.

### D5. Model catalog (AI)

`ModelCatalog` port: `lookup(modelId): Result<ModelCapabilities, CatalogError>`. `OpenRouterModelCatalog` fetches `GET https://openrouter.ai/api/v1/models` with no key, caches the list for 10 minutes, and reads `supported_parameters` (`structured_outputs`, `tools`) and `context_length`. A model not in the list returns `{ known: false }`. New use case `LookupModel`, and `SaveProviderSettings` calls it for OpenRouter. A catalog failure saves `capabilities: unknown` (spec: catalog unreachable → prompted mode).

### D6. Context budgets across contexts

`ContextBudget` VO (AI domain): `standard = { maxHtmlChars: 12_000, maxTargets: 40 }`, `compact = { maxHtmlChars: 6_000, maxTargets: 20 }`. New AI use case `GetContextBudget` returns the budget for the active provider's profile. `GeneratePatch` uses the same budget for `EditContext.create`, so the server-side limit holds even if a caller ignores the budget.

Editing side (infrastructure only): `buildSelectionContext(el, { maxTargets })` replaces the constant. `AiPatchSourceAdapter` takes a second function, `BudgetRequester`, and calls it before building the context. In the extension, the content script uses a new bridged message, `ai/getContextBudget`. This keeps D2 of phase 1: Editing only sees the AI application API.

### D7. Settings storage and migration (extension infrastructure)

The stored value becomes `{ version: 2, active, anthropic: {...}, openrouter: {...} }`. `ChromeSettingsRepository.load` detects the phase 1 shape (`{ apiKey, model }` without `version`) and maps it to `active: 'anthropic'` with that key and model. Saving writes v2. Invalid data falls back to defaults, as before.

### D8. Options page

The options page gets a provider segmented control. Each provider has its own key field and model field: a select for Anthropic, and a text input with a `datalist` of suggestions for OpenRouter. The OpenRouter field shows the catalog result after a debounced lookup ("Found: structured outputs, tools", "Not in catalog" or "Capabilities unknown"), next to a context profile select. Test and Clear act on the active provider. The manifest adds `https://openrouter.ai/*` to `host_permissions`. The background and options roots share `composition/ai-services.ts`, which in `--mode e2e` swaps in a fake generator and a fake catalog so e2e runs never reach a provider or openrouter.ai.

### D9. Eval harness (`packages/eval`)

This is a new dev-only workspace package and a composition root running in Node with jsdom. It is a new boundaries element, `eval`, that may import every core layer.

- **Cases:** `cases/*.ts`, each `{ id, fixture, select, prompt, checks: ((doc) => string | null)[] }`. Fixtures are static HTML snapshots of the demo app in `fixtures/*.html`. They are static so that runs don't depend on React or a dev server.
- **Initial set (10):** banner above form, red primary button, rename heading, hide the sales button, add a "New" badge to a list row, disable the submit button, add an aria-label, add helper text under the email input, add a fixed toast notification, increase card padding.
- **Shared check helpers:** `isReddish(color)`, `backgroundIsReddish`, `isHidden`, `byText`, `words`, `inserted`, `insertedWith(text)`.
- **One property per check:** a check finds the element it judges by itself (for example the inserted element containing "trial"), so a wrong position fails only the position check. A cascade of failures from one mistake would hide what the model got right.
- **Repeats:** `--repeat N` runs each case N times per model. Results carry a `run` index; the summary adds the per-run pass-rate range and lists cases whose outcome differed between runs. Small models vary between runs, so a single sample per case cannot separate models that are close.
- **Runner:** `pnpm eval --model <id> [--model <id>] [--case <pattern>] [--provider openrouter|anthropic]`. It reads `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` from the environment and exits early when the key is missing (spec). It builds `GeneratePatch` with in-memory settings, the real router and the real catalog, and `DomPageGateway` + `AiPatchSourceAdapter` with direct (unbridged) requesters. For each case and model it records diagnostics and outcome, then prints a summary table (first-try valid %, valid after retry %, repaired %, applied %, passed %, median latency, total cost) and writes `packages/eval/results/<timestamp>.json` (gitignored).
- **Dry run:** `--dry-run` answers every case with its hand-written reference patch through the full harness, proving cases and checks without a provider.
- **Isolation:** `packages/eval` has unit tests (fake generators only: runner metrics, repair counting, "every check fails on the untouched page", missing-key message), so `pnpm test` runs them but never calls a provider or runs a case against a model.
- **Tooling:** the CLI runs with `tsx`, whose esbuild dependency is allowed to run its install script via `allowBuilds` in `pnpm-workspace.yaml` (pnpm blocks dependency build scripts by default).

## Risks / Trade-offs

- [Strict schema enforcement varies by OpenRouter endpoint] → `require_parameters: true` routes only to endpoints that accept the parameters; a 503 becomes the "no provider" message; repair and the retry catch soft violations.
- [Stored capabilities can go stale] → the options page re-checks on open, and a 400 that names `response_format`/`tools` maps to a message suggesting re-checking the model in settings.
- [Forced `tool_choice` may be rejected by some OpenRouter providers] → tool mode is used only when structured outputs are unavailable; both suggested models use `json_schema`.
- [Small models can return valid but wrong edits] → not solved here; the eval exists to measure it, and the result guides the next change.
- [`anyOf` with strict mode may hit schema-feature limits on some providers] → the schema avoids `$ref`, `oneOf`, formats and patterns. The `t\d+` target check is enforced by the domain rather than the schema.
- [Eval cost] → the runner prints the number of calls it will make before starting. GLM 5.3 Flash costs fractions of a cent per run of 10 cases.
- [Changing `PatchGenerator`'s return type touches the Anthropic adapter and its tests] → accepted; it is mechanical and covered by the existing adapter tests.

## Migration Plan

Settings migrate on first load (D7). There is no data loss and no user action. Rollback to phase 1 would read v2 settings as invalid and fall back to empty settings, so the user would re-enter the Anthropic key. This is acceptable for an unreleased extension.

## Open Questions

- Compact budget values (6 000 chars, 20 targets) are starting points. The eval will show whether GLM Flash does better with even less context.
