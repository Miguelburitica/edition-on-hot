# Proposal

## Why

Users want to run edits through the model gateways they already pay for or host. OpenCode's hosted API gives one key for models such as GLM 5.3 Flash, Claude Haiku 5.5, Kimi and DeepSeek. Teams also run a LiteLLM proxy to route to their own providers, keys and models under central budgets. Both speak the OpenAI chat-completions format that the OpenRouter adapter already uses, so adding them is mostly configuration, not new generation logic.

## What Changes

- **Two new providers: OpenCode and LiteLLM.** Each has its own key, model and context profile, alongside Anthropic and OpenRouter. The user picks the active one in settings.
- **OpenCode (hosted API).** Fixed base URL `https://opencode.ai/inference/openai/v1`. The key is required. The model is a free-text ID with suggestions (`glm-5.3-flash`, `claude-haiku-5-5`). It is checked against OpenCode's public catalog (`https://opencode.ai/inference/v1/models`), which reports tools and structured-output support, so the output mode adapts as it does for OpenRouter.
- **LiteLLM (your proxy).** Configurable base URL, defaulting to `http://localhost:4000`, local or remote. The key is optional, because proxies may run without auth. The model is the name the proxy exposes. Capabilities come from the proxy's `/model/info` when it is available. Otherwise the plain-text JSON mode is used, which every model can follow.
- **Host permission on demand.** The extension declares optional access to any host. Saving LiteLLM asks Chrome for access to exactly that proxy's origin. OpenCode's host is a regular host permission.
- **One shared chat-completions adapter.** The OpenRouter generator becomes a generic OpenAI-compatible generator: base URL and key come from the config, and OpenRouter-only request fields are sent only to OpenRouter. Network errors to LiteLLM name the proxy URL.
- **Eval:** `--provider opencode` (key `OPENCODE_API_KEY`) and `--provider litellm` (`LITELLM_BASE_URL`, optional `LITELLM_API_KEY`).
- **Stored settings v3** holds four provider slots. v2 settings migrate on first load without losing keys.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-provider-settings`: four providers; base URL for LiteLLM; optional LiteLLM key; per-provider model validation and catalog checks; on-demand host permission; v2→v3 migration.
- `patch-generation-eval`: the eval can target OpenCode and LiteLLM.

## Bounded contexts and layers touched

- **AI Assistance, domain:**
  - Provider ids and labels; slots with a base URL.
  - Per-provider model-id rules and the optional key.
  - `ModelCatalog` takes a query (provider, model, base URL, key) instead of a bare model id.
  - New `InvalidBaseUrlError`.
- **AI Assistance, application:** `SaveProviderSettings` (base URL), `LookupModel` and the settings view.
- **AI Assistance, infrastructure:**
  - `ChatCompletionsPatchGenerator`, which replaces `OpenRouterPatchGenerator`.
  - `OpenCodeModelCatalog` and `LiteLlmModelCatalog`.
  - `ModelCatalogRouter`.
- **Extension:**
  - Manifest permissions.
  - Settings repository v3.
  - Options UI (four providers, base URL field, permission request).
  - Composition.
- **Eval:** CLI, key lookup and settings.
- **Editing context:** not touched.

## Out of scope

- A generic "OpenAI-compatible" provider for any URL (Ollama, LM Studio, vLLM). The engine supports it, but it is not exposed.
- OpenCode's Anthropic-messages, Responses and Google endpoints. Chat completions reaches every text model.
- A local `opencode serve` server.
- Streaming, and cost reporting for OpenCode and LiteLLM. Only OpenRouter returns cost in the response.
- Running the real-model eval against OpenCode or LiteLLM in this change. That needs the user's key or proxy.

## Impact

- `packages/core/src/ai/**`, `packages/extension/src/{infrastructure,presentation/options,composition}`, `packages/extension/wxt.config.ts`, `packages/eval/src/{cli,run}.ts`, README.
- The stored settings format changes (migrated). No new dependencies.
