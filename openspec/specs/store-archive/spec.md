# store-archive Specification

## Purpose
Let the owner move the whole store to another machine or keep a backup. One archive file holds the records, the events, and the store format.

## Requirements

### Requirement: REQ-ARC-001 Archive export
`personakit export --out FILE` SHALL write one canonical JSON file with the schema `personakit.archive/v0`. It SHALL hold `store.json`, every record, and every event, sorted by ID, with no time or path. It SHALL check every record and event first, and refuse a store with an unreadable file. It SHALL refuse an existing output file. The same store SHALL give the same bytes. The app SHALL offer the same export.

Refs: REQ-PER-004, REQ-STO-003

#### Scenario: SCN-ARC-001-1 The export is deterministic
- **WHEN** the owner exports the same store twice with different time zones
- **THEN** the two files are byte-identical

#### Scenario: SCN-ARC-001-2 An unreadable record stops the export
- **WHEN** a record file in the store is not valid JSON
- **THEN** the command exits with code 6, names the file, and writes no archive

#### Scenario: SCN-ARC-001-3 The export does not overwrite a file
- **WHEN** the output file already exists
- **THEN** the command exits with code 6, and the file stays byte-identical

### Requirement: REQ-ARC-002 Archive restore
`personakit import archive FILE` SHALL restore an archive into an empty store. An empty store has no record file and no event file at the top level. The command SHALL create a missing store. It SHALL check the schema, the format version, every record, and every event before the first write. It SHALL refuse a newer format. It SHALL keep the `store.json` of the target when it exists. The web app SHALL NOT offer a restore in M2.

Refs: REQ-ARC-001, REQ-STO-001

#### Scenario: SCN-ARC-002-1 A round trip keeps every byte
- **WHEN** the owner exports a store, restores the archive into an empty store, and exports again
- **THEN** the two archives are byte-identical, and `doctor` reports no error

#### Scenario: SCN-ARC-002-2 Restore refuses a store with data
- **WHEN** the target store holds one record that is not in the archive
- **THEN** the command exits with code 6, and the store does not change

#### Scenario: SCN-ARC-002-3 Restore refuses a newer format
- **WHEN** the archive has a format version above the supported version
- **THEN** the command exits with code 6, tells the owner to update PersonaKit, and writes nothing

#### Scenario: SCN-ARC-002-4 One record that is not valid stops the restore
- **WHEN** one record in the archive has an unknown kind
- **THEN** the command exits with code 6, names the record, and the store holds no record and no event

#### Scenario: SCN-ARC-002-5 Restore refuses a broken event chain
- **WHEN** the events of a record reach revision 5, and the record has revision 2. Or the events have a gap from revision 1 to revision 3
- **THEN** the command exits with code 6 and writes nothing

### Requirement: REQ-ARC-003 Export warning
An archive holds private records. The CLI SHALL print a warning to stderr after each export. The warning SHALL say that the file holds private records and that the owner must keep it private. The app SHALL show the same warning before the download starts. The server SHALL send the export only with the token, as an attachment, with `Cache-Control: no-store`.

Refs: REQ-WEB-002, REQ-WEB-004, ADR-001

#### Scenario: SCN-ARC-003-1 The CLI warns after an export
- **WHEN** the owner runs `personakit export --out FILE`
- **THEN** stderr holds the private data warning, and stdout holds no record text

#### Scenario: SCN-ARC-003-2 The app warns before the download
- **WHEN** the logic module gets an export request before the owner selects Continue on the warning
- **THEN** it does not allow the download, and `/api/export` answers only with the token, as an attachment

### Requirement: REQ-ARC-004 Restore safety
Restore SHALL hold the lock `locks/restore.lock`. While that lock exists and is not stale, `propose`, `update`, and owner actions SHALL fail with the conflict code. Restore SHALL check the ULID form of every ID before it builds a path. It SHALL write all events first and all records last, with files 0600 and folders 0700. When every file in the store equals its archive copy, the same archive SHALL finish the restore.

Refs: REQ-ARC-002, REQ-STO-003

#### Scenario: SCN-ARC-004-1 Restore refuses a path in an ID
- **WHEN** a record or an event in the archive has the ID `../x`
- **THEN** the command exits with code 6, and the store holds no record and no event

#### Scenario: SCN-ARC-004-2 A stopped restore can finish
- **WHEN** a restore stops after the event phase, and the owner runs it again with the same archive
- **THEN** the second run writes the records, and `doctor` reports no error

#### Scenario: SCN-ARC-004-3 A write during a restore fails
- **WHEN** an agent proposes a record while the restore lock exists
- **THEN** the proposal fails with the conflict code, and the store does not change

#### Scenario: SCN-ARC-004-4 Another archive cannot finish a partial restore
- **WHEN** a store holds events from one archive, and the owner restores a different archive
- **THEN** the command exits with code 6, and the store does not change

#### Scenario: SCN-ARC-004-5 Every writer fails during a restore
- **WHEN** the restore lock exists, and `proposeBatch`, `update`, `ownerAction`, `setVisibility`, or `POST /api/propose` runs
- **THEN** each one fails with the conflict code, or the server answers 409, and the store does not change

#### Scenario: SCN-ARC-004-6 A file that appears during the restore fails the restore
- **WHEN** a record file that is not in the archive appears during the restore
- **THEN** the restore exits with code 6 and gives the number of such files, but not their names or text

#### Scenario: SCN-ARC-004-7 A refused restore writes no store.json
- **WHEN** the target folder has no store.json and holds an event file that is not in the archive
- **THEN** the restore exits with code 6, and the folder still has no store.json
