## ADDED Requirements

### Requirement: The active design system guides generation
The system SHALL send a summary of the active design system for the page's site with every change request, bounded by the active context profile. It SHALL ask the model to use the tokens through `var(--token)` and to reuse the component classes.

#### Scenario: Guidance is sent
- **WHEN** a design system is active for the site and the user submits a request
- **THEN** the request includes the design system's tokens and component patterns

#### Scenario: Guidance is bounded
- **WHEN** the design system's summary exceeds the profile's design budget
- **THEN** it is cut at a line boundary to fit

#### Scenario: No design system
- **WHEN** no design system is active for the site
- **THEN** the request has no design system block
