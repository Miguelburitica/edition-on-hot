# Spec Delta

## Purpose

Gives developers a repeatable way to measure how well a model turns edit requests into valid, correct patches, so model and harness choices are based on numbers rather than impressions.

## ADDED Requirements

### Requirement: Eval runs a fixed case set against chosen models
The system SHALL provide a command that runs every eval case against each model named on the command line, using the same harness as the extension: prompt, output mode, repair, retry and validation.

#### Scenario: Two models
- **WHEN** a developer runs the eval with `z-ai/glm-5.3-flash` and `anthropic/claude-haiku-5.5`
- **THEN** every case runs once per model and results are reported per model

#### Scenario: Single case
- **WHEN** a developer passes a case filter
- **THEN** only the matching cases run

### Requirement: Cases check the resulting page
Each eval case SHALL define a page fixture, the element to select, a request, and checks on the page after the patch is applied. A case passes only when the proposal is valid, applies without error, and every check holds.

#### Scenario: Correct edit
- **WHEN** a model's patch for "make the sign up button red" applies and the button's background is red
- **THEN** the case passes

#### Scenario: Valid but wrong edit
- **WHEN** a patch is valid and applies but a check fails
- **THEN** the case fails and the report names the failed check

#### Scenario: Checks judge one property each
- **WHEN** a model inserts the requested banner with the right text and color but in the wrong place
- **THEN** only the position check fails, and the text and color checks pass

### Requirement: Eval reports comparable metrics
The system SHALL report, per model: first-try validity rate, validity after retry, share of cases that needed local repair, apply success rate, case pass rate, median latency and total cost when the provider reports it. It SHALL also write the full results as JSON.

#### Scenario: Report
- **WHEN** an eval run finishes
- **THEN** a summary table with those metrics is printed and a JSON results file is written

### Requirement: Cases can be repeated to measure consistency
The system SHALL accept a repeat count and run every case that many times per model. With more than one run it SHALL report the mean pass rate with the lowest and highest per-run pass rate, and list cases whose outcome differed between runs.

#### Scenario: Three repeats
- **WHEN** a developer runs the eval with a repeat count of 3
- **THEN** every case runs three times per model, and the summary shows the mean pass rate and its range across the three runs

#### Scenario: Inconsistent case
- **WHEN** a case passes in some runs and fails in others
- **THEN** the report lists it with how many runs passed

#### Scenario: Default
- **WHEN** no repeat count is given
- **THEN** every case runs once and the report matches a single run

### Requirement: Eval never runs without explicit intent
The system SHALL run evals only when started by a developer with a provider key in their environment. Evals SHALL NOT be part of `pnpm test` or any automatic check.

#### Scenario: Missing key
- **WHEN** the eval command runs without a provider key in the environment
- **THEN** it exits with a message explaining which variable to set, without calling any provider

#### Scenario: Normal test run
- **WHEN** a developer runs `pnpm test`
- **THEN** no eval case runs and no provider is called
