## Why

Generated changes reuse the page's look only as far as the model can guess it from one element's HTML and a few computed styles. Product teams have a design system (color, spacing, radius, type and shadow tokens, and component classes). Previews that use it look real, and they produce specs a developer can implement without translating hard-coded values. Users need to capture a design system from their product, bring one from a token file, and have every generation use it.

## What Changes

- New **Design System** bounded context.
- **Extraction**: from the current page, the system extracts:
  - CSS custom properties defined on `:root`.
  - Inferred tokens: the most-used colors, spacing, radii, font sizes, font families and shadows, with role names where they are clear (text, background, primary, border).
  - Component patterns: buttons, inputs, links, cards, badges, alerts and headings, with their classes.
- **Import and export**: design tokens in the W3C Design Tokens (DTCG) JSON format, including references and composite shadows. Components travel in a `hew` extension.
- **Library**: design systems are saved locally, and one can be activated per site (origin). The side panel shows the active one with its tokens and lets the user switch, extract, import, export or delete.
- **Injection into generation**: the active design system is summarized within a context budget and sent with every change request. The model is told to use `var(--token)` and the component classes.
- **Injection into the page**: tokens the page does not define (inferred or imported) are injected as `:root` custom properties, so `var(--ds-…)` references resolve. Removing or switching the design system removes them.

## Capabilities

### New Capabilities
- `design-system`: extraction, DTCG import/export, a local library with per-site activation, and token injection into the page.

### Modified Capabilities
- `prompt-editing`: change requests include the active design system's guidance.

## Impact

- New context `packages/core/src/design-system/{domain,application,infrastructure}`.
- AI Assistance:
  - domain: `EditContext` carries the design guidance; `ContextBudget.maxDesignChars`; a `DesignGuidanceSource` port.
  - application: `GeneratePatch` asks the port.
  - infrastructure: the prompt builder renders the guidance.
- Extension:
  - Infrastructure: a chrome.storage repository for design systems and new message schemas.
  - Composition: the background wires the guidance source; the content script runs the extractor and injector.
  - Presentation: a Design system section in the side panel.
- Lint boundaries include the new context.
- Out of scope:
  - Tailwind config import.
  - Figma sync.
  - A token linter that rewrites raw values to tokens.
  - Dark-mode token sets.
  - Syncing design systems across devices.
