# prompt-editing Specification

## Purpose
Turns a natural-language change request about the current selection into a validated, structured patch proposal produced by the configured LLM.

## Requirements

### Requirement: Prompt requires a selection
The system SHALL only accept a change request when an element is selected and the request text is not blank.

#### Scenario: No selection
- **WHEN** the user submits a request with no element selected
- **THEN** the request is rejected with a message asking the user to select an element first

#### Scenario: Blank request
- **WHEN** the user submits a request containing only whitespace
- **THEN** the request is rejected and nothing is sent to the provider

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

### Requirement: Provider failures are reported
The system SHALL report provider errors (authentication, out of credits, moderation block, no available provider, rate limit, network, timeout) to the user in plain language and leave the page unchanged.

#### Scenario: Wrong API key
- **WHEN** the provider rejects the request as unauthenticated
- **THEN** the user sees a message that the API key is invalid, with a link to settings

#### Scenario: Out of credits
- **WHEN** OpenRouter answers that the account has insufficient credits
- **THEN** the user is told to add credits to their OpenRouter account

#### Scenario: Blocked by moderation
- **WHEN** the provider blocks the request for moderation reasons
- **THEN** the user is told the request was blocked by the provider's content policy

#### Scenario: No provider can serve the model
- **WHEN** OpenRouter reports that no provider meets the request's requirements
- **THEN** the user is told the model is unavailable with the required features and is pointed to settings to pick another model

### Requirement: Output mode follows model capabilities
The system SHALL request output in the most reliable mode the model supports: a strict JSON-schema response when structured outputs are supported, otherwise tool calling, otherwise JSON in plain text. Anthropic requests keep tool calling.

#### Scenario: Structured outputs supported
- **WHEN** the active OpenRouter model supports structured outputs
- **THEN** the request asks for a strict JSON-schema response and only routes to providers that support it

#### Scenario: Only tools supported
- **WHEN** the model supports tools but not structured outputs
- **THEN** the request uses tool calling

#### Scenario: Capabilities unknown
- **WHEN** the model's capabilities are unknown or it supports neither
- **THEN** the request asks for a JSON object in plain text and the response is parsed from the text

### Requirement: Mechanical mistakes are repaired before retrying
The system SHALL apply a fixed set of deterministic repairs to provider output that fails validation, and validate again before using the one retry. Repairs SHALL never invent operations or targets that the output did not contain.

#### Scenario: Code fences
- **WHEN** the output is valid JSON wrapped in a markdown code fence
- **THEN** the fence is removed and the proposal is accepted without a retry

#### Scenario: Bare target numbers and position aliases
- **WHEN** an op has target `"2"` and position `"above"`
- **THEN** they are read as `"t2"` and `"before"`

#### Scenario: Unrepairable output
- **WHEN** the output still fails validation after repair
- **THEN** the system retries once with the remaining validation errors, as before

#### Scenario: Repair cannot target unknown elements
- **WHEN** a repaired target id is not among the provided targets
- **THEN** the proposal is still rejected as invalid

### Requirement: The model is asked for complete changes
The system SHALL instruct the model to apply the request to every element it concerns, to use selection-scoped stylesheet rules for repeated items, and to restructure markup when the request implies it, instead of preferring the smallest change.

#### Scenario: Every item
- **WHEN** a list is selected and the user asks for alternating borders on every item
- **THEN** the request sent to the model explains that stylesheet rules apply to the selected element and everything inside it
