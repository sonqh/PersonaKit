# Design

## Context

The previous change made every final CV line cite accepted public records. The product manager and the architect reviewed the fact checks in that plan and moved them here with detailed rules. Those rules are the base of this design.

## Goals / Non-Goals

**Goals:**

- Catch the common ways a rewrite changes a record: dates, numbers, employers, titles, and the size of a role.
- No warning on an unchanged draft, so that a warning means something.
- No record text in any output.

**Non-Goals:**

- Proof that a paraphrase keeps its meaning.
- Languages other than English for number words, seniority words, and verbs.
- Detection of an invented organization that is not in the store.

## Decisions

### Tokens

- Before the checks, the core removes the marker, the list prefix, and every record ID from the line. Refs: REQ-CV-003
- Words match on Unicode boundaries (`\p{L}\p{N}` with the `u` flag), because `\b` in JavaScript is ASCII only. Refs: REQ-CV-003, REQ-CV-007
- The record text for a check is the statement and the printed facets: role, organization, level, scope, tags, the period dates, and the credential dates. Refs: REQ-CV-003

### Years and numbers

- A year is a 4-digit token from 1900 to 2099. A range such as `2021–2023` gives two years. Refs: REQ-CV-003
- A year passes when it falls within the start and end years of a cited period, or the issued and expiry years. An ongoing period has no upper limit. A year also passes when the cited text contains it, for example `ISO 27001` or a product year. Refs: REQ-CV-003
- A number is a digit run with `,` and `_` removed and leading zeros removed. Numbers match as whole tokens, so `4` never matches `40`. Number words from one to twenty and the tens match their digits. Refs: REQ-CV-003
- Known gaps: `5k` does not match `5,000`, and `Q3` and `24/7` give the tokens 3, 24, and 7. These give warnings unless a record has the same tokens. Refs: REQ-CV-003

### Organizations and titles

- Names come from the organization and role facets of accepted public records only. A private name could leak through the warnings otherwise. Refs: REQ-CV-007
- The check matches names case-sensitively, longest first, and removes each match from the line before it looks for the next. So `Arc Labs` does not also match `Arc`, and `Archive` matches neither. Refs: REQ-CV-007
- A name that belongs to a cited record and to an uncited record passes. Refs: REQ-CV-007
- Seniority words are senior, principal, chief, director, and manager. Each one must appear in a cited role or statement. Lead and head are verbs here, so the ownership check handles them. Refs: REQ-CV-007

### Ownership verbs

- Verb families have fixed English forms. The co-lead family matches first and is removed, so `led` inside `co-led` does not match again. Refs: REQ-CV-004
- A line that cites several records uses the highest contribution level among them. Refs: REQ-CV-004
- A verb passes when any form of its family is in a cited statement. For example, "Managed" passes when the statement says "managing". Refs: REQ-CV-004
- When no cited record has a contribution level and the statement does not have the verb family, the check gives a contribution-unknown warning. The owner can add the level or reword the line. Refs: REQ-CV-004
- Known false positives: negation ("did not lead") and passive voice ("led by"). Tests record this behavior. Refs: REQ-CV-004

### Output

- Warnings give the line number, a code, the token from the owner's line, and record IDs. They never give record text. Refs: REQ-CV-003
- Owner lines with `[pk:self]` get no fact checks. The check lists them for review. Refs: REQ-CV-003
- Without `--strict`, warnings exit with code 0. With `--strict`, they exit with code 6. Refs: REQ-CV-004

## Risks / Trade-offs

- Warnings can be wrong for a correct paraphrase. Mitigation: warnings do not block strip without `--strict`, and the fixture guard test keeps the draft free of warnings.
- English word lists miss synonyms. Mitigation: the lists live in one module with tests, so they can grow.

## Plan review

The product manager and the architect gave the rules above when they reviewed the m1-cv-projection plan on 2026-11-07. The owner delegated the approval of this plan while away. The architect reviews the diff before the archive.
