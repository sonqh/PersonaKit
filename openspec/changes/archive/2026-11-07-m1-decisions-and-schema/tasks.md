# Tasks

## 1. Persona records

- [x] 1.1 Add the record schema v0 validator with sources, provenance, and text rules [REQ-PER-001] [REQ-PER-002] [REQ-PER-003] Verify: `npm run typecheck && node --test tests/schema.test.ts`
- [x] 1.2 Add canonical JSON and the ULID generator [REQ-PER-004] Verify: `npm run typecheck && node --test tests/serialization.test.ts`
- [x] 1.3 Add synthetic fixtures for four professions [REQ-PER-005] Verify: `npm run typecheck && node --test tests/fixtures-schema.test.ts`

## 2. Record store location

- [x] 2.1 Add the store location check [REQ-STO-001] Verify: `npm run typecheck && node --test tests/location.test.ts`
- [x] 2.2 Add the privacy check script [REQ-STO-002] Verify: `npm run typecheck && node --test tests/check-privacy.test.ts && npm run check:privacy`

## 3. Decisions and documents

- [x] 3.1 Record ADR-001, ADR-002, and ADR-003, and update the roadmap and the architecture [REQ-STO-001] Verify: `npx -y spec-ctx@0.5.0 lint ste decisions/store-outside-repo.md decisions/proposal-only-agent-writes.md decisions/tech-stack.md docs/roadmap.md docs/architecture.md docs/m1-design.md && npx -y spec-ctx@0.5.0 lint tells decisions/store-outside-repo.md decisions/proposal-only-agent-writes.md decisions/tech-stack.md docs/roadmap.md docs/architecture.md docs/m1-design.md`
