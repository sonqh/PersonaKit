# web-app Specification

## Purpose
Give the owner a local web app for the full PersonaKit flow. The app runs on the owner's machine and calls the core for every read and write.

## Requirements

### Requirement: REQ-WEB-001 Local web server
`personakit serve` SHALL start an HTTP server with `node:http` on 127.0.0.1 only. It SHALL serve static HTML, CSS, and JavaScript from `src/web/` with no build step and no runtime dependency. It SHALL create the store when it is missing, with the same location rules as `init`. It SHALL print one URL that holds a random token. `--port` SHALL select the port. The default port is a free port that the system picks.

Refs: ADR-001, ADR-003

#### Scenario: SCN-WEB-001-1 The server listens on the loopback address only
- **WHEN** the owner runs `personakit serve`
- **THEN** the server listens on 127.0.0.1 and not on another address, and it prints one URL with a token

#### Scenario: SCN-WEB-001-2 The server sends the static app
- **WHEN** a browser requests `/` with a correct Host header
- **THEN** the server sends the HTML page from `src/web/` without a build step

#### Scenario: SCN-WEB-001-3 A busy port stops the server with a message
- **WHEN** the owner gives `--port` with a port that another program uses
- **THEN** the command prints a message that names the port and exits with code 1

### Requirement: REQ-WEB-002 Token on every API request
Each `serve` run SHALL make a new random token of 32 bytes. The app SHALL keep the token in session storage for its origin and SHALL NOT use cookies. Every request to `/api/` except `/api/session` SHALL carry the token in the `X-PersonaKit-Token` header. The server SHALL accept no other carrier and SHALL compare the token in constant time. Without a correct token, the server SHALL answer 401 with no record data.

#### Scenario: SCN-WEB-002-1 A request without the token gets no data
- **WHEN** a client calls any `/api/` path without the token header
- **THEN** the server answers 401, and the body holds no record ID and no record text

#### Scenario: SCN-WEB-002-2 A wrong token gets no data
- **WHEN** a client calls `/api/records` with a token from another `serve` run
- **THEN** the server answers 401 and writes nothing to the store

#### Scenario: SCN-WEB-002-3 The correct token opens the API
- **WHEN** the app calls `/api/records` with the token from the printed URL
- **THEN** the server answers 200 with the records

#### Scenario: SCN-WEB-002-4 A token in the query string does not count
- **WHEN** a client calls `/api/records?token=<token>` without the header
- **THEN** the server answers 401

### Requirement: REQ-WEB-003 Host and Origin checks
The server SHALL refuse a request without a Host header, or with a Host other than `127.0.0.1:<port>` or `localhost:<port>`. It SHALL refuse the Origin `null` and every Origin that does not match the Host. A POST request SHALL carry a matching Origin and the content type `application/json`. The server SHALL send no CORS header and SHALL answer OPTIONS with 405. Every answer SHALL carry the security headers that the design lists.

#### Scenario: SCN-WEB-003-1 The server refuses a rebound host name
- **WHEN** a request with the correct token has the Host header `attacker.example:<port>`
- **THEN** the server answers 403 and sends no record data

#### Scenario: SCN-WEB-003-2 A foreign origin cannot write
- **WHEN** a POST request has the Origin `http://attacker.example`
- **THEN** the server answers 403 and the store does not change

#### Scenario: SCN-WEB-003-3 A preflight request gets no CORS permission
- **WHEN** a client sends OPTIONS to an `/api/` path
- **THEN** the server answers 405 without an `Access-Control-Allow-Origin` header

#### Scenario: SCN-WEB-003-4 A request without a Host header fails
- **WHEN** an HTTP/1.0 request with the correct token has no Host header
- **THEN** the server answers 400 and sends no record data

#### Scenario: SCN-WEB-003-5 The Origin null fails
- **WHEN** a request with the correct token has the Origin `null`
- **THEN** the server answers 403

#### Scenario: SCN-WEB-003-6 An Origin with another port fails
- **WHEN** a request with the correct token has the Origin `http://127.0.0.1:<other port>`
- **THEN** the server answers 403

### Requirement: REQ-WEB-004 Owner-only disclosure in the web app
The app SHALL show private records only in the owner's local page. The app SHALL NOT keep records, the brief, the CV text, or drafts in any browser storage. Session storage SHALL hold the token only. Every API answer SHALL be JSON with `Cache-Control: no-store`. The server SHALL NOT print or log record text or request bodies.

Refs: REQ-VIS-001, ADR-001

#### Scenario: SCN-WEB-004-1 The owner sees a private record
- **WHEN** the app calls `/api/records` with the token, and the store holds a private record
- **THEN** the answer holds the text of the private record

#### Scenario: SCN-WEB-004-2 The server output holds no record text
- **WHEN** the server handles a proposal with a canary statement, and an export
- **THEN** no output of `personakit serve` on stdout or stderr contains the canary

#### Scenario: SCN-WEB-004-3 The app keeps only the token in browser storage
- **WHEN** the tests scan every file under `src/web/`
- **THEN** no file uses localStorage, indexedDB, or document.cookie, session storage holds one token key only, and every API answer carries no-store

### Requirement: REQ-WEB-005 Manual record editing
The app SHALL let the owner propose a record and update a record through the core functions `propose` and `update`. Each write SHALL record the actor `web` and `user_stated` true. A stale revision or an accepted record SHALL give a new proposal that supersedes it. The app SHALL tell the owner about the new proposal. Only `src/core/` SHALL write the store.

Refs: REQ-STO-004, REQ-STO-005, ADR-002

#### Scenario: SCN-WEB-005-1 A new record from the form is a proposal
- **WHEN** the app posts one record to `/api/propose`
- **THEN** the store holds a proposed record with the actor web and user_stated true

#### Scenario: SCN-WEB-005-2 An edit of an accepted record makes a proposal
- **WHEN** the app posts a new statement for an accepted record to `/api/update`
- **THEN** the accepted file stays byte-identical, and a new proposal supersedes it

#### Scenario: SCN-WEB-005-3 A stale edit does not overwrite
- **WHEN** an agent updates a proposal, and the app then posts an edit with the old revision
- **THEN** the server answers with a conflict, the agent change stays, and a new proposal holds the owner edit

### Requirement: REQ-WEB-006 One result screen
The result screen SHALL show the full AI brief and the CV draft from the core. It SHALL show the findings of `cv check` for the CV text in an editable text area. The owner can change the text and run the check again. The server SHALL NOT store the CV text. The brief and the draft SHALL be the same bytes as the CLI output for the same store.

Refs: REQ-AIP-001, REQ-CV-001, REQ-CV-002, REQ-VIS-002

#### Scenario: SCN-WEB-006-1 The screen shows both outputs
- **WHEN** the app calls `/api/result` for a store with accepted ai and public records
- **THEN** the answer holds the brief and the CV draft, and each matches the CLI output byte for byte

#### Scenario: SCN-WEB-006-2 An edited line without a marker shows a finding
- **WHEN** the app posts CV text with a line without a marker to `/api/cv/check`
- **THEN** the answer holds the finding with its line number and code

### Requirement: REQ-WEB-007 Print view after a clean check
The app SHALL offer the print view only when the last checked text equals the current text and that check had no error. The print view SHALL show the output of `cv strip` and no marker. A print style sheet SHALL hide every other part of the page. The server SHALL refuse a strip request for text with a check error.

Refs: REQ-CV-005

#### Scenario: SCN-WEB-007-1 A clean check turns on the print view
- **WHEN** the logic module gets a clean check for the current text
- **THEN** it turns on the print view, and `/api/cv/strip` returns the text without markers

#### Scenario: SCN-WEB-007-2 A check error keeps the print view off
- **WHEN** the check has an error, or the current text differs from the checked text
- **THEN** the logic module keeps the print view off, and `/api/cv/strip` refuses text with an error

### Requirement: REQ-WEB-008 Data and safety page
The app SHALL have a page that tells the owner where the store is on disk. It SHALL say that the app keeps no record data in browser storage. It SHALL describe backup through export or a private git repository. It SHALL say that the token and the host checks protect against other web pages. They are a safeguard, not a security boundary. Programs that run as the owner can read the store files.

Refs: ADR-001

#### Scenario: SCN-WEB-008-1 The page names the store path
- **WHEN** the app calls `/api/state`
- **THEN** the answer holds the store path of the running server, and the data page shows the backup steps

#### Scenario: SCN-WEB-008-2 The page states the limit of the safeguard
- **WHEN** the tests read the data page and the README section for `serve`
- **THEN** both say that the token and the host checks are a safeguard, not a security boundary

### Requirement: REQ-WEB-009 Open the app without a terminal
`serve --open` SHALL make a random code that works once and expires after two minutes. It SHALL open `http://127.0.0.1:<port>/#code=<code>` with the platform opener, through an argument list and no shell. The page SHALL post the code to `/api/session` to get the token. The scripts `scripts/personakit-web.command` and `scripts/personakit-web.bat` SHALL run `personakit serve --open`.

Refs: REQ-WEB-002

#### Scenario: SCN-WEB-009-1 The code gives the token once
- **WHEN** the page posts the code to `/api/session` two times
- **THEN** the first answer holds the token, and the second answer is 401

#### Scenario: SCN-WEB-009-2 An expired code fails
- **WHEN** the page posts the code more than two minutes after the start
- **THEN** the server answers 401 and gives no token

#### Scenario: SCN-WEB-009-3 The opener gets the code and not the token
- **WHEN** `serve --open` runs with a test opener
- **THEN** the opener gets one URL argument with the code, and no argument holds the token

#### Scenario: SCN-WEB-009-5 The opener refuses a URL of another form
- **WHEN** the platform opener gets a URL that does not match `http://127.0.0.1:<port>/#code=<code>`
- **THEN** it fails and starts no process

#### Scenario: SCN-WEB-009-4 The launchers start the server
- **WHEN** the tests read the two launcher scripts
- **THEN** each script runs `personakit serve --open`

### Requirement: REQ-WEB-010 Record text is never markup
The app SHALL put record text, the brief, and the CV text into the page with `textContent` or form values only. It SHALL show the brief and the CV as plain text. No file under `src/web/` SHALL use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, or inline event handler attributes.

Refs: REQ-AIP-002

#### Scenario: SCN-WEB-010-1 The static scan finds no markup sink
- **WHEN** the tests scan every file under `src/web/`
- **THEN** no file holds a forbidden sink or an inline `on` handler attribute

#### Scenario: SCN-WEB-010-2 A script tag in a statement stays text
- **WHEN** the store holds a proposal whose statement holds `<script>`
- **THEN** `/api/records` returns it as a JSON string with the content type `application/json`, and the page policy allows only scripts from the server
