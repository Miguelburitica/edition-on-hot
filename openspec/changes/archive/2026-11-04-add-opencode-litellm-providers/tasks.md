## 1. AI domain

- [x] 1.1 Add `opencode` and `litellm` provider ids, labels and the `COMPATIBLE_PROVIDERS` spec table (default model, suggestions, profile, key required, editable base URL, default base URL, model-id rule) (design D1)
- [x] 1.2 Generalize `ProviderSettings` to an Anthropic slot plus compatible slots with `baseUrl`; validate base URLs (`InvalidBaseUrlError`, normalize trailing `/` and `/v1`); `toConfig` with an optional LiteLLM key and `MissingModelError`; unit tests for each provider, key optionality, URL validation and normalization
- [x] 1.3 Change `ModelCatalog.lookup` to take a `CatalogQuery`; update the domain tests

## 2. AI application

- [x] 2.1 `SaveProviderSettings` accepts `baseUrl`, rejects an empty LiteLLM model, and looks up capabilities for every compatible provider; `LookupModel` takes a query; the settings view lists every provider slot (with `baseUrl`, `keyRequired`, `baseUrlEditable`, suggestions); unit tests

## 3. AI infrastructure

- [x] 3.1 Replace `OpenRouterPatchGenerator` with `ChatCompletionsPatchGenerator` (base URL from config, optional auth header, OpenRouter-only fields, LiteLLM network message, neutral 402 message); tests for each provider's URL, headers and body
- [x] 3.2 `OpenCodeModelCatalog`, `LiteLlmModelCatalog` (model info with `/models` fallback) and `ModelCatalogRouter`; adapt `OpenRouterModelCatalog` to the query; tests with fake fetch

## 4. Extension

- [x] 4.1 Manifest: OpenCode host permission and optional any-host permissions (design D4)
- [x] 4.2 Settings repository v3 with v2 and v1 migration and per-slot fallback; tests
- [x] 4.3 Options UI: four providers, proxy URL field, optional-key label, catalog-specific capability text, and a host access request before saving LiteLLM; composition root wires `browser.permissions.request` (fake in e2e)
- [x] 4.4 e2e: configure LiteLLM with a URL and no key, save, and see it active; configure OpenCode and see the catalog status; verify `pnpm e2e` passes

## 5. Eval

- [x] 5.1 `--provider opencode|litellm`, `requireProviderEnv` (keys, `LITELLM_BASE_URL`), catalog router; tests for missing env messages
- [x] 5.2 README: providers and eval variables

## 6. Integration

- [x] 6.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm spec:validate`, `pnpm eval --dry-run`, `pnpm e2e`; verify all pass
