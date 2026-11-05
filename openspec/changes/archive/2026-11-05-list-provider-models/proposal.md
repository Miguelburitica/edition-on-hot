## Why

The model field only offers one or two hard-coded suggestions, so users must know and type exact model IDs, and Anthropic is limited to two models. Every provider can list the models an account can use, so the selector should offer exactly those. Testing OpenCode with a real key also showed that some models fail: Mistral returns its answer as an array of content parts, and models the account has not enabled are reported as a content-policy block.

## What Changes

- Settings fetch the models available to the user's account from the active provider and offer them in the model field, with a refresh action:
  - Anthropic: `GET /v1/models` with the key.
  - OpenRouter: `GET /models/user` with the key, falling back to the public `/models`.
  - OpenCode: `GET /inference/v1/models` with the key, which returns only the account's enabled models; the public list without a key.
  - LiteLLM: the proxy's `/model/info`, falling back to `/models`.
- Anthropic accepts any `claude-*` model ID the account lists, not only the two built-in ones.
- The OpenCode capability lookup uses the key, so a model the account has not enabled shows as not found.
- The chat completions adapter reads content sent as an array of parts (skipping thinking parts).
- Provider errors: a new `model-access` failure for models the account has not enabled; HTTP 410 maps to unavailable; rate-limit, credits and unknown errors include the provider's own message.
- The eval also accepts `OPENCODE_APIKEY` as the OpenCode key variable.

## Capabilities

### New Capabilities

### Modified Capabilities
- `llm-provider-settings`: models are listed from the provider; Anthropic accepts listed model IDs; the OpenCode lookup uses the key.
- `prompt-editing`: content parts are read; model-access and provider messages are reported.

## Impact

- Bounded context: AI Assistance only.
  - domain: `ModelOption`, `ModelLister` port, relaxed Anthropic model ID rule, `model-access` failure kind.
  - application: `ListModels` use case.
  - infrastructure: list support in the OpenRouter, OpenCode and LiteLLM catalogs, a new `AnthropicModelLister`, a `ModelListerRouter`, and content parsing and error mapping in `ChatCompletionsPatchGenerator`.
- Extension: options UI (model field with the account's models), e2e fakes.
- Out of scope: per-model pricing display, searching models by capability, and caching lists across browser restarts.
