# llm-provider-settings Specification

## Purpose
Lets the user bring their own LLM provider credentials and model choice, stored locally, so change requests run on their own account.

## Requirements

### Requirement: User configures provider credentials
The system SHALL let the user choose the active provider (Anthropic, OpenRouter, OpenCode or LiteLLM) and save one API key per provider. For Anthropic the model is picked from a supported list; for the others it is a free-text model ID, with suggestions where the provider has well-known models. Settings SHALL be stored only in local extension storage.

#### Scenario: Save settings
- **WHEN** the user saves a key and model for a provider
- **THEN** that provider becomes active and later requests use its key and model

#### Scenario: Default model
- **WHEN** the user opens settings for the first time
- **THEN** Anthropic is preselected with its default model, OpenRouter defaults to `z-ai/glm-5.3-flash`, and OpenCode defaults to `glm-5.3-flash`

#### Scenario: Keys are kept per provider
- **WHEN** the user saves a key for one provider and later switches to another
- **THEN** the first provider's key is kept and is used again when that provider is reactivated

#### Scenario: OpenRouter model suggestions
- **WHEN** the user edits the OpenRouter model
- **THEN** `z-ai/glm-5.3-flash` and `anthropic/claude-haiku-5.5` are suggested

#### Scenario: Malformed OpenRouter model ID
- **WHEN** the user saves an OpenRouter model ID that is not in `vendor/model` format
- **THEN** the save is rejected with an explanation of the expected format

### Requirement: LiteLLM is configured with a proxy URL
The system SHALL give LiteLLM a base URL, defaulting to `http://localhost:4000`, an optional key and a required model name, since a proxy exposes its own model names and may run without auth.

#### Scenario: LiteLLM without a key
- **WHEN** the user saves LiteLLM with a base URL and model but no key
- **THEN** the settings are saved and requests are sent to the proxy without an Authorization header

#### Scenario: Invalid LiteLLM base URL
- **WHEN** the user saves a LiteLLM base URL that is not an http or https URL
- **THEN** the save is rejected with an explanation

#### Scenario: Missing LiteLLM model
- **WHEN** the user saves LiteLLM without a model name
- **THEN** the save is rejected and the user is asked for the model name the proxy exposes

### Requirement: Key is used only for provider calls
The system SHALL send the API key only to the configured provider's API endpoint, which for LiteLLM is the user's configured base URL. It SHALL never inject the key into the inspected page.

#### Scenario: Page cannot read the key
- **WHEN** a script in the inspected page inspects the DOM or extension messages
- **THEN** the API key is not present in any of them

### Requirement: Generation requires configured settings
The system SHALL refuse to send a change request when the active provider has no API key configured (except LiteLLM, whose key is optional) or, for LiteLLM, no model, and SHALL direct the user to settings.

#### Scenario: Missing key
- **WHEN** the user submits a request and the active provider requires a key and has none
- **THEN** no provider call is made and the side panel explains that a key must be added in settings

#### Scenario: Key saved only for the other provider
- **WHEN** the active provider has no key but another provider does
- **THEN** no provider call is made and the side panel names the active provider whose key is missing

### Requirement: User can test and clear the key
The system SHALL let the user test the active provider's saved key with a minimal provider call and clear the saved key of the active provider.

#### Scenario: Test a valid key
- **WHEN** the user tests a valid key
- **THEN** a success message is shown

#### Scenario: Clear the key
- **WHEN** the user clears the key
- **THEN** it is removed from storage, the other provider's key is kept, and change requests to the active provider are refused until a new key is saved

### Requirement: OpenRouter model is checked against the catalog
The system SHALL look up the chosen model in the provider's model catalog and show whether it exists and which output modes it supports:
- OpenRouter's public catalog, without the key.
- OpenCode's public catalog, without the key.
- The LiteLLM proxy's model info, with the LiteLLM key if one is set.

If the catalog cannot be reached, the model ID is still saved and the plain-text output mode is used.

#### Scenario: Known model
- **WHEN** the user enters a model ID that the catalog lists
- **THEN** settings show that it was found and whether it supports structured outputs and tools

#### Scenario: Unknown model
- **WHEN** the user enters a model ID that the catalog does not list
- **THEN** settings warn that the model was not found but still allow saving it

#### Scenario: Catalog unreachable
- **WHEN** the catalog cannot be reached
- **THEN** settings say the capabilities are unknown and saving still works

#### Scenario: OpenCode capabilities choose the output mode
- **WHEN** the OpenCode catalog says the chosen model supports structured output
- **THEN** patches are requested with a strict JSON-schema response

### Requirement: User chooses a context profile
The system SHALL let the user choose a standard or compact context profile per provider. Compact SHALL be the default for OpenRouter and OpenCode, and standard the default for Anthropic and LiteLLM.

#### Scenario: Default profiles
- **WHEN** the user has not chosen a profile
- **THEN** Anthropic and LiteLLM use standard, and OpenRouter and OpenCode use compact

#### Scenario: Override
- **WHEN** the user picks a different profile for a provider and saves
- **THEN** later requests to that provider use that profile's limits

### Requirement: Earlier settings are migrated
The system SHALL convert settings saved by earlier versions into the current format on first load, without losing keys, models or the active provider. Earlier formats are a single Anthropic key and model, and the two-provider format.

#### Scenario: Upgrade from phase 1
- **WHEN** the extension loads settings that contain only an Anthropic key and model
- **THEN** they become the Anthropic slot and Anthropic is active

#### Scenario: Upgrade from two providers
- **WHEN** the extension loads settings with Anthropic and OpenRouter slots
- **THEN** both slots and the active provider are kept, and OpenCode and LiteLLM start empty with their defaults

### Requirement: Access to a LiteLLM proxy is granted per host
The system SHALL ask the browser for access to the LiteLLM proxy's origin when the user saves LiteLLM settings, and SHALL save only if access is granted. It SHALL NOT request access to any other host.

#### Scenario: Access granted
- **WHEN** the user saves LiteLLM with base URL `https://llm.example.com` and grants access
- **THEN** the settings are saved and requests reach the proxy

#### Scenario: Access denied
- **WHEN** the user declines the browser's access prompt
- **THEN** nothing is saved and settings explain that access to that host is needed

#### Scenario: Unreachable proxy
- **WHEN** a request to the LiteLLM proxy fails at the network level
- **THEN** the error names the configured base URL so the user can check that the proxy is running

### Requirement: Settings list the models available to the account
The system SHALL fetch the models the user's account can use from the active provider and offer them in the model field. The field SHALL still accept a typed model ID. Listing SHALL use the saved key, or the key being entered.

#### Scenario: Models are listed
- **WHEN** the user opens a provider's settings and a key is saved
- **THEN** the model field offers the models the provider lists for that key, and settings show how many are available

#### Scenario: Every listed model is offered
- **WHEN** a model is already chosen and the user opens the model field
- **THEN** every listed model is offered, not only those matching the current choice, and "Other model ID…" lets the user type an ID that is not listed

#### Scenario: OpenCode lists only enabled models
- **WHEN** the user's OpenCode account has not enabled a model
- **THEN** that model is not offered, and entering it shows it as not found in the catalog

#### Scenario: Listing fails
- **WHEN** the provider's model list cannot be reached
- **THEN** settings say the list is unavailable and the model can still be typed and saved

#### Scenario: Anthropic accepts listed models
- **WHEN** the user picks any `claude-*` model the Anthropic account lists
- **THEN** it is saved and used for requests
