# Tasks

## 1. Shared operations

- [x] 1.1 Move the brief, list, show, propose, CV draft, and CV check operations to `src/app/operations.ts`, and keep the golden outputs [REQ-MCP-005] Verify: `npm run check`

## 2. MCP server

- [x] 2.1 Add the stdio line reader, JSON-RPC framing, and exit on stdin close, and add the `personakit mcp` command [REQ-MCP-001] Verify: `npm run typecheck && node --test tests/mcp.test.ts`
- [x] 2.2 Add the per-request version rules and `server/discover` [REQ-MCP-002] Verify: `npm run typecheck && node --test tests/mcp.test.ts`
- [x] 2.3 Add the legacy `initialize` handshake [REQ-MCP-003] Verify: `npm run typecheck && node --test tests/mcp.test.ts`
- [x] 2.4 Add the tool list with input schemas and data notices [REQ-MCP-004] Verify: `npm run typecheck && node --test tests/mcp.test.ts`
- [x] 2.5 Add the `brief`, `list`, `show`, and `cv_draft` tools [REQ-MCP-005] Verify: `npm run typecheck && node --test tests/mcp-tools.test.ts`
- [x] 2.6 Add the `propose` tool with the actor map [REQ-MCP-006] Verify: `npm run typecheck && node --test tests/mcp-tools.test.ts`
- [x] 2.7 Add the `cv_check` tool with the size limit [REQ-MCP-007] Verify: `npm run typecheck && node --test tests/mcp-tools.test.ts`
- [x] 2.8 Add tool errors and the MCP canary tests [REQ-MCP-008] Verify: `npm run typecheck && node --test tests/mcp-privacy.test.ts`

## 3. JSON Resume

- [x] 3.1 Add the export builder with the mapping and the sort order [REQ-RES-002] Verify: `npm run typecheck && node --test tests/json-resume.test.ts`
- [x] 3.2 Add the export disclosure tests with canaries [REQ-RES-003] Verify: `npm run typecheck && node --test tests/json-resume.test.ts`
- [x] 3.3 Add `export json-resume` to the CLI, with the schema copy and the fixture tests [REQ-RES-001] Verify: `npm run typecheck && node --test tests/json-resume-cli.test.ts`
- [x] 3.4 Add the import mapping to proposals [REQ-RES-004] Verify: `npm run typecheck && node --test tests/json-resume.test.ts`
- [x] 3.5 Add the import checks with JSON Pointer paths [REQ-RES-005] Verify: `npm run typecheck && node --test tests/json-resume.test.ts`
- [x] 3.6 Add `import json-resume` to the CLI with the all-or-nothing write [REQ-RES-004] [REQ-RES-005] Verify: `npm run typecheck && node --test tests/json-resume-cli.test.ts`

## 4. Documents

- [x] 4.1 Add the MCP configuration for Claude Desktop, Claude Code, and Codex to the README and the claude.ai guide [REQ-MCP-001] [REQ-MCP-004] Verify: `npm run typecheck && node --test tests/mcp-docs.test.ts`
- [x] 4.2 Add the MCP tools and the JSON Resume commands to the skill, the architecture, and the roadmap [REQ-MCP-004] [REQ-RES-004] Verify: `npm run typecheck && node --test tests/agents.test.ts`
