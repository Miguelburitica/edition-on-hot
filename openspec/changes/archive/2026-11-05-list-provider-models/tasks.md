## 1. AI domain

- [x] 1.1 `ModelOption`, `ModelListing`, `ModelListQuery`, `ModelLister` port; `model-access` failure kind; Anthropic model IDs validated by pattern; unit tests

## 2. AI application

- [x] 2.1 `ListModels` use case (saved key fallback, missing key error, sorting); Anthropic settings accept listed IDs; unit tests

## 3. AI infrastructure

- [x] 3.1 Chat completions adapter reads content parts and maps model-access, 410 and provider messages; tests
- [x] 3.2 List support in OpenRouter, OpenCode (keyed, per-key cache) and LiteLLM catalogs; `AnthropicModelLister`; `ModelListerRouter`; tests with fake fetch

## 4. Extension and eval

- [x] 4.1 Options model field with the account's models, refresh, and status line; composition wiring and e2e fake lister
- [x] 4.2 e2e: models are listed and one can be picked; eval accepts `OPENCODE_APIKEY`
- [x] 4.3 Live check against OpenCode with a real key (eval)
