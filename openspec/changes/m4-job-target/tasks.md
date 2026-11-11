# Tasks

## 1. Core

- [ ] 1.1 Add the job text parser, the size limit, and the term rules in `src/core/cv-job.ts` [REQ-CV-008] [REQ-CV-009] Verify: `npm run typecheck && node --test tests/cv-job.test.ts`
- [ ] 1.2 Extend the privacy scan to every fixture file that is not `.jsonl` or `SYNTHETIC.md` [REQ-CV-012] Verify: `npm run typecheck && node --test tests/check-privacy.test.ts`
- [ ] 1.3 Add a synthetic job text to each profession folder in `fixtures/` [REQ-CV-012] Verify: `npm run typecheck && node scripts/check-privacy.ts && node --test tests/fixtures.test.ts tests/fixtures-schema.test.ts`
- [ ] 1.4 Add the record match and the match report with its privacy and control-character tests [REQ-CV-009] [REQ-CV-012] Verify: `npm run typecheck && node --test tests/cv-job.test.ts`
- [ ] 1.5 Add the tailored draft and the check guard for each fixture [REQ-CV-010] Verify: `npm run typecheck && node --test tests/cv-job.test.ts tests/cv.test.ts`

## 2. Interfaces

- [ ] 2.1 Add `cv match --job` and `cv draft --job` to the CLI, with stdin and the subprocess determinism tests [REQ-CV-011] [REQ-CV-010] [REQ-CV-008] Verify: `npm run typecheck && node --test tests/cv-job-cli.test.ts tests/cv-cli.test.ts`
- [ ] 2.2 Add the `job` input to the MCP tool `cv_draft`, with the byte limit and a privacy case [REQ-CV-011] [REQ-CV-012] Verify: `npm run typecheck && node --test tests/mcp-tools.test.ts tests/mcp-docs.test.ts tests/mcp-privacy.test.ts`

## 3. Documentation

- [ ] 3.1 Add the tailoring steps and the gap rules to the personakit skill and its copy, with tests [REQ-CV-011] Verify: `npm run typecheck && node --test tests/agents.test.ts`
- [ ] 3.2 Add the M4 section to the roadmap, the job input to the architecture, and the job commands to the README [REQ-CV-010] [REQ-CV-011] Verify: `npm run typecheck && node --test tests/mcp-docs.test.ts`
