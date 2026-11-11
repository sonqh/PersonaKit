# Spec Delta

## ADDED Requirements

### Requirement: REQ-CV-008 Job text becomes requirements
The core SHALL split a job text of at most 65,536 UTF-8 bytes into requirements. Each list item is one, and each prose sentence with two terms or more is one. A heading or a line that ends with a colon SHALL NOT be a requirement. The core SHALL keep at most 100. The job text SHALL NOT enter the store, events, logs, or stderr. The same text SHALL give the same requirements in every time zone and locale.

#### Scenario: SCN-CV-008-1 List items and sentences become requirements
- **WHEN** a job text has a heading, a line "Requirements:", three bullets of which one is "Excel", and a paragraph of two sentences
- **THEN** the core returns five requirements in text order without list prefixes, and "Excel" is one of them

#### Scenario: SCN-CV-008-2 Empty and oversize texts are refused
- **WHEN** a job text is empty, holds no requirement, or is multibyte text one byte over 65,536 bytes
- **THEN** the core returns a usage error with a fixed message and builds no draft

#### Scenario: SCN-CV-008-3 The job text is never stored or logged
- **WHEN** the owner builds a tailored draft with a job text that contains a unique marker string
- **THEN** no store file, no event, no stderr output, and no MCP log line holds that string

#### Scenario: SCN-CV-008-4 Requirements are deterministic
- **WHEN** the CLI parses the same job text in subprocesses with different `TZ`, `LANG`, and `LC_ALL` values
- **THEN** the outputs are byte-identical

### Requirement: REQ-CV-009 Records share words with requirements
The core SHALL compare each requirement with CV-eligible records. Record terms SHALL come from the statement, role, organization, level, scope, and tags. A term SHALL be an NFKC, lower-case token that has a letter and is not an English stop word. A record SHALL share words with a requirement on two common terms. One term SHALL be enough for a requirement of three terms or fewer. A tag SHALL match when all its terms are in the requirement.

#### Scenario: SCN-CV-009-1 A requirement with shared terms finds its record
- **WHEN** a requirement says "Bookkeeping for small clients" and a public record says "Did the bookkeeping for 40 small clients"
- **THEN** the report links the requirement to that record ID

#### Scenario: SCN-CV-009-2 A requirement without a record is a gap
- **WHEN** no eligible record shares enough terms with a requirement
- **THEN** the report lists the requirement under gaps

#### Scenario: SCN-CV-009-3 A tag of several words matches as a whole
- **WHEN** a record has the tag "customer support", one requirement says "Customer support by phone and email", and another says "Support the regional sales partners"
- **THEN** the first requirement links to the record through the tag, and the second does not

#### Scenario: SCN-CV-009-4 Digits and code names follow the term rule
- **WHEN** a requirement says "5+ years of C++" and records hold only "5", or only "C", or "C++"
- **THEN** only the record with "C++" shares words, and `C#`, `node.js`, and "e.g." give the tokens that the design lists

### Requirement: REQ-CV-012 The match report is safe to show
The report SHALL list each requirement with the IDs of records that share words with it. It SHALL list the gaps and the unused IDs, and no record text. Only accepted public records that are not intents or preferences SHALL appear. Requirement text SHALL be one line without control characters, at most 500 characters. Report text SHALL say that a record shares words. It SHALL NOT say that the owner meets a requirement.

Refs: REQ-VIS-002

#### Scenario: SCN-CV-012-1 The report holds no record text
- **WHEN** the report is built for a store with public records
- **THEN** it holds requirement text, record IDs, and counts, and no statement or facet text

#### Scenario: SCN-CV-012-2 Excluded records never appear
- **WHEN** the job text of each fixture shares terms with excluded records: private, ai, proposed, rejected, retired, intent, preference, and the canary
- **THEN** those requirements are gaps, and no ID of those records is in the report, the draft, or the MCP result

#### Scenario: SCN-CV-012-3 Untrusted job text cannot change the terminal
- **WHEN** a job line holds an ESC sequence, other control characters, and 2,000 characters
- **THEN** the report text of that requirement has no control character and at most 500 characters

#### Scenario: SCN-CV-012-4 The wording makes no claim of fit
- **WHEN** `cv match` prints its text report
- **THEN** each link says "shares words with", each gap says "no record shares enough words", and the text says that a link is a hint

### Requirement: REQ-CV-010 Tailored CV draft
With a job text, `cv draft` SHALL keep Summary, Education, Credentials, and Career breaks whole. In the other sections it SHALL keep only records that share words with a requirement. Order and line format SHALL follow REQ-CV-001. When no record outside the whole sections shares words, it SHALL build the full draft. The CLI SHALL print the count and IDs of left-out records to stderr. The same input SHALL give the same bytes.

Refs: REQ-CV-001

#### Scenario: SCN-CV-010-1 Unmatched records leave the draft and the owner sees them
- **WHEN** a store has four public experience records and a job text shares words with two of them
- **THEN** the draft has those two under Experience plus the whole sections, and stderr gives the two other IDs and the command `cv match`

#### Scenario: SCN-CV-010-2 Each fixture gives a useful tailored draft
- **WHEN** the tailored draft runs for the synthetic job text of each profession fixture
- **THEN** the report has at least one link and one gap, and `cv check` on the unchanged draft reports no error and no warning

#### Scenario: SCN-CV-010-3 No match gives the full draft
- **WHEN** a job text shares words with no record, or only with Summary records
- **THEN** the draft equals the draft without a job, and the report gives zero matches

#### Scenario: SCN-CV-010-4 The tailored draft is deterministic
- **WHEN** the CLI builds the tailored draft in subprocesses with different `TZ`, `LANG`, and `LC_ALL` values
- **THEN** the outputs are byte-identical

### Requirement: REQ-CV-011 Job input in the CLI and MCP
`cv match --job FILE` SHALL print the report, as JSON with `--json`. `cv draft --job FILE` SHALL use the tailored draft, and with `--json` print `{draft, match}`. FILE `-` SHALL read stdin. The MCP tool `cv_draft` SHALL take an optional `job` and then return `{draft, match}`. The personakit skill SHALL limit gap questions, and SHALL forbid a line for a gap that the owner did not state.

Refs: REQ-CV-008, REQ-MCP-001

#### Scenario: SCN-CV-011-1 The CLI prints the report
- **WHEN** the owner runs `cv match --job jd.txt --json` on a synthetic store
- **THEN** the output lists links, gaps, and unused IDs, and the exit code is 0

#### Scenario: SCN-CV-011-2 The CLI writes a tailored draft from a file or stdin
- **WHEN** the owner runs `cv draft --job jd.txt --out cv.md`, and again with `--job -` and the same text on stdin
- **THEN** both files equal the tailored draft from the core

#### Scenario: SCN-CV-011-3 The MCP tool takes a job text
- **WHEN** an agent calls `cv_draft` with a `job` text, and again without it
- **THEN** the first result holds the draft and the report, and the second equals the result before this change

#### Scenario: SCN-CV-011-4 Bad job input is refused
- **WHEN** the job file is missing or empty, or the CLI file or the MCP `job` text is one byte over 65,536 bytes
- **THEN** the CLI exits with code 2, the MCP tool returns an error, and neither writes a file
