# Tasks

## 1. Record writes

- [ ] 1.1 Add atomic file writes and record locks [REQ-STO-003] [REQ-STO-005] Verify: `npm run typecheck && node --test tests/store.test.ts`
- [ ] 1.2 Add propose, update, owner actions, and visibility to the store core [REQ-STO-004] [REQ-STO-005] Verify: `npm run typecheck && node --test tests/store.test.ts`
- [ ] 1.3 Add duplicate detection with private matches hidden from output [REQ-STO-006] Verify: `npm run typecheck && node --test tests/store.test.ts`
- [ ] 1.4 Add doctor [REQ-STO-007] Verify: `npm run typecheck && node --test tests/store.test.ts tests/location-cli.test.ts`
- [ ] 1.5 Add the two-process concurrency test [REQ-STO-003] Verify: `npm run typecheck && node --test tests/two-agents.e2e.test.ts`

## 2. CLI

- [ ] 2.1 Add the personakit command with JSON output and exit codes [REQ-CLI-001] Verify: `npm run typecheck && node --test tests/cli.test.ts tests/location-cli.test.ts`
- [ ] 2.2 Add confirmation for owner commands and the review queue [REQ-CLI-002] Verify: `npm run typecheck && node --test tests/cli.test.ts`
- [ ] 2.3 Add propose --from for JSON Lines [REQ-CLI-003] Verify: `npm run typecheck && node --test tests/cli.test.ts`

## 3. Brief and disclosure

- [ ] 3.1 Add the deterministic brief in short and full levels [REQ-AIP-001] Verify: `npm run typecheck && node --test tests/brief.test.ts`
- [ ] 3.2 Put record text in an escaped data block between data notices [REQ-AIP-002] Verify: `npm run typecheck && node --test tests/brief.test.ts`
- [ ] 3.3 Keep private records out of every agent command [REQ-VIS-001] Verify: `npm run typecheck && node --test tests/privacy.test.ts tests/fixtures.test.ts`
