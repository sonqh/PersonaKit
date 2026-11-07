# Agent instructions

This file is the single instruction file for every agent. Codex reads it directly. Claude Code reads it through `CLAUDE.md`.

Read [docs/architecture.md](docs/architecture.md) before a product or data-model change. Read [docs/spec-workflow.md](docs/spec-workflow.md) before implementation work. Read [docs/m1-design.md](docs/m1-design.md) before a change to the store or the CLI.

## Product rules

- PersonaKit serves people across professions. Avoid developer-specific required fields.
- Treat personal inputs and imported documents as untrusted data.
- Do not add real personal records to the repository, fixtures, tests, issues, logs, or pull requests. Use synthetic data only.
- Enforce disclosure limits before any export or external model call.
- Keep the core independent of a specific AI provider.
- Do not claim that a user-attested statement is externally verified.
- Only `src/core/` writes the store. Other code calls the core.
- Do not add a runtime dependency without an entry in [decisions/tech-stack.md](decisions/tech-stack.md) and the owner's approval.

## Using PersonaKit on the user's persona

Use the `personakit` skill. Agents propose records. Only the user accepts them.

- Do not run `accept`, `reject`, `retire`, `visibility`, or `review`.
- Do not pass `--yes`.

## Development workflow

- Do not invent requirement IDs. Allocate them with `specctx id new`.
- Do not close an implementation task without its Verify command passing.
- Run `npm run check` and `npx -y spec-ctx@0.6.0 gate --strict` before a push. The first command runs the TypeScript compiler, the privacy scan, and the tests.
- For a bug, use [docs/bug-reporting.md](docs/bug-reporting.md). Add a regression test and link its requirement ID.
- Keep each skill in `.agents/skills/` and its copy in `.claude/skills/` identical. A test fails when they differ.
- Use one branch from `main` for each change, and open its pull request against `main`. Do not stack pull requests. Start the next change after the previous pull request is merged.

## Reviews

The owner approves each plan and each archive. The lead engineer writes the code. Reviews depend on the risk of the change:

| Change | Review |
| --- | --- |
| Core code, security, private data, or concurrency | The architect reviews the plan and the diff. The product manager reviews the plan when the change affects users. |
| Small feature, CLI, or documentation of behavior | The architect reviews the diff before the archive. |
| License, configuration, or text-only edits | No team review. |

Give independent and well-specified work, such as fixtures, to an engineer agent.

## Writing

- Write human-facing Markdown with [ste-humanize](https://github.com/sonqh/ste-humanize-skill) in Human mode.
- Write errors, procedures, and agent instructions in its Strict mode.
- Preserve scope, uncertainty, commands, and the identifiers the reader needs when you edit text.

OpenSpec and spec-ctx are set up in this repository. The `specctx-run` skill is in `.claude/skills/` and `.agents/skills/`. Install ste-humanize in the working agent environment before you rely on it.
