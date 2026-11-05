# Spec Delta

## MODIFIED Requirements

### Requirement: Added styles are scoped
The system SHALL scope stylesheet rules added by a changeset so they only affect the selected element, the elements inside it, and the elements the changeset inserted. Rules SHALL NOT affect any other element on the page.

#### Scenario: Scoped rule does not leak
- **WHEN** an add-stylesheet operation sets a rule for ".banner" and the page already has an unrelated ".banner" element outside the selection
- **THEN** the unrelated element's computed style is unchanged

#### Scenario: Rule styles every item in the selection
- **WHEN** a list is selected and an add-stylesheet operation sets a border for "li"
- **THEN** every item of that list gets the border, and list items elsewhere on the page do not

#### Scenario: Rule styles inserted elements outside the selection
- **WHEN** a changeset inserts a banner before the selected form and adds a rule for ".banner-new"
- **THEN** the inserted banner is styled even though it is outside the form

#### Scenario: Undo removes the selection mark
- **WHEN** a changeset with an add-stylesheet operation is applied and then undone
- **THEN** the selected element's HTML equals its HTML before the changeset

## ADDED Requirements

### Requirement: Operations without a visible effect are flagged
After applying a changeset, the system SHALL check each operation and attach a warning when a stylesheet rule matches no element or when an operation's target, or every node it inserted, is not rendered. A changeset with warnings SHALL still count as applied.

#### Scenario: Rule matches nothing
- **WHEN** an add-stylesheet operation's selectors match no element in its scope
- **THEN** the changeset is applied with a warning naming the rule that matched nothing

#### Scenario: Hidden target
- **WHEN** a style operation targets an element that is not rendered (for example `display: none` on it or an ancestor)
- **THEN** the changeset is applied with a warning that the target is hidden

#### Scenario: Intentional hiding is not flagged
- **WHEN** an operation hides a visible element by setting `display: none` or removes it
- **THEN** no warning is attached for that operation
