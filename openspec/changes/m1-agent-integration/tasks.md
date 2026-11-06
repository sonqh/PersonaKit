# Tasks

## 1. Agent integration

- [x] 1.1 Add CLAUDE.md and the agent rules in AGENTS.md [REQ-AGT-001] Verify: `npm run typecheck && node --test tests/agents.test.ts`
- [x] 1.2 Add the shared personakit skill and the mirror test [REQ-AGT-002] Verify: `npm run typecheck && node --test tests/agents.test.ts`
- [x] 1.3 Add personakit skill install [REQ-AGT-003] Verify: `npm run typecheck && node --test tests/agents.test.ts`

## 2. Team and delivery

- [x] 2.1 Add the product manager, architect, and engineer roles, the CI workflow, the README flow, and the claude.ai guide [REQ-AGT-001] Verify: `npm run check && npx -y spec-ctx@0.5.0 lint ste .claude/agents/product-manager.md .claude/agents/architect.md .claude/agents/engineer.md README.md AGENTS.md docs/claude-ai.md`
