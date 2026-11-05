## ADDED Requirements

### Requirement: Varied response shapes are understood
The system SHALL read a model's answer whether the message content is a string or a list of content parts, ignoring thinking parts.

#### Scenario: Content parts
- **WHEN** a provider returns content as a thinking part followed by a text part with the JSON patch
- **THEN** the patch in the text part is parsed

### Requirement: Account and quota problems are reported precisely
The system SHALL tell the user when the chosen model is not enabled for their account, and SHALL include the provider's own explanation for rate limits, quota and unexpected errors.

#### Scenario: Model not enabled
- **WHEN** the provider answers that access to the model is disabled
- **THEN** the user is told the model is not enabled for their account and is pointed to settings, not told about a content policy

#### Scenario: Free usage limit
- **WHEN** the provider answers 429 with the message "Free usage limit reached"
- **THEN** the rate-limit message includes that text
