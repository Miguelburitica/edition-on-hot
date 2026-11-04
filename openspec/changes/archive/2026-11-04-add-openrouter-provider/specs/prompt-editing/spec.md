# Spec Delta

## MODIFIED Requirements

### Requirement: Request is sent with bounded element context
The system SHALL send the provider the request text, the selection's HTML trimmed to the maximum size of the active context profile, a summary of its ancestors, and its key computed styles. The profile also caps how many elements are targetable. It SHALL NOT send cookies, storage contents or form field values.

#### Scenario: Large element is trimmed
- **WHEN** the selected element's HTML exceeds the maximum context size of the active profile
- **THEN** the HTML sent is truncated to that size and marked as truncated

#### Scenario: Input values are excluded
- **WHEN** the selection contains an input with a typed value
- **THEN** the context sent to the provider contains the input without its value

#### Scenario: Compact profile limits targets
- **WHEN** the compact profile is active and the selection contains more elements than its target limit
- **THEN** only that many elements are labeled as targets, starting with the selection itself

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

## ADDED Requirements

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
