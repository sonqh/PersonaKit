# Delivery plan

Status: Proposed. Validate demand before building the full application.

## M0. Research and specification bootstrap

- Test one manual onboarding with a CV or interview.
- Give participants an AI brief and a cited CV draft.
- Measure time to useful output and unsupported claims.
- Initialize OpenSpec and spec-ctx in the repository.
- Add requirements with stable IDs and executable task verification.
- Add synthetic examples from several professions.

Set these decision rules before the test runs:

- At least 60% of participants prefer answers with the AI brief in a blind comparison.
- At least 30% of participants still use the brief after 7 days.
- At least 40% of participants would use the CV draft for their next application.

Exit: All decision rules pass, and the repository has a valid specification change. If a rule fails, record the failed assumption as an issue. Revise the positioning before M1 starts.

## M1. Domain core

- Define five record groups and shared metadata.
- Validate IDs, states, evidence references, and visibility.
- Add a deterministic compiler for short and full AI briefs.
- Add a CV projection that preserves cited record IDs.
- Test that rejected and private records never enter disallowed exports.

Exit: Synthetic records produce both outputs, with tests for disclosure and claim traceability.

## M2. First web workflow

- Add guided interview and manual record editing.
- Paste CV text to propose records. No file parsing yet.
- Let users accept or reject proposed facts.
- Show both outputs on one result screen.
- Support portable archive export and restore.
- Explain browser storage risks.
- Support CV print output only after its content review works.

Exit: Nontechnical users can finish the complete flow without a terminal.

## M3. Optional integrations

- Add CV file import (local PDF and DOCX parsing) and JSON Resume interoperability.
- Add role packs supported by user research.
- Add optional LLM extraction and writing.
- Add CLI and read-only MCP after the file export is useful.

Exit: Each integration has compatibility tests and does not change the canonical model.

## Exclusions from the first web release

Accounts, cloud sync, OCR, hosted AI proxy, multi-user coaching, agent write-back, vector database, and automatic publication of personal data.

## Delivery rules

Each implementation change must include a requirement ID, a user-visible scenario, a test, and a Verify command. Keep changes small enough to review. Record a failed assumption as an issue. Use the bug process in [bug-reporting.md](bug-reporting.md).
