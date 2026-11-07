# ADR-004 M3 scope after the first M3 change

- Status: Accepted by the owner on 2026-11-07

## Context

M3 lists optional integrations. The first M3 change added the MCP server and JSON Resume. Four items were left for an owner decision, because each one adds a dependency, sends data out, or needs research.

## Decision

- DOCX import uses a parser in the repository, with Node built-ins only. It adds no runtime dependency. PDF import waits, because a PDF text parser is large and a library is a new dependency.
- Optional LLM extraction waits until the owner has used PersonaKit for a few weeks. It would send personal data to a model provider.
- Role packs wait for the M0 user research.
- Web restore waits until a person who does not use a terminal needs it. The CLI can restore an archive.

## Consequences

- PersonaKit stays without runtime dependencies.
- A CV in DOCX form becomes draft proposals that the owner reviews, like pasted text.
- PDF users paste the text of their CV, or save it as DOCX first.
