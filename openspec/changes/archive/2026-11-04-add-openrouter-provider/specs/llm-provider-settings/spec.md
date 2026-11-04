# Spec Delta

## MODIFIED Requirements

### Requirement: User configures provider credentials
The system SHALL let the user choose the active provider (Anthropic or OpenRouter) and save one API key per provider. For Anthropic the model is picked from a supported list. For OpenRouter it is a free-text model ID with suggestions. Each provider has a preselected default model. Settings SHALL be stored only in local extension storage.

#### Scenario: Save settings
- **WHEN** the user enters an API key, picks a model and saves
- **THEN** the settings persist across browser restarts and the key is shown masked

#### Scenario: Default model
- **WHEN** the user saves a key without changing the model
- **THEN** the default model of the active provider is used for requests

#### Scenario: Keys are kept per provider
- **WHEN** the user saves an Anthropic key, switches to OpenRouter, saves an OpenRouter key and switches back
- **THEN** both keys are still saved and requests use the key of the active provider

#### Scenario: OpenRouter model suggestions
- **WHEN** the user selects OpenRouter as the provider
- **THEN** the model field suggests `z-ai/glm-5.3-flash` and `anthropic/claude-haiku-5.5`, and accepts any other model ID typed in

#### Scenario: Malformed OpenRouter model ID
- **WHEN** the user saves an OpenRouter model ID that is not of the form `vendor/model`
- **THEN** the settings are not saved and the user is told the expected format

### Requirement: Generation requires configured settings
The system SHALL refuse to send a change request when the active provider has no API key configured and SHALL direct the user to settings.

#### Scenario: Missing key
- **WHEN** the user submits a change request without a saved API key for the active provider
- **THEN** the request is not sent and the user is shown a link to settings

#### Scenario: Key saved only for the other provider
- **WHEN** only an Anthropic key is saved and OpenRouter is the active provider
- **THEN** the request is not sent and the user is told to add an OpenRouter key

### Requirement: User can test and clear the key
The system SHALL let the user test the active provider's saved key with a minimal provider call and clear the saved key of the active provider.

#### Scenario: Test a valid key
- **WHEN** the user tests a valid key
- **THEN** a success message is shown

#### Scenario: Clear the key
- **WHEN** the user clears the key
- **THEN** it is removed from storage, the other provider's key is kept, and change requests to the active provider are refused until a new key is saved

## ADDED Requirements

### Requirement: OpenRouter model is checked against the catalog
The system SHALL look up the chosen OpenRouter model in OpenRouter's public model catalog and show whether it exists and which output modes it supports. The lookup SHALL NOT send the API key. If the catalog cannot be reached, the model ID is still saved.

#### Scenario: Known model
- **WHEN** the user enters `z-ai/glm-5.3-flash`
- **THEN** settings show that the model exists and supports structured outputs and tools

#### Scenario: Unknown model
- **WHEN** the user enters a model ID that the catalog does not list
- **THEN** settings warn that the model was not found, and saving is still allowed

#### Scenario: Catalog unreachable
- **WHEN** the catalog request fails
- **THEN** settings say capabilities are unknown and the model is used with plain-text JSON output

### Requirement: User chooses a context profile
The system SHALL let the user choose a standard or compact context profile per provider. Compact SHALL be the default for OpenRouter and standard the default for Anthropic.

#### Scenario: Default profiles
- **WHEN** the user has not chosen a profile
- **THEN** OpenRouter requests use the compact profile and Anthropic requests use the standard profile

#### Scenario: Override
- **WHEN** the user sets OpenRouter to the standard profile
- **THEN** OpenRouter requests use the standard limits

### Requirement: Earlier settings are migrated
The system SHALL convert settings saved by the previous version (a single Anthropic key and model) into the new format on first load, without losing the key or model.

#### Scenario: Upgrade from phase 1
- **WHEN** storage holds a phase 1 Anthropic key and model and the extension loads
- **THEN** Anthropic is the active provider with that key and model, and no OpenRouter key is set
