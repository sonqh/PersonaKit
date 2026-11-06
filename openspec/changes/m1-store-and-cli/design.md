# Design

## Context

[The M1 design](../../../docs/m1-design.md) holds the full design and the review findings. This change implements its store, CLI, and brief sections. The previous change holds the schema and the store location.

## Goals / Non-Goals

**Goals:**

- Two agents can write to one store at the same time without lost writes.
- The owner keeps the final decision on every record.
- Every assistant gets the same brief, and no private record.

**Non-Goals:**

- The agent skill, `CLAUDE.md`, and `skill install`. The next change adds them.
- The CV projection, an MCP server, and the web UI.
- A `resolve` command for forked histories. `doctor` reports them.

## Decisions

- A new proposal is a new file, so it needs no lock. Every change to an existing record file takes a lock in `locks/`. Accept locks the record and every record it supersedes in sorted order, so two processes cannot deadlock. Refs: REQ-STO-005
- The event is the commit point. The core writes the event first, then the record. `doctor` reports an event that has no matching record revision. Refs: REQ-STO-003, REQ-STO-007
- Each state-change event holds `from_revision`, `to_revision`, and the sha256 of the prior file. `doctor` finds a fork when two events start from the same revision. Nothing orders events by time, because clocks on two machines can differ. Refs: REQ-STO-007
- New files are published with a hard link from a synced temporary file. The link fails when the target exists, so a ULID collision can never overwrite a record. Refs: REQ-STO-003
- Proposals default to private. Accept sets the final visibility, and `review` offers ai, public, or private. The product manager found that the brief stayed empty without this. Refs: REQ-STO-004
- Agent commands never print private text, with or without a terminal. The architect found that a pseudo-terminal defeats a terminal check. Refs: REQ-VIS-001
- Command output lists only visible duplicates, so an agent cannot probe for private records. Refs: REQ-STO-006
- Output is readable text by default and JSON with `--json`. The skill always passes `--json`. Refs: REQ-CLI-001
- The confirmation step is a safeguard against agent mistakes, not a security boundary. The docs say so. Refs: REQ-CLI-002
- The brief puts records as JSON lines in a fence that is longer than any backtick run, between two data notices. Refs: REQ-AIP-002

- Before every push the team runs two checks: `npm run check` (type check, privacy check, tests) and `spec-ctx gate --strict`. The handoff calls both together the gate. CI runs both. Refs: REQ-STO-003
- Every event holds the sha256 of the file after the change. `doctor` counts an event as applied only when its result is the current file or the input of a later event. So an interrupted write shows as an orphan, not as a fork. Refs: REQ-STO-007
- A stale lock is taken over with an atomic rename. The process then checks that it renamed the lock it judged stale, and puts a newer lock back. Refs: REQ-STO-005

## Risks / Trade-offs

- An agent in a pseudo-terminal can open `review` and see private text. Mitigation: the skill forbids `review`, and the docs say that this is not a security boundary.
- `doctor` detects a fork after a git merge but does not repair it. Mitigation: the owner retires the unwanted record. A `resolve` command is planned later in M1.
- A retried agent command can create a second proposal. Mitigation: the duplicate flag marks it for the owner.

## Plan review, 2026-11-06

The product manager and the architect reviewed the M1 design before this change. Adopted for this change:

- The product manager: the claude.ai path through `propose --from`, accept with visibility, the `review` queue, readable output by default, and a pending count in `doctor`.
- The architect: locks on every change to an existing file, in sorted order. Owner commands take a reviewed revision. Events hold a revision chain, and `doctor` finds forks.
- The architect: stale lock rules, synced temporary files with exclusive publish, and git settings for the store.
- The architect: no private output under a pseudo-terminal, hidden private duplicates, and fence escaping.

Deferred: event replay with a `resolve` command, and an idempotency key for agent retries.

## Plan-stop review, 2026-11-06

The product manager and the architect reviewed this change plan.

Fixed:

- Blocker (architect): `update --visibility ai` let an agent make a private record readable through `show`. `update` now refuses to raise visibility. SCN-VIS-001-4 tests it.
- The canary test now runs every command except `review`, with owner commands, `init`, and error paths. The pseudo-terminal test checks that its harness works, and runs on Linux only.
- `review --yes` without a terminal exits with code 4. SCN-VIS-001-5 tests it.
- Two processes could both remove one stale lock. The takeover now uses an atomic rename and a check.
- A crash after the event write looked like a fork. Events now hold `next_sha256`, and `doctor --fix` moves orphan events.
- Accept refuses a second successor of one record.
- New scenarios for concurrent updates, lock rules, `doctor --fix`, `init`, `reject`, the session label, and an all-or-nothing batch.
- `LC_ALL` in the locale test, JSON errors for unknown options, and the exact sort order in REQ-AIP-001.

Deferred: a `doctor` test for more than one successor. Accept now prevents that case on one machine. It can still happen after a git merge, and `doctor` reports it.
