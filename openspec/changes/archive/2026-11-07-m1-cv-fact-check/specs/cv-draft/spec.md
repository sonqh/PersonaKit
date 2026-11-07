# Spec Delta

## ADDED Requirements

### Requirement: REQ-CV-003 Years and numbers match the cited records
`cv check` SHALL warn when a cited line has a year from 1900 to 2099 outside every cited period or date. A year that a cited text contains SHALL pass. It SHALL warn when another number is not in a cited statement or facet. Number words from one to twenty, and tens words up to one hundred, count as numbers. The check SHALL ignore the marker, the list prefix, and record IDs. A warning SHALL give the line number and the token, never record text.

#### Scenario: SCN-CV-003-1 A wrong year is flagged
- **WHEN** a line says 2019 and cites a record with the period 2021 to 2023
- **THEN** the check reports a year warning for that line

#### Scenario: SCN-CV-003-2 A year in the period passes
- **WHEN** a line says "2021 to 2023" or 2022 and cites a record with the period 2021 to 2023, or an ongoing period from 2021
- **THEN** the check reports no year warning

#### Scenario: SCN-CV-003-3 An unsupported number is flagged
- **WHEN** a line says 40% or "ten" and no cited record contains 40 or ten
- **THEN** the check reports a number warning, and the number 4 in a record does not match 40

#### Scenario: SCN-CV-003-4 A clean draft has no warning
- **WHEN** the check runs on an unchanged draft of each synthetic fixture
- **THEN** it reports no warning

### Requirement: REQ-CV-007 Organizations and titles match the cited records
`cv check` SHALL warn when a cited line names an organization or a role that belongs only to accepted public records that the line does not cite. Names SHALL match case-sensitively on word boundaries, longest name first. The check SHALL warn when a line has a seniority word (senior, principal, chief, director, manager) that is not in a cited role or statement. Names from records that are not public SHALL NOT be used.

#### Scenario: SCN-CV-007-1 An organization from another record is flagged
- **WHEN** a line names an organization that belongs only to an uncited public record
- **THEN** the check reports an organization warning

#### Scenario: SCN-CV-007-2 Substrings and longer names do not match by mistake
- **WHEN** the store has the organizations Arc and Arc Labs, and a line cites Arc Labs and says Archive
- **THEN** the check reports no organization warning

#### Scenario: SCN-CV-007-3 A private organization is never used
- **WHEN** a line names an organization that only a private record holds
- **THEN** the check reports no organization warning

#### Scenario: SCN-CV-007-4 An added seniority word is flagged
- **WHEN** a line says "Senior Support Specialist" and the cited role is Support Specialist
- **THEN** the check reports a seniority warning

### Requirement: REQ-CV-004 Ownership verbs match the contribution level
`cv check` SHALL warn when a cited line uses an ownership verb above the highest contribution level of its cited records. The order is contributed, supported, co-led, led, owned. The check reads the first word of a claim. Forms of lead, manage, and direct need led. Owned and founded need owned. Co-lead forms need co-led. A verb whose family is in a cited statement or role SHALL pass. `--strict` SHALL make warnings fail with code 6.

#### Scenario: SCN-CV-004-1 An overstated verb is flagged
- **WHEN** a line says "Led" and cites a record with contribution contributed
- **THEN** the check reports an ownership warning

#### Scenario: SCN-CV-004-2 Supported verbs pass
- **WHEN** a line says "Led" and cites a record with contribution led, or "Co-led" with co-led, or "Managed" with a statement that says "managing"
- **THEN** the check reports no ownership warning

#### Scenario: SCN-CV-004-3 Several cited records use the highest level
- **WHEN** a line says "Led" and cites one record with contributed and one with led
- **THEN** the check reports no ownership warning

#### Scenario: SCN-CV-004-4 Strict mode fails on a warning
- **WHEN** the check runs with `--strict` on a file with one warning and no error, and again on a clean file
- **THEN** it exits with code 6, and then with code 0
