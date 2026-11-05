# Spec Delta

## ADDED Requirements

### Requirement: User can jump to any version
The system SHALL show the history as a timeline starting with the original page, followed by each changeset in order, with the current version marked. Choosing an entry SHALL show the page as it was at that version by undoing or redoing changesets as needed.

#### Scenario: Back to the original
- **WHEN** three changesets are applied and the user chooses "Original"
- **THEN** all three are undone, the page matches its state before the first changeset, and "Original" is marked as current

#### Scenario: Jump forward
- **WHEN** the user is viewing the original and chooses the second changeset
- **THEN** the first and second changesets are applied, the third stays undone, and the second is marked as current

#### Scenario: New change from an earlier version
- **WHEN** the user is viewing version 1 of 3
- **THEN** the panel warns that applying a new change discards versions 2 and 3, and applying one does so

#### Scenario: A version cannot be restored
- **WHEN** re-applying a changeset while jumping forward fails because its target is gone
- **THEN** the page stays at the last version that applied, that version is marked as current, and the user sees the error

### Requirement: History shows each changeset's operations and warnings
Each history entry SHALL expand to list its operations with their type and target element, and SHALL show any warnings attached when it was applied.

#### Scenario: Inspect a changeset
- **WHEN** the user expands a history entry
- **THEN** each operation is listed with its type and a short description of its target

#### Scenario: Applied with warnings
- **WHEN** a changeset was applied with a warning that a rule matched nothing
- **THEN** its entry says "applied with warnings" and shows the warning
