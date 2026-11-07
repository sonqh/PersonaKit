# Design

## Context

The architecture sets the grounding rules for a CV. Each claim cites accepted record IDs. The dates, names, and numbers match the cited records, and the verbs match the contribution level. The core has no model. The agents that the owner uses already write text well. So PersonaKit gives them a cited draft and a strict line check, and the owner reviews the result.

## Goals / Non-Goals

**Goals:**

- A cited draft that fits any profession, including credentials, freelance work, and career breaks.
- No line in the final text without a citation or an explicit owner mark.
- No private or ai-only record in any CV output.

**Non-Goals:**

- Fact and wording warnings. The next change adds them, because good tokenization needs its own review.
- Writing polished text in the core. Agents do that outside the core.
- Ranking records against a job description. A later change can add it after user research.
- PDF, DOCX, or print output. M2 adds print output after the content review works.
- Proof that a paraphrase keeps its meaning.

## Decisions

### Draft

- Section by `facets.type`: `freelance` goes to Freelance engagements, `education` and `course` to Education, `career_break` to Career breaks. A record with `issued_on` or `expires_on` goes to Credentials. Other experience goes to Experience. Other capabilities go to Capabilities. Identity goes to Summary. Intents never enter, because plans are not CV claims. Refs: REQ-CV-001
- Each record is one line: `- <statement> (<role>, <organization>, <start> to <end>)`. Line feeds become spaces, white space collapses, and `[pk:` in record text becomes `(pk:`. So a statement can never become a heading, a quote, or a second citation. Refs: REQ-CV-001
- Sort key for dated sections: ongoing first, then the period start descending by code point, then the end descending, then the ID ascending. A record without a start comes last. Capabilities and Summary sort by ID. Code-point order puts `2021-06` before `2021` when descending. Nothing uses `localeCompare`, `Intl`, `Date`, or the clock. Refs: REQ-CV-001
- `--as-of YYYY-MM-DD` marks credentials that expired before that date. Without it, the draft prints the dates only, so it stays deterministic. Refs: REQ-CV-001
- When few public records exist, the CLI prints a hint to stderr. The hint gives the number of accepted ai records and the `visibility` command. The hint gives counts only, never text. Refs: REQ-CV-001

### Line model and markers

- First the CLI removes a byte order mark and carriage returns. Then a line passes when it is blank, a horizontal rule, or a draft section heading. A line that ends with a marker also passes. The marker pattern is `\s*\[pk:(self|ULID(,ULID)*)\]\s*$`. Refs: REQ-CV-002, REQ-CV-006
- A heading with a title or dates needs a marker, like any claim line. A quote line is a claim line. A fenced code block is an error. Refs: REQ-CV-002
- `[pk:` anywhere else in a line is a `misplaced-marker` error. A marker with an ID that is not a ULID is `malformed-marker`. Strip never leaves part of a marker. Refs: REQ-CV-002, REQ-CV-005
- One code, `not-citable`, covers a missing ID and an ID that is not accepted or not public. A separate reason would tell an agent that a private record exists. Refs: REQ-VIS-002
- `[pk:self]` lets the owner keep a name line, a contact line, or a link. The check lists these lines in their own group, so the owner sees them before strip. Refs: REQ-CV-002

### Output and privacy

- The draft prints the statement, organization, role, period, issued date, and expiry date only. Location, sources (a reference can be a local path), tags, extensions, and provenance stay out. Refs: REQ-VIS-002
- `cv check` prints line numbers, codes, and record IDs. It never prints record text. The CV file belongs to the owner, so its own lines can appear. Refs: REQ-VIS-002
- Exit codes follow the CLI. Code 0 means no error, and code 5 means a missing CV file. Code 6 covers check errors, an oversized file, and unreadable record files. Refs: REQ-CV-006

## Risks / Trade-offs

- A cited line can still change the meaning of its record. Mitigation: the next change adds fact and wording warnings, and the owner reviews the final text.
- `[pk:self]` can hide an invented claim. Mitigation: the check lists every owner line, and the skill forbids agents to add `[pk:self]`.
- The draft hint counts ai records, which tells a caller how many exist. Mitigation: only counts, and the hint goes to the owner's terminal on stderr.

## Plan review, 2026-11-07

The product manager and the architect reviewed the first plan. Adopted in this change:

- Architect blocker: record text could break the draft. Each record is now one escaped list line.
- Architect blocker and product manager blocker: headings and quote lines skipped the check but reached the final text. Every printed line now needs a marker, except blank lines, rules, and draft section headings.
- Product manager: `[pk:self]` for owner lines. Sections for credentials, education, freelance work, and career breaks. Summary from identity only, with intents left out. The empty-draft hint. The claude.ai CV steps.
- Architect: the full marker grammar, CRLF and byte order mark handling, the size limit, and the exit code for a missing file.
- Architect: the exact sort key, the field whitelist, and one not-citable code.
- Architect: a canary test for check output, and the handling of unreadable record files.
- Product manager: the architecture now says that a job description is optional.

Moved to the next change `m1-cv-fact-check`:

- years and ranges, numbers, and number words
- organizations from public records, with word boundaries and longest match
- titles and seniority words
- ownership verbs with inflections, `co-led` first, verbs from the cited statement, and records without a contribution level

Kept against advice: the `AGENTS.md` branch rule stays in this change, because the owner asked for it here. It is one line of documentation.

## Archive-stop review, 2026-11-07

The architect reviewed the diff. The line model held against every bypass tried: headings with markers, marker-only lines, indented code, setext headings, HTML comments, fences, and hidden characters. Fixed after the review:

- Blocker: the end-of-line marker regex backtracked in quadratic time. A 1 MiB line took minutes. A linear parser with `lastIndexOf` replaces it, and a test checks a 1 MiB line in under one second.
- `cv strip --json` printed raw text. It now prints one JSON object with the text and the owner lines.
- A partial expiry date such as `2026-11` now lasts to the end of its month.
- Spaces inside a marker are malformed, as the grammar says.
- Tests now cover the freelance and career-break sections, and the draft without a hint.
- The skill describes exit code 6 as invalid input or CV check errors.
