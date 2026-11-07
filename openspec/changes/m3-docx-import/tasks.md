# Tasks

## 1. DOCX reader

- [x] 1.1 Add the ZIP reader with limits and the CRC check [REQ-ONB-008] Verify: `npm run typecheck && node --test tests/docx.test.ts`
- [x] 1.2 Add the paragraph text scan of word/document.xml [REQ-ONB-008] Verify: `npm run typecheck && node --test tests/docx.test.ts`

## 2. Command and documents

- [x] 2.1 Add personakit import docx [REQ-ONB-009] Verify: `npm run typecheck && node --test tests/docx.test.ts`
- [x] 2.3 Compare the reader with mammoth as a development dependency [REQ-ONB-008] Verify: `npm run typecheck && node --test tests/docx-compare.test.ts`
- [x] 2.2 Record ADR-004 and update the roadmap and the README [REQ-ONB-009] Verify: `npm run typecheck && npx -y spec-ctx@0.5.0 lint ste decisions/m3-scope.md docs/roadmap.md README.md`
