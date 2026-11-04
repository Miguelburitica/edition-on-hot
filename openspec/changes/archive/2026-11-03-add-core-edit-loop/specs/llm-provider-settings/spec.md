# Spec Delta

## Purpose

Lets the user bring their own LLM provider credentials and model choice, stored locally, so change requests run on their own account.

## ADDED Requirements

### Requirement: User configures provider credentials
The system SHALL let the user save an Anthropic API key and choose a model from a supported list, with a default model preselected. Settings SHALL be stored only in local extension storage.

#### Scenario: Save settings
- **WHEN** the user enters an API key, picks a model and saves
- **THEN** the settings persist across browser restarts and the key is shown masked

#### Scenario: Default model
- **WHEN** the user saves a key without changing the model
- **THEN** the default model is used for requests

### Requirement: Key is used only for provider calls
The system SHALL send the API key only to the configured provider's API endpoint. It SHALL never inject the key into the inspected page.

#### Scenario: Page cannot read the key
- **WHEN** a script on the inspected page searches the DOM and its own storage
- **THEN** it cannot find the API key

### Requirement: Generation requires configured settings
The system SHALL refuse to send a change request when no API key is configured and SHALL direct the user to settings.

#### Scenario: Missing key
- **WHEN** the user submits a change request without a saved API key
- **THEN** the request is not sent and the user is shown a link to settings

### Requirement: User can test and clear the key
The system SHALL let the user test the saved key with a minimal provider call and clear the saved key.

#### Scenario: Test a valid key
- **WHEN** the user tests a valid key
- **THEN** a success message is shown

#### Scenario: Clear the key
- **WHEN** the user clears the key
- **THEN** it is removed from storage and change requests are refused until a new key is saved
