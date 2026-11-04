# Hot Edit Web

A Chrome extension for product owners: select part of any web page, describe a change in plain language, and preview it live. It runs on your own Anthropic API key.

## Run it

```bash
pnpm install
pnpm build          # production build → packages/extension/.output/chrome-mv3
pnpm fixture        # demo page at http://localhost:5179
```

Load `packages/extension/.output/chrome-mv3` with **chrome://extensions → Developer mode → Load unpacked**. Add your key on the extension's options page, open a page, click the toolbar icon to open the side panel, then **Select element** and describe the change. `pnpm dev` runs WXT in watch mode with its own browser profile.

## Checks

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint, including the DDD layer and bounded-context boundaries |
| `pnpm typecheck` | TypeScript for every package |
| `pnpm test` | Vitest unit tests (domain, application, DOM via jsdom, adapters) |
| `pnpm e2e` | Builds the extension in `e2e` mode (fake model) and drives it with Playwright |
| `pnpm spec:validate` | `openspec validate --all --strict` |

## How it is organized

- `openspec/`: specs and change proposals. Work starts as an OpenSpec change (`/opsx:propose`); `openspec/config.yaml` records the architecture rules every change must follow.
- `packages/core`: bounded contexts in DDD layers. `editing` covers selection, patch ops, history and the DOM gateway; `ai` covers the provider settings and patch generation through Claude. `domain` is pure TypeScript, `application` holds the use cases, and `infrastructure` holds the adapters.
- `packages/extension`: the WXT/React extension. It contains the presentation (picker overlay, side panel, options), the chrome adapters, and the composition roots that wire adapters into use cases.
- `fixtures/demo-app`: the page the e2e tests edit.

The model never returns JavaScript. It returns structured patch ops, which are validated, sanitized and applied with exact inverses for undo and redo.
