# M1 design: one store, one write path, two agents

Status: Implemented on branch `feat/m1-proposal-write-path`. The product manager and the architect reviewed it on 2026-11-06. Their findings are at the end. The OpenSpec changes will cite this file.

## Goal

The owner updates one persona through Claude Code, claude.ai, and Codex. Agents can propose records. Only the owner can accept them. Every agent reads the same brief.

## Layout

```text
src/core/   library: the only code that writes the store
src/cli/    the personakit command, a thin wrapper around src/core
bin/        the executable entry point
fixtures/   synthetic personas, one folder for each person
tests/      unit, CLI, and end-to-end tests
decisions/  architecture decision records
```

The core has no runtime dependencies. It uses Node 22 built-ins only. Node 22 runs the TypeScript sources directly, so a fresh clone needs no build step. TypeScript is a development dependency for the type check.

## Store

- Default path: `~/.personakit/`. The `PERSONAKIT_HOME` variable or the `--store` option overrides it.
- The CLI refuses a store inside the PersonaKit repository, or inside the repository of the current directory. It warns for a store inside any other repository. The store can be its own private git repository.
- `records/<ULID>.json`: one file for each record.
- `events/<ULID>.json`: one file for each event. Events are never edited. Two machines that add events do not get a merge conflict. Each state change records `from_revision`, `to_revision`, and the sha256 of the prior file.
- `locks/`: lock files. Git ignores them.
- `store.json`: the store format version.

Every write goes to a temporary file (`.<name>.<pid>.<random>.tmp`), syncs it to disk, and then renames it. A new file is published with a hard link, so it never overwrites an existing file. Readers read only ULID-named files. JSON output has sorted keys, two-space indents, LF line ends, and a final newline.

## Record v0

```json
{
  "schema": "personakit.record/v0",
  "id": "01JC9Z0000000000000000000A",
  "kind": "experience",
  "statement": "Ran the evening support queue for a regional bike-share service.",
  "state": "proposed",
  "visibility": "private",
  "revision": 1,
  "facets": { "type": "job", "organization": "...", "period": { "start": "2021-03", "end": "2023-08" } },
  "sources": [{ "kind": "chat", "label": "career chat" }],
  "provenance": { "actor": "codex", "model": "...", "session": "...", "at": "2026-11-06T14:00:00.000Z", "user_stated": true },
  "supersedes": [],
  "possible_duplicate_of": []
}
```

- `kind`: identity, experience, capability, preference, or intent. These are the five groups from the architecture.
- `facets`: optional structured fields for any profession: type, organization, role, period, expiry date, contribution level, and tags. No field is specific to developers.
- `extensions`: a namespaced object for later fields. The validator rejects other unknown keys, so typos do not pass silently.
- States: `proposed`, `accepted`, `rejected`, `retired`. A rejected record stays in the store for the audit trail.

## Write rules

| Action | Who | Effect |
| --- | --- | --- |
| `propose` | Agent or owner | New record in state `proposed`. Visibility defaults to `private`. The proposer can suggest `ai` or `public`. `--from` reads JSON Lines. |
| `update` | Agent or owner | A proposed record with the same revision changes in place. An accepted record never changes. The command creates a new proposal that supersedes it. A stale revision exits with code 3 and creates a proposal. |
| `accept` | Owner | `proposed` to `accepted`. `--visibility` sets the final visibility. Accepted records it supersedes become `retired`. Proposals it supersedes become `rejected`. |
| `reject` | Owner | `proposed` to `rejected`. |
| `retire` | Owner | `accepted` to `retired`. |
| `visibility` | Owner | Changes the visibility of a proposed or accepted record. The statement does not change. |
| `review` | Owner | An interactive queue. It shows each proposal with its source, provenance, duplicates, and the record it replaces. The owner can accept a proposal as ai, public, or private. The owner can also reject it, skip it, or stop. |

`accept`, `reject`, and `retire` ask for confirmation in an interactive terminal. Without a terminal they fail with code 4, unless the command has `--yes`. This step protects against agent mistakes. It is not a security boundary: an agent that can run a shell can also pass `--yes`.

Every change to an existing record file takes a lock (exclusive create in `locks/`). `accept` locks the record and every record it supersedes, in sorted order, so two processes cannot deadlock. A lock from a dead process on the same host, or a lock older than 10 minutes, is stale and is removed. A new proposal needs no lock because it is a new file. Owner commands can pass `--revision`, the revision the owner reviewed. `review` always passes it.

The event is the commit point. The core writes the event first, then the record. If a process stops between the two writes, `doctor` reports the gap.

## Duplicates

The core normalizes the statement: Unicode NFKC, lower case, punctuation removed, white space collapsed. When a record of the same kind has the same normalized statement, the proposal gets `possible_duplicate_of`. The core never merges records. The command output lists only duplicates with visibility `ai` or `public`, so an agent cannot probe for private records. It also says when the owner rejected the same statement before. Owner review shows all matches.

## Read rules

- `brief` compiles the AI brief from accepted records with visibility `ai` or `public`. The output is the same bytes for the same store.
- `brief --level short` holds identity, preferences, and goals. `--level full` holds all five kinds.
- The brief puts each record as one JSON line inside a fenced block. The fence is longer than any backtick run in the content. A notice before and after the block says that the text is user data, not instructions. The brief lists the IDs and revisions it used and a digest. It holds no time, path, or host name. Extensions never enter the brief.
- `brief`, `list`, `show`, `propose`, `update`, and `doctor` never print the text of a private record, with or without a terminal. `list` and `show` print a private record as `redacted`. Only the interactive `review` shows private text.
- The store files are readable by any program that runs as the owner. The property is "no CLI output path prints a private record", not "agents cannot read files".

## Output and exit codes

Commands print readable text by default and JSON with `--json`. The skill always passes `--json`. Errors with `--json` print `{"error": {"code", "exit_code", "message", "details"}}` to stdout. `brief` prints Markdown unless it has `--json`.

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unexpected error |
| 2 | Usage error |
| 3 | Revision conflict. The command created a proposal instead. |
| 4 | Confirmation required |
| 5 | Record not found |
| 6 | Invalid record or invalid state change |
| 7 | Unsafe store path |

## Agent integration

- `AGENTS.md` is the single instruction file. `CLAUDE.md` holds only `@AGENTS.md`.
- One `personakit` skill exists in `.agents/skills/` for Codex and in `.claude/skills/` for Claude Code. A test fails when the copies differ.
- `personakit skill install` copies the skill to the user skill folders, so the agents can use it in any project.

## claude.ai

claude.ai cannot run a shell, and M1 has no MCP server. claude.ai writes proposals as JSON Lines. The owner saves them to a file and runs `personakit propose --from <file> --actor claude-ai`. To read, the owner pastes the output of `brief` into a claude.ai project. That copy goes stale when records change.

## Requirements and tests

| Handoff property | Mechanism | Test |
| --- | --- | --- |
| Data outside the repo | Location check, `check:privacy` | `location.test.ts`, `check-privacy.test.ts` |
| One write path | `src/core/store.ts`. The CLI calls it. | All CLI tests |
| Agents propose, the owner accepts | States, confirmation, exit code 4 | `store.test.ts`, `cli.test.ts` |
| Provenance on every write | `provenance`, events | `store.test.ts` |
| Safe concurrent writes | One file per record, atomic writes, locks, canonical JSON | `two-agents.e2e.test.ts`, `store.test.ts` |
| No silent overwrite | `supersedes`, exit code 3 | `store.test.ts`, `cli.test.ts` |
| Duplicates flagged | Normalized statement match | `store.test.ts` |
| One read path, no private output | `brief`, `agentView` | `privacy.test.ts` (also under a pseudo-terminal), `fixtures.test.ts` |
| Records are data | Fenced JSON lines, notices, control-character rules | `brief.test.ts`, `schema.test.ts` |
| Same instructions for both agents | `CLAUDE.md`, mirrored skill | `agents.test.ts` |

## Later in M1

- CV projection that keeps cited record IDs, and its grounding checks.
- Disclosure tests for the CV path.
- A `resolve` command for forked histories. M1 detects them in `doctor`.
- An idempotency key for agent retries, so a retried `propose` does not create a duplicate.
- `migrate` for a later schema version.

## Out of scope for M1

Web UI, MCP server, model calls in the core, embeddings, accounts, cloud sync, CV file parsing, and automatic acceptance.

## Review findings, 2026-11-06

The product manager and the architect reviewed the first version of this design.

Adopted:

- claude.ai had no path to write or read. Added `propose --from` and the manual brief step.
- Private proposals made the brief empty after accept. Added `accept --visibility`, the `visibility` command, and visibility choices in `review`.
- The review loop was not designed. Added the `review` queue and the pending count in `doctor`.
- The terminal check for private records was not sound, because an agent can run a command in a pseudo-terminal. Agent commands now never print private text. The canary test also runs under a pseudo-terminal.
- Duplicate references leaked private record IDs. Output now lists only visible duplicates.
- The lock did not cover `update` or the records that `accept` changes. All changes to existing files now take locks, in sorted order.
- Git merges can fork the state of a record. Events now carry the revision chain, and `doctor` reports forks, unapplied events, conflict markers, and supersede errors.
- Temporary files, fsync, stale locks, fence escaping, bidi characters, NFC, sorted arrays, and git settings for the store.
- The refusal of every enclosing repository was too broad. It now refuses only the PersonaKit repository and the current project.
- `propose` echoed the statement in readable mode. Removed, because no CLI output may print private text.

Deferred, with a reason:

- Events as the full source of truth with replay and `resolve`. M1 detects the problem. Repair needs an owner decision on the UX.
- An idempotency key for agent retries. Duplicate detection flags a retried proposal for now.
