# PersonaKit architecture proposal

Status: Proposed. M1 implements the record store and the CLI. See [the M1 design](m1-design.md).

## User experience

The first flow accepts pasted CV text or a short interview. The user reviews the records that result. The result screen offers an AI brief and a tailored CV draft.

A user can edit records later. A CV draft can use a job description later to pick records. M1 builds the draft without one.

## Core records

The data model has five record groups. Every group must work for a person without formal employment.

| Group | Meaning | Example |
| --- | --- | --- |
| Identity | Details the person chooses to store | Professional name |
| Experience | Things the person did or learned | Job, volunteer work, course, project |
| Capability | What the person can do | Japanese communication, user research |
| Preference | How the person wants help | Short replies for work email |
| Intent | What the person wants | Apply for remote roles |

Each record has a stable ID, source, acceptance state, visibility, and time metadata. A record may reference evidence. Evidence can be a local file reference, a URL, or a user's statement. These sources have different levels of confidence.

Recommended conceptual shape:

```ts
type RecordKind = "identity" | "experience" | "capability" | "preference" | "intent";
type RecordState = "proposed" | "accepted" | "rejected" | "retired";
type Visibility = "private" | "ai" | "public";

interface PersonaRecord {
  id: string;
  kind: RecordKind;
  statement: string;
  state: RecordState;
  visibility: Visibility;
  sourceIds: string[];
  evidenceIds?: string[];
  contribution?: "contributed" | "supported" | "co-led" | "led" | "owned";
  asOf?: string;
  scope?: string[];
  supersedes?: string[];
}
```

- `sourceIds` show where the record came from, such as a CV or an interview.
- `evidenceIds` point to the material that supports the claim.
- `contribution` applies to experience records. It records the level of the person's role.

Visibility has an order: `private` < `ai` < `public`.

- The AI pack receives `ai` and `public` records.
- A CV receives `public` records only.
- A `private` record never enters an output for agents, models, or CVs. The owner can sync the store to a private git remote. That remote is a trust boundary the owner chooses.

This example is a design sketch. Schema v0 in `src/core/schema.ts` is the implemented form. It uses snake_case field names on disk, inline `sources` with an optional `ref` and `excerpt` as evidence, and puts `contribution` in `facets`. Sensitive identity fields may need separate records so the user can disclose them independently.

## Two output paths

```text
CV / interview -> proposed records -> user review -> accepted records
                                                   |
                                   +---------------+---------------+
                                   |                               |
                              AI context pack                  CV draft
                                   |                               |
                            audience filter            public records only
                                   |                               |
                              short / full      cited lines -> owner review
```

The compiler must filter records before it sends data to an optional AI model. Only accepted records can enter an output. The output records the source IDs it used.

The AI brief includes relevant preferences and goals. The CV uses professional facts and capabilities with visibility public. Intents and preferences never enter a CV. An agent can rewrite the draft, and `personakit cv check` refuses every final line that does not cite accepted public records. A CV must not expose private notes only because they appear in the same vault.

## Grounding rules

- Each CV claim must cite one or more accepted record IDs.
- Check dates, organization names, titles, and numeric values against the cited records.
- Record contribution scope. Distinguish owning a component from leading a whole project.
- The CV check compares the output verbs against the `contribution` level of each cited record.
- Flag wording that might overstate ownership, scale, or causality.
- Require user review of the final draft.

The checks can catch structural mismatches. They cannot guarantee that every paraphrase preserves meaning.

## Local storage

The store is a folder outside any repository, `~/.personakit/` by default. It holds one file for each record and one file for each event. The owner can make it a private git repository for backup and sync. See [the store decision](../decisions/store-outside-repo.md).

A later web app reads the same store through the core. If the web app keeps a copy in browser storage, it must not present that copy as a permanent vault.

Keep model access optional. When the app uses an external model, show which records it will share and ask for consent.

## Role support

Role packs supply interview questions, examples, terminology, and CV section suggestions. They do not create new required core record groups. Start with one general pack. Test it with engineers, support specialists, designers, and students.

## Architecture boundaries

- Domain core: types, validation, access checks, selection, citation checks.
- Application layer: onboarding, record review, import, output preparation.
- Web interface: forms, record editing, export preview, backup.
- CLI (M1): a thin wrapper around the core. Agents and the owner use it.
- Application layer (M3): `src/app/operations.ts` holds the operations that the CLI and the MCP server share.
- MCP server (M3): `personakit mcp` serves the agent tools over stdio. It has no owner actions.
- JSON Resume (M3): export from public records, and import as proposals.
- Adapters later: optional LLMs.

Keep personal record IDs separate from spec-ctx requirement IDs. The first identifies user-owned data. The second identifies product requirements and tests.

## Decisions

- The first importer accepts pasted CV text. Local PDF and DOCX parsing comes later.

## Open decisions

- The archive format and migration policy.
- How to resolve a record that two machines changed. M1 detects this case in `doctor`.
- How to measure better AI responses in a blind comparison.
- Whether career-led onboarding attracts users who only want AI personalization.
