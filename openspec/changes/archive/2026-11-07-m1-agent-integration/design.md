# Design

## Context

The CLI from the previous change works from a shell. Agents need instructions that tell them to propose only and to read the brief as data. The current Codex documentation says that Codex reads `AGENTS.md` and scans `.agents/skills` from the working folder up to the repository root. Claude Code reads `CLAUDE.md` and `.claude/skills`.

## Goals / Non-Goals

**Goals:**

- One source of agent rules for both agents.
- The skill works in any project, not only in this repository.

**Non-Goals:**

- An MCP server or a claude.ai connector.
- Automatic sync of the skill after an update. The owner runs `skill install` again.

## Decisions

- `AGENTS.md` is canonical, and `CLAUDE.md` holds only `@AGENTS.md`. Two copies of the rules would drift. Refs: REQ-AGT-001
- The skill source is `.agents/skills/personakit/SKILL.md`. The copy in `.claude/skills/` must be byte-identical. A symbolic link would break on some systems and in some archive tools. Refs: REQ-AGT-002
- The mirror test covers every skill in `.agents/skills/`. The OpenSpec skills exist only in `.claude/skills/` and stay outside the test. Refs: REQ-AGT-002
- The skill is written in STE Strict mode. Agents follow short, direct steps better. Refs: REQ-AGT-002
- `skill install` copies files instead of linking them. The copy works after the clone moves. Refs: REQ-AGT-003
- The two-agent readiness test lives in the previous change, because it tests the store. This change adds the parts that the agents read. Refs: REQ-AGT-002

## Risks / Trade-offs

- An installed skill can be older than the skill in the repository. Mitigation: the README tells the owner to run `skill install` after an update.
- An agent can ignore the skill rules. Mitigation: owner commands still need confirmation, and private text never appears in agent command output.

## Plan review, 2026-11-06

The product manager asked to decide whether agents may pass `--yes`. Decision: the skill forbids it. The owner accepts through `review` in his own terminal. The product manager also found that `skill install` is needed because the store lives outside the repository. Adopted.

## Plan-stop review, 2026-11-06

The product manager found that no change told claude.ai the line format for `propose --from`. Added `docs/claude-ai.md` with the steps and a prompt. The architect found no issue specific to this change.
