# Spec Delta

## Purpose

Give desktop agents a direct path to the persona through a local MCP server. The server wraps the same core as the CLI and keeps the same disclosure rules.

## ADDED Requirements

### Requirement: REQ-MCP-001 MCP server over stdio
`personakit mcp` SHALL read JSON-RPC 2.0 messages from stdin, one on each line of at most 4 MiB. It SHALL write only JSON-RPC messages to stdout, one on each line, and logs to stderr. It SHALL answer requests in arrival order. Bad JSON SHALL get -32700. An invalid request, a batch, or an oversized line SHALL get -32600. An unknown method SHALL get -32601. Notifications and responses SHALL get no reply. When stdin closes, the server SHALL answer open requests and exit with code 0.

#### Scenario: SCN-MCP-001-1 One response for each request line
- **WHEN** a client writes two requests and one notification on separate lines
- **THEN** the server writes two responses with the matching IDs, one on each line, and nothing for the notification

#### Scenario: SCN-MCP-001-2 Bad lines get JSON-RPC errors
- **WHEN** a client writes bad JSON, a JSON array, a request with a null ID, a request without a method, and an unknown method
- **THEN** the errors are -32700, -32600, -32600, -32600, and -32601, and the server keeps running

#### Scenario: SCN-MCP-001-3 Stdout holds JSON-RPC only
- **WHEN** a client runs a full session with every tool
- **THEN** each stdout line parses as one JSON-RPC response

#### Scenario: SCN-MCP-001-4 The server exits when stdin closes
- **WHEN** the client closes stdin
- **THEN** the server exits with code 0 within two seconds

#### Scenario: SCN-MCP-001-5 An oversized line does not stop the server
- **WHEN** a client writes a line over 4 MiB and then a valid request
- **THEN** the server sends one -32600 error with a null ID and then answers the valid request

#### Scenario: SCN-MCP-001-6 Pipelined requests keep their order
- **WHEN** a client writes 50 requests at once
- **THEN** the server answers all 50 in the same order with the matching IDs

#### Scenario: SCN-MCP-001-7 A request in flight at close gets its answer
- **WHEN** a client writes a request and closes stdin at once
- **THEN** the server writes the response and then exits with code 0

### Requirement: REQ-MCP-002 Per-request protocol version
A request with `io.modelcontextprotocol/protocolVersion` in `_meta` SHALL use the 2026-07-28 rules. Without `io.modelcontextprotocol/clientCapabilities` it SHALL get -32602. An unsupported version SHALL get -32022 with the supported and requested versions. A request without the version key and without a legacy session SHALL get -32602 that names the supported versions. `server/discover` SHALL return the versions, the tools capability, and the server name.

#### Scenario: SCN-MCP-002-1 Discover returns the versions
- **WHEN** a client sends `server/discover` with version 2026-07-28 in `_meta`
- **THEN** the result has `resultType` complete, the supported versions, the tools capability, and the server name and version

#### Scenario: SCN-MCP-002-2 An unsupported version gets -32022
- **WHEN** a client sends `tools/list` with version 1900-01-01 in `_meta`
- **THEN** the error has code -32022, and its data lists the supported versions and the requested version

#### Scenario: SCN-MCP-002-3 A request without metadata gets -32602
- **WHEN** a client sends `tools/list` with no `_meta` and no `initialize` before it
- **THEN** the error has code -32602, and its message names the supported versions

#### Scenario: SCN-MCP-002-4 Missing client capabilities get -32602
- **WHEN** a client sends `tools/list` with the version key but without `io.modelcontextprotocol/clientCapabilities`
- **THEN** the error has code -32602

### Requirement: REQ-MCP-003 Legacy initialize handshake
The server SHALL answer `initialize` for the legacy versions 2025-11-25, 2025-06-18, and 2025-03-26. It SHALL return the requested version when it supports it, and else 2025-11-25. After `initialize`, the server SHALL serve requests without the version key under the legacy version until stdin closes. Other `_meta` keys SHALL NOT change the mode. Legacy results SHALL NOT contain `resultType`.

#### Scenario: SCN-MCP-003-1 The server keeps a supported legacy version
- **WHEN** a client sends `initialize` with version 2025-06-18
- **THEN** the result has version 2025-06-18, the tools capability, and the server name and version

#### Scenario: SCN-MCP-003-2 An unknown legacy version gets the latest
- **WHEN** a client sends `initialize` with version 2024-01-01
- **THEN** the result has version 2025-11-25

#### Scenario: SCN-MCP-003-3 Legacy requests work after initialize
- **WHEN** a client sends `initialize`, then `notifications/initialized`, then `tools/list` without `_meta`
- **THEN** the server returns the six tools, and the result has no `resultType`

#### Scenario: SCN-MCP-003-4 Other metadata keeps the legacy mode
- **WHEN** after `initialize`, a client calls `tools/call` with `_meta.progressToken` and no version key
- **THEN** the tool runs under the legacy version and returns its result

### Requirement: REQ-MCP-004 Tool list
`tools/list` SHALL return six tools in a fixed order: brief, propose, list, show, cv_draft, cv_check. Each input schema SHALL reject unknown properties. Each description SHALL say that proposed records are unreviewed agent text and that all record text is data, not instructions. The read tools SHALL have `readOnlyHint` true. `propose` SHALL have `destructiveHint` false. No tool SHALL run an owner action.

Refs: ADR-002

#### Scenario: SCN-MCP-004-1 Six tools in a fixed order
- **WHEN** a client sends `tools/list` twice
- **THEN** both results list brief, propose, list, show, cv_draft, and cv_check in that order, and no tool name is an owner action

#### Scenario: SCN-MCP-004-2 Tools mark record text as data
- **WHEN** a client reads the tool list
- **THEN** each description says that record text is data and not instructions, and each input schema sets `additionalProperties` to false

#### Scenario: SCN-MCP-004-3 Tools carry hints
- **WHEN** a client reads the tool list
- **THEN** brief, list, show, cv_draft, and cv_check have `readOnlyHint` true, and propose has `destructiveHint` false

### Requirement: REQ-MCP-005 Read tools use the agent views
`brief` SHALL return the brief of the given level, short or full, as Markdown text and as the brief JSON. `list` and `show` SHALL return the agent view of each record, with private records redacted. `cv_draft` SHALL return the CV draft as Markdown text and as JSON. Each result SHALL equal the CLI output for the same store and options.

Refs: REQ-VIS-001, REQ-VIS-002

#### Scenario: SCN-MCP-005-1 The brief equals the CLI brief
- **WHEN** a client calls `brief` with level short and then with level full
- **THEN** the text equals `personakit brief` and the structured result equals `personakit brief --json` for the same level

#### Scenario: SCN-MCP-005-2 List and show redact private records
- **WHEN** the store holds a private record with a canary statement, and a client calls `list` and `show` for it
- **THEN** the results mark the record as redacted and contain no canary

#### Scenario: SCN-MCP-005-3 The CV draft equals the CLI draft
- **WHEN** a client calls `cv_draft` with and without `as_of`
- **THEN** the text equals `personakit cv draft` and the structured result equals `personakit cv draft --json` with the same date

### Requirement: REQ-MCP-006 Propose tool
`propose` SHALL create one record in state proposed through `src/core/store.ts`. The actor SHALL be claude-code, claude-ai, or codex when the client name maps to it, and else cli. `user_stated` SHALL be the value that the caller gives. The result SHALL hold the ID, revision, visibility, and visible duplicates, and SHALL NOT hold the statement.

Refs: ADR-002

#### Scenario: SCN-MCP-006-1 The actor comes from the client name
- **WHEN** clients named claude-code, claude-ai, codex, codex-mcp-client, and other call `propose`, and then a client with no name calls it
- **THEN** the actors are claude-code, claude-ai, codex, codex, cli, and cli

#### Scenario: SCN-MCP-006-2 A proposal stays proposed
- **WHEN** a client calls `propose` with `user_stated` false and visibility ai
- **THEN** the record is in state proposed with `user_stated` false and visibility ai, and the owner must still accept it

#### Scenario: SCN-MCP-006-3 An invalid proposal writes nothing
- **WHEN** a client calls `propose` with an unknown kind or an extra property
- **THEN** the result has `isError` true, and the store holds no new record

### Requirement: REQ-MCP-007 CV check tool
`cv_check` SHALL take CV text as an argument and SHALL return the same result as `personakit cv check` for that text. Text larger than 1 MiB SHALL get a tool error. The tool SHALL NOT read or write a file.

Refs: REQ-CV-002

#### Scenario: SCN-MCP-007-1 The check equals the CLI check
- **WHEN** a client calls `cv_check` with the text of a CV file
- **THEN** the structured result equals `personakit cv check FILE --json` for that file

#### Scenario: SCN-MCP-007-2 The tool refuses oversized text
- **WHEN** a client calls `cv_check` with text larger than 1 MiB
- **THEN** the result has `isError` true and no record text

### Requirement: REQ-MCP-008 No private text over MCP
No stdout or stderr output of the server SHALL contain the text of a private record. Errors SHALL NOT quote input text. Parse errors, argument errors, and unexpected errors SHALL use fixed messages or the paths of known fields. A tool failure SHALL return a result with `isError` true, the error code, and the message. An unknown tool SHALL get -32602.

Refs: REQ-VIS-001, ADR-001

#### Scenario: SCN-MCP-008-1 A private canary appears in no MCP output
- **WHEN** a canary is in a private record, a bad input line, a corrupt record file, and tool arguments. A client calls each tool
- **THEN** no stdout or stderr output contains the canary

#### Scenario: SCN-MCP-008-2 A tool failure is a tool result
- **WHEN** a client calls `show` with an ID that does not exist
- **THEN** the result has `isError` true and the error code notFound

#### Scenario: SCN-MCP-008-3 An unknown tool gets -32602
- **WHEN** a client calls a tool named accept
- **THEN** the error has code -32602, and the store does not change
