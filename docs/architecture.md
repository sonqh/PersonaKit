# PersonaKit architecture proposal

Status: Proposed. This design has not been implemented.

## User experience

The first flow accepts pasted CV text or a short interview. The user reviews the records that result. The result screen offers an AI brief and a tailored CV draft.

A user can edit records later. A CV draft needs a job description. The AI brief does not.

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
type RecordState = "proposed" | "accepted" | "retired";
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
- A `private` record never leaves the device.

This example is a design sketch. It is not a published schema. Sensitive identity fields may need separate records so the user can disclose them independently.

## Two output paths

```text
CV / interview -> proposed records -> user review -> accepted records
                                                   |
                                   +---------------+---------------+
                                   |                               |
                              AI context pack                  CV draft
                                   |                               |
                            audience filter              job description
                                   |                               |
                              short / full                cited statements
```

The compiler must filter records before it sends data to an optional AI model. Only accepted records can enter an output. The output records the source IDs it used.

The AI brief includes relevant preferences and goals. The CV uses professional facts and capabilities. A CV must not expose private notes only because they appear in the same vault.

## Grounding rules

- Each CV claim must cite one or more accepted record IDs.
- Check dates, organization names, titles, and numeric values against the cited records.
- Record contribution scope. Distinguish owning a component from leading a whole project.
- The CV check compares the output verbs against the `contribution` level of each cited record.
- Flag wording that might overstate ownership, scale, or causality.
- Require user review of the final draft.

The checks can catch structural mismatches. They cannot guarantee that every paraphrase preserves meaning.

## Local storage

The first app can keep a working copy in browser storage. Provide a versioned archive format, export, import, and visible backup guidance. Browser storage can be cleared. Do not present it as a permanent vault.

Keep model access optional. When the app uses an external model, show which records it will share and ask for consent.

## Role support

Role packs supply interview questions, examples, terminology, and CV section suggestions. They do not create new required core record groups. Start with one general pack. Test it with engineers, support specialists, designers, and students.

## Architecture boundaries

- Domain core: types, validation, access checks, selection, citation checks.
- Application layer: onboarding, record review, import, output preparation.
- Web interface: forms, record editing, export preview, backup.
- Adapters later: JSON Resume, optional LLMs, CLI, MCP.

Keep personal record IDs separate from spec-ctx requirement IDs. The first identifies user-owned data. The second identifies product requirements and tests.

## Decisions

- The first importer accepts pasted CV text. Local PDF and DOCX parsing comes later.

## Open decisions

- The archive format and migration policy.
- How to handle conflicts between accepted records.
- How to measure better AI responses in a blind comparison.
- Whether career-led onboarding attracts users who only want AI personalization.
