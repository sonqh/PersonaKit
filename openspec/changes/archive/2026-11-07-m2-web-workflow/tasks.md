# Tasks

## 1. Core

- [x] 1.1 Add `proposeBatch` to the store and move `propose --from` to it [REQ-ONB-007] [REQ-ONB-004] [REQ-ONB-003] Verify: `npm run typecheck && node --test tests/propose-batch.test.ts tests/cli.test.ts`
- [x] 1.2 Add the text splitter in `src/core/text-import.ts` with the section words, list rules, and limits [REQ-ONB-002] Verify: `npm run typecheck && node --test tests/text-import.test.ts`
- [x] 1.3 Add `validateEvent` and the archive export in `src/core/archive.ts` [REQ-ARC-001] Verify: `npm run typecheck && node --test tests/archive.test.ts`
- [x] 1.4 Add the archive restore with the empty-store rule and the format rule [REQ-ARC-002] Verify: `npm run typecheck && node --test tests/archive.test.ts`
- [x] 1.5 Add the restore lock, the ID rules, the write order, and the finish of a partial restore [REQ-ARC-004] Verify: `npm run typecheck && node --test tests/archive.test.ts`

## 2. CLI

- [x] 2.1 Add `personakit import text FILE` with output that holds no statement text [REQ-ONB-004] Verify: `npm run typecheck && node --test tests/import-cli.test.ts`
- [x] 2.2 Add `personakit export --out FILE` with the private data warning [REQ-ARC-001] [REQ-ARC-003] Verify: `npm run typecheck && node --test tests/archive-cli.test.ts`
- [x] 2.3 Add `personakit import archive FILE` [REQ-ARC-002] [REQ-ARC-004] Verify: `npm run typecheck && node --test tests/archive-cli.test.ts`

## 3. Server

- [x] 3.1 Add `personakit serve` with the loopback bind, the port option, and the static file list [REQ-WEB-001] Verify: `npm run typecheck && node --test tests/server.test.ts`
- [x] 3.2 Add the token, the Host and Origin rules, and the security headers [REQ-WEB-002] [REQ-WEB-003] Verify: `npm run typecheck && node --test tests/server.test.ts`
- [x] 3.3 Add the no-store header, the body limit, and the rule that the server prints no record text [REQ-WEB-004] Verify: `npm run typecheck && node --test tests/server.test.ts`
- [x] 3.4 Add `serve --open`, the one-time code, the session route, and the two launcher scripts [REQ-WEB-009] Verify: `npm run typecheck && node --test tests/server.test.ts`
- [x] 3.5 Add the record routes for state, list, propose, and update [REQ-WEB-005] [REQ-WEB-010] Verify: `npm run typecheck && node --test tests/server-api.test.ts`
- [x] 3.6 Add the split route and the batch proposal route for the paste flow and the interview [REQ-ONB-003] [REQ-ONB-001] Verify: `npm run typecheck && node --test tests/server-api.test.ts`
- [x] 3.7 Add the accept and reject routes with the expected revision [REQ-ONB-005] Verify: `npm run typecheck && node --test tests/server-api.test.ts`
- [x] 3.8 Add the result route and the two CV routes for `cv check` and `cv strip` [REQ-WEB-006] [REQ-WEB-007] Verify: `npm run typecheck && node --test tests/server-api.test.ts`
- [x] 3.9 Add the export route [REQ-ARC-001] [REQ-ARC-003] Verify: `npm run typecheck && node --test tests/server-api.test.ts`

## 4. Web app

- [x] 4.1 Add the logic module with the fragment rule, the interview batch, the print rule, and the export gate. Add the start screen rule and the messages. [REQ-WEB-007] [REQ-ONB-001] [REQ-ONB-006] [REQ-ARC-003] Verify: `npm run typecheck && node --test tests/web-logic.test.ts`
- [x] 4.2 Add the page shell, the token handling, and the static scans for browser storage and markup sinks [REQ-WEB-002] [REQ-WEB-004] [REQ-WEB-010] Verify: `npm run typecheck && node --test tests/web-static.test.ts`
- [x] 4.3 Add the interview questions, the start screen, and the interview page [REQ-ONB-001] [REQ-ONB-006] Verify: `npm run typecheck && node --test tests/web-static.test.ts`
- [x] 4.4 Add the record form, the paste page, and the review page [REQ-WEB-005] [REQ-ONB-003] [REQ-ONB-005] Verify: `npm run typecheck && node --test tests/web-static.test.ts`
- [x] 4.5 Add the result screen and the print style sheet [REQ-WEB-006] [REQ-WEB-007] Verify: `npm run typecheck && node --test tests/web-static.test.ts`
- [x] 4.6 Add the data page and the export button with the warning [REQ-WEB-008] [REQ-ARC-003] Verify: `npm run typecheck && node --test tests/web-static.test.ts`

## 5. Flow and documents

- [x] 5.1 Add an end-to-end test of the full flow through the API with a synthetic CV [REQ-ONB-003] [REQ-ONB-005] [REQ-WEB-006] [REQ-ARC-002] Verify: `npm run typecheck && node --test tests/web-flow.e2e.test.ts`
- [x] 5.2 Add the `serve`, import, and export sections to the README and update the architecture and the roadmap [REQ-WEB-008] [REQ-WEB-009] [REQ-ARC-003] Verify: `npm run typecheck && node --test tests/web-static.test.ts && npx -y spec-ctx@0.5.0 lint ste README.md docs/architecture.md docs/roadmap.md`
