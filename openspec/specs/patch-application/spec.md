# patch-application Specification

## Purpose
Applies structured patch operations to the live page safely and records how to reverse each one, so every visible change can be undone exactly.

## Requirements

### Requirement: Supported patch operations
The system SHALL support these operations on a target element: insert HTML (before, after, as first child, as last child), replace the element, set inline styles, set or remove an attribute, set text content, remove the element, and add a stylesheet rule set.

#### Scenario: Insert a banner before a form
- **WHEN** an insert operation with position "before" and banner HTML targets a form
- **THEN** the banner appears in the DOM immediately before the form

#### Scenario: Set a style
- **WHEN** a set-style operation sets background-color on a button
- **THEN** the button's inline background-color has the given value

### Requirement: Inserted HTML is sanitized
The system SHALL sanitize all HTML from patch operations before inserting it, removing script elements, inline event handler attributes and javascript: URLs.

#### Scenario: Script is stripped
- **WHEN** an insert operation contains a script element and an onclick attribute
- **THEN** the inserted markup has neither the script element nor the onclick attribute

#### Scenario: Event handler attribute is refused
- **WHEN** a set-attribute operation targets an attribute whose name starts with "on"
- **THEN** the operation is rejected and the element is unchanged

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

### Requirement: Changesets apply atomically
The system SHALL apply all operations of a changeset or none of them. If any operation's target cannot be resolved or the operation fails, every operation already applied in that changeset SHALL be reverted.

#### Scenario: Second operation fails
- **WHEN** a changeset's first operation succeeds and its second targets an element that cannot be found
- **THEN** the first operation is reverted, the page matches its state before the changeset, and an error names the unresolved target

### Requirement: Every applied operation is reversible
The system SHALL record, for each applied operation, the inverse needed to restore the prior DOM state exactly.

#### Scenario: Reverting restores the DOM
- **WHEN** a changeset containing an insert, a style change and a text change is applied and then reverted
- **THEN** the targeted subtree's HTML equals its HTML before the changeset was applied

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
