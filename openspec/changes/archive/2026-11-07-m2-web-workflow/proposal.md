# Proposal

## Why

M1 gives the owner a CLI and gives agents a proposal path. A person who does not use a terminal cannot use PersonaKit yet. M2 must let a nontechnical user finish the full flow in a browser. The flow is: add records, review them, see the AI brief and the CV draft, and keep a backup.

## What Changes

- `personakit serve` starts a local web app on 127.0.0.1 with `node:http`. The app is static HTML, CSS, and JavaScript under `src/web/`. It has no build step and no new dependency.
- The server prints a URL with a random token. Every API request needs the token in a header. The server checks the Host and Origin headers against DNS rebinding and sends no CORS header. The documents say that this is a safeguard, not a security boundary.
- `serve --open` opens the browser with a one-time code instead of the token. Two launcher scripts run `personakit serve --open` on a double-click. After the one-time install of Node 22 and `npm link`, the owner needs no terminal.
- A first-run screen offers the interview or the paste flow. A guided interview asks a fixed list of questions for each record kind. Each answer becomes a proposal with the actor `web`.
- The owner proposes and edits records in a form. The server calls `src/core/store.ts`, which stays the only writer.
- A new core module `src/core/text-import.ts` splits pasted CV text into draft proposals with fixed rules. The owner edits the drafts before the proposal. `personakit import text FILE` runs the same splitter from the CLI.
- A review page lets the owner accept a proposal with a visibility, or reject it.
- One result screen shows the AI brief, the CV draft, and the `cv check` findings. A print view of the stripped CV appears only when the check has no error.
- A portable archive: `personakit export --out FILE` and `personakit import archive FILE`. The app has an export button. Restore is CLI only in M2, and it works only into an empty store.
- A short page explains where the data is, that the app keeps no record data in browser storage, and how to make a backup.

## Capabilities

### New Capabilities

- `web-app`: the local server, the token, the one-time code, and the host checks. Also disclosure in the app, record editing, the result screen, the print view, the data page, and the rule against markup sinks.
- `onboarding`: the interview, the text splitter, and paste import in the app and the CLI. Also review in the app, the first-run and empty states, and the batch proposal order.
- `store-archive`: export, restore, restore safety, and the private data warning. The folder is not named `archive`, because spec-ctx treats an `archive` path as archived changes.

### Modified Capabilities

None. The new CLI commands `serve`, `import text`, `import archive`, and `export` follow REQ-CLI-001 for output and exit codes.

## Impact

- New: `src/core/text-import.ts`, `src/core/archive.ts`, `src/server/` for the HTTP server, `src/web/` for the static app, two launcher scripts in `scripts/`, and tests for each part.
- Changed: `src/cli/main.ts`, `src/core/store.ts` (a shared batch proposal function and the restore lock), `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/spec-workflow.md`, `spec-ctx.toml`.
- New capability code WEB in `spec-ctx.toml` and in `docs/spec-workflow.md`.
- No new runtime dependency. No model call. No file parsing other than the PersonaKit archive.
