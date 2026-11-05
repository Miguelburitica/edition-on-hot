## ADDED Requirements

### Requirement: Session changes export as a change spec
The system SHALL build a change spec from the changesets currently applied in the session, in order. For each one it SHALL include the prompt, the summary, a requirement with a WHEN/THEN scenario, the operations described with their target selectors and content, and the design tokens used.

#### Scenario: Export applied changes
- **WHEN** two changesets are applied and the user exports
- **THEN** the spec contains two requirements in that order with their prompts, target selectors and inserted HTML

#### Scenario: Undone changes are excluded
- **WHEN** the latest changeset is undone and the user exports
- **THEN** the spec does not contain it

#### Scenario: Nothing to export
- **WHEN** no changeset is applied
- **THEN** export is unavailable

#### Scenario: Tokens used
- **WHEN** a change's CSS uses `var(--color-primary)` and the active design system defines it
- **THEN** the spec lists `--color-primary` with its value for that change

### Requirement: Specs export in three formats
The system SHALL export the change spec as a Markdown document, as an OpenSpec change archive (proposal, design, tasks and a spec delta) that passes strict OpenSpec validation, or as JSON. It SHALL let the user download any of them or copy the Markdown.

#### Scenario: Markdown download
- **WHEN** the user exports as Markdown
- **THEN** a `.md` file downloads with the requirements, implementation notes and tasks

#### Scenario: OpenSpec archive
- **WHEN** the user exports as an OpenSpec change and unzips it into `openspec/changes/`
- **THEN** `openspec validate <change> --strict` passes

#### Scenario: JSON download
- **WHEN** the user exports as JSON
- **THEN** a `.json` file downloads with the page, the changes and their operations

#### Scenario: Copy Markdown
- **WHEN** the user copies the spec
- **THEN** the Markdown is on the clipboard
