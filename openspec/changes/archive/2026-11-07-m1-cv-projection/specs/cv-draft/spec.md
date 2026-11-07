# Spec Delta

## Purpose

Build a CV draft from accepted public records. Make sure that every line in the final CV text cites the records behind it.

## ADDED Requirements

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
