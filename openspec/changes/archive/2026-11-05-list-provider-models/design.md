## Context

`ModelCatalog.lookup` resolves one model's capabilities for the compatible providers. Model IDs are typed by hand. Anthropic models are a closed enum `AnthropicModelId`.

## Goals / Non-Goals

**Goals:** list the models the user's key can use, for every provider, and keep lookup working; fix the OpenCode failures found with a real key.
**Non-Goals:** filtering by price or capability; persisting lists.

## Decisions

### D1. `ModelLister` port (AI domain)
`ModelLister.list(query: ModelListQuery) → Result<ModelListing, CatalogUnavailableError>`, where `ModelListQuery = { provider: ProviderId; apiUrl: string; apiKey: string | null }` and `ModelListing = { models: ModelOption[]; scope: 'account' | 'public' }`. `ModelOption = { id, label, capabilities }`. Adapters (AI infrastructure):
- `AnthropicModelLister`: `GET https://api.anthropic.com/v1/models?limit=1000` with the `x-api-key` and direct-browser-access headers; capabilities are tools.
- `OpenRouterModelCatalog.list`: `/models/user` with the key (scope `account`), otherwise `/models` (scope `public`).
- `OpenCodeModelCatalog.list` and `lookup` read `/inference/v1/models` with the key when one is set (the account's enabled models), and cache per key.
- `LiteLlmModelCatalog.list`: `/model/info`, falling back to `/models`.
- `ModelListerRouter` dispatches by provider.

### D2. `ListModels` use case (AI application)
Input `{ provider, apiKey?, baseUrl? }`; when `apiKey` is omitted the saved key is used. A provider whose key is required and missing returns `missing-api-key`. Results are sorted by label.

### D3. Anthropic model IDs
`AnthropicModelId` becomes `string`, validated by `/^claude-[a-z0-9][a-z0-9.-]*$/`. The two known models stay as labels and defaults, so stored settings keep working.

### D4. Options UI
The model field is a text input bound to a `<datalist>` of the listed models (searchable, and still free text). Models load when a provider tab opens and has a key, or when "Refresh models" is pressed. A line states "N models available to your account" or why the list could not load. Anthropic uses the same field.

### D5. OpenCode fixes (chat completions adapter)
- `contentText` joins the `text` parts of an array `content`.
- `statusError` checks the provider message first: "access is disabled" and similar phrases map to `model-access`. HTTP 410 maps to `unavailable`. Rate limits, credits and unknown errors append the provider's own message, shortened to 160 characters.

## Risks / Trade-offs

- Anthropic's lister needs the key before it can list anything; until one is saved, the two built-in models are suggested.
- OpenRouter `/models/user` respects the account's provider filters, which is what users expect.
