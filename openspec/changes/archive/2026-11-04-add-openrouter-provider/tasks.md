# Tasks

## 1. AI domain

- [x] 1.1 Add `ProviderId`, `ContextProfile`, `OpenRouterModelId` (format check, default `z-ai/glm-5.3-flash`, suggestions constant) and `ModelCapabilities`; verify unit tests for valid and invalid IDs (including `~z-ai/glm-flash-latest`) and for the defaults
- [x] 1.2 Reshape `ProviderSettings` per design D1 (active provider, per-provider key/model/profile, OpenRouter capabilities), with `toConfig()` returning the discriminated `ProviderConfig` for the active provider; verify tests for "keys are kept per provider", "key saved only for the other provider" and per-provider clear
- [x] 1.3 Add `ContextBudget` (standard 12 000/40, compact 6 000/20) and the profile defaults (OpenRouter compact, Anthropic standard); make `EditContext.create` take a budget; verify tests for both profiles and the override
- [x] 1.4 Add `chooseOutputMode` (design D3); verify a test per branch (Anthropic, structured, tools-only, unknown)
- [x] 1.5 Add `repairDraft` with `RepairKind` reporting (design D2 rule list); verify a test per rule, a test that repair never adds ops or targets, and a test that an unknown repaired target is still rejected by `PatchProposal.fromDraft`
- [x] 1.6 Change ports: `PatchGenerator.generate` returns `GeneratorOutput { raw, diagnostics }`, add `ProposalParser` and `ModelCatalog`, add the `ProviderError` kinds `credits`, `moderation`, `unavailable`, `no-provider` with messages; verify `pnpm --filter @hew/core typecheck` reports only the expected call sites, which are fixed in groups 2–3

## 2. AI application

- [x] 2.1 Rework `GeneratePatch`: budget from settings, output mode in the request, parse → repair → parse → target check per attempt, one retry with remaining issues, `diagnostics` in the response; verify tests for "code fences accepted without retry", "unrepairable output retries once", "repair counted in diagnostics", and the existing missing-key and provider-failure tests
- [x] 2.2 Add `GetContextBudget` and `LookupModel`; make `SaveProviderSettings` accept a provider, validate the model per provider, and store catalog capabilities for OpenRouter (unknown on catalog failure); extend `ProviderSettingsView` with provider, per-provider masked keys, suggestions, profile and capabilities; verify tests with fake catalog and repository, including "malformed OpenRouter model ID" and "catalog unreachable"
- [x] 2.3 Export the new use cases and types from `ai/application/index.ts`; verify the boundaries lint test still passes and no other context imports `ai/domain`

## 3. AI infrastructure

- [x] 3.1 Adapt `AnthropicPatchGenerator` to return raw tool input plus diagnostics, and move its Zod parsing into an `AnthropicProposalParser`; verify the existing adapter tests pass after updating them to the new return type
- [x] 3.2 Add the strict OpenRouter wire schema (design D4) with Zod, its JSON schema export (no `$ref`/`oneOf`/`pattern`, all objects `additionalProperties: false`) and an `OpenRouterProposalParser` mapping `styles` pairs back to a record; verify tests that the exported schema meets those constraints and that parsing round-trips every op type
- [x] 3.3 Implement `OpenRouterPatchGenerator` for the three modes, plus `ping`, timeout, status and body-error mapping (401/402/403/408/429/502/503) and cost from `usage`; verify tests with mocked `fetch` asserting the request body per mode (`response_format` + `require_parameters`, forced tool, no format) and each error mapping
- [x] 3.4 Implement `OpenRouterModelCatalog` with a 10-minute cache and no auth header; verify tests with mocked `fetch` for known model, unknown model, network failure, and that the request has no `Authorization` header
- [x] 3.5 Implement `PatchGeneratorRouter` (generator and parser by provider); verify a routing test for both providers

## 4. Editing infrastructure

- [x] 4.1 Make `buildSelectionContext` take `{ maxTargets }`; verify a jsdom test for "compact profile limits targets" (t0 is always the selection) and the existing context tests
- [x] 4.2 Give `AiPatchSourceAdapter` a `BudgetRequester`, called before building the context; verify an adapter test that the budget's target limit is applied and that a budget failure is reported without calling the patch requester

## 5. Extension

- [x] 5.1 Add the `ai/getContextBudget` message and its bridged requester; wire the router, catalog and budget handler in the background composition root; verify unit tests for the new bridge function and `pnpm lint`
- [x] 5.2 Migrate `ChromeSettingsRepository` to the v2 shape with phase 1 detection (design D7); verify tests for v2 round-trip, phase 1 upgrade and invalid-data fallback
- [x] 5.3 Update the options page (design D8): provider control, per-provider key/model fields, OpenRouter datalist and debounced catalog status, profile select, Test/Clear on the active provider; verify with the e2e tests in 5.5
- [x] 5.4 Add `https://openrouter.ai/*` to the manifest host permissions and map the new error codes in the side panel (`provider-credits`, `provider-moderation`, `provider-no-provider` show a settings link where relevant); verify the built manifest and a side panel e2e assertion
- [x] 5.5 Extend the e2e suite: save an OpenRouter key and model, switch providers and confirm both keys persist, and run the edit loop with the e2e fake generator while OpenRouter is active; verify `pnpm e2e` passes

## 6. Eval harness

- [x] 6.1 Create `packages/eval` (tsx runner, jsdom), add the `eval` boundaries element, the root `pnpm eval` script, and gitignore `packages/eval/results/`; verify `pnpm lint` and that `pnpm test` does not run it
- [x] 6.2 Add the static demo-app HTML fixtures and the 10 cases with check helpers (design D9); verify a dry-run mode (`--dry-run`) that applies each case's hand-written reference patch and checks that every case passes
- [x] 6.3 Implement the runner: arguments, early exit without a key, printing the planned call count, per-case execution through `GeneratePatch` + `DomPageGateway`, summary table and JSON results; verify the missing-key exit and a run against a fake generator in a unit test
- [x] 6.4 Document `pnpm eval` usage in README.md; verify the documented command runs in `--dry-run` mode as written
- [x] 6.5 Make each case's checks judge one property each: find inserted elements wherever they landed and check position separately; verify a unit test where a banner inserted in the wrong place fails only the position check, and the dry run and "checks fail on the untouched page" tests still pass
- [x] 6.6 Add `--repeat N`: run each case N times per model, report mean pass rate with min–max across runs and list inconsistent cases; verify unit tests for the aggregate, the range and the inconsistent-case list, and that N=1 output is unchanged

## 7. Integration

- [x] 7.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm spec:validate` and `pnpm e2e`; verify all pass
- [x] 7.2 With the user's OpenRouter key, run `pnpm eval --model z-ai/glm-5.3-flash --model anthropic/claude-haiku-5.5` and share the summary table; verify a results file is written and the numbers are reported to the user

## Workflow follow-up

- Archive the change with `openspec archive add-openrouter-provider` after review.
- Decide the default OpenRouter model and the compact budget values from the eval results.
