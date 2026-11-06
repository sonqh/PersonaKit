# Design

## Context

The repository held design documents only. The owner is the first real user, and his data is private. [The M1 design](../../../docs/m1-design.md) describes the whole M1 store, CLI, and agent integration. This change covers the decisions, the schema, the fixtures, and the store location.

## Goals / Non-Goals

**Goals:**

- Record the decisions before any code depends on them.
- A schema that works for any profession and rejects typos.
- Fixtures that tests can use without real personal data.
- A check that fails when personal data could enter this repository.

**Non-Goals:**

- The store operations, the CLI, and the brief. The next change adds them.
- The agent skill and the two-agent test. The third change adds them.
- The CV projection.

## Decisions

- Field names on disk use snake_case, and `contribution` is a facet. The architecture sketch used camelCase and a top-level field. One case on disk keeps the files easy to read for agents and people. Refs: REQ-PER-001
- Sources are inline objects with an optional `ref` and `excerpt`. They serve as evidence in v0. A separate evidence entity can come later without breaking v0. Refs: REQ-PER-002
- The validator is strict on write. Unknown fields fail, except under a namespaced key in `extensions`. A later schema version adds fields by name. Refs: REQ-PER-001
- Text rules reject bidi controls and zero-width characters, because they can hide or reorder text inside an agent brief. Refs: REQ-PER-003
- The location check refuses only the PersonaKit repository and the repository of the current directory. A store inside another repository, such as a dotfiles home, gets a warning. The product manager found that a refusal for every repository was too broad. Refs: REQ-STO-001
- Fixtures are JSON Lines of proposal inputs, not finished store files. Tests build a store from them. The same format is the input of `propose --from`. Refs: REQ-PER-005
- Node 22 runs the TypeScript sources directly. There is no build step. Refs: ADR-003

## Risks / Trade-offs

- A strict validator on an older CLI rejects a record that a newer CLI wrote. Mitigation: the store has a format version, and the next change refuses to write to a newer format.
- The privacy check finds a store by its `store.json` file. A copy of record files without `store.json` would not be found. Mitigation: fixture lines need the synthetic marker, and the store location check stops the CLI from creating a store in the repository.

## Plan review, 2026-11-06

The product manager and the architect reviewed the M1 design before this change. The findings that apply to this change are adopted:

- The product manager asked for at least one required source and for `ref` and `excerpt` on sources. Adopted.
- The product manager found that refusing every enclosing repository was too broad. Adopted: refuse only the PersonaKit repository and the current project.
- The architect asked for NFC statements, sorted set-like arrays, code-point comparison, and rejection of bidi and zero-width characters. Adopted.
- The architect asked to update the architecture in the same change: the rejected state, one naming case, and the new private-record rule. Adopted.
