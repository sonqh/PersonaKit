# Delivery plan

Status: Proposed. Test demand before building the full application.

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

Exit: All decision rules pass, and the repository has a valid specification change. If a rule fails, record the failed assumption as an issue and revise the positioning. M1 work can run in parallel with this research.

## M1. Domain core, store, and CLI

The owner decided on 2026-11-06 that agents write to one persona before the web UI exists. See [the decision](../decisions/proposal-only-agent-writes.md). The M0 research stays open and does not block M1.

- Keep the store outside any repository. See [the decision](../decisions/store-outside-repo.md).
- Add a CLI that wraps the core. Agents propose records. Only the owner accepts them.
- Give Claude Code and Codex the same instructions and the same `personakit` skill.
- Test two agents that write to one store at the same time.
- Define five record groups and shared metadata.
- Reject invalid IDs, states, evidence references, and visibility.
- Add a deterministic compiler for short and full AI briefs.
- Add a CV projection that preserves cited record IDs.
- Test that rejected and private records never enter disallowed exports.

Exit: Synthetic records produce both outputs, with tests for disclosure and claim traceability. Two agents can propose records to one store at the same time without lost writes.

## M2. First web workflow

- Add guided interview and manual record editing.
- Paste CV text to propose records. No file parsing yet.
- Let users accept or reject proposed facts.
- Show both outputs on one result screen.
- Support portable archive export and restore.
- Explain browser storage risks.
- Support CV print output only after its content review works.

Exit: Nontechnical users can finish the complete flow without a terminal.

The OpenSpec change `m2-web-workflow` builds this milestone with `personakit serve`, a local web app on 127.0.0.1. After the one-time install of Node 22 and `npm link`, a launcher script starts the app with a double-click. Restore in the web app moves to M3. M2 restores an archive with the CLI.

## M3. Optional integrations

- Add an MCP server that wraps the same core. The change `m3-mcp-and-json-resume` adds it.
- Add JSON Resume export and import. The same change adds them.
- Add DOCX import with a parser in the repository. The change `m3-docx-import` adds it. PDF import waits. See [ADR-004](../decisions/m3-scope.md).
- Add role packs after the M0 user research.
- Add optional LLM extraction and writing after the owner uses PersonaKit for a few weeks. It sends personal data to a model provider.
- Add archive restore in the web app when a person who does not use a terminal needs it.

Exit: Each integration has compatibility tests and does not change the canonical model.

## M4. Job-targeted CV loop

The Codex review of 2026-11-11 found that the CV draft took no job description. It did not pick records for a job, and it did not show missing information. M4 closes the loop: a real CV, then review, then a specific job description, then a CV that the person uses to apply.

The changes, one pull request each, in this order:

1. `m4-job-target`: a job text as input, a word-overlap match report with gaps, and a tailored draft in the CLI and MCP. The personakit skill tells agents how to ask about gaps.
2. The web flow for a job description, with follow-up questions from the gaps.
3. Acknowledgement of fact warnings and `[pk:self]` lines before print and strip.
4. Local counts-only metrics and a diagnostic export for the M0 test.

People who do not use a terminal can run the loop only after change 2. Until then, the owner runs it with the CLI or an agent.

Change 4 sets the measures and their thresholds before any measurement starts. The measures are edit time for each application, wrong claims in each CV, and the number of real applications.

Exit: The owner and the M0 participants use tailored CVs for real applications, and the change 4 measures meet their thresholds.

## Exclusions from the first web release

Accounts, cloud sync, OCR, hosted AI proxy, multi-user coaching, automatic acceptance of agent proposals, vector database, and automatic publication of personal data.

## Delivery rules

Each implementation change must include a requirement ID, a user-visible scenario, a test, and a Verify command. Keep changes small enough to review. Record a failed assumption as an issue. Use the bug process in [bug-reporting.md](bug-reporting.md).
