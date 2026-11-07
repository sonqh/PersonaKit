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

### Requirement: REQ-VIS-002 Only public records enter a CV
`cv draft` SHALL include only accepted records with visibility public. It SHALL print only the statement, organization, role, period, issued date, and expiry date. It SHALL NOT print location, sources, tags, extensions, or provenance. `cv check` and `cv strip` SHALL NOT print record text, and SHALL use one error code for every ID that cannot be cited.

Refs: ADR-001

#### Scenario: SCN-VIS-002-1 Private and ai canaries stay out of the draft
- **WHEN** the store holds accepted private and ai records with canary values, and rejected and retired public records
- **THEN** no output of `cv draft` contains a canary or a rejected or retired statement

#### Scenario: SCN-VIS-002-2 Hidden fields stay out of the draft
- **WHEN** a public record has a location, a source reference, a tag, and an extension with canary values
- **THEN** the draft contains none of these values

#### Scenario: SCN-VIS-002-3 The check never prints record text
- **WHEN** a CV cites a public record with a canary statement, and another line cites a private record
- **THEN** no output of `cv check` contains the canary or the private statement, also with `--json`

#### Scenario: SCN-VIS-002-4 Fixture CV drafts hold public records only
- **WHEN** each synthetic fixture becomes an accepted store
- **THEN** its CV draft cites only public records and contains no private canary
