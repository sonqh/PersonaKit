# Proposal

## Why

Claude Desktop, Claude Code, and Codex can call local tools through the Model Context Protocol (MCP). Today the owner moves the brief and the proposals between these apps and PersonaKit by copy and paste. A local MCP server gives the apps a direct path to the same core, with the same rules: agents propose, and only the owner accepts.

Many CV tools read and write JSON Resume. A JSON Resume export lets the owner use public records in those tools. An import lets the owner start from an existing JSON Resume file without typing each fact again.

## What Changes

- `personakit mcp` starts an MCP server over stdio. It has no SDK and no new dependency.
  - It serves protocol version 2026-07-28 with the version in each request.
  - It also answers the legacy `initialize` handshake for 2025-11-25, 2025-06-18, and 2025-03-26.
  - Tools: `brief`, `propose`, `list`, `show`, `cv_draft`, and `cv_check`. No tool runs an owner action.
  - Tool results use the agent views. No result, error, or log line holds private record text.
- `personakit export json-resume [--out FILE]` builds a JSON Resume 1.0.0 document from accepted public records. It uses the same rules as the CV draft.
- `personakit import json-resume FILE` turns a JSON Resume file into proposals. The import is all or nothing. It never accepts a record.
- A shared application module holds the operations that the CLI and the MCP server both call. So both paths give the same output.
- The README and `docs/claude-ai.md` get the MCP configuration for Claude Desktop, Claude Code, and Codex.
- `spec-ctx.toml` and `docs/spec-workflow.md` register the capability codes MCP and RES.

## Capabilities

### New Capabilities

- `mcp-server`: the stdio transport, the protocol version rules, the tool list, the tools, and the disclosure rules for MCP output.
- `json-resume`: the export, its field mapping and disclosure rules, and the import as proposals.

### Modified Capabilities

None. The existing disclosure requirements stay as they are. The MCP and RES requirements cite them.

## Impact

- New: `src/app/operations.ts`, `src/mcp/server.ts`, `src/core/json-resume.ts`, and tests for each.
- Changed: `src/cli/main.ts`, the personakit skill and its copy, `README.md`, `docs/claude-ai.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/spec-workflow.md`, and `spec-ctx.toml`.
- No new runtime dependency. No model calls. No network access.
