# ADR-002 Agents propose, the owner accepts, and the CLI moves into M1

- Status: Accepted by the owner on 2026-11-06

## Context

The owner updates his persona through Claude Code, claude.ai, and Codex. He needs this before the web UI exists. The roadmap put the CLI in M3 and excluded agent write-back from the first web release.

## Decision

- A core library is the only code that writes the store. The `personakit` CLI wraps it. Claude Code and Codex run the same CLI commands and read the same JSON. A later MCP server wraps the same core. M1 has no MCP server.
- An agent write creates a record in state `proposed`. Only an owner command moves a record to `accepted`, `rejected`, or `retired`.
- `accept`, `reject`, `retire`, `visibility`, and `review` ask for confirmation in an interactive terminal. Without a terminal they fail with exit code 4, unless the command has `--yes`. The agent skill tells agents never to pass `--yes`.
- This confirmation step protects against agent mistakes. It is not a security boundary. An agent with shell access can pass `--yes` or read the store files.
- Each write records the actor (`claude-code`, `claude-ai`, `codex`, `cli`, `web`), an optional model and session label, the time, and whether the user stated the fact. These fields are labels, not proof of identity.
- An accepted record never changes in place. A change creates a proposal that supersedes it. A stale revision exits with code 3 and creates a proposal.
- claude.ai cannot run a shell. In M1 it writes proposals as JSON Lines, and the owner imports them with `personakit propose --from <file> --actor claude-ai`. The owner pastes the output of `brief` into claude.ai by hand. That copy goes stale.

## Roadmap change

- The CLI and the proposal-only write path move from M3 to M1.
- "Agent write-back" leaves the exclusions. Automatic acceptance stays excluded.
- The M0 research (concierge test) stays open and does not block M1. The owner runs it. This replaces the M0 exit rule that M1 starts only after the decision rules pass.

## Consequences

- Every agent can add to one persona, and the owner keeps the final decision.
- Proposals wait until the owner reviews them. `doctor` and `review` show the pending count.
