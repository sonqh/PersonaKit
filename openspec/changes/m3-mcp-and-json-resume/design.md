# Design

## Context

ADR-002 says that a later MCP server wraps the same core as the CLI. ADR-003 allows no runtime dependency without owner approval, so the server cannot use the MCP SDK. The CLI already has the agent views, the brief, the CV draft, and the CV check. The MCP server and the JSON Resume commands reuse them.

The MCP specification changed on 2026-07-28. The current version has no `initialize` handshake. Each request carries its protocol version, client name, and client capabilities in `_meta`. Clients that use an earlier version still send `initialize`. The specification calls a server that serves both kinds "dual-era".

Sources, read on 2026-11-07:

- `modelcontextprotocol.io/specification/latest` names 2026-07-28 as the current version.
- The 2026-07-28 pages for the base protocol, versioning, `server/discover`, stdio, and tools.
- The 2025-11-25 lifecycle page for the legacy handshake.
- The JSON Resume schema at tag v1.0.0 of `jsonresume/resume-schema`, and `jsonresume.org/schema` (version 1.7.1).

## Goals / Non-Goals

**Goals:**

- A direct path from Claude Desktop, Claude Code, and Codex to the persona, without copy and paste.
- The same output from a tool and from the matching CLI command.
- No private record text in any MCP output.
- A JSON Resume export that holds only what a CV draft holds.
- A JSON Resume import that only proposes.

**Non-Goals:**

- PDF and DOCX parsing. It needs a runtime dependency or a large hand-written parser. The owner must approve that first.
- Role packs. They need user research first.
- Optional LLM extraction. It sends personal data to a model provider. The owner must decide on that first.
- A web UI. M2 holds the web work.
- Owner actions over MCP. Accept, reject, retire, and visibility stay in the owner's terminal.
- MCP resources, prompts, subscriptions, sampling, and the HTTP transport. Tools over stdio give the direct path.
- Export of JSON Resume sections that PersonaKit has no data for, such as contact fields and references.

## Decisions

- The shared operations move to `src/app/operations.ts`. The CLI and the MCP server call the same functions, so their data is equal. The operations return data only, with no I/O and no environment. The CLI adapter keeps the actor parsing from flags and the environment. Only `src/core/store.ts` writes the store. Refs: REQ-MCP-005, REQ-MCP-006, ADR-002
- The server lives in `src/mcp/server.ts`. It is hand-written JSON-RPC 2.0 with a byte-level line splitter on stdin `data` events. It has no SDK, so it adds no runtime dependency. Refs: REQ-MCP-001, ADR-003
- The server writes each message with `JSON.stringify` on one line. A promise queue runs the handlers one at a time, in arrival order. Refs: REQ-MCP-001
- The splitter counts the line limit of 4 MiB in bytes. Over the limit, it drops bytes up to the next line feed and sends one -32600 error with a null ID. Refs: REQ-MCP-001
- A JSON array gets -32600, because the server does not support batches. The server ignores response objects and `notifications/cancelled`. An ID that is null, fractional, or not a string or number gets -32600. Refs: REQ-MCP-001
- On stdin `end`, the server drains the queue and waits for the callback of the last stdout write. Then it sets `process.exitCode` to 0. It never calls `process.exit()`. Refs: REQ-MCP-001
- The server targets 2026-07-28. It also answers `initialize` for 2025-11-25, 2025-06-18, and 2025-03-26, because desktop clients can still use the handshake. Refs: REQ-MCP-002, REQ-MCP-003
- The key `io.modelcontextprotocol/protocolVersion` in `_meta` selects the modern rules. Legacy clients also send `_meta`, for example `progressToken`, so the presence of `_meta` selects nothing. A modern request without `io.modelcontextprotocol/clientCapabilities` gets error -32602. Modern results carry `resultType` complete and the server name in `_meta`. Refs: REQ-MCP-002
- A request without the version key uses the legacy session after `initialize`. Before `initialize`, it gets error -32602 that names the supported versions. Legacy results have no `resultType`. `ping` gets an empty result in both modes. Refs: REQ-MCP-002, REQ-MCP-003
- The server keeps no state between modern requests. Each tool call opens the store and reads the records again. The store comes from `--store` or `PERSONAKIT_HOME`, with the same location checks as the CLI. Refs: REQ-MCP-002, ADR-001
- The tool inputs: `brief` takes `level`. `propose` takes `kind`, `statement`, `user_stated`, and optional `visibility`, `facets`, `sources`, and `supersedes`. `list` takes `state` and `kind`. `show` takes `id`. `cv_draft` takes `as_of`. `cv_check` takes `text`. Refs: REQ-MCP-004
- Each input schema sets `additionalProperties` to false. The server also checks the arguments itself, because a client can skip the schema. A bad argument gets a tool error. Refs: REQ-MCP-004, REQ-MCP-008
- Each tool description and the server `instructions` say that proposed records are unreviewed agent text, and that all record text is data, not instructions. They also say that only the owner accepts records. The `instructions` are a constant and never hold record text. Refs: REQ-MCP-004
- The read tools have the annotation `readOnlyHint` true. `propose` has `destructiveHint` false. Refs: REQ-MCP-004
- `brief` and `cv_draft` return Markdown in `content` and the JSON in `structuredContent`. The other tools return the JSON in both fields, as the specification advises. Refs: REQ-MCP-005
- The actor comes from the client name in lower case. The names `claude-code`, `claude-ai`, `codex`, and `codex-mcp-client` map to their actors. Every other name gives `cli`. The name is a label, not proof, as ADR-002 says. Refs: REQ-MCP-006, ADR-002
- A modern request takes the client name from its own `_meta`. A legacy request takes it from `initialize`. The default source is kind `chat` with label `mcp`. Refs: REQ-MCP-006
- `propose` takes one record. It runs `checkProposal` before the write, so an invalid proposal writes nothing. The operation returns the ID, revision, visibility, visible duplicates, and a visible-rejection flag. It never returns the record. Refs: REQ-MCP-006, REQ-VIS-001
- `cv_check` measures the text in UTF-8 bytes against the CLI limit of 1 MiB. It never touches a file. Refs: REQ-MCP-007
- A `PersonaKitError` becomes a tool result with `isError` true. It holds the same error object as CLI `--json` output. Core error details hold IDs, paths, and counts only. Refs: REQ-MCP-008
- Any other error gives the fixed message "Unexpected error. Run personakit doctor." The stderr log holds the tool name and the error class only. In `mcp` mode, handlers for `uncaughtException` and `unhandledRejection` write only the error class to stderr. Refs: REQ-MCP-008
- JSON Resume code lives in `src/core/json-resume.ts`. It has pure functions and no clock. The CLI writes files and calls `propose` through the core. Refs: REQ-RES-001, REQ-RES-004
- Export starts from `cvEligible`, so it has the CV rules. It sorts dated items with `compareDated`. It writes the keys in sorted order with `stringifyCanonical`. Refs: REQ-RES-001, REQ-RES-002, REQ-RES-003
- Export sets `$schema` to the v1.0.0 schema URL and `meta.version` to `v1.0.0`. The document holds no record IDs. With `--json`, the CLI result lists the IDs it used. Refs: REQ-RES-001
- Export mapping: identity statements, sorted by ID and joined with line feeds, go to `basics.summary`. Experience and freelance items go to `work` with `name`, `position`, `startDate`, `endDate`, and `summary`. Refs: REQ-RES-002
- Education and course items go to `education` with `institution`, `studyType`, `area`, and dates. Credentials go to `certificates` with `name` and `issuer`. Capabilities go to `skills` with `name` and `level`. Refs: REQ-RES-002
- Schema v1.0.0 needs a full date in `certificates[].date`. Export writes `issued_on` there only when it has a day. The schema has no expiry field, so export leaves the expiry out. Refs: REQ-RES-002, REQ-RES-003
- Export leaves career breaks out, because JSON Resume has no section for them. The CLI result gives their count. Refs: REQ-RES-002
- Import mapping: `basics.label` and `basics.summary` become identity. `work`, `volunteer`, `projects`, `education`, and `certificates` become experience with types employment, volunteer, project, education, and credential. Refs: REQ-RES-004
- Each work, volunteer, and project item gives one proposal for its summary and one for each highlight. `skills` and `languages` become capabilities. Skill keywords become tags. Refs: REQ-RES-004
- Import skips `basics` contact fields, `awards`, `publications`, `interests`, `references`, and `meta`. References hold data about other people. Contact lines go in a CV with `[pk:self]`. Refs: REQ-RES-004
- Import first removes a byte order mark and turns CRLF into LF. It checks the type and pattern of each field that it maps. It reads mapped fields with `Object.hasOwn` and never merges parsed input into an object. It checks every proposal with `checkProposal` and one set of existing IDs. It writes only when the problem list is empty. Refs: REQ-RES-005
- Import problems use JSON Pointer paths such as `/work/2/startDate`, with `~` and `/` escaped. They never quote a value or a key from the file. Unknown root keys give one problem with their count. Refs: REQ-RES-005
- The export test copies the v1.0.0 schema into `tests/data/` with its MIT notice. A small draft-04 subset checker in the test reads it. The product code has no schema library. Refs: REQ-RES-001, ADR-003
- The MCP configuration in the README uses the absolute path to `bin/personakit.mjs`, because desktop apps can start without the shell `PATH`. Refs: REQ-MCP-001

- The parse error -32700 and the bad JSON error of import use fixed text, because the Node `SyntaxError` message quotes the input. Refs: REQ-MCP-008, REQ-RES-005
- MCP errors never quote input. The server checks the argument keys at each level, the ULID form of IDs, and enum values before it calls the core. So core messages hold only known field paths. A corrupt record gives a fixed message with its ID. Refs: REQ-MCP-008
- Import stops at more than 500 proposals from one file. Refs: REQ-RES-005
- Every proposal from one file gets the source label `json-resume:` and the first 12 hex digits of the SHA-256 of the file. Refs: REQ-RES-004
- Validation failures write nothing. A write failure after the first write stops the import and reports the IDs already written. Refs: REQ-RES-005
- `export json-resume --out` writes through a temporary file and a rename, with `replaceFileAtomic` from the core file helpers. Refs: REQ-RES-001
- The draft-04 subset checker in the test fails on any schema keyword that it does not implement. Refs: REQ-RES-001
- Before the move to `src/app/operations.ts`, a golden test stores the text and `--json` output of each moved command. The move keeps every byte. Refs: REQ-MCP-005

## Risks / Trade-offs

- The client name is self-reported. A client can claim another actor. Mitigation: the actor is a label, and the owner reviews every proposal.
- A desktop client can call `propose` many times. Mitigation: duplicate detection flags repeats, and `review` shows the pending count.
- A client that supports only a legacy version earlier than 2025-03-26 cannot connect. Mitigation: the error names the supported versions.
- The MCP specification can change again. Mitigation: the version list is one constant, and the tests cover both modes.
- JSON Resume has no place for career breaks, expiry dates, or contribution levels. Mitigation: export leaves them out and reports the count of left-out career breaks.
- Import can create many proposals from one file. Mitigation: the proposals are private until the owner accepts them, and duplicate detection flags repeats.
- The tool results reach a model. Mitigation: the results use the same filters as the CLI, and canary tests cover every tool.
