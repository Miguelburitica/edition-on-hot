## Context

The AI context has two providers. Anthropic has its own adapter. OpenRouter is served by `OpenRouterPatchGenerator`, which talks OpenAI chat completions to a fixed URL, plus `OpenRouterModelCatalog`. `ProviderSettings` hard-codes two slots, and `ModelCatalog.lookup(modelId)` assumes one global catalog. OpenCode's hosted API and LiteLLM proxies both speak chat completions:
- OpenCode: `https://opencode.ai/inference/openai/v1/chat/completions` with `Authorization: Bearer`. Its public catalog at `https://opencode.ai/inference/v1/models` lists `capabilities.tools.supported`, `capabilities.structured_output` and `limit.context` per model.
- LiteLLM: `<base>/v1/chat/completions` with an optional Bearer key. `<base>/v1/model/info` lists `model_name` with `model_info.supports_function_calling` and `supports_response_schema`. `<base>/v1/models` lists ids.

## Goals / Non-Goals

**Goals:**
- OpenCode and LiteLLM as first-class providers, with the same harness as OpenRouter: output modes, repair, retry, budgets and errors.
- One chat-completions adapter for the three OpenAI-compatible providers.
- Access to a LiteLLM host only when the user asks for it.

**Non-Goals:** a generic custom-URL provider, other OpenCode API formats, streaming, and cost reporting outside OpenRouter.

## Decisions

### D1. Provider ids and slots (AI domain)
- `PROVIDER_IDS = ['anthropic', 'openrouter', 'opencode', 'litellm']`.
- `ProviderSettings` keeps `anthropic: AnthropicSlot` and holds the other three as `CompatibleSlot { apiKey, model, profile, capabilities, baseUrl }` in a record keyed by `CompatibleProviderId`.
- A small per-provider spec table in the domain (`COMPATIBLE_PROVIDERS`) gives each provider's:
  - label
  - default model and suggestions
  - default profile
  - whether a key is required
  - whether the base URL is user-editable
  - default base URL
  - model-id rule

  The rules:
  - OpenRouter: `vendor/model`.
  - OpenCode: `^[a-z0-9][\w.:-]*$`.
  - LiteLLM: any non-empty id without whitespace.
- For fixed-URL providers the base URL is always the default and is ignored on update.
- `ProviderConfig` becomes:
  - `{ provider: 'anthropic', … }`, or
  - `{ provider: CompatibleProviderId; apiKey: string | null; model; capabilities; apiUrl }`.
- `apiUrl` is the chat completions API root: `apiUrlOf(provider, baseUrl)` appends `/v1` for LiteLLM, and is the fixed URL for the others. The slot stores the proxy origin the user typed, and the config carries what adapters call.
- `toConfig` fails with `MissingApiKeyError` only when the provider requires a key. For an empty LiteLLM model it fails with `MissingModelError` (new).
- `InvalidBaseUrlError` (new) covers base URLs that are not http(s) or do not parse. Trailing slashes and a trailing `/v1` are stripped, so `http://localhost:4000/v1` and `http://localhost:4000` are the same.
- An empty LiteLLM model is allowed in stored state, so a fresh install can load, but `SaveProviderSettings` rejects it.

### D2. Catalog query (AI domain port)
`ModelCatalog.lookup(query: CatalogQuery)`, where `CatalogQuery = { provider, model, apiUrl, apiKey }`. `LookupModel.execute({ provider, model, baseUrl? })` builds the query from the saved slot (for the LiteLLM key) plus the values being edited, and never fails. `ModelCatalogRouter` (infrastructure) dispatches to:
- OpenRouter: the existing adapter, adapted to the query.
- `OpenCodeModelCatalog`: the public catalog, no key, 10-minute cache. `structuredOutputs = capabilities.structured_output === true`, `tools = capabilities.tools.supported === true`, `contextLength = limit.context`.
- `LiteLlmModelCatalog`: `<base>/v1/model/info`, with the key if set, mapping `supports_response_schema` and `supports_function_calling`. If that endpoint fails, it falls back to `<base>/v1/models`: found means capabilities are unknown but the model exists, so `found` with both flags false, which selects `prompted`. Unreachable gives `CatalogUnavailableError`. It is not cached, because the user may change the proxy at any moment.

`chooseOutputMode` is unchanged: it works for every compatible provider.

### D3. One chat-completions generator (AI infrastructure)
`OpenRouterPatchGenerator` becomes `ChatCompletionsPatchGenerator`:
- It posts to `${config.apiUrl}/chat/completions`. OpenRouter's base is `https://openrouter.ai/api/v1`, OpenCode's is `https://opencode.ai/inference/openai/v1`, and LiteLLM's is `<base>/v1`.
- It sends `Authorization: Bearer` only when a key is set.
- OpenRouter-only fields (`usage: { include: true }` and `provider: { require_parameters: true }`) are added only when `config.provider === 'openrouter'`.
- A network failure to LiteLLM gives `ProviderError('network', 'is the LiteLLM proxy running at <base>?')`.
- The 402 message becomes provider-neutral.
- The router maps `openrouter`, `opencode` and `litellm` to the same instance.

### D4. Host access (extension)
- `wxt.config.ts` adds `https://opencode.ai/*` to `host_permissions` and declares `optional_host_permissions: ['http://*/*', 'https://*/*']`.
- `OptionsApp` gets a `requestHostAccess(origin) => Promise<boolean>` prop. The composition root implements it with `browser.permissions.request({ origins: [origin + '/*'] })`, and e2e mode uses a fake that grants.
- On Save for LiteLLM, the request is the first thing the click handler does, so the user gesture still counts. A denial shows an explanation and saves nothing.
- The service worker and the options page then reach the proxy. Same-origin pages are not involved, and the key never goes to the page.

### D5. Settings storage v3 (extension infrastructure)
- `{ version: 3, active, anthropic, openrouter, opencode, litellm }`, where compatible slots include `baseUrl`.
- v2 is read as v3, with OpenCode and LiteLLM empty. v1 migrates as before.
- An invalid stored slot falls back to empty for that slot only, so one bad slot doesn't lose the others' keys.

### D6. Options UI (extension presentation)
- Four provider buttons.
- LiteLLM shows a "Proxy URL" field and "API key (optional)".
- The model field is free text with a datalist of suggestions for OpenRouter and OpenCode.
- The capability line names the catalog: OpenRouter catalog, OpenCode catalog or LiteLLM proxy.
- The key placeholder is `sk-…` for OpenCode and LiteLLM.

### D7. Eval (eval package)
- `--provider opencode|litellm`.
- Keys: `OPENCODE_API_KEY`, and `LITELLM_API_KEY` (optional). `LITELLM_BASE_URL` is required for LiteLLM. They are read from `.env` too.
- `requireKey` becomes `requireProviderEnv`, which returns `{ apiKey, baseUrl }`.
- Rows are labeled `provider:model`. The catalog comes from the `ModelCatalogRouter`.

## Risks / Trade-offs

- **OpenCode may not honour `response_format` json_schema on every model**, even where the catalog says `structured_output`. The generator's existing 400 mapping explains it. The user can add a key and run the eval to confirm.
- **LiteLLM `/model/info` may need an admin key on some setups.** The fallback to `/v1/models` keeps capability detection working at the plain-text level.
- **Optional `http://*/*` / `https://*/*` permissions** show the extension as able to request any site. They are only requested for the exact proxy origin the user typed.

## Migration Plan

Storage v2 → v3 happens on load. No user action is needed, and keys and the active provider are kept.

## Open Questions

None.
