# ADR-001 Keep personal data in a store outside any repository

- Status: Accepted by the owner on 2026-11-06

## Context

The owner is the first real user. His records are private. This repository is public. Agents run inside other project repositories, where a careless write could commit personal data.

## Decision

- The store is a folder outside any repository. The default is `~/.personakit/`. The `PERSONAKIT_HOME` variable or the `--store` option overrides it.
- The CLI refuses a store inside the PersonaKit repository, or inside the repository of the current directory. It warns for a store inside any other repository, for example a dotfiles home.
- The store can be its own private git repository for backup and sync. `init` writes `.gitattributes` (LF for JSON) and `.gitignore` (locks and temporary files).
- One file for each record (`records/<ULID>.json`) and one file for each event (`events/<ULID>.json`). Two machines that add records or events do not get a merge conflict.
- The repository holds synthetic fixtures only. Each fixture folder has `SYNTHETIC.md`, and each fixture line has a synthetic marker. `npm run check:privacy` fails when a marker is missing, when `PERSONAKIT_HOME` points inside the repository, or when a store exists inside the repository.

## Change to the private-record rule

The architecture said that a private record never leaves the device. A synced store moves private records to a git remote that the owner chooses. The rule becomes:

- No PersonaKit output for agents, models, or CVs contains a private record.
- The git remote of the store is a trust boundary that the owner chooses and controls.

## Consequences

- Personal data never needs to touch this repository.
- When two machines change the same record, git can merge two histories without a text conflict. `doctor` finds these forks from the event revisions. The owner resolves them by hand in M1.
- A browser-only store is no longer the first storage. The web UI in M2 reads the same store through the core.
