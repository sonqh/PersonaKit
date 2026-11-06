# Proposal

## Why

The owner uses Claude Code and Codex on one persona. Both agents must find the same rules and the same way to use the CLI from a fresh clone and from any other project.

## What Changes

- `CLAUDE.md` imports `AGENTS.md`. `AGENTS.md` gets the rules for agents that work on the user's persona.
- One `personakit` skill for both agents, with a test that fails when the copies differ.
- `personakit skill install` copies the skill to the user skill folders of both agents.
- Product manager, architect, and engineer roles in `.claude/agents/`.
- A CI workflow that runs the type check, the privacy check, the tests, and the spec-ctx gate.
- The README explains the first-use flow. A guide gives the claude.ai steps and a prompt that outputs valid JSON Lines.

## Capabilities

### New Capabilities

- `agent-integration`: the shared instruction file, the shared skill, and skill install.

### Modified Capabilities

None.

## Impact

- New: `docs/claude-ai.md`, `CLAUDE.md`, `.agents/skills/personakit/`, `.claude/skills/personakit/`, `.claude/agents/`, `.github/workflows/ci.yml`.
- Changed: `AGENTS.md`, `README.md`, `src/cli/main.ts`.
