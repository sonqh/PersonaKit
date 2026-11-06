# agent-integration Specification

## Purpose
Give Claude Code and Codex the same instructions and the same PersonaKit skill.

## Requirements

### Requirement: REQ-AGT-001 One instruction file
`AGENTS.md` SHALL be the only instruction file. Codex reads it directly. `CLAUDE.md` SHALL hold only the line `@AGENTS.md`, so Claude Code reads the same rules.

Refs: ADR-002

#### Scenario: SCN-AGT-001-1 CLAUDE.md imports AGENTS.md
- **WHEN** a test reads `CLAUDE.md` from a fresh clone
- **THEN** the file holds only `@AGENTS.md`

### Requirement: REQ-AGT-002 One shared personakit skill
The repository SHALL ship one `personakit` skill in `.agents/skills/` for Codex and an identical copy in `.claude/skills/` for Claude Code. A test SHALL fail when any skill copy differs. The skill SHALL tell agents to propose only, to never pass `--yes`, and to never propose sensitive attributes that the user did not state.

Refs: ADR-002

#### Scenario: SCN-AGT-002-1 The copies are identical
- **WHEN** a test compares each skill in `.agents/skills/` with its copy in `.claude/skills/`
- **THEN** the file lists and the bytes are the same

#### Scenario: SCN-AGT-002-2 The skill holds the safety rules
- **WHEN** a test reads the personakit skill
- **THEN** it has the name and description fields, and the rules about owner commands, `--yes`, and sensitive attributes

### Requirement: REQ-AGT-003 Skill install for every project
`personakit skill install` SHALL copy the skill to `~/.claude/skills/personakit/` and `~/.agents/skills/personakit/`. Both agents can then use the skill in any project, because the store lives outside this repository.

#### Scenario: SCN-AGT-003-1 Install copies the skill for both agents
- **WHEN** the owner runs `personakit skill install` with a temporary home folder
- **THEN** both user skill folders hold a byte-identical copy of the skill
