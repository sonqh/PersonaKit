# onboarding Specification

## Purpose
Help a new owner fill the store without a terminal. The owner answers interview questions or pastes CV text, then reviews every proposal.

## Requirements

### Requirement: REQ-ONB-001 Guided interview
The app SHALL ask a fixed list of questions for each record kind. The list SHALL be in `src/web/questions.json`. No question SHALL be specific to one profession, and no answer SHALL be required. Each answer that is not empty SHALL become one proposal of its kind. The proposal SHALL have the actor `web`, `user_stated` true, and a source of kind `interview`. The app SHALL skip empty answers.

Refs: REQ-STO-004, ADR-002

#### Scenario: SCN-ONB-001-1 Every kind has questions
- **WHEN** the tests read the question list
- **THEN** each of the five record kinds has at least one question, and no question holds a word from the developer word list

#### Scenario: SCN-ONB-001-2 Answers become proposals
- **WHEN** the logic module builds a batch from two experience answers, one intent answer, and empty answers, and the app posts it
- **THEN** the store holds three proposals with the actor web, user_stated true, and the source kind interview

#### Scenario: SCN-ONB-001-3 An empty interview writes nothing
- **WHEN** the logic module builds a batch from an interview with no answers
- **THEN** the batch is empty, and the app sends no request and says that it found no answers

### Requirement: REQ-ONB-002 Deterministic text splitter
`src/core/text-import.ts` SHALL turn pasted text into draft proposals with fixed rules and no model. It SHALL remove a byte order mark, treat CRLF as LF, and apply NFC. Each list item and each paragraph SHALL become one draft. A known section heading SHALL set the kind of the drafts after it. The default kind is experience. The same text SHALL give the same drafts. The splitter SHALL NOT write the store.

Refs: REQ-PER-003

#### Scenario: SCN-ONB-002-1 List items and paragraphs become drafts
- **WHEN** the text has a paragraph, a blank line, and three list items that start with `-`, `*`, or a bullet sign
- **THEN** the splitter returns four drafts in the order of the text, without list signs

#### Scenario: SCN-ONB-002-2 Section headings set the kind
- **WHEN** the text has the headings Skills and Goals, each with one list item under it
- **THEN** the first draft has the kind capability and the second draft has the kind intent

#### Scenario: SCN-ONB-002-3 The splitter is deterministic
- **WHEN** the splitter runs twice on the same text, once with CRLF line ends and a byte order mark
- **THEN** both runs return the same drafts

#### Scenario: SCN-ONB-002-4 The splitter refuses oversized text
- **WHEN** the text is larger than 256 KiB, or it gives more than 500 drafts
- **THEN** the splitter refuses it with code 6 and returns no draft

### Requirement: REQ-ONB-003 Paste CV text in the web app
The app SHALL send pasted text to the splitter and show the drafts. The owner SHALL edit, change the kind of, or remove each draft before the owner proposes them. The server SHALL check every draft before the first write and propose nothing when one draft is not valid. Each proposal SHALL have the actor `web`, `user_stated` true, and a source of kind `cv`.

Refs: REQ-ONB-002, REQ-ONB-007

#### Scenario: SCN-ONB-003-1 The owner edits drafts before the proposal
- **WHEN** the app posts text that gives three drafts to `/api/split`, removes one draft, edits another, and posts the two to `/api/propose`
- **THEN** the store holds two proposals with the edited text and the source kind cv

#### Scenario: SCN-ONB-003-2 One draft that is not valid stops the batch
- **WHEN** one of three drafts has an empty statement
- **THEN** the server names the draft, and the store does not change

### Requirement: REQ-ONB-004 Import text from the CLI
`personakit import text FILE` SHALL run the splitter on the file and propose every draft with a source of kind `cv`. It SHALL check every draft before the first write and propose nothing when one draft is not valid. It SHALL use the actor from `--actor`, with `cli` as the default. It SHALL print record IDs and counts, and no statement text.

Refs: REQ-ONB-002, REQ-ONB-007, REQ-VIS-001

#### Scenario: SCN-ONB-004-1 The file becomes proposals
- **WHEN** the owner runs `personakit import text` on a synthetic CV file with four list items
- **THEN** the store holds four proposals, and the output lists four record IDs

#### Scenario: SCN-ONB-004-2 One draft that is not valid stops the import
- **WHEN** one paragraph in the file is longer than the statement limit
- **THEN** the command exits with code 6, names the draft, and proposes nothing

#### Scenario: SCN-ONB-004-3 The output holds no statement text
- **WHEN** the file holds a canary statement, and the command runs with and without `--json`
- **THEN** no output of the command contains the canary

### Requirement: REQ-ONB-005 Review in the web app
The review page SHALL list each proposal with its text, kind, sources, provenance, possible duplicates, and the records it supersedes. The owner SHALL accept a proposal with the visibility private, ai, or public, or reject it. Each action SHALL call `ownerAction` with the actor `web` and the revision on the page. The click is the decision of the owner, like `--yes` in the CLI.

Refs: REQ-STO-004, ADR-002

#### Scenario: SCN-ONB-005-1 The owner accepts with a visibility
- **WHEN** the app posts an accept with the visibility ai for a proposal
- **THEN** the record has the state accepted and the visibility ai, and its event records the actor web

#### Scenario: SCN-ONB-005-2 The owner rejects a proposal
- **WHEN** the app posts a reject for a proposal
- **THEN** the record has the state rejected and stays in the store

#### Scenario: SCN-ONB-005-3 A changed proposal needs a new review
- **WHEN** an agent updates a proposal, and the app then posts an accept with the old revision
- **THEN** the server answers with a conflict, and the record stays proposed

### Requirement: REQ-ONB-006 First run and empty states
When the store has no records, the app SHALL open a start screen with two choices: Interview and Paste CV. The screen SHALL say that no output uses a record before the owner reviews it. The result screen SHALL explain an empty brief or CV and link to review. The accept controls SHALL explain private, ai, and public in plain words, with private as the default. The app SHALL show a clear message when the server stopped or the session is not valid.

Refs: REQ-ONB-005, REQ-WEB-006

#### Scenario: SCN-ONB-006-1 An empty store opens the start screen
- **WHEN** the logic module gets a state with no records
- **THEN** it selects the start screen, and the screen text says that no output uses a record before review

#### Scenario: SCN-ONB-006-2 An empty result explains the next step
- **WHEN** the logic module gets a result with no brief records and no CV records
- **THEN** it returns a hint that names the review page

#### Scenario: SCN-ONB-006-3 Private is the default visibility
- **WHEN** the logic module lists the visibility choices
- **THEN** private comes first as the default, and each choice has a plain explanation

#### Scenario: SCN-ONB-006-4 A stopped server gives a clear message
- **WHEN** a request fails with a network error, or the server answers 401
- **THEN** the logic module returns a message that tells the owner to start the server again or open the new URL

### Requirement: REQ-ONB-007 Batch proposal order
The core function `proposeBatch` SHALL check every input before the first write and propose nothing when one input is not valid. It SHALL then write the proposals in input order. A crash can leave the first part of the batch in the store. When an unexpected write error occurs, the error details SHALL list the IDs written so far.

Refs: REQ-CLI-003, REQ-STO-003

#### Scenario: SCN-ONB-007-1 The batch keeps the input order
- **WHEN** a batch of three valid inputs runs
- **THEN** the record IDs ascend in input order, and each record holds the statement of its input

#### Scenario: SCN-ONB-007-2 One input that is not valid stops the batch
- **WHEN** the third of three inputs has an unknown kind
- **THEN** the function fails with code 6, names item 3, and the store does not change

#### Scenario: SCN-ONB-007-3 A write error lists the IDs written so far
- **WHEN** a write fails with an unexpected error at the third input
- **THEN** the error details list the two IDs that the batch wrote

### Requirement: REQ-ONB-008 DOCX text reader
The core SHALL read the paragraph text of a DOCX file with Node built-ins only. It SHALL read ZIP entries that are stored or deflated, with sizes from the central directory. It SHALL refuse encryption, ZIP64, and a duplicate `word/document.xml`. Limits: 10 MiB file, 1000 entries, 20 MiB for `word/document.xml`, and a compression ratio of 100. It SHALL refuse a DOCTYPE and SHALL decode only the five XML entities and numeric references.

Refs: ADR-004

#### Scenario: SCN-ONB-008-1 Paragraphs become lines
- **WHEN** a DOCX holds paragraphs, a tab, a line break, and the entities `&amp;` and `&#233;`
- **THEN** each paragraph is its own block with the tab, the break, and the decoded characters, and text-box text appears once

#### Scenario: SCN-ONB-008-2 A ZIP bomb is refused
- **WHEN** `word/document.xml` declares more than 20 MiB or 100 times its compressed size, or inflates past its declared size
- **THEN** the reader refuses the file, and memory never grows past the limit

#### Scenario: SCN-ONB-008-3 A broken or unsafe file is refused
- **WHEN** the file is not a ZIP, has no `word/document.xml`, is encrypted, or holds a DOCTYPE
- **THEN** the reader refuses it with a fixed message that quotes no file content

### Requirement: REQ-ONB-009 Import a DOCX CV
`personakit import docx FILE` SHALL turn the DOCX text into drafts with the text splitter, and propose them all or nothing. Each proposal SHALL be private, with source kind import and the label `docx:<12 hex characters of the file hash>`. `--user-stated` SHALL set the flag. The command SHALL never accept a record, and SHALL print IDs and counts only. A missing file SHALL exit with code 5, and a refused file with code 6.

Refs: ADR-004

#### Scenario: SCN-ONB-009-1 A DOCX CV becomes private proposals
- **WHEN** the owner imports a synthetic DOCX CV with three sections
- **THEN** the store holds one private proposal for each draft, with the docx source label, and the output holds no statement text

#### Scenario: SCN-ONB-009-2 A refused file proposes nothing
- **WHEN** the owner imports a ZIP bomb, a file that is not a DOCX, or a missing file
- **THEN** the command exits with code 6, 6, or 5, proposes nothing, and quotes no file content
