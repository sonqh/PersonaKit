# Tasks

## 1. CV core

- [ ] 1.1 Add the cited CV draft with sections, sort key, escaping, and the field whitelist [REQ-CV-001] [REQ-VIS-002] Verify: `npm run typecheck && node --test tests/cv.test.ts`
- [ ] 1.2 Add the line model, the marker grammar, and the citation check [REQ-CV-002] Verify: `npm run typecheck && node --test tests/cv.test.ts`
- [ ] 1.3 Add strip [REQ-CV-005] Verify: `npm run typecheck && node --test tests/cv.test.ts`

## 2. CLI

- [ ] 2.1 Add cv draft, cv check, and cv strip to the CLI with input handling [REQ-CV-006] [REQ-CV-001] [REQ-CV-005] Verify: `npm run typecheck && node --test tests/cv-cli.test.ts`
- [ ] 2.2 Add the CV disclosure tests with canaries and fixtures [REQ-VIS-002] Verify: `npm run typecheck && node --test tests/cv-cli.test.ts tests/cv.test.ts`

## 3. Agents and documents

- [ ] 3.1 Add the CV steps to the skill and the claude.ai guide. Add the branch rule and the job description note [REQ-AGT-002] [REQ-AGT-001] Verify: `npm run typecheck && node --test tests/agents.test.ts && npx -y spec-ctx@0.5.0 lint ste AGENTS.md .agents/skills/personakit/SKILL.md README.md docs/claude-ai.md docs/architecture.md`
