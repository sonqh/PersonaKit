# Proposal

## Why

The owner wants Claude Code, claude.ai, and Codex to update one persona. The previous change defined the record and the store location. This change adds the only code that writes the store, the CLI that agents and the owner run, and the brief that every assistant reads.

## What Changes

- The store core: one file for each record and event, atomic writes, locks, revision checks, duplicate flags, and `doctor`.
- The `personakit` CLI with JSON output and fixed exit codes. Agents propose. Owner commands need confirmation.
- `propose --from` reads JSON Lines, so claude.ai output can enter the store.
- A deterministic AI brief in a short and a full level.
- No agent-facing command prints a private record.

## Capabilities

### New Capabilities

- `record-writes`: safe concurrent writes, the proposal-only state model, no silent overwrite, duplicates, and diagnosis.
- `cli`: commands, output, exit codes, confirmation, and batch proposals.
- `ai-brief`: the deterministic brief and the rule that records are data.
- `disclosure`: no private record in agent output.

### Modified Capabilities

None.

## Impact

- New: `src/core/store.ts`, `src/core/fsutil.ts`, `src/core/brief.ts`, `src/cli/main.ts`, `bin/personakit.mjs`, and tests.
- No new dependencies.
