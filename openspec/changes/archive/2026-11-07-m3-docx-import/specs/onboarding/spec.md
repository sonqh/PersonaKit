# Spec Delta

## ADDED Requirements

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
