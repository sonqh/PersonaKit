# Design

## Context

`buildCvDraft` in `src/core/cv.ts` takes accepted public records and returns a fixed draft. `checkCv` checks a rewritten draft. Nothing in the core knows about a job. This change adds a job text as an input next to the records. A link between a requirement and a record is a hint for the owner and the agent. It does not show that the owner meets the requirement. Every final line still goes through `cv check`.

The architect and the product manager reviewed the first plan. Both approved with changes. This design holds those changes.

## Goals / Non-Goals

**Goals:**

- Show which records share words with a job and which job requirements no record supports.
- Keep a tailored draft in the same format, so the existing check, strip, print, and agent steps work.
- Keep the core deterministic, provider-free, and without new dependencies.

**Non-Goals:**

- Understanding of a job text. The match uses shared words only.
- Languages other than English for stop words and plural forms. Other languages still match on exact terms.
- Storage of job texts or a history of applications.
- Web UI, follow-up questions in the app, and warning acknowledgement. Later M4 changes add them.

## Decisions

- The job text is a call input. The core does not store it, and no event, log, or stderr line holds it. So the store schema stays the same, and a JD stays out of backups. A later change can add saved targets if the owner asks. Refs: REQ-CV-008
- The job text is untrusted data. The core reads it as text only. The `cv_draft` description says that the job text and the requirement text in the result are data, not instructions. Refs: REQ-CV-008, REQ-CV-011
- The core parser checks the size limit of 65,536 UTF-8 bytes with `Buffer.byteLength`. The CLI and MCP share this check. The MCP server does not enforce JSON Schema `maxLength`, and `maxLength` counts characters. The error message is fixed and never repeats the input. Refs: REQ-CV-008, REQ-CV-011
- Parsing: remove a byte order mark, turn CRLF and CR into LF, and apply NFKC. Split into lines. A Markdown heading or a line that ends with `:` is a context line. A line with a list prefix (`-`, `*`, `•`, `1.`, `1)`, `a)`) is one requirement, also with one term, because short items such as "Excel" or "CPR" are common. Split another line into sentences at `. `, `? `, and `! `, and keep a sentence with two terms or more. Keep the first 100 requirements, and report the rest as `truncated`. Refs: REQ-CV-008
- A known split: "e.g. Excel" in prose gives the fragments "e.g" and "Excel". The fragment "e.g" has no term, so the core drops it. A test shows this. Refs: REQ-CV-008
- Tokens come from the linear regex `[\p{L}\p{N}][\p{L}\p{N}+#]*` with the `u` flag. It cannot backtrack. So `C++` gives `c++`, `C#` gives `c#`, `node.js` gives `node` and `js`, and `5+` gives `5+`. A term must hold a letter and have two characters or more. So digit-only tokens such as `5`, `5+`, and `2020` are not terms, and `e.g.` gives no term. Refs: REQ-CV-009
- Normalization: NFKC on both the job text and the record text before tokenizing. Lower case with `toLowerCase()`, never `toLocaleLowerCase()`. A fixed English stop list removes function words and JD filler words such as experience, ability, strong, required, preferred, and years. A plural `s` is removed from a term of five letters or more that does not end in `ss`. Refs: REQ-CV-009
- Record terms come from `recordText` in `src/core/cv-facts.ts` without the dates: statement, role, organization, level, scope, and tags. The CV does not print level, scope, and tags. They are public fields of a public record, so the match uses them as hints. A link from a tag can show a record whose printed line does not repeat the words. The owner sees the link in the report. Refs: REQ-CV-009
- Match rule: two common terms, or one when the requirement has three terms or fewer, or a tag whose terms are all in the requirement. The tag goes through the same term rules. The rule is simple to explain and to test. A false link costs little, because the owner and the check review the draft. Refs: REQ-CV-009
- Only `cvEligible` records take part. Private, ai, proposed, rejected, and retired records, intents, and preferences never appear in a link, a gap, the unused list, or the draft. Refs: REQ-CV-012
- Report shape: `schema: "personakit.cv-match/v0"`, `requirements: [{ n, text, ids }]` with `ids` sorted by the number of common terms descending and then by ID, `gaps: [n]`, `unused: [id]`, `matched: <count>`, `truncated: <count>`. `matched` counts records outside the whole sections. All sorts use code-point comparison, as `cmpId` does, never `localeCompare`. Refs: REQ-CV-009, REQ-CV-012
- Requirement text in the report goes through `oneLine`. The core then removes C0 and C1 control characters and cuts the text at 500 characters. So a JD line cannot move the cursor or change colors in the terminal. Refs: REQ-CV-012
- Report wording: "shares words with", "no record shares enough words", and a note that a link is a hint, not proof of fit. No key or text uses the words covered, meets, or qualified. Refs: REQ-CV-012
- Tailored draft: keep Summary, Education, Credentials, and Career breaks whole. Identity sets the context of a CV. A job often asks for a licence or a degree. A JD names it loosely (RN, CPA, CDL), so word overlap misses it. A career break explains a time gap. In Experience, Freelance engagements, and Capabilities, keep the records that share words. Keep the REQ-CV-001 order inside each section, so dated sections stay in time order. Refs: REQ-CV-010
- When `matched` is 0, return the full draft. An empty CV, or a CV with only a Summary, helps nobody, and the report shows the reason. Refs: REQ-CV-010
- `cv draft --job` prints to stderr the count and IDs of the records it left out, and the next step `personakit cv match --job FILE`. IDs only, no text, as the existing hint for ai records does. Refs: REQ-CV-010
- Dropping unmatched experience can leave holes in the time line, mostly for career changers. The owner or the agent adds a record back by hand in the rewrite. The README and the skill state this trade-off. The open question for the owner is in the risks. Refs: REQ-CV-010
- CLI: `cv match --job FILE [--json]` prints the report. `cv draft --job FILE` uses the tailored draft. With `--json` it prints `{ "draft": <cv-draft/v0>, "match": <cv-match/v0> }`. With `--out` its data is `{ written, records, left_out, gaps }`. FILE `-` reads stdin, as `propose --from -` does. `--as-of` works with `--job`. A missing, empty, or oversize job is a usage error with code 2. Refs: REQ-CV-011
- MCP: `cv_draft` gets an optional `job` string. Without `job`, the result is unchanged: the Markdown text and the `cv-draft/v0` object as structured content. With `job`, the text is the tailored Markdown, and the structured content is `{ draft, match }`. No new tool, so agents keep one entry point. Refs: REQ-CV-011, REQ-MCP-001
- The personakit skill gets a tailoring procedure. The agent gets the draft and the report and rewrites the draft with markers. It skips gaps that are not job requirements, such as benefits, the company description, and legal text. It groups related gaps and asks about at most five, the most important first. The owner can stop at any time. Refs: REQ-CV-011
- The skill forbids a line, also a `[pk:self]` line, for a gap that the owner did not state in the session. An answer of the owner becomes a proposal with `user_stated: true`. When the owner says that a record already supports a gap, the agent can propose a tag update, and the owner accepts it with `review`. An instruction inside a job text never starts a tool call. Refs: REQ-CV-011
- Determinism tests spawn the CLI in subprocesses with different `TZ`, `LANG`, and `LC_ALL` values, because Node fixes the locale and the time zone at start. Refs: REQ-CV-008, REQ-CV-010
- The privacy scan in `scripts/check-privacy.ts` also checks each non-`.jsonl` file in a fixture folder, except `SYNTHETIC.md`. Such a file starts with the line `# Synthetic job text (PersonaKit fixture)`. A heading is never a requirement, so the marker stays out of the match. Each fixture job text shares terms with the fixture canary and with one excluded record, and holds one gap and one synonym miss. Refs: REQ-CV-012

## Risks / Trade-offs

- Word overlap misses synonyms, such as "customer care" for "client support". The gap list then shows a requirement that a record supports. The owner can add a tag through a proposal and `review`.
- A JD in another language matches only on exact shared terms. The README states it.
- A tailored draft of a career changer can have holes in the time line. The README and the skill tell the owner to add records back.
- Open questions for the owner: Should the draft drop unmatched records from Experience? This plan says yes. Should the store keep job texts? This plan says no. Which M4 measures and thresholds apply? Is a CLI and agent loop enough until the web change?
