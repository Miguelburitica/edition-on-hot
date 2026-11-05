# Spec Delta

## MODIFIED Requirements

### Requirement: Request is sent with bounded element context
The system SHALL send the provider the request text, the selection's HTML trimmed to the maximum size of the active context profile, a summary of its ancestors including the layout of each ancestor that is a grid or flex container, and its key computed styles including its own layout properties. The profile also caps how many elements are targetable. It SHALL NOT send cookies, storage contents or form field values.

#### Scenario: Large element is trimmed
- **WHEN** the selected element's HTML exceeds the maximum context size of the active profile
- **THEN** the HTML sent is truncated to that size and marked as truncated

#### Scenario: Input values are excluded
- **WHEN** the selection contains an input with a typed value
- **THEN** the context sent to the provider contains the input without its value

#### Scenario: Compact profile limits targets
- **WHEN** the compact profile is active and the selection contains more elements than its target limit
- **THEN** only that many elements are labeled as targets, starting with the selection itself

#### Scenario: Parent layout is described
- **WHEN** the selection sits in a two-column grid and the user asks it to use all the available space
- **THEN** the ancestor summary sent to the provider says the parent is a grid and gives its columns

### Requirement: Provider output is a validated patch proposal
The system SHALL accept from the provider only a list of up to 60 structured patch operations matching the patch schema, plus a short summary. Operations that set reserved `data-hew-` attributes or event-handler attributes, or use `javascript:` URLs, SHALL be validation issues. It SHALL never execute provider output as script.

#### Scenario: Valid proposal
- **WHEN** the provider returns operations that match the schema
- **THEN** a patch proposal with those operations and the summary is produced

#### Scenario: Invalid output is retried once
- **WHEN** the provider's first output fails schema validation
- **THEN** the system asks the provider once more, including the validation errors

#### Scenario: Invalid output after retry
- **WHEN** the provider's second output also fails validation
- **THEN** the request fails with an "invalid patch" error and the page is not changed

#### Scenario: Reserved attribute is retried, not shown raw
- **WHEN** the provider's first output sets an attribute named `data-hew-submit-hook`
- **THEN** the system retries once with an issue explaining that `data-hew-` attributes are reserved, and the user only sees an error if the retry also fails

#### Scenario: Large proposals
- **WHEN** the provider returns 45 valid operations
- **THEN** the proposal is accepted

## ADDED Requirements

### Requirement: The model is asked for complete changes
The system SHALL instruct the model to apply the request to every element it concerns, to use selection-scoped stylesheet rules for repeated items, and to restructure markup when the request implies it, instead of preferring the smallest change.

#### Scenario: Every item
- **WHEN** a list is selected and the user asks for alternating borders on every item
- **THEN** the request sent to the model explains that stylesheet rules apply to the selected element and everything inside it
