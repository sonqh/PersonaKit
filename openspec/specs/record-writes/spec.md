# record-writes Specification

## Purpose
Write persona records safely when two agents and the owner use one store at the same time.

## Requirements

### Requirement: REQ-STO-003 One file for each record and event
The store SHALL keep one file for each record and one file for each event, named by ULID. Every write SHALL use a temporary file and a rename. A new file SHALL never replace an existing file. Readers SHALL read only ULID-named files. `init` SHALL write `.gitattributes` and `.gitignore` for a store that is synced with git.

Refs: ADR-001

#### Scenario: SCN-STO-003-1 Two agents propose at the same time
- **WHEN** two processes, labeled claude-code and codex, each propose 100 records into one store at the same time
- **THEN** the store holds 200 valid record files and 200 event files, with no lost and no corrupted file
- **AND** after the owner accepts them with visibility ai, two runs of `brief` give byte-identical output

#### Scenario: SCN-STO-003-2 No temporary files remain
- **WHEN** a process proposes 20 records
- **THEN** the record and event folders hold only ULID-named files, and `doctor` finds no error

#### Scenario: SCN-STO-003-3 Init creates the store
- **WHEN** the owner runs `init` with a new store path
- **THEN** the store holds `store.json`, `.gitattributes`, `.gitignore`, and the records, events, and locks folders

### Requirement: REQ-STO-004 Agents propose and the owner decides
An agent write SHALL create a record in state `proposed` with visibility `private` unless the proposer suggests another visibility. Only accept, reject, and retire SHALL change the state. Accept SHALL set the final visibility and retire the accepted records that the new record supersedes. A record SHALL have one accepted successor at most. Each change SHALL write an event with the actor and the revisions.

Refs: ADR-002

#### Scenario: SCN-STO-004-1 A proposal records its provenance
- **WHEN** an agent labeled codex proposes a record
- **THEN** the record is proposed, private, at revision 1, and holds the actor, model, session, time, and user_stated flag

#### Scenario: SCN-STO-004-2 Accept sets the visibility and retires the old record
- **WHEN** the owner accepts a proposal that supersedes an accepted record, with visibility ai
- **THEN** the proposal becomes accepted with visibility ai, and the old record becomes retired

#### Scenario: SCN-STO-004-3 Invalid state changes fail
- **WHEN** the owner retires a proposed record, or accepts a rejected record
- **THEN** the core refuses the change with the invalid code

#### Scenario: SCN-STO-004-4 The owner rejects a proposal
- **WHEN** the owner rejects a proposed record
- **THEN** the record becomes rejected, and an event records the change

#### Scenario: SCN-STO-004-5 One record has one successor
- **WHEN** the owner accepts a second proposal that supersedes a record that already has an accepted successor
- **THEN** the core refuses the accept with the conflict code

### Requirement: REQ-STO-005 No silent overwrite
An accepted record SHALL never change in place. An update to it SHALL create a proposal that supersedes it. An update with a stale revision SHALL create a proposal and report a conflict. An update SHALL NOT raise visibility. Every change to an existing record file SHALL hold a lock. Locks for several records SHALL be taken in sorted order.

Refs: ADR-002

#### Scenario: SCN-STO-005-1 A proposal at the current revision changes in place
- **WHEN** an agent updates a proposed record with its current revision
- **THEN** the record changes and its revision increases by one

#### Scenario: SCN-STO-005-2 An accepted record never changes
- **WHEN** an agent updates an accepted record
- **THEN** the accepted file stays byte-identical, and a new proposal supersedes it

#### Scenario: SCN-STO-005-3 A stale revision reports a conflict
- **WHEN** an agent updates an accepted record with an old revision
- **THEN** the core reports a conflict, creates a proposal, and leaves the accepted record unchanged

#### Scenario: SCN-STO-005-4 The owner accepts what the owner reviewed
- **WHEN** the owner accepts with a reviewed revision, and an agent changed the record after the review
- **THEN** the core refuses the accept with the conflict code

#### Scenario: SCN-STO-005-5 Two processes update one proposal
- **WHEN** two processes each update one proposed record 50 times with its current revision
- **THEN** the in-place updates form one revision chain with no gap and no repeat, and `doctor` finds no error

#### Scenario: SCN-STO-005-6 Stale and live locks
- **WHEN** a lock belongs to a dead process on this host, or to a live process
- **THEN** the core removes the dead lock and continues, and it reports a conflict after a timeout for the live lock

### Requirement: REQ-STO-006 Duplicates are flagged, not merged
A proposal whose normalized statement matches a record of the same kind SHALL get `possible_duplicate_of`. Normalization SHALL use NFKC, lower case, and no punctuation or extra spaces. The core SHALL never merge records. Command output SHALL list only matches with visibility ai or public, and SHALL say when the owner rejected the same statement before.

#### Scenario: SCN-STO-006-1 A visible duplicate is reported
- **WHEN** an agent proposes a statement that differs from an ai record only in case and punctuation
- **THEN** the proposal holds the reference, and the output lists it

#### Scenario: SCN-STO-006-2 A private duplicate stays hidden
- **WHEN** an agent proposes a statement that matches a private record
- **THEN** the proposal holds the reference, and the output does not list it

#### Scenario: SCN-STO-006-3 A rejected statement is flagged
- **WHEN** an agent proposes a statement that the owner rejected before
- **THEN** the output says that the owner rejected it

### Requirement: REQ-STO-007 Store diagnosis
`doctor` SHALL report bad files, forks, orphan events, supersede errors, leftovers from crashes, and missing git settings. An unapplied event SHALL count as an orphan only when it starts from the current record file, and as a fork otherwise. `doctor --fix` SHALL remove stale locks and old temporary files, and move orphan events to `events/orphaned/`.

#### Scenario: SCN-STO-007-1 A forked history is reported
- **WHEN** two applied events change one record from the same revision
- **THEN** `doctor` reports a forked history and fails

#### Scenario: SCN-STO-007-2 Conflict markers are reported
- **WHEN** a record file holds git conflict markers
- **THEN** `doctor` reports the file

#### Scenario: SCN-STO-007-3 An interrupted last write is an orphan
- **WHEN** an event starts from the current record file, and its record change was not written
- **THEN** `doctor` reports an orphan event and no fork, and `doctor --fix` moves the event to `events/orphaned/`

#### Scenario: SCN-STO-007-4 Doctor removes leftovers
- **WHEN** an old temporary file and a lock from a dead process exist
- **THEN** `doctor` reports both, and `doctor --fix` removes both

#### Scenario: SCN-STO-007-5 A fork with one change on each side
- **WHEN** two machines each change one record from the same revision, and git keeps one record file
- **THEN** `doctor` reports a forked history, and `doctor --fix` keeps both events

#### Scenario: SCN-STO-007-6 A retry after a crash is not a fork
- **WHEN** a write crashes after its event, and the user then retries the same change with success
- **THEN** the retry moves the crashed event to `events/orphaned/`, and `doctor` finds no error
