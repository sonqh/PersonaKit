# Proposal

## Why

Many people keep their CV as a Word file. Today they must copy the text by hand before PersonaKit can propose records from it. The owner decided on 2026-11-07 that DOCX import uses a parser in the repository with no new runtime dependency (ADR-004).

## What Changes

- A DOCX text reader in the core. It reads the ZIP container and `word/document.xml` with Node built-ins, with limits against ZIP bombs and unsafe XML.
- `personakit import docx FILE`. It sends the text through the existing text splitter and creates private proposals that the owner reviews.
- ADR-004 records the owner's four M3 decisions. The roadmap follows it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `onboarding`: adds DOCX import.

## Impact

- New: `src/core/docx.ts`, `tests/docx.test.ts`, `decisions/m3-scope.md`.
- Changed: `src/cli/main.ts`, `docs/roadmap.md`, `README.md`.
- No new dependencies.
