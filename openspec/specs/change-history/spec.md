# change-history Specification

## Purpose
Keeps an ordered history of the changes applied in a tab so the user can review them and undo or redo them in a predictable order.

## Requirements

### Requirement: Applied changes are recorded per tab session
The system SHALL record each successfully applied changeset in the edit session of the tab where it was applied, with its prompt, summary, time and status. A session SHALL last while the page stays loaded.

#### Scenario: Changeset listed after apply
- **WHEN** a changeset is applied successfully
- **THEN** the side panel's history shows it at the top with its prompt and summary

#### Scenario: Failed changes are not recorded
- **WHEN** applying a changeset fails
- **THEN** the history is unchanged

### Requirement: Undo reverts the most recent applied changeset
The system SHALL undo only the most recently applied changeset that is still applied, restoring the page to its state before that changeset.

#### Scenario: Undo twice
- **WHEN** changesets A then B are applied and the user undoes twice
- **THEN** B is reverted first, then A, and both are marked as undone

#### Scenario: Nothing to undo
- **WHEN** no changeset is applied
- **THEN** the undo control is disabled

### Requirement: Redo re-applies the most recently undone changeset
The system SHALL redo the most recently undone changeset. Applying a new changeset SHALL discard all undone changesets from the redo stack.

#### Scenario: Redo after undo
- **WHEN** changeset A is undone and the user chooses redo
- **THEN** A is applied again and marked as applied

#### Scenario: New change clears redo
- **WHEN** changeset A is undone and a new changeset B is applied
- **THEN** redo is disabled and A is no longer offered for redo

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
- **THEN** its entry is marked "applied · warnings" and shows the warning
