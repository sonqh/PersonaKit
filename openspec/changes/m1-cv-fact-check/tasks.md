# Tasks

## 1. Fact checks

- [x] 1.1 Add the year and number checks with number words [REQ-CV-003] Verify: `npm run typecheck && node --test tests/cv-facts.test.ts`
- [x] 1.2 Add the organization, title, and seniority checks [REQ-CV-007] Verify: `npm run typecheck && node --test tests/cv-facts.test.ts`
- [x] 1.3 Add the ownership verb check [REQ-CV-004] Verify: `npm run typecheck && node --test tests/cv-facts.test.ts`

## 2. CLI and guard

- [x] 2.1 Add cv check --strict and the fixture guard test [REQ-CV-004] [REQ-CV-003] Verify: `npm run typecheck && node --test tests/cv-facts.test.ts tests/cv-cli.test.ts tests/cv.test.ts`
- [x] 2.2 Add the warning steps to the personakit skill [REQ-CV-003] Verify: `npm run typecheck && node --test tests/agents.test.ts && npx -y spec-ctx@0.5.0 lint ste .agents/skills/personakit/SKILL.md`
