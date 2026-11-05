## MODIFIED Requirements

### Requirement: Eval never runs without explicit intent
The system SHALL run evals only when started by a developer with the chosen provider's settings in their environment: a key for Anthropic, OpenRouter and OpenCode, and a base URL for LiteLLM, whose key is optional. Evals SHALL NOT be part of `pnpm test` or any automatic check.

#### Scenario: Missing key
- **WHEN** the eval command runs without the provider's key in the environment
- **THEN** it exits with a message explaining which variable to set, without calling any provider

#### Scenario: Missing LiteLLM base URL
- **WHEN** the eval runs with `--provider litellm` and no `LITELLM_BASE_URL`
- **THEN** it exits with a message explaining the variable, without calling any provider

#### Scenario: Normal test run
- **WHEN** a developer runs `pnpm test`
- **THEN** no eval case runs and no provider is called

## ADDED Requirements

### Requirement: Eval targets any configured provider
The system SHALL let the eval target Anthropic, OpenRouter, OpenCode or LiteLLM. It uses the same settings validation, catalog lookup and output-mode choice as the extension.

#### Scenario: OpenCode
- **WHEN** a developer runs the eval with `--provider opencode --model glm-5.3-flash` and `OPENCODE_API_KEY` set
- **THEN** every case runs against OpenCode's chat-completions endpoint and the report labels the rows `opencode:glm-5.3-flash`
