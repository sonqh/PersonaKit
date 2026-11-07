# Spec Delta

## Purpose

Move CV data between PersonaKit and JSON Resume version 1.0.0 files. Export uses the CV disclosure rules. Import creates proposals for the owner to review.

## ADDED Requirements

### Requirement: REQ-RES-001 JSON Resume export
`personakit export json-resume` SHALL build a JSON Resume document that is valid against schema version 1.0.0. With `--out FILE` it SHALL write the file atomically, and else write to stdout. The JSON SHALL have sorted keys and a final newline. The same records SHALL give the same bytes, with no clock, locale, or time zone input.

#### Scenario: SCN-RES-001-1 Export is valid JSON Resume
- **WHEN** the owner exports each synthetic fixture as an accepted store
- **THEN** each document passes a copy of the JSON Resume 1.0.0 schema, and the checker fails on a schema keyword that it does not implement

#### Scenario: SCN-RES-001-2 Export is deterministic
- **WHEN** the export runs twice with different time zones and locales
- **THEN** the two outputs are byte-identical

#### Scenario: SCN-RES-001-3 The file is written atomically
- **WHEN** the owner exports with `--out` to a path that holds an old file
- **THEN** the file holds the complete new document, and no temporary file stays in the folder

### Requirement: REQ-RES-002 Export mapping
Export SHALL map identity statements to `basics.summary`. Experience SHALL go to `work`, education and course types to `education`, credentials to `certificates`, and capabilities to `skills`. Dated items SHALL use the CV draft sort order. Dates SHALL keep their precision. An ongoing period SHALL have no `endDate`.

Refs: REQ-CV-001

#### Scenario: SCN-RES-002-1 Records go to their sections
- **WHEN** the store holds public identity, job, education, credential, and capability records
- **THEN** each record appears once in its section with the mapped fields

#### Scenario: SCN-RES-002-2 Dates keep their precision
- **WHEN** public records have the periods 2021, 2021-06, and 2021-06-15, and one ongoing period
- **THEN** the export keeps each date as written, and the ongoing item has no `endDate`

### Requirement: REQ-RES-003 Export holds public records only
Export SHALL include only accepted records with visibility public, and SHALL NOT include intents or preferences. It SHALL print only the statement, organization, role, period, issued date, and level. It SHALL NOT print location, sources, tags, extensions, provenance, or private and ai records.

Refs: REQ-VIS-002, ADR-001

#### Scenario: SCN-RES-003-1 Private and ai canaries stay out
- **WHEN** the store holds accepted private and ai records, intents, preferences, and rejected public records with canaries
- **THEN** the export contains no canary

#### Scenario: SCN-RES-003-2 Hidden fields stay out
- **WHEN** a public record has a location, a source reference, a tag, and an extension with canaries
- **THEN** the export contains none of these values

### Requirement: REQ-RES-004 JSON Resume import creates proposals
`personakit import json-resume FILE` SHALL turn the sections of a JSON Resume file into proposals through `src/core/store.ts`. Each proposal SHALL have actor cli, `user_stated` true, visibility private, and a source of kind import. The source label SHALL be `json-resume:` and the first 12 hex digits of the SHA-256 of the file. Import SHALL never accept a record. It SHALL list the sections that it skips.

Refs: ADR-002

#### Scenario: SCN-RES-004-1 A file becomes proposals
- **WHEN** the owner imports a synthetic JSON Resume file with basics, work, education, certificates, and skills
- **THEN** the store holds one proposal for each mapped item, each with actor cli, source kind import, and visibility private

#### Scenario: SCN-RES-004-2 Import never accepts
- **WHEN** the owner imports a file and runs `list --state accepted`
- **THEN** the list holds no imported record

#### Scenario: SCN-RES-004-3 The output lists skipped sections
- **WHEN** the file has references, interests, and contact fields
- **THEN** the output lists those sections as skipped, and no proposal holds their values

#### Scenario: SCN-RES-004-4 One file gives one source label
- **WHEN** the owner imports the same file twice
- **THEN** every proposal has the source label `json-resume:` with the same 12 hex digits

### Requirement: REQ-RES-005 Import is all or nothing
Import SHALL remove a byte order mark and turn CRLF into LF. Then it SHALL check the whole file before the first write. A file over 1 MiB, bad JSON, a schema error, over 500 proposals, or an invalid proposal SHALL stop it with exit code 6. Then it SHALL write nothing. Each problem SHALL name a JSON Pointer path and SHALL NOT quote the file. A write failure SHALL report the IDs already written.

#### Scenario: SCN-RES-005-1 One bad item stops the import
- **WHEN** the third work item has an invalid start date
- **THEN** the command exits with code 6, names the path `/work/2/startDate`, and writes no record

#### Scenario: SCN-RES-005-2 Problems do not quote the file
- **WHEN** an invalid item holds a canary value
- **THEN** no output of the command contains the canary

#### Scenario: SCN-RES-005-3 Too many proposals stop the import
- **WHEN** a file maps to 501 proposals
- **THEN** the command exits with code 6 and writes no record

#### Scenario: SCN-RES-005-4 A byte order mark and CRLF are accepted
- **WHEN** a valid file starts with a byte order mark and has CRLF line ends
- **THEN** the import succeeds

#### Scenario: SCN-RES-005-5 Unknown root keys and long text are problems
- **WHEN** a file has two unknown root keys and a work summary over 2000 characters
- **THEN** the problems give the count of unknown keys without their names, and the path `/work/0/summary`

#### Scenario: SCN-RES-005-6 A write failure reports the written IDs
- **WHEN** the third write of an import fails
- **THEN** the error lists the IDs of the two records already written
