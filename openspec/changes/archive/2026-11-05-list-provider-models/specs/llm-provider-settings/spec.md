## ADDED Requirements

### Requirement: Settings list the models available to the account
The system SHALL fetch the models the user's account can use from the active provider and offer them in the model field. The field SHALL still accept a typed model ID. Listing SHALL use the saved key, or the key being entered.

#### Scenario: Models are listed
- **WHEN** the user opens a provider's settings and a key is saved
- **THEN** the model field offers the models the provider lists for that key, and settings show how many are available

#### Scenario: OpenCode lists only enabled models
- **WHEN** the user's OpenCode account has not enabled a model
- **THEN** that model is not offered, and entering it shows it as not found in the catalog

#### Scenario: Listing fails
- **WHEN** the provider's model list cannot be reached
- **THEN** settings say the list is unavailable and the model can still be typed and saved

#### Scenario: Anthropic accepts listed models
- **WHEN** the user picks any `claude-*` model the Anthropic account lists
- **THEN** it is saved and used for requests
