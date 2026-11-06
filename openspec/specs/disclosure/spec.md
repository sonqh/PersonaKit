# disclosure Specification

## Purpose
Keep private records out of every output that an agent can read.

## Requirements

### Requirement: REQ-VIS-001 No private record in agent output
No command other than `review` SHALL print the text of a private record, with or without a terminal. This covers every option and every error path. `update` SHALL NOT raise visibility. `list` and `show` SHALL mark a private record as redacted. Only `review`, in an interactive terminal, SHALL show private text. Agents with shell access can still read the store files, so this rule covers command output only.

Refs: ADR-001

#### Scenario: SCN-VIS-001-1 A private canary appears in no agent output
- **WHEN** a private record holds a canary value and an agent runs every command except `review`, including owner commands with `--yes` and error paths
- **THEN** no stdout or stderr contains the canary

#### Scenario: SCN-VIS-001-2 The rule holds in a pseudo-terminal
- **WHEN** the same commands run inside a pseudo-terminal
- **THEN** no output contains the canary

#### Scenario: SCN-VIS-001-3 Fixture canaries stay out of the brief
- **WHEN** each synthetic fixture becomes an accepted store
- **THEN** its brief contains no private canary

#### Scenario: SCN-VIS-001-4 Update cannot raise visibility
- **WHEN** an agent runs `update --visibility ai` on a private proposal or a private accepted record
- **THEN** the command exits with code 6, and `show` and `list` still mark the record as redacted

#### Scenario: SCN-VIS-001-5 Review needs a terminal
- **WHEN** an agent runs `review --yes` without a terminal
- **THEN** the command exits with code 4 and prints no private text

#### Scenario: SCN-VIS-001-6 Owner prompts show no private text
- **WHEN** the owner runs `accept`, `reject`, `retire`, or `visibility` without `--yes` in a terminal
- **THEN** the confirmation prompt shows the record as redacted, with no private text
