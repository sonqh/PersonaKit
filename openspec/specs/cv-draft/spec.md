# cv-draft Specification

## Purpose
Build a CV draft from accepted public records. Make sure that every line in the final CV text cites the records behind it.

## Requirements

### Requirement: REQ-CV-001 Cited CV draft
`cv draft` SHALL build Markdown from accepted public records. Sections: Summary (identity), Experience, Freelance engagements, Education, Credentials (issued and expiry dates), Career breaks, and Capabilities. Intents SHALL NOT enter. Each record SHALL be one `- ` line: line feeds become spaces, and `[pk:` in record text becomes `(pk:`. The line SHALL end with `[pk:<ID>]`. The same records SHALL give the same bytes.

#### Scenario: SCN-CV-001-1 Every record line cites its record
- **WHEN** the owner builds a draft from a store with public experience, education, credential, and capability records
- **THEN** each record line is a list item that ends with the marker of its record, under the section for its type

#### Scenario: SCN-CV-001-2 The draft is deterministic
- **WHEN** the draft runs twice with different time zones and locales
- **THEN** the two outputs are byte-identical

#### Scenario: SCN-CV-001-3 The draft has a fixed order
- **WHEN** the store holds experience with ongoing, ended, partial-date, and undated periods
- **THEN** ongoing periods come first, then the newest start, then the newest end, then the ID, and undated records come last

#### Scenario: SCN-CV-001-4 Record text cannot break the draft
- **WHEN** a public statement has a line feed, starts with `#`, or contains `[pk:` and another ID
- **THEN** the draft prints it as one list line with one marker, and `cv check` passes on the draft

#### Scenario: SCN-CV-001-5 Credentials show their dates
- **WHEN** a public credential has an issued date and an expiry date, and the draft runs with `--as-of` after the expiry date
- **THEN** the line shows both dates and marks the credential as expired

### Requirement: REQ-CV-002 Every final line is cited
`cv check <file>` SHALL accept a line only if it is blank, a horizontal rule, a section heading from the draft, or ends with a valid marker. A marker is `[pk:` with one or more ULIDs separated by commas, then `]`, at the end of the line. `[pk:self]` marks a line that the owner states. All other lines SHALL be errors. These include a missing or malformed marker, a marker elsewhere in the line, a fenced code block, and an ID that is not citable.

#### Scenario: SCN-CV-002-1 A line without a marker fails
- **WHEN** a CV line, a quote line, or a heading with a title and dates has no marker
- **THEN** the check reports an error with the line number and exits with code 6

#### Scenario: SCN-CV-002-2 A misplaced or malformed marker fails
- **WHEN** a marker is in the middle of a line, or holds an ID that is not a ULID
- **THEN** the check reports an error for that line

#### Scenario: SCN-CV-002-3 An ID that cannot be cited fails with one code
- **WHEN** a line cites an ID that is missing, proposed, rejected, retired, private, or ai
- **THEN** the check reports the code not-citable for that ID, and gives no reason and no record text

#### Scenario: SCN-CV-002-4 Owner lines are listed for review
- **WHEN** a line ends with `[pk:self]`
- **THEN** the check passes the line and lists it in the owner-stated group

#### Scenario: SCN-CV-002-5 A clean draft passes
- **WHEN** the check runs on an unchanged draft from `cv draft`
- **THEN** it reports no error and exits with code 0

### Requirement: REQ-CV-005 Final text after review
`cv strip <file>` SHALL print the CV text without markers. It SHALL refuse a file with a check error. Then it prints the findings to stderr and no CV text to stdout. With `--json`, the text and the owner lines SHALL be fields of one JSON object. The owner reviews the final text. PersonaKit does not claim that a paraphrase keeps the meaning of its records.

#### Scenario: SCN-CV-005-1 Strip removes the markers
- **WHEN** the owner strips a file with no check error
- **THEN** the output has the same lines without the markers

#### Scenario: SCN-CV-005-2 Strip refuses a file with errors
- **WHEN** the owner strips a file with a line that has no marker
- **THEN** the command exits with code 6 and prints nothing to stdout

### Requirement: REQ-CV-006 CV input handling
`cv check` and `cv strip` SHALL remove a byte order mark and treat CRLF as LF. They SHALL refuse a file larger than 1 MiB with code 6, and a missing file with code 5. `cv draft` and `cv check` SHALL exit with code 6 when a record file in the store cannot be read, and name the number of such files.

#### Scenario: SCN-CV-006-1 CRLF and a byte order mark are accepted
- **WHEN** the owner checks a clean draft saved with CRLF line ends and a byte order mark
- **THEN** the check reports no error

#### Scenario: SCN-CV-006-2 Missing and oversized files are refused
- **WHEN** the CV file does not exist, or is larger than 1 MiB
- **THEN** the command exits with code 5, or with code 6

#### Scenario: SCN-CV-006-3 A corrupt record file stops the CV path
- **WHEN** a record file in the store is not valid JSON
- **THEN** `cv draft` and `cv check` exit with code 6 and name one unreadable record file

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
