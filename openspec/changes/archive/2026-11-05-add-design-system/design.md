## Context

Generation sees only the selection. There is no notion of tokens or components, and no shared storage beyond provider settings and the per-tab edit session.

## Goals / Non-Goals

**Goals:**
- Capture a usable design system from a live page in one click.
- Round-trip DTCG token files.
- Make the model use tokens and component classes.
- Make injected token references render on the page.

**Non-Goals:**
- Perfect token naming.
- Theme variants.
- Enforcing token use.

## Decisions

### D1. Domain model (Design System domain)
- `Token` value object: `{ name, group, value, cssVar, source, uses? }`.
  - `group`: one of `color | spacing | radius | font-size | font-family | font-weight | shadow | other`.
  - `source`: one of `variable | inferred | imported`.
  - `name` is kebab-case. `cssVar` must match `--[a-zA-Z0-9_-]+`.
  - `value` must be non-empty, at most 200 characters, and free of `;{}<>`, so it can be written into a stylesheet safely.
- `ComponentPattern` value object: `{ name, kind, tag, classes, example }`.
  - `example` is a small HTML snippet built by the extractor: tag, classes and short text only.
- `DesignSystem` aggregate: `{ id, name, origin | null, tokens, components, createdAt, updatedAt }`.
  - Invariants: a name of 1–80 characters; unique token names and css vars; at most 400 tokens and 40 components.
  - Behaviour:
    - `rename`.
    - `guidance(maxChars)`: ordered groups, cut at line boundaries.
    - `injectableVariables()`: the tokens whose source is not `variable`.
- Port `DesignSystemRepository`: `list`, `get`, `save`, `delete`, `activeFor(origin)`, `setActive(origin, id | null)`.
- Port `DesignSystemExtractor`: `extract() → ExtractedDesignSystem`.
- Port `DesignTokenCodec`: `encode(ds) → text` and `decode(text) → Result<draft>`.
- Domain errors:
  - `InvalidDesignSystemError`.
  - `DesignSystemNotFoundError`.
  - `InvalidTokenFileError`.
  - `NothingExtractedError`.

### D2. Application (Design System application)
- Use cases:
  - `ExtractDesignSystem(extractor)`: content script.
  - `SaveDesignSystem(repo, ids, clock)`: from a draft; activates for the origin.
  - `ImportDesignSystem(repo, codec, ids, clock)`.
  - `ExportDesignSystem(repo, codec)`: returns `{ fileName, text }`.
  - `ListDesignSystems`.
  - `GetActiveDesignSystem(origin)`.
  - `ActivateDesignSystem(origin, id | null)`.
  - `DeleteDesignSystem`: also clears bindings.
  - `GetDesignGuidance(pageUrl, maxChars)`.
  - `GetInjectableTokens(origin)`.
- Views are plain DTOs: `DesignSystemView` and `TokenView`.

### D3. Infrastructure (Design System infrastructure)
- `DomDesignSystemExtractor(document, window)`:
  - Reads `:root`, `html` and `body` custom properties from readable stylesheets. Cross-origin sheets are skipped.
  - Values are resolved through `getComputedStyle`.
  - Groups are classified by name and value.
  - Up to 2,000 visible elements are sampled for computed styles. The extractor counts frequencies, normalizes colors to hex, drops values already covered by a variable, and keeps the top values per group with role names. Inferred names get `--ds-` css vars.
  - Component patterns are grouped by tag and class signature. Elements of the extension (`data-hew-*`, overlay host) are ignored.
- `DomTokenInjector(document)`: maintains one `<style data-hew-design-system>` that defines `:root { --ds-x: value; }` only for variables the page does not already define. `clear()` removes it.
- `DtcgCodec`: Zod-validated decode.
  - Nested groups; `$type` is inherited.
  - `{a.b}` references are resolved (depth 10, cycles rejected).
  - Composite `shadow`, `typography` and `fontFamily` arrays become CSS strings.
  - Groups are mapped from `$type` and the path.
  - Input is capped at 1 MB.
  - Encode writes groups by token group, with `$extensions.hew` for the css var, the source and the components.

### D4. Guidance into the AI context
- AI domain:
  - `DesignGuidanceSource.forPage(pageUrl, maxChars) → Promise<string | null>`.
  - `EditContextProps.designSystem?: string`, truncated to `ContextBudget.maxDesignChars`: 4,000 for standard, 1,500 for compact.
- `GeneratePatch` takes the source as an optional dependency.
- The prompt builder adds a "Design system" block and a rule to prefer `var(--token)` and the component classes.
- The background composition wires the source to `GetDesignGuidance`, reading the same chrome.storage repository. The two contexts do not import each other; only the composition root knows both.

### D5. Extension wiring
- Storage: `hew.designSystems = { version: 1, systems: Record<id, StoredDesignSystem>, bindings: Record<origin, id> }` in `storage.local`.
- Messages:
  - `designSystem/extract` replies with `{ draft, origin, title }`.
  - `designSystem/inject` takes `{ variables: Record<string,string> | null }`; the schema re-checks the names and values.
  - `EditorState` gains `origin`.
- Side panel "Design system" section:
  - Active design system name, counts, and swatches (in a `<details>`).
  - A select of saved design systems plus "None".
  - "Extract from page", "Import tokens…" (file input) and "Export" (downloads DTCG JSON).
  - "Delete".
  - After every change, and on connect, the panel sends `inject` for the tab.

## Risks / Trade-offs

- Inferred role names are heuristics. Users can still edit tokens through export, edit and import.
- Pages with cross-origin stylesheets expose only computed values. Inference covers them.
- Guidance costs prompt tokens. It is bounded per profile.
