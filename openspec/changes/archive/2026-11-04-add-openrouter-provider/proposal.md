# Proposal

## Why

Patch generation is a narrow, structured task. Small, cheap models such as GLM 5.3 Flash (about $0.03/$0.09 per million tokens on OpenRouter) or Claude Haiku 5.5 may handle it well if the harness around them is strict enough, which would make every edit far cheaper and faster than with Opus. The user has an OpenRouter key, so supporting OpenRouter makes those models (and many others) available with one key. Small models fail more often on structure, though, so the harness has to adapt to each model's capabilities and recover from small mistakes. We also need a repeatable way to measure whether a model is good enough, instead of judging by feel.

## What Changes

- **Second provider: OpenRouter.** The user picks Anthropic or OpenRouter in settings and stores a key for each. Requests go to the active provider.
- **Free-text OpenRouter model ID** with suggestions (`z-ai/glm-5.3-flash`, `anthropic/claude-haiku-5.5`). The ID is checked against OpenRouter's public model catalog, which also reports what the model supports.
- **The output mode adapts to the model.** If the model supports structured outputs, use a strict JSON-schema response; if it only supports tools, use tool calling; otherwise ask for JSON in plain text. Anthropic keeps tool calling.
- **Local repair before retry.** Common mechanical mistakes (code fences, `"0"` instead of `"t0"`, `above` instead of `before`, camelCase CSS properties, a bare op instead of a list) are fixed deterministically before spending the one model retry.
- **Context budgets.** A compact profile (smaller HTML limit, fewer targetable elements) applies to OpenRouter models by default; the user can switch to standard. The Editing context asks the AI context for the budget before serializing the selection.
- **Clearer provider errors.** Out-of-credits (402), moderation blocks (403) and no-available-provider (503) get their own messages.
- **Model eval harness.** `pnpm eval` runs a fixed set of edit cases against one or more models, using the developer's own key, and reports first-try validity, validity after retry, how often local repair was needed, apply success, check pass rate, latency and cost.
- **BREAKING (stored settings):** the stored settings format changes to hold a key per provider. Existing Anthropic settings are migrated on first load.

## Capabilities

### New Capabilities
- `patch-generation-eval`: a developer tool that measures how well a model produces valid, correct patches on a fixed set of cases.

### Modified Capabilities
- `llm-provider-settings`: provider choice, a key per provider, free-text OpenRouter model IDs checked against the catalog, and the context profile setting.
- `prompt-editing`: the context limit follows the context profile, the output mode follows model capabilities, local repair runs before the retry, and new provider error cases are added.

## Bounded contexts and layers touched

- **AI Assistance**: domain (`ProviderId`, per-provider settings, `ModelCapabilities`, `OutputMode` policy, `ContextBudget`, `ProposalRepair`, new `ProviderError` kinds, port `ModelCatalog`), application (`GeneratePatch` uses repair and budgets; new `GetContextBudget`, `LookupModel`), infrastructure (`OpenRouterPatchGenerator`, `OpenRouterModelCatalog`, strict-schema variant of the patch schema, generator selection by provider).
- **Editing**: infrastructure only. `buildSelectionContext` takes a budget, and `AiPatchSourceAdapter` requests the budget before building the context.
- **Extension**: infrastructure (budget message, settings migration), presentation (provider and model fields on the options page), composition (provider routing in the background), manifest (host permission for `https://openrouter.ai/*`).
- **New `packages/eval`**: a composition root for running evals in Node with jsdom.

## Out of scope

- Other providers' native APIs (OpenAI, Google, and so on). They are reachable through OpenRouter.
- Streaming responses and showing partial output.
- Automatic model fallback chains, or cost caps configured in the extension.
- OpenRouter OAuth sign-in. Only a pasted key is supported.
- Running evals in CI. They spend money, so they run only when a developer starts them with their own key.
- Changing the Anthropic default model (Opus 5.5) or its request shape.

## Impact

- New external endpoints: `https://openrouter.ai/api/v1/chat/completions` (with the user's key) and `https://openrouter.ai/api/v1/models` (public, no key).
- Manifest gains a host permission for `https://openrouter.ai/*`.
- Stored settings key `hew.providerSettings` gets a new shape, with a migration from the phase 1 shape.
- No new runtime dependencies: OpenRouter is called with `fetch`, because the Anthropic SDK does not speak its OpenAI-compatible API.
- New workspace package `packages/eval` (dev only).
