## Why

The changes a product owner makes in a session are lost when the page reloads. The value of a session is the decisions it captured: what was asked, what changed, on which element, and with which design tokens. Those should become a spec a developer, or an AI coding agent, can implement in the real codebase.

## What Changes

- New **Handoff** bounded context that turns the session's applied changesets into a **Change Spec**. For each change it records:
  - the page;
  - the prompt and summary;
  - the operations, described in plain language with their target selectors, inserted HTML, styles and CSS;
  - the design tokens used.
- Each change becomes a requirement with WHEN/THEN scenarios and implementation tasks.
- Three export formats:
  - **Markdown**: one human-readable spec.
  - **OpenSpec change** (`.zip` with `proposal.md`, `design.md`, `tasks.md` and `specs/<capability>/spec.md`): it validates with `openspec validate --strict` and can be dropped into a repo's `openspec/changes/`.
  - **JSON**: machine-readable, for automation.
- The side panel gets an Export section: choose a format, then download, or copy the Markdown.
- Editing exposes the applied changes with full operation details through a new use case.

## Capabilities

### New Capabilities
- `change-spec-export`: build a Change Spec from the session and export it as Markdown, an OpenSpec change or JSON.

### Modified Capabilities

## Impact

- New context `packages/core/src/handoff/{domain,application,infrastructure}`.
- Editing application gets `ExportSessionChanges` and its DTOs.
- Extension:
  - `editing/exportChanges` content command (adds the page URL and title).
  - Side panel Export section.
  - Download and clipboard services in composition.
- Lint boundaries include the new context.
- Out of scope:
  - Before/after screenshots.
  - Opening GitHub issues or PRs.
  - AI-written prose.
  - Persisting sessions across reloads.
