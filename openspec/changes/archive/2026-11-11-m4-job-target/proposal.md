# Proposal

## Why

PersonaKit promises a path from an old CV to a CV for one specific job. Today `cv draft` takes no job. It prints every accepted public record in a fixed order. It cannot tell the owner which records fit a job, or which job requirements no record supports. An external agent does all the tailoring. The Codex review of 2026-11-11 named this the largest gap against the CV-led direction. This change is the first change of M4: the job-targeted CV loop.

## What Changes

- A job description (JD) becomes an input to the CV draft. The core splits it into requirements. The JD is untrusted text. The core does not store it.
- A deterministic match links each requirement to accepted public records by shared terms and tags. No model call.
- A match report lists the requirements that records cover, the requirements that no record covers (gaps), and the records that match no requirement. It holds JD text and record IDs, never record text.
- A tailored draft keeps the matched records and the Summary and Career breaks sections. The format stays the same, so `cv check` works without a change.
- New CLI command `personakit cv match --job FILE` and option `cv draft --job FILE`. The MCP tool `cv_draft` takes an optional `job` text.
- The personakit skill tells an agent how to tailor with the report: rewrite with markers, and ask the owner about each gap.
- The roadmap gets an M4 section.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cv-draft`: adds the job input, the match report, and the tailored draft.

## Impact

- New: `src/core/cv-job.ts`, `tests/cv-job.test.ts`, `tests/cv-job-cli.test.ts`, synthetic JD fixtures.
- Changed: `src/app/operations.ts`, `src/cli/main.ts`, `src/mcp/server.ts`, the personakit skill and its copy, `README.md`, `docs/roadmap.md`.
- No change to the record schema or the store. No new dependency.

## Out of scope

- The web UI for the JD flow. A later M4 change adds it.
- Follow-up interview questions from gaps in the web app. A later M4 change adds them. In this change an agent asks them through the skill.
- Acknowledgement of fact warnings before print. A later M4 change adds it.
- Rewriting text with a model. An agent still rewrites.
