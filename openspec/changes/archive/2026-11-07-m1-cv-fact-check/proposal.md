# Proposal

## Why

`cv check` already refuses a final line without a citation. A cited line can still change its record: a wrong year, a larger number, another employer, a higher title, or a bigger role. The architecture asks the CV check to compare dates, names, titles, numbers, and verbs with the cited records. This change adds those checks as warnings. It is the last change of M1.

## What Changes

- Year and number warnings: a year outside the cited periods, and a number or a number word that no cited record contains.
- Organization and title warnings: a name from an uncited public record, and a seniority word that the cited role does not have.
- Ownership warnings: a verb such as led or owned above the contribution level of the cited records.
- `cv check --strict` makes warnings fail with code 6.
- A guard test: the unchanged draft of each synthetic fixture gives no warning.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cv-draft`: adds the fact and wording warnings.

## Impact

- New: `src/core/cv-facts.ts` and `tests/cv-facts.test.ts`.
- Changed: `src/core/cv.ts`, `src/cli/main.ts`, the personakit skill and its copy.
- No new dependencies.
