# Spec Delta

## Purpose

Lets the user point at an element on any web page and turn that choice into a selection the editor can find again and send as context for an edit.

## ADDED Requirements

### Requirement: Picker mode highlights the hovered element
The system SHALL provide a picker mode. While it is active, the element under the pointer SHALL be outlined, the page SHALL NOT receive the click, and the extension's own overlay elements SHALL NOT be selectable.

#### Scenario: Hovering highlights an element
- **WHEN** picker mode is active and the user moves the pointer over a button
- **THEN** that button is outlined and its tag name is shown in a label next to the outline

#### Scenario: Overlay is never selected
- **WHEN** picker mode is active and the pointer is over the extension's own outline or label
- **THEN** the highlighted element stays the page element beneath it

### Requirement: Clicking selects an element
The system SHALL select the clicked element, leave picker mode, and keep the selection visibly marked until it is cleared or replaced.

#### Scenario: Selecting a form
- **WHEN** picker mode is active and the user clicks a form
- **THEN** the form becomes the current selection, picker mode ends, and the side panel shows the selection summary

#### Scenario: Cancelling the picker
- **WHEN** picker mode is active and the user presses Escape
- **THEN** picker mode ends and the previous selection, if any, is kept

### Requirement: Selection is described by a resolvable anchor
The system SHALL describe each selection with an anchor that combines a CSS selector, tag name, ARIA role when present, and a short text fingerprint. It SHALL be able to find the element again from the anchor alone.

#### Scenario: Resolving an unchanged page
- **WHEN** an anchor is resolved on the same page without DOM changes
- **THEN** it returns the originally selected element

#### Scenario: Resolving after sibling insertion
- **WHEN** a new sibling is inserted before the selected element and the anchor is resolved
- **THEN** it still returns the originally selected element, matched by its text fingerprint and tag

#### Scenario: Anchor no longer matches
- **WHEN** the selected element was removed from the page and the anchor is resolved
- **THEN** resolution reports that the anchor was not found
