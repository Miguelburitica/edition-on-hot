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
The system SHALL scope stylesheet rules added by a changeset so they only affect elements inserted or marked by that changeset.

#### Scenario: Scoped rule does not leak
- **WHEN** an add-stylesheet operation sets a rule for ".banner" and the page already has an unrelated ".banner" element
- **THEN** the unrelated element's computed style is unchanged

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
