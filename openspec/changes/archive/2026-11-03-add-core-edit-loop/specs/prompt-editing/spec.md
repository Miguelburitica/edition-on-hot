# Spec Delta

## Purpose

Turns a natural-language change request about the current selection into a validated, structured patch proposal produced by the configured LLM.

## ADDED Requirements

### Requirement: Prompt requires a selection
The system SHALL only accept a change request when an element is selected and the request text is not blank.

#### Scenario: No selection
- **WHEN** the user submits a request with no element selected
- **THEN** the request is rejected with a message asking the user to select an element first

#### Scenario: Blank request
- **WHEN** the user submits a request containing only whitespace
- **THEN** the request is rejected and nothing is sent to the provider

### Requirement: Request is sent with bounded element context
The system SHALL send the provider the request text, the selection's HTML trimmed to a fixed maximum size, a summary of its ancestors, and its key computed styles. It SHALL NOT send cookies, storage contents or form field values.

#### Scenario: Large element is trimmed
- **WHEN** the selected element's HTML exceeds the maximum context size
- **THEN** the HTML sent is truncated to that size and marked as truncated

#### Scenario: Input values are excluded
- **WHEN** the selection contains an input with a typed value
- **THEN** the context sent to the provider contains the input without its value

### Requirement: Provider output is a validated patch proposal
The system SHALL accept from the provider only a list of structured patch operations matching the patch schema, plus a short summary. It SHALL never execute provider output as script.

#### Scenario: Valid proposal
- **WHEN** the provider returns operations that match the schema
- **THEN** a patch proposal with those operations and the summary is produced

#### Scenario: Invalid output is retried once
- **WHEN** the provider's first output fails schema validation
- **THEN** the system asks the provider once more, including the validation errors

#### Scenario: Invalid output after retry
- **WHEN** the provider's second output also fails validation
- **THEN** the request fails with an "invalid patch" error and the page is not changed

### Requirement: Provider failures are reported
The system SHALL report provider errors (authentication, rate limit, network, timeout) to the user in plain language and leave the page unchanged.

#### Scenario: Wrong API key
- **WHEN** the provider rejects the request as unauthenticated
- **THEN** the user sees a message that the API key is invalid, with a link to settings
