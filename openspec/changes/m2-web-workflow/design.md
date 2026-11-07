# Design

## Context

M1 has one writer, `src/core/store.ts`, and a CLI that wraps it. ADR-003 allows no runtime dependency, and Node runs the TypeScript sources with no build step. The browser cannot run TypeScript, so the web app must be plain JavaScript. The store stays in `~/.personakit/` as ADR-001 says. The web app reads and writes it through the core, like the CLI.

The owner is the only user of a running server. Other web pages in the same browser are the main threat. They can send requests to 127.0.0.1, and DNS rebinding can make a foreign host name point at 127.0.0.1. Programs that run as the owner are not in scope. They can read the store files already.

## Goals / Non-Goals

**Goals:**

- A nontechnical user finishes the flow in the browser: interview or paste, review, result, and backup.
- After the one-time install, the owner starts the app with a double-click.
- No web page except the PersonaKit app can read or change the store through the server.
- The same store gives the same brief, CV draft, and archive bytes in the CLI and in the app.

**Non-Goals:**

- Accounts, sign-in, multiple users, or remote access. The server binds 127.0.0.1 only.
- Cloud sync or hosted storage.
- OCR, PDF or DOCX parsing, or any file parsing other than the PersonaKit archive.
- Model calls or LLM extraction. The splitter uses fixed rules.
- A build step, a front-end framework, or a new runtime dependency.
- Retire, the visibility command, and doctor in the app. The CLI keeps them in M2.
- Web restore moves to M3. M2 restores with the CLI only.
- Merge of an archive into a store with data, and migration of older archive formats.
- An installer for Node. The owner installs Node 22 and runs `npm link` once.

## Decisions

- Layout: `src/server/` holds the HTTP server and the routes. `src/web/` holds `index.html`, `app.css`, `app.js`, `logic.js`, and `questions.json`. The server sends a fixed list of static paths only. It never maps a URL to a file path. Refs: REQ-WEB-001, ADR-003
- `serve` binds 127.0.0.1, not `localhost`, so a resolver cannot pick another address. The default port is 0, and the system picks a free port. `--port` sets a fixed port. Refs: REQ-WEB-001
- `serve` runs `initStore` when the store is missing. A new user then needs one command only. The location rules of `init` apply. Refs: REQ-WEB-001, REQ-STO-001
- Token: 32 random bytes from `node:crypto`, in base64url. Without `--open`, the printed URL is `http://127.0.0.1:<port>/#token=<token>`. The browser never sends a fragment in a request or a Referer header. Refs: REQ-WEB-002
- The app reads the fragment, removes it with `history.replaceState`, and keeps the token in session storage under one key. The browser scopes session storage to the origin with its port and clears it when the tab closes. A reload then keeps the session. The app uses no cookies. Refs: REQ-WEB-002, REQ-WEB-004
- The server reads the token from the `X-PersonaKit-Token` header only. A query string or a cookie never counts. It compares tokens with `timingSafeEqual` on equal-length buffers. Static files need no token, because they hold no personal data. Refs: REQ-WEB-002
- `serve --open` makes a one-time code of 16 random bytes. The code expires after two minutes and works once. The server opens `http://127.0.0.1:<port>/#code=<code>` with `open` on macOS, `xdg-open` on Linux, or `cmd /c start "" <url>` on Windows. It calls `spawn` with an argument list and no shell. Refs: REQ-WEB-009
- The page posts the code to `/api/session`, which needs no token, and gets the token. The server then forgets the code. A process list can show the code, but the code is short-lived and works once. Refs: REQ-WEB-009
- Launchers: `scripts/personakit-web.command` for macOS and `scripts/personakit-web.bat` for Windows. Each runs `personakit serve --open` and keeps the window open while the server runs. Refs: REQ-WEB-009
- Host check: the request must carry a Host header, and it must be `127.0.0.1:<port>` or `localhost:<port>`. A missing Host gets 400. Another Host gets 403. This stops DNS rebinding, because a rebound page sends its own host name. Refs: REQ-WEB-003
- Origin check: a request with an Origin header must match `http://` plus the Host value. The server refuses `null` and every other value with 403. A POST request must carry a matching Origin and `Content-Type: application/json`. Refs: REQ-WEB-003
- The server sends no `Access-Control-*` header and answers OPTIONS with 405. Refs: REQ-WEB-003
- Headers on every answer: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`. API answers use `application/json`. Refs: REQ-WEB-003, REQ-WEB-004
- Request bodies have a limit of 1 MiB. The server answers 413 above the limit. Refs: REQ-WEB-003
- API errors use the CLI error object `{"error": {"code", "exit_code", "message", "details"}}`. The HTTP status follows the code: 400 usage, 404 not found, 409 conflict, 422 invalid, 500 unexpected. Refs: REQ-WEB-005, REQ-CLI-001
- The server prints the URL and the store path at start. It prints no request log, no request body, and no record text. Refs: REQ-WEB-004
- The owner sees private text in the app. This is the same rule as `review` in the CLI. The rule of REQ-VIS-001 covers outputs for agents, models, and CVs, and the app is none of these. Refs: REQ-WEB-004, REQ-VIS-001
- Browser storage holds the token only. Records, the brief, the CV text, and drafts stay in page memory. A static test allows `sessionStorage` only in `logic.js` with the one token key. Refs: REQ-WEB-004
- The app builds every element with `createElement` and sets text with `textContent` or form values. The brief and the CV appear in `pre` elements as plain text. A static test fails on `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, and inline `on` attributes. Refs: REQ-WEB-010
- `src/web/logic.js` is an ES module with no DOM access. It holds the decisions of the app. These are the fragment, the interview batch, the print rule, and the export gate. It also holds the start screen, the empty result hint, the visibility choices, and the messages. `node --test` imports it, and `logic.d.ts` gives its types to the type check. Refs: REQ-WEB-007, REQ-ONB-001, REQ-ONB-006, REQ-ARC-003
- Routes: `POST /api/session`, `GET /api/state`, `GET /api/records`, `POST /api/propose`, `POST /api/update`, `POST /api/accept`, `POST /api/reject`, `POST /api/split`, `GET /api/result`, `POST /api/cv/check`, `POST /api/cv/strip`, and `GET /api/export`. Each route calls the core. Refs: REQ-WEB-005, REQ-ONB-003, REQ-ONB-005, REQ-WEB-006, REQ-ARC-001
- A new core function `proposeBatch` checks every input with `checkProposal` before the first write. Then it proposes each input in input order. A crash can leave the first part of the batch. On an unexpected write error, the error details list the IDs written so far. The CLI `propose --from`, `import text`, the interview, and the paste flow all use it. Refs: REQ-ONB-007, REQ-CLI-003
- Web writes use the actor `web` and `user_stated` true. The owner typed or reviewed each statement in the app. Refs: REQ-WEB-005, REQ-ONB-001, REQ-ONB-003
- Edits send the revision that the page showed. A stale revision gives a superseding proposal, as `update` does in the CLI. The app shows the new proposal ID and asks the owner to review it. Refs: REQ-WEB-005, REQ-STO-005
- Accept and reject send the revision on the page as `expectedRevision`. The click is the decision of the owner, like `--yes` in the CLI. The app shows no second dialog for accept or reject. Refs: REQ-ONB-005, ADR-002
- Interview questions live in `src/web/questions.json` as `{kind, id, text, hint}` items. A test reads the five kinds and a developer word list. Each answer becomes one proposal without the splitter, with the source `{kind: "interview", label: "web interview"}`. Refs: REQ-ONB-001
- First run: when `/api/state` reports no records, the app opens the start screen with Interview and Paste CV. The accept controls list private, ai, and public with plain text, and private is the default. A network error or a 401 shows a message to start the server again or open the new URL. Refs: REQ-ONB-006
- Splitter rules, in order. Remove a byte order mark, change CRLF to LF, and apply NFC. Remove control characters that the record schema refuses. A heading is a Markdown heading or a short line that matches the section word list, with an optional colon. A list item starts with `-`, `*`, `+`, a bullet sign, or a number and a dot. Lines of one paragraph join with one space. Each list item and each paragraph gives one draft `{kind, statement}`. Refs: REQ-ONB-002
- Section words map to kinds. Summary and Profile map to identity. Experience, Work, Employment, Education, Volunteering, Projects, and Certifications map to experience. Skills and Languages map to capability. Goals and Objective map to intent. Preferences maps to preference. The default kind is experience. Refs: REQ-ONB-002
- The splitter guesses no facets, dates, or organizations. It returns drafts only, and the owner edits them. Limits: 256 KiB of text and 500 drafts. A draft longer than the statement limit stays in the list with a problem note, so the owner can shorten it. Refs: REQ-ONB-002, REQ-ONB-003
- `import text FILE` uses the source `{kind: "cv", label: "pasted text"}`. It stores no excerpt, because the statement holds the same text. Refs: REQ-ONB-004
- Result screen: `GET /api/result` returns the full brief Markdown, the CV draft Markdown, the check result of the draft, and the record counts. The CV text goes into a text area. `POST /api/cv/check` runs `checkCv` on the edited text. The server keeps no CV text. Refs: REQ-WEB-006
- Print view: the print button is on only when the last checked text equals the current text and that check had no error. `POST /api/cv/strip` runs the check and `stripCv` together, and refuses text with an error. A print style sheet hides everything except the stripped text. Refs: REQ-WEB-007, REQ-CV-005
- Archive format: one canonical JSON object `{schema: "personakit.archive/v0", format_version: 1, store, records, events}`. `store` is the parsed `store.json`. `records` and `events` are the parsed files, sorted by ID. The archive holds no time, host, or path. Events under `events/orphaned/` stay out. Refs: REQ-ARC-001
- Export writes the file with mode 0600 and refuses an existing file. Restore rewrites each item with `stringifyCanonical`, so a round trip gives the same bytes. Refs: REQ-ARC-001, REQ-ARC-002
- A new core function `validateEvent` checks the event schema, the ULID fields, the event type, and the revisions. Restore checks every record with `validateRecord` and every event with `validateEvent`. Refs: REQ-ARC-002
- Restore checks the ULID form of every record ID, event ID, and event record ID before any path join. The file name is the ID. It refuses duplicate IDs, an event whose record is not in the archive, and revisions that do not chain. Each record revision must equal the highest `to_revision` of its events. Refs: REQ-ARC-004
- Restore takes `locks/restore.lock` with the existing lock rules. `propose`, `update`, `ownerAction`, and `setVisibility` refuse with the conflict code while the lock exists and is not stale. Refs: REQ-ARC-004
- Restore writes all events first and all records last, each with `writeNewFileAtomic`. Files get mode 0600 and folders mode 0700. A store with events and no records is a partial restore. When every top-level file in the store equals its archive copy, the same archive finishes the restore and writes the missing files. Refs: REQ-ARC-004
- Restore keeps the `store.json` of the target when it exists. Otherwise it writes the `store` object of the archive after the format check. An archive with a higher `format_version` or store format fails with code 6, and the message tells the owner to update PersonaKit. Refs: REQ-ARC-002
- The web export uses `fetch` with the token header and saves the answer through a Blob URL. A plain link cannot carry the header. The logic module allows the download only after the owner selects Continue on the warning. Refs: REQ-ARC-003, REQ-WEB-002
- The data page shows the store path from `GET /api/state`. It states the safeguard limit in the same words as the README. Refs: REQ-WEB-008

## Risks / Trade-offs

- A page script with an XSS bug could read the token from session storage. Mitigation: the strict content security policy, no markup sinks, and a static test for both.
- The one-time code can appear in a process list. Mitigation: it works once and expires after two minutes. The token never appears in a process argument.
- The token is a safeguard. Malware that runs as the owner can read the store files and the terminal output. Mitigation: the README and the data page say this in plain words.
- The splitter can give poor drafts for unusual CV layouts. Mitigation: the owner edits every draft before the proposal, and nothing reaches the store before that step.
- An exported archive holds private records in plain text. Mitigation: the CLI and the app warn the owner, and the file has mode 0600.
- A restore that stops halfway leaves a partial store. Mitigation: events go first and records last, and the same archive finishes the restore.
- `user_stated` true on pasted text says that the owner stated the fact. It does not say that anyone checked it. The brief and the CV keep their current wording about attested facts.
- The app is plain JavaScript without a type check. Mitigation: the decisions sit in `logic.js` with unit tests, and server tests cover each route.
