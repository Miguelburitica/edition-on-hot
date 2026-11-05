## Context

`SessionSnapshot` only exposes op types and short target labels. Full ops live in the `EditSession` aggregate inside the content script. The design system, if any, is known to the side panel.

## Goals / Non-Goals

**Goals:**
- A deterministic, faithful spec of what is currently applied.
- An OpenSpec export that validates.

**Non-Goals:**
- Prose generation by the model.
- Screenshots.
- A GitHub integration.

## Decisions

### D1. Editing exposes applied changes
`ExportSessionChanges` (Editing application) returns `ChangeLog { changes: ChangeRecord[] }`, which covers only the changesets that are currently applied, oldest first.
- `ChangeRecord`: `{ id, prompt, summary, createdAt, ops: OpRecord[], warnings }`.
- `OpRecord`: the op with each anchor flattened to `{ selector, tag, role?, text }`.

The content command `editing/exportChanges` adds `page: { url, title }`.

### D2. Handoff domain
- `ChangeSpec` value object, built by `ChangeSpec.create(input, now)`.
  - Input: `{ page, changes, designSystem?: { name, tokens: { cssVar, value, group }[] } }`.
  - `NothingToExportError` when there are no changes.
  - It derives:
    - `title`: from the page title or host.
    - `changeName`: kebab-case `ui-<host>-<yyyymmdd>`, prefixed with a letter.
    - `capability`: kebab-case from the host plus the first path segment, or `ui` when empty.
    - For each change: `requirement` (a title from the summary, made unique), `scenario` (WHEN the user opens the page path, THEN the summary holds), `steps` (plain-language descriptions of each op), and `tokensUsed` (the `var(--x)` references in its HTML, styles and CSS, matched against the design system).
- Op descriptions are pure functions. For example, insert reads "Insert before `form.signup` (form): …" and is followed by the HTML block.
- Port `ChangeSpecRenderer.render(spec) → RenderedFile { fileName, mimeType, content: string | Uint8Array }`.

### D3. Handoff application
`ExportChangeSpec(renderers: Record<format, ChangeSpecRenderer>, clock)` takes `{ format: 'markdown' | 'openspec' | 'json', input }` and returns `Result<RenderedFile, …>`.

### D4. Handoff infrastructure
- `MarkdownSpecRenderer`: Why, What Changes, Design system tokens table, Requirements with scenarios, Implementation notes per change (prompt, target, steps, code blocks), and Tasks.
- `OpenSpecChangeRenderer`: builds `proposal.md`, `design.md`, `tasks.md` and `specs/<capability>/spec.md` with `## ADDED Requirements`.
  - Every requirement contains SHALL and at least one scenario.
  - The files are packed with `ZipWriter`: STORE method, CRC-32, no dependency.
- `JsonSpecRenderer`: `{ format: 'hew-change-spec', version: 1, ...spec }`.
- Code fences use a fence longer than any backtick run in the content.

### D5. Extension
The side panel Export section is enabled when at least one change is applied. It has a format select and two actions:
- "Download": `URL.createObjectURL` plus a temporary anchor.
- "Copy Markdown": `navigator.clipboard.writeText`.

The panel composes the input from the `editing/exportChanges` reply and the active design system view.

## Risks / Trade-offs

- Selectors are CSS paths from the live DOM. Developers still need to map them to components. The text fingerprint and tag help.
- Large inserted HTML makes long specs. That is acceptable, because it is what was approved.
