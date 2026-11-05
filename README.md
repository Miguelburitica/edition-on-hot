# Hot Edit Web

A Chrome extension for product owners: select part of any web page, describe a change in plain language, and preview it live. It runs on your own API key: Anthropic, or OpenRouter for models like GLM 5.3 Flash and Claude Haiku 5.5.

## Run it

```bash
pnpm install
pnpm build          # production build → packages/extension/dist/chrome-mv3
pnpm fixture        # demo page at http://localhost:5179
```

Load `packages/extension/dist/chrome-mv3` with **chrome://extensions → Developer mode → Load unpacked**. Add your key on the extension's options page, open a page, click the toolbar icon to open the side panel, then **Select element** and describe the change. `pnpm dev` runs WXT in watch mode with its own browser profile.

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

The key can also live in a git-ignored `.env` at the repo root (`OPENROUTER_API_KEY` or `OPEN_ROUTER_KEY`, `ANTHROPIC_API_KEY`); variables set in the shell take precedence.

Options: `--repeat N` to run each case N times (the passed column then shows the mean and the per-run range, and cases that flip between runs are listed), `--provider anthropic` (uses `ANTHROPIC_API_KEY`, model ids like `claude-opus-5-5`), `--case <text>` to run matching cases only, `--dry-run`. It prints a per-case line, a summary table (first-try valid, valid after retry, repaired, applied, passed, median latency, cost) and the failures, and writes the full results to `packages/eval/results/`.

## How it is organized

- `openspec/`: specs and change proposals. Work starts as an OpenSpec change (`/opsx:propose`); `openspec/config.yaml` records the architecture rules every change must follow.
- `packages/core`: bounded contexts in DDD layers. `editing` covers selection, patch ops, history and the DOM gateway; `ai` covers the provider settings and patch generation through Claude. `domain` is pure TypeScript, `application` holds the use cases, and `infrastructure` holds the adapters.
- `packages/extension`: the WXT/React extension. It contains the presentation (picker overlay, side panel, options), the chrome adapters, and the composition roots that wire adapters into use cases.
- `packages/eval`: the model eval harness (`pnpm eval`).
- `fixtures/demo-app`: the page the e2e tests edit.

The model never returns JavaScript. It returns structured patch ops, which are validated, sanitized and applied with exact inverses for undo and redo.
