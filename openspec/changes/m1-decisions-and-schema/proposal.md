# Proposal

## Why

On 2026-11-06 the owner decided to update his own persona through Claude Code, claude.ai, and Codex before the web UI exists. This needs a store outside the public repository and a record schema that both agents write. The roadmap had the CLI in M3 and excluded agent write-back. The decisions and the schema come first, because the store and the CLI depend on them.

## What Changes

- Three decision records: the store outside any repository (ADR-001), proposal-only agent writes with the roadmap change (ADR-002), and the tech stack (ADR-003).
- The roadmap and the architecture follow these decisions. The CLI moves into M1. The private-record rule now names the git remote of the store as a trust boundary that the owner chooses.
- Record schema v0 with a validator, canonical JSON, and ULIDs. No runtime dependencies.
- Synthetic fixtures for four people from different professions.
- The store location check and a privacy check that fails on unmarked fixtures or a store inside the repository.
- New capability codes STO, CLI, and AGT. The gate also lints the decision records, the agent roles, and the personakit skill.

## Capabilities

### New Capabilities

- `persona-records`: the record schema, sources and provenance, text rules, serialization, and synthetic fixtures.
- `record-store`: where the store lives and the check that keeps personal data out of this repository.

### Modified Capabilities

None.

## Impact

- New: `src/core/`, `scripts/check-privacy.ts`, `fixtures/`, `tests/`, `decisions/`.
- New development dependencies: `typescript` and `@types/node`. No runtime dependencies.
- Changed: `docs/roadmap.md`, `docs/architecture.md`, `docs/spec-workflow.md`, `spec-ctx.toml`.
