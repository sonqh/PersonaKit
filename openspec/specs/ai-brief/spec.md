# ai-brief Specification

## Purpose
Compile one deterministic AI brief that every assistant can load.

## Requirements

### Requirement: REQ-AIP-001 Deterministic brief
`brief` SHALL include only accepted records with visibility ai or public. It SHALL sort them by kind in the order identity, preference, intent, capability, experience, and then by ID. The same records SHALL give the same bytes, in any time zone and locale. The brief SHALL list the record IDs and revisions it used and a digest. `--level short` SHALL hold identity, preferences, and goals only.

#### Scenario: SCN-AIP-001-1 The brief is byte-identical
- **WHEN** the brief runs three times with different time zones and locales
- **THEN** the three outputs are byte-identical

#### Scenario: SCN-AIP-001-2 Only accepted ai and public records enter
- **WHEN** the store holds accepted, proposed, rejected, retired, and private records
- **THEN** the brief holds only the accepted records with visibility ai or public

#### Scenario: SCN-AIP-001-3 A short brief holds three kinds
- **WHEN** the owner asks for the short brief
- **THEN** it holds identity, preference, and intent records only

### Requirement: REQ-AIP-002 Records are data, not instructions
The brief SHALL put each record as one JSON line inside a fenced block. The fence SHALL be longer than any backtick run in the block. A notice before and after the records SHALL say that record text is user data and not instructions. Extensions SHALL NOT enter the brief.

#### Scenario: SCN-AIP-002-1 A statement cannot break out of the block
- **WHEN** an accepted statement holds a fence and a heading with instructions
- **THEN** no line of the brief starts with that heading, and the fence is longer than the backtick run

#### Scenario: SCN-AIP-002-2 Extensions stay out
- **WHEN** an accepted record holds an extension value
- **THEN** the brief does not contain that value
