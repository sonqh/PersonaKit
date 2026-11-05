# PersonaKit

PersonaKit helps people keep a personal profile they own. The same profile can produce an AI brief and a draft CV. People can review the facts and choose what each output may include.

The project is at the design stage. There is no released application or CLI yet.

## First experience

1. Start with an existing CV or answer a short interview.
2. Review the extracted facts, skills, preferences, and goals.
3. Export an AI context pack and a CV draft from the accepted records.

A person can use PersonaKit without knowing how to code. The proposed first interface is a local-first web app.

## Design rules

- Keep the data model useful across professions.
- Give each record a stable ID and record its source.
- Treat a user's statement as user-attested. Do not claim that an external party verified it.
- Ask the user to approve proposed facts before using them.
- Check disclosure permissions before preparing an export.
- Keep the data portable. A browser copy must not be the only copy.
- Keep AI model calls optional. Show people when data will leave their device.

## Design documents

- [Product and architecture](docs/architecture.md)
- [Delivery plan](docs/roadmap.md)
- [Specification workflow with spec-ctx](docs/spec-workflow.md)
- [Bug reports and learning loop](docs/bug-reporting.md)

## Current status

This repository contains design documents. The team has not yet run OpenSpec or spec-ctx initialization here. The next implementation change must bootstrap those tools and record the result in a reviewed pull request.

## Related tools

- [spec-ctx](https://github.com/sonqh/spec-ctx) provides stable requirement IDs, task context, verification evidence, and handoffs for OpenSpec work.
- [ste-humanize](https://github.com/sonqh/ste-humanize-skill) sets the writing rules for human-facing Markdown and agent instructions.

## Contributions

Use a GitHub issue to describe a bug or propose a change. Remove private personal data from examples and logs before you post them.
