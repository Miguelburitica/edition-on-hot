# Hot Edit Web

A Chrome extension for product owners: select part of any web page, describe a change in plain language, and preview it live. It runs on your own API key: Anthropic, OpenRouter or OpenCode (models like GLM 5.3 Flash and Claude Haiku 5.5), or your own LiteLLM proxy.

## Download

Every merge to `main` publishes a versioned build on the repository's **Releases** page (`hot-edit-web-v<version>-chrome.zip`, with a SHA-256 checksum). Unzip it, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.

Versions are `<major>.<minor>.<build>`: major and minor come from `packages/extension/package.json`, and the build number is the GitHub Actions run number. To start a new minor or major line, change that file's version (e.g. to `0.2.0`). The workflow is `.github/workflows/release.yml`; it runs lint, typecheck, unit tests and spec validation before building.

## Run it

```bash
pnpm install
pnpm build          # production build → packages/extension/dist/chrome-mv3
pnpm fixture        # demo page at http://localhost:5179
```

Load `packages/extension/dist/chrome-mv3` with **chrome://extensions → Developer mode → Load unpacked**. Add your key on the extension's options page (for LiteLLM, the proxy URL; its key is optional, and saving asks Chrome for access to that host only), open a page, click the toolbar icon to open the side panel, then **Select element** and describe the change. `pnpm dev` runs WXT in watch mode with its own browser profile.

The model field lists the models your key can use (OpenRouter's account list, OpenCode's enabled models, Anthropic's `/v1/models`, or your LiteLLM proxy's models); **Refresh models** reloads it.

## Design systems

In the side panel, **Extract from page** captures the site's design system: its `:root` custom properties, the most-used colors, spacing, radii, font sizes, fonts and shadows (as `--ds-…` tokens), and component patterns such as buttons, inputs and cards with their classes. **Import tokens…** reads a W3C Design Tokens (DTCG) JSON file, and **Export** writes one. One design system is active per site. Every change request on that site includes it, so the model uses `var(--token)` and the component classes. Tokens the page does not define are injected as root custom properties, so the preview renders them.

## Exporting a session as a spec

**Export spec** turns the changes currently applied into a spec: each change's prompt, a requirement with a WHEN/THEN scenario, the operations with their target selectors, HTML and CSS, the design tokens used, and implementation tasks. Choose **Markdown**, **OpenSpec change (.zip)** (unzip it into a repo's `openspec/changes/`; it passes `openspec validate --strict`) or **JSON**, or copy the Markdown.

## Checks

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint, including the DDD layer and bounded-context boundaries |
| `pnpm typecheck` | TypeScript for every package |
| `pnpm test` | Vitest unit tests (domain, application, DOM via jsdom, adapters) |
| `pnpm e2e` | Builds the extension in `e2e` mode (fake model) and drives it with Playwright |
| `pnpm spec:validate` | `openspec validate --all --strict` |
| `pnpm eval --dry-run` | Checks the eval cases against their reference patches (no provider calls) |

## Comparing models

`pnpm eval` runs 13 edit cases against real models with your own key, using the same prompt, output mode, repair and retry as the extension. It is never part of `pnpm test`.

```bash
OPENROUTER_API_KEY=sk-or-… pnpm eval --model z-ai/glm-5.3-flash --model anthropic/claude-haiku-5.5
```

The key can also live in a git-ignored `.env` at the repo root (`OPENROUTER_API_KEY` or `OPEN_ROUTER_KEY`, `ANTHROPIC_API_KEY`, `OPENCODE_API_KEY` or `OPENCODE_APIKEY`, `LITELLM_BASE_URL` / `LITELLM_API_KEY`); variables set in the shell take precedence.

Other providers: `--provider opencode` (uses `OPENCODE_API_KEY`, model ids like `glm-5.3-flash`) and `--provider litellm` (uses `LITELLM_BASE_URL`, e.g. `http://localhost:4000`, plus `LITELLM_API_KEY` if your proxy requires one; model ids are the names your proxy exposes).

Options: `--repeat N` to run each case N times (the passed column then shows the mean and the per-run range, and cases that flip between runs are listed), `--provider anthropic` (uses `ANTHROPIC_API_KEY`, model ids like `claude-opus-5-5`), `--case <text>` to run matching cases only, `--dry-run`. It prints a per-case line, a summary table (first-try valid, valid after retry, repaired, applied, passed, median latency, cost) and the failures, and writes the full results to `packages/eval/results/`.

## How it is organized

- `openspec/`: specs and change proposals. Work starts as an OpenSpec change (`/opsx:propose`); `openspec/config.yaml` records the architecture rules every change must follow.
- `packages/core`: bounded contexts in DDD layers. `editing` covers selection, patch ops, history and the DOM gateway; `ai` covers the provider settings and patch generation (Anthropic, plus OpenRouter, OpenCode and LiteLLM through one OpenAI-compatible adapter). `domain` is pure TypeScript, `application` holds the use cases, and `infrastructure` holds the adapters.
- `packages/extension`: the WXT/React extension. It contains the presentation (picker overlay, side panel, options), the chrome adapters, and the composition roots that wire adapters into use cases.
- `packages/eval`: the model eval harness (`pnpm eval`).
- `fixtures/demo-app`: the page the e2e tests edit.

The model never returns JavaScript. It returns structured patch ops, which are validated, sanitized and applied with exact inverses for undo and redo.

## License

[MIT](LICENSE)
