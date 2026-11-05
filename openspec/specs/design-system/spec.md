# design-system Specification

## Purpose
Captures a product's design tokens and component patterns from a live page or a DTCG token file, keeps them in a local library with one active design system per site, and makes previews use them.

## Requirements

### Requirement: A design system can be extracted from the page
The system SHALL extract a design system from the current page: the CSS custom properties defined on the root, the most-used colors, spacing, radii, font sizes, font families and shadows, and component patterns with their classes. It SHALL save the result locally and activate it for the page's site.

#### Scenario: Extract from a page with variables
- **WHEN** the user extracts from a page whose stylesheet defines `--color-primary` on `:root`
- **THEN** the saved design system contains a color token `--color-primary` with its resolved value

#### Scenario: Inferred tokens
- **WHEN** the page uses colors and spacing without custom properties
- **THEN** the most-used values become tokens with `--ds-` variables and role names where clear, such as `color-text`

#### Scenario: Component patterns
- **WHEN** the page has buttons with the classes `btn btn-primary`
- **THEN** the design system lists a button pattern with those classes

#### Scenario: Extension elements are ignored
- **WHEN** the extension's overlay or inserted elements are on the page
- **THEN** they do not contribute tokens or patterns

### Requirement: Design tokens import and export as DTCG JSON
The system SHALL import design tokens from a W3C Design Tokens (DTCG) JSON file and export any saved design system in that format. It SHALL resolve references and composite values on import.

#### Scenario: Import a token file
- **WHEN** the user imports a DTCG file with `color.brand.primary` as a color and `space.2` as a dimension
- **THEN** a design system is saved with tokens `color-brand-primary` and `space-2` and activated for the site

#### Scenario: References are resolved
- **WHEN** a token's value is `{color.brand.primary}`
- **THEN** the imported token has the referenced value

#### Scenario: Invalid file
- **WHEN** the user imports a file that is not valid DTCG JSON or has no tokens
- **THEN** nothing is saved and the user is told why

#### Scenario: Round trip
- **WHEN** the user exports a design system and imports the file again
- **THEN** the tokens and components are the same

### Requirement: One design system is active per site
The system SHALL keep a local library of design systems and let the user activate one, or none, for each site.

#### Scenario: Switch design systems
- **WHEN** the user picks another saved design system for the site
- **THEN** later change requests on that site use it

#### Scenario: Delete the active design system
- **WHEN** the user deletes the active design system
- **THEN** it is removed and no design system is active for any site that used it

### Requirement: Missing tokens are injected into the page
The system SHALL define the active design system's tokens that the page does not already define as root custom properties, so that changes using them render. It SHALL remove them when the design system is switched off.

#### Scenario: Imported tokens render
- **WHEN** an imported design system with `--ds-color-brand` is active and a change uses `var(--ds-color-brand)`
- **THEN** the element shows that color

#### Scenario: Page variables are not overridden
- **WHEN** the page already defines a variable with the same name
- **THEN** the page's value is kept

#### Scenario: Switch off
- **WHEN** the user selects no design system
- **THEN** the injected properties are removed
