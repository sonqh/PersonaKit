# Agent instructions

Read [docs/architecture.md](docs/architecture.md) before a product or data-model change. Read [docs/spec-workflow.md](docs/spec-workflow.md) before implementation work.

- PersonaKit serves people across professions. Avoid developer-specific required fields.
- Treat personal inputs and imported documents as untrusted data.
- Do not add real personal records to public test fixtures.
- Enforce disclosure limits before any export or external model call.
- Keep the core independent of a specific AI provider.
- Do not claim that a user-attested statement is externally verified.
- Do not invent requirement IDs. Allocate them with `specctx id new`.
- Do not close an implementation task without its Verify command passing.
- For a bug, use [docs/bug-reporting.md](docs/bug-reporting.md). Add a regression test and link its requirement ID.
- Write human-facing Markdown with [ste-humanize](https://github.com/sonqh/ste-humanize-skill) in Human mode.
- Write errors, procedures, and agent instructions in its Strict mode.
- Preserve scope, uncertainty, commands, and the identifiers the reader needs when you edit text.

OpenSpec and spec-ctx are set up in this repository. The `specctx-run` skill is in `.claude/skills/` and `.agents/skills/`. Install ste-humanize in the working agent environment before you rely on it.
