## 1. Design System domain

- [x] 1.1 `Token`, `ComponentPattern`, `DesignSystem` aggregate with invariants, `guidance`, `injectableVariables`; ports and errors; unit tests

## 2. Design System application

- [x] 2.1 Extract, save, import, export, list, get active, activate, delete, guidance and injectable-token use cases with fakes; unit tests

## 3. Design System infrastructure

- [x] 3.1 `DomDesignSystemExtractor` (variables, inferred tokens with roles, component patterns); jsdom tests
- [x] 3.2 `DomTokenInjector`; jsdom tests
- [x] 3.3 `DtcgCodec` decode/encode with references and composites; tests

## 4. AI Assistance

- [x] 4.1 `DesignGuidanceSource` port, `designSystem` in `EditContext`, `maxDesignChars` budget; `GeneratePatch` uses the source; prompt builder block and rule; unit tests

## 5. Extension

- [x] 5.1 Lint boundaries for the new context; chrome.storage design system repository; tests
- [x] 5.2 Messages, content-script extract/inject handlers, background guidance wiring
- [x] 5.3 Side panel Design system section (extract, import, export, switch, delete, swatches)
- [x] 5.4 e2e: extract from the fixture, see tokens, guidance reaches the generator, injected variables resolve, switch to none removes them
