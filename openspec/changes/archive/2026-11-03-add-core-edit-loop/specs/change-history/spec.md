# Spec Delta

## Purpose

Keeps an ordered history of the changes applied in a tab so the user can review them and undo or redo them in a predictable order.

## ADDED Requirements

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
