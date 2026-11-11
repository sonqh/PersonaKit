# PersonaKit architecture proposal

Status: Proposed. M1 implements the record store and the CLI. See [the M1 design](m1-design.md).

## User experience

The first flow accepts pasted CV text or a short interview. The user reviews the records that result. The result screen offers an AI brief and a tailored CV draft.

A user can edit records later. A CV draft can use a job description to pick records. The change `m4-job-target` adds this to the CLI and MCP. The core splits the job text into requirements and links each one to the public records that share words with it. It does not store the job text. A link is a hint for the user and the agent. It does not show that the user meets the requirement.

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

Current limits of the CV check:

- Only a citation error stops `cv strip` and printing. A fact warning does not.
- The fact rules use English words and patterns.
- A line marked `[pk:self]` is a user statement. The check skips it.
- The organization and role check compares names with the public records. It cannot detect every invented name.

Describe the CV as traced to its sources, with warnings for mismatches. Do not describe it as free of invented claims.

## Local storage

The store is a folder outside any repository, `~/.personakit/` by default. It holds one file for each record and one file for each event. The owner can make it a private git repository for backup and sync. See [the store decision](../decisions/store-outside-repo.md).

The web app (`personakit serve`) reads the same store through the core. It keeps no record data in browser storage. Session storage holds only the session key of one tab. See the change `m2-web-workflow`.

Keep model access optional. When the app uses an external model, show which records it will share and ask for consent.

## Role support

Role packs supply interview questions, examples, terminology, and CV section suggestions. They do not create new required core record groups. Start with one general pack. Test it with engineers, support specialists, designers, and students.

## Architecture boundaries

- Domain core: types, validation, access checks, selection, citation checks.
- Application layer: onboarding, record review, import, output preparation.
- Web interface (M2): a local server in `src/server/` and static pages in `src/web/`. It binds 127.0.0.1, needs a token on every API call, and checks the Host and Origin headers. These checks are a safeguard, not a security boundary.
- CLI (M1): a thin wrapper around the core. Agents and the owner use it.
- Application layer (M3): `src/app/operations.ts` holds the operations that the CLI and the MCP server share.
- MCP server (M3): `personakit mcp` serves the agent tools over stdio. It has no owner actions.
- JSON Resume (M3): export from public records, and import as proposals.
- Adapters later: optional LLMs.

Keep personal record IDs separate from spec-ctx requirement IDs. The first identifies user-owned data. The second identifies product requirements and tests.

## Decisions

- The first importer accepts pasted CV text. Local PDF and DOCX parsing comes later.
- The archive is one canonical JSON file, `personakit.archive/v0`, with `store.json`, the records, and the events. Restore works only into an empty store. A newer format fails with a message to update PersonaKit.

## Open decisions

- The migration policy for older archive formats.
- How to resolve a record that two machines changed. M1 detects this case in `doctor`.
- How to measure better AI responses in a blind comparison.
- Whether career-led onboarding attracts users who only want AI personalization.
