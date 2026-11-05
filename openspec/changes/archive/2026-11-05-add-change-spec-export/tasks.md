## 1. Editing application

- [x] 1.1 `ExportSessionChanges` with `ChangeLog` DTOs (applied changesets only, flattened anchors); unit tests

## 2. Handoff domain and application

- [x] 2.1 `ChangeSpec` (title, change name, capability, unique requirements, scenarios, op steps, tokens used), `NothingToExportError`, renderer port; unit tests
- [x] 2.2 `ExportChangeSpec` use case; unit tests

## 3. Handoff infrastructure

- [x] 3.1 Markdown, OpenSpec (zip) and JSON renderers, `ZipWriter`; tests, including that the OpenSpec files validate with `openspec validate --strict`

## 4. Extension

- [x] 4.1 Lint boundaries; `editing/exportChanges` command; side panel Export section with download and copy
- [x] 4.2 e2e: apply a change, export Markdown and JSON, check the contents
