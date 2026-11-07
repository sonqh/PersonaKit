# Proposal

## Why

M1 promises two outputs from one record: an AI brief and a CV draft that never invents a claim. The brief exists. The CV path does not. Agents such as Claude Code and Codex write good CV text, but they can overstate a role or change a date. PersonaKit has no model in the core, so it cannot write the final text itself. It can build a cited starting draft. It can also refuse any final line that does not cite the records behind it.

## What Changes

- `personakit cv draft` builds a deterministic Markdown draft from accepted public records:
  - sections for summary, experience, freelance engagements, education, credentials, career breaks, and capabilities
  - one list line for each record, which ends with a citation marker such as `[pk:01J...]`
  - a hint with the number of accepted ai records when the draft has few public records
- `personakit cv check <file>` accepts a line only when it is blank, a rule, a draft section heading, or cited. `[pk:self]` marks a line that the owner states.
- `personakit cv strip <file>` prints the final text without markers, and refuses a file with check errors.
- Only accepted public records enter a CV, with a fixed list of printed fields. Canary tests cover this.
- The skill and the claude.ai guide get the CV steps and a prompt.
- The architecture says that a job description is optional and comes later.
- `AGENTS.md` gets a branch rule: each change uses one branch from `main`, and pull requests are not stacked.

The next change, `m1-cv-fact-check`, adds the warnings for years, numbers, organizations, titles, and ownership verbs. Requirement IDs REQ-CV-003 and REQ-CV-004 are kept for it.

## Capabilities

### New Capabilities

- `cv-draft`: the cited draft, the line and marker rules, the final text, and input handling.

### Modified Capabilities

- `disclosure`: adds the rule that only public records enter a CV.

## Impact

- New: `src/core/cv.ts`, `tests/cv.test.ts`, `tests/cv-cli.test.ts`.
- Changed: `src/cli/main.ts`, the personakit skill and its copy, `AGENTS.md`, `README.md`, `docs/claude-ai.md`, `docs/architecture.md`.
- No new dependencies. No model calls.
