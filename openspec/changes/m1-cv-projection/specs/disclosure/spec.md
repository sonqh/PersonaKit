# Spec Delta

## Purpose

Keep private and ai-only records out of the CV path.

## ADDED Requirements

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
