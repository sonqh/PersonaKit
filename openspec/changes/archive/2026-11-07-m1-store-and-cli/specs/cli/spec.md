# Spec Delta

## Purpose

Give the owner and every agent one command-line interface to the store.

## ADDED Requirements

### Requirement: REQ-CLI-001 Commands, output, and exit codes
The `personakit` command SHALL wrap the core. It SHALL print readable text by default and JSON with `--json`. Errors with `--json` SHALL print a JSON error object. Exit codes SHALL be 0 success, 1 unexpected, 2 usage, 3 conflict, 4 confirmation required, 5 not found, 6 invalid, and 7 unsafe store path.

Refs: ADR-002

#### Scenario: SCN-CLI-001-1 A stale update exits with code 3
- **WHEN** an agent runs `update` on an accepted record with an old revision
- **THEN** the command exits with code 3, and the accepted file stays byte-identical

#### Scenario: SCN-CLI-001-2 Errors carry their codes
- **WHEN** a command with `--json` has an unknown kind, an unknown command, an unknown option, or a missing record
- **THEN** it exits with code 2, 2, 2, or 5, and the JSON error holds the code

#### Scenario: SCN-CLI-001-3 A store inside the repository is refused
- **WHEN** `init` runs with a store path inside the PersonaKit repository
- **THEN** it exits with code 7

### Requirement: REQ-CLI-002 Owner commands need confirmation
`accept`, `reject`, `retire`, and `visibility` SHALL ask for confirmation in an interactive terminal. Without a terminal they SHALL exit with code 4 unless the command has `--yes`. `review` SHALL run only in an interactive terminal, and `--yes` SHALL NOT change that. This step protects against agent mistakes. It is not a security boundary.

Refs: ADR-002

#### Scenario: SCN-CLI-002-1 Accept without a terminal fails
- **WHEN** `accept` runs without a terminal and without `--yes`
- **THEN** it exits with code 4, and the record stays proposed

#### Scenario: SCN-CLI-002-2 The owner confirms with the flag
- **WHEN** `accept` runs without a terminal and with `--yes`
- **THEN** the record becomes accepted

### Requirement: REQ-CLI-003 Batch proposals from JSON Lines
`propose --from <file>` and `propose --from -` SHALL read one proposal for each line. Each proposal SHALL get the same validation and duplicate check as a single proposal. The command SHALL check every line before it writes, and propose nothing when a line is invalid. This is the path for claude.ai, which cannot run a shell.

Refs: ADR-002

#### Scenario: SCN-CLI-003-1 claude.ai proposals come from stdin
- **WHEN** the owner pipes two JSON lines to `propose --from - --actor claude-ai`
- **THEN** two proposals exist, and both record the actor claude-ai

#### Scenario: SCN-CLI-003-2 One bad line stops the batch
- **WHEN** the second of two lines has an invalid period
- **THEN** the command exits with code 6, names line 2, and proposes nothing
