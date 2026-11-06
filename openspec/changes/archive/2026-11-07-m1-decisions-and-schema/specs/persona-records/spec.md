# Spec Delta

## Purpose

Define the persona record, its sources and provenance, and the synthetic fixtures that tests use.

## ADDED Requirements

### Requirement: REQ-PER-001 Record schema v0
A persona record SHALL have the schema `personakit.record/v0`, a ULID ID, one of five kinds, a statement, and a revision. Its state SHALL be proposed, accepted, rejected, or retired. Its visibility SHALL be private, ai, or public. The validator SHALL reject a field that is not in the schema. Extra data goes in `extensions` under a namespaced key.

Refs: ADR-001

#### Scenario: SCN-PER-001-1 A minimal record is valid
- **WHEN** a record has every required field with a valid value
- **THEN** the validator reports no issue

#### Scenario: SCN-PER-001-2 An unknown field fails
- **WHEN** a record has a field that is not in the schema, such as a typo of `visibility`
- **THEN** the validator reports an issue with the path of that field

#### Scenario: SCN-PER-001-3 An extension needs a namespace
- **WHEN** a record has an extension key without a dot, such as `field`
- **THEN** the validator reports an issue for that key

### Requirement: REQ-PER-002 Sources and provenance
Every record SHALL list at least one source. Every record SHALL have provenance. The provenance holds an actor from the list claude-code, claude-ai, codex, cli, and web. It holds an optional model and session label, a UTC time, and whether the user stated the fact. These fields are labels, not proof of identity.

Refs: ADR-002

#### Scenario: SCN-PER-002-1 A record without a source fails
- **WHEN** a record has an empty source list
- **THEN** the validator reports an issue for `sources`

#### Scenario: SCN-PER-002-2 An unknown actor fails
- **WHEN** the provenance actor is not in the actor list
- **THEN** the validator reports an issue for `provenance.actor`

### Requirement: REQ-PER-003 Safe text and dates
Record text SHALL NOT contain control characters other than tab and line feed, bidi controls, or zero-width characters. A statement SHALL be in Unicode NFC form. A date SHALL use the form YYYY, YYYY-MM, or YYYY-MM-DD. A period SHALL NOT end before it starts, and an ongoing period SHALL NOT have an end date.

#### Scenario: SCN-PER-003-1 Hidden characters fail
- **WHEN** a statement contains a bidi override or a zero-width space
- **THEN** the validator reports an issue for `statement`

#### Scenario: SCN-PER-003-2 An inconsistent period fails
- **WHEN** a period ends before it starts, or is ongoing and has an end date
- **THEN** the validator reports an issue for `facets.period`

#### Scenario: SCN-PER-003-3 A date in another format fails
- **WHEN** an expiry date has the form 31/03/2027
- **THEN** the validator reports an issue for `facets.expires_on`

### Requirement: REQ-PER-004 Deterministic serialization and IDs
The core SHALL write JSON with keys sorted at every level, two-space indents, LF line ends, and a final newline. Set-like arrays SHALL be sorted. Record IDs SHALL be ULIDs. IDs from one process SHALL be unique and in increasing order, also within one millisecond.

#### Scenario: SCN-PER-004-1 The same value gives the same bytes
- **WHEN** the core serializes an object with unsorted nested keys
- **THEN** the output shows the keys in sorted order and ends with a line feed

#### Scenario: SCN-PER-004-2 IDs stay in order within one millisecond
- **WHEN** one process makes 1000 IDs while the clock does not change
- **THEN** all IDs are valid ULIDs, unique, and in increasing order

### Requirement: REQ-PER-005 Synthetic fixtures
The repository SHALL hold synthetic fixtures for at least four people: a software engineer, a support specialist, a designer, and a career changer. Each fixture SHALL use all five kinds and be marked synthetic. Together they SHALL cover a career break, a credential with an expiry date, and a freelancer with at least five engagements. Each fixture SHALL have a private record with a canary value.

#### Scenario: SCN-PER-005-1 Every fixture line is a valid record
- **WHEN** each fixture line becomes a full record
- **THEN** the validator reports no issue, and each line has the synthetic marker

#### Scenario: SCN-PER-005-2 The fixtures cover the required cases
- **WHEN** the tests read all fixtures
- **THEN** they find a career break, an expiring credential, a freelancer with five or more engagements, and a private canary in each fixture
