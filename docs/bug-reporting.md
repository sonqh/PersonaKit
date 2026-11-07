# Bug reporting and learning loop

A useful bug report tells a maintainer what failed and gives enough detail to reproduce it. PersonaKit handles personal information, so every report must also limit what it reveals.

## Where bugs go

Use GitHub Issues for triage. Start with the [bug report form](../.github/ISSUE_TEMPLATE/bug_report.yml). Do not post credentials, real CVs, private records, or sensitive screenshots in public issues.

Report a security problem or a private-data exposure privately. Follow [SECURITY.md](../SECURITY.md).

## Bug classes

| Type | Example |
| --- | --- |
| `privacy` | A private record appears in an AI export |
| `grounding` | A CV draft claims that a contributor led a project |
| `import` | A date changes when a CV is parsed |
| `data-integrity` | An accepted record disappears after restore |
| `compatibility` | A browser cannot open an exported archive |
| `ux` | The review screen hides a required decision |

The form asks if the feature worked in an earlier version. Regression is not a bug type. A maintainer adds the `regression` label after triage when a previously working scenario fails again.

Privacy leaks and data loss need immediate maintainer attention. Do not ask a reporter to share private input in an issue.

## Minimum report

- What the user tried to do.
- What the user expected.
- What happened instead.
- Steps using synthetic or redacted data.
- App version or commit, browser, operating system.
- Whether the failure repeats.

No telemetry service is planned for the MVP. A later opt-in diagnostic export may include a generated report ID, app version, error category, and a record of failed steps. It must exclude record content, prompts, evidence files, API keys, and CV text by default.

## Severity and triage

- P0: confirmed private-data disclosure or destructive data loss. Stop unsafe exports and issue a security response.
- P1: common workflow blocked or CV fabrication with material impact.
- P2: recoverable defect with a workaround.
- P3: cosmetic or low-impact issue.

Severity is an initial triage estimate. Maintainers may change it after reproduction.

## Fix loop

1. Reproduce the issue with synthetic fixtures.
2. Link the issue to the affected requirement ID when one exists.
3. Decide if the issue is a code defect or a missing requirement.
4. For changed behavior, open an OpenSpec delta and allocate IDs with spec-ctx.
5. Add a regression scenario and an executable Verify command.
6. Fix the code. Run `specctx task done` after verification passes.
7. Run the repository quality gate.
8. Link the pull request and test evidence back to the issue.
9. Close the issue after verification. Record any remaining limitation.

The issue remains the record of the failure. The spec defines expected behavior. Verification evidence shows which command passed. Keep these roles separate.

## Bugs in spec-ctx

File a defect in spec-ctx in the [spec-ctx issue tracker](https://github.com/sonqh/spec-ctx/issues), not here. This applies when you find the defect during PersonaKit work. Do not add a workaround in PersonaKit.

spec-ctx keeps a local run log in `.ctx/local/runs.jsonl`. The log holds the command name, the exit code, the run time, and a fixed set of signals. It holds no path, argument value, requirement ID, or spec text. It never leaves the machine, and git ignores it.

To file a defect:

1. Run `npx -y spec-ctx@0.6.0 report > specctx-report.md`.
2. Read the report. Add what you ran, what you expected, and what happened.
3. Run `gh issue create -R sonqh/spec-ctx --body-file specctx-report.md`.
4. Delete `specctx-report.md`. Do not commit it.

`SPECCTX_JOURNAL=0` turns the run log off for one shell.

## Learning from bugs

Review issues by failure type, root cause, affected release, and whether a regression test exists. Track repeat defects and time to reproduce. Do not count a closed issue as proof that the bug is fixed without a passed regression test.

For privacy failures, publish a safe summary after the exposure is contained. Do not publish the affected data or a reproduction that exposes another person.
