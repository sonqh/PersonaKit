# Spec Delta

## Purpose

Keep the personal record store outside this public repository and outside the projects that agents work in.

## ADDED Requirements

### Requirement: REQ-STO-001 Store location
The store SHALL default to `~/.personakit/`. The `PERSONAKIT_HOME` variable SHALL override it. The core SHALL refuse a store inside the PersonaKit repository or inside the repository of the current directory. It SHALL warn for a store inside another repository. A store that is its own git repository SHALL be allowed.

Refs: ADR-001

#### Scenario: SCN-STO-001-1 Default and override
- **WHEN** `PERSONAKIT_HOME` is empty, or holds a path
- **THEN** the store path is `~/.personakit/`, or that path

#### Scenario: SCN-STO-001-2 The check refuses a store in the PersonaKit repository
- **WHEN** the store path is inside the PersonaKit repository
- **THEN** the location check refuses the store

#### Scenario: SCN-STO-001-3 The check refuses a store in the current project
- **WHEN** the store path is inside the git repository of the current directory
- **THEN** the location check refuses the store

#### Scenario: SCN-STO-001-4 A store in another repository gets a warning
- **WHEN** the store path is inside a git repository that does not hold the current directory
- **THEN** the location check accepts the store with a warning

#### Scenario: SCN-STO-001-5 A store can be its own repository
- **WHEN** the store folder holds its own `.git` folder
- **THEN** the location check accepts the store without a warning

### Requirement: REQ-STO-002 Privacy check
`npm run check:privacy` SHALL fail when a fixture folder has no `SYNTHETIC.md` or a fixture line has no synthetic marker. It SHALL also fail when `PERSONAKIT_HOME` points inside the repository, or when a PersonaKit store exists inside the repository.

Refs: ADR-001

#### Scenario: SCN-STO-002-1 A clean repository passes
- **WHEN** the check runs on this repository
- **THEN** it exits with code 0

#### Scenario: SCN-STO-002-2 The configured store is inside the repository
- **WHEN** `PERSONAKIT_HOME` points inside the repository
- **THEN** the check exits with code 1

#### Scenario: SCN-STO-002-3 A fixture is not marked synthetic
- **WHEN** a fixture folder has no `SYNTHETIC.md` and a line without the marker
- **THEN** the check exits with code 1 and names both problems

#### Scenario: SCN-STO-002-4 A store is inside the repository
- **WHEN** a store file exists inside the repository
- **THEN** the check exits with code 1
