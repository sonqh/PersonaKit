# Design

## Context

A DOCX file is a ZIP archive. The text of the body is in `word/document.xml`, in `w:t` elements inside runs (`w:r`) inside paragraphs (`w:p`). PersonaKit already splits pasted CV text into drafts. So the import only needs the plain text, with a blank line after each paragraph.

## Goals / Non-Goals

**Goals:**

- Read the body text of a normal DOCX file, from Word, LibreOffice, or Google Docs.
- Refuse hostile files safely, with no unbounded memory use.

**Non-Goals:**

- PDF, DOC, RTF, ODT, headers, footers, footnotes, comments, tables as tables, and images. Text boxes are read, because many CV templates keep skills in a sidebar text box.
- Formatting, lists as structure, and section detection beyond what the text splitter does.
- DOCX upload in the web app. A later change can add it.

## Decisions

### ZIP

- The reader opens the file once, checks its size with `fstat` (10 MiB), and reads it into one buffer. Refs: REQ-ONB-008
- End of central directory: search backwards over the last 22 + 65535 bytes. Accept a signature only when 22 plus the comment length reaches the end of the file exactly. Refuse a nonzero disk number, entry counts that differ, more than 1000 entries, and any 0xFFFF or 0xFFFFFFFF field (ZIP64). Refs: REQ-ONB-008
- The central directory must end at or before the end record, and the walk must use exactly its declared size. All reads are unsigned. Refs: REQ-ONB-008
- The reader matches the exact bytes `word/document.xml` and refuses a duplicate. It does not decode other names. Refs: REQ-ONB-008
- Flags: refuse bit 0 and bit 6 (encryption) and method 99. Accept bit 3 (data descriptor), because the sizes come from the central directory. Methods 0 and 8 only. Refs: REQ-ONB-008
- Local header: check the signature and the name bytes. The data starts after the local name and extra lengths, which can differ from the central ones. The data must end at or before the central directory. Refs: REQ-ONB-008
- Size checks run in this order: declared size ≤ 20 MiB, compressed size > 0, declared size ≤ 100 × compressed size, data range in bounds. Method 0 needs equal sizes. Method 8 inflates with `maxOutputLength` set to the declared size. Then the output length must equal the declared size, and the CRC-32 (`zlib.crc32`) must match. Every zlib error becomes one fixed invalid message. Refs: REQ-ONB-008

### XML

- Bytes decode as UTF-8 with `TextDecoder` in fatal mode. A UTF-16 byte order mark, or a declared encoding other than UTF-8, refuses the file. Refs: REQ-ONB-008
- A linear scanner reads comments (`<!-- -->`) and processing instructions (`<? ?>`) as one unit each. A quoted attribute value can hold `>`. `<!DOCTYPE` or `<!ENTITY` anywhere refuses the file. CDATA is text inside `w:t` and is skipped elsewhere. Refs: REQ-ONB-008
- The root element binds a prefix to the WordprocessingML namespace, Transitional or Strict. The scanner uses that prefix, not a fixed `w:`. It refuses a default namespace binding for it, and a prefix that is bound again deeper. Element names match exactly up to white space, `/`, or `>`. Refs: REQ-ONB-008
- Only `w:t` inside a run writes text. `w:tab` and `w:br` or `w:cr` inside a run write a tab and a line break. The same names inside `w:pPr` or `w:rPr` write nothing. `w:noBreakHyphen` writes `-`. `w:softHyphen`, `w:sym`, and `w:lastRenderedPageBreak` write nothing. Refs: REQ-ONB-008
- The end of each `w:p` writes a blank line, so each paragraph becomes its own draft in the splitter. A paragraph with `w:numPr` (a Word list item) starts with `- `. `<w:p/>` writes a blank line. Refs: REQ-ONB-008, REQ-ONB-009
- The scanner skips the content of `mc:Fallback`, `w:del`, and `w:moveFrom`, and keeps `mc:Choice`, `w:ins`, and `w:moveTo`. A self-closing `<w:del/>` or `<w:ins/>` inside run properties opens no skip. So text-box text appears once, and deleted tracked changes are left out. Field codes stay out, because they are in `w:instrText`, not `w:t`. Refs: REQ-ONB-008
- Entities: the five XML entities and numeric references with at most 7 decimal or 6 hexadecimal digits. Some references refuse the file: 0, a surrogate, a value above 0x10FFFF, FFFE, FFFF, and a malformed reference. Any other named entity refuses the file. A reference to another control character becomes a space. Refs: REQ-ONB-008

### Command

- `import docx` passes the text to `splitText`, then to `proposeBatch`. So the rules of pasted text apply. These are the 256 KiB text limit, 500 drafts, all or nothing at the check step, and writes in order. Refs: REQ-ONB-009
- Proposals are set to private explicitly. The source is `{kind: "import", label: "docx:<first 12 hex characters of the sha256 of the file>"}`, so the owner can find and reject one file's batch. Refs: REQ-ONB-009
- Errors use fixed messages. They never quote file content. Refs: REQ-ONB-009

### Comparison with a library

- The owner chose a hand-written reader, with a check against a library during development (2026-11-07). `mammoth` is a development dependency only. A test builds DOCX files and compares the reader's text with `mammoth.extractRawText` after white space is normalized. `scripts/compare-docx.ts FILE` runs the same comparison on a file on the owner's own computer. Real CV files never enter the repository. Refs: REQ-ONB-008
- A test fails if any file under `src/` imports `mammoth`. Refs: REQ-ONB-008

## Plan review, 2026-11-07

The architect found three blockers, now in the decisions above. Paragraphs must end with a blank line for the splitter. Element names need exact matching that knows the context and self-closing tags. And `mc:AlternateContent` duplicates text-box text. The owner approved the DOCX direction in ADR-004.

## Risks / Trade-offs

- A DOCX that keeps its text in text boxes or tables gives few drafts. Mitigation: the owner can paste the text instead, and the command prints the draft count.
- A hand-written parser can have bugs. Mitigation: limits on every size, `maxOutputLength`, a CRC check, and tests with broken and hostile files.
