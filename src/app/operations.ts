// Shared operations. The CLI and the MCP server call these functions, so both paths return the same data.
// REQ-MCP-005 REQ-MCP-006 REQ-MCP-007 REQ-VIS-001 REQ-VIS-002
// The functions return data only: no stdout, no environment, no prompts. Only src/core/store.ts writes the store.

import { createHash } from "node:crypto";
import { stringifyCanonical } from "../core/canonical.ts";
import { buildJsonResume, planJsonResumeImport, problemAt } from "../core/json-resume.ts";
import { PersonaKitError } from "../core/errors.ts";
import { agentView, compileBriefJson, compileBriefMarkdown, type BriefJson, type BriefLevel } from "../core/brief.ts";
import { buildCvDraft, checkCv, renderCvMarkdown, type CvCheckResult, type CvDraft } from "../core/cv.ts";
import { proposeBatch, checkProposal, getRecord, propose, readAll, type ActorLabel, type ProposeInput, type Store } from "../core/store.ts";
import type { PersonaRecord, RecordKind, RecordState } from "../core/schema.ts";

/** CV text and import files share this limit, in bytes. */
export const TEXT_INPUT_LIMIT = 1024 * 1024;

/** The brief as Markdown and as JSON, compiled from one read of the store. */
export function briefBoth(store: Store, level: BriefLevel): { markdown: string; json: BriefJson } {
  const { records } = readAll(store);
  return { markdown: compileBriefMarkdown(records, level), json: compileBriefJson(records, level) };
}

/** The brief as the CLI prints it: Markdown, or canonical JSON. */
export function briefText(store: Store, level: BriefLevel, json: boolean): string {
  const { records } = readAll(store);
  return json ? stringifyCanonical(compileBriefJson(records, level)) : compileBriefMarkdown(records, level);
}

export interface ListResult {
  records: Record<string, unknown>[];
  problems?: number;
}

export function listRecords(store: Store, filter: { state?: RecordState; kind?: RecordKind }): ListResult {
  const { records, problems } = readAll(store);
  const views = records.filter((r) => (!filter.state || r.state === filter.state) && (!filter.kind || r.kind === filter.kind)).map(agentView);
  const out: ListResult = { records: views };
  if (problems.length) out.problems = problems.length;
  return out;
}

export function showRecord(store: Store, id: string): Record<string, unknown> {
  return agentView(getRecord(store, id));
}

export interface ProposeSummary {
  id: string;
  state: string;
  revision: number;
  visibility: string;
  possible_duplicates: string[];
  previously_rejected: boolean;
}

/** All or nothing: every proposal is checked before the first write. Never returns the record or its statement. */
export function proposeRecords(store: Store, inputs: ProposeInput[], label: ActorLabel): ProposeSummary[] {
  // proposeBatch checks every proposal before the first write, refuses during a restore, and writes in order.
  let batch: ReturnType<typeof proposeBatch>;
  try {
    batch = proposeBatch(store, inputs, label);
  } catch (err) {
    // Keep the CLI wording: JSON Lines input names lines, not items.
    if (err instanceof PersonaKitError && err.code === "invalid" && Array.isArray(err.details.problems)) {
      const problems = (err.details.problems as string[]).map((p) => p.replace(/^item (\d+):/, "line $1:"));
      throw new PersonaKitError("invalid", `Nothing was proposed. ${problems.join("; ")}.`, { problems });
    }
    throw err;
  }
  return batch.map(({ record, duplicates }) => {
    // Report only duplicates the caller may see.
    return { id: record.id, state: record.state, revision: record.revision, visibility: record.visibility, possible_duplicates: duplicates.visible, previously_rejected: duplicates.rejected_visible.length > 0 };
  });
}

/** Records for the CV path. Unreadable record files stop it: a count only, never text. */
export function cvRecords(store: Store): PersonaRecord[] {
  const { records, problems } = readAll(store);
  if (problems.length) {
    throw new PersonaKitError("invalid", `${problems.length} record file${problems.length === 1 ? "" : "s"} cannot be read. Run "personakit doctor".`, { unreadable: problems.length });
  }
  return records;
}

export interface CvDraftResult {
  draft: CvDraft;
  markdown: string;
  count: number;
  /** Accepted ai records that could enter a CV with visibility public. A count, never text. */
  ai_only: number;
}

export function cvDraft(store: Store, asOf?: string): CvDraftResult {
  const records = cvRecords(store);
  const draft = buildCvDraft(records, asOf);
  const count = draft.sections.reduce((n, s) => n + s.items.length, 0);
  const aiOnly = records.filter((r) => r.state === "accepted" && r.visibility === "ai" && r.kind !== "intent" && r.kind !== "preference").length;
  return { draft, markdown: renderCvMarkdown(draft), count, ai_only: aiOnly };
}

export function cvCheck(store: Store, text: string): CvCheckResult {
  return checkCv(text, cvRecords(store));
}

// ---------- JSON Resume ----------
// REQ-RES-001 REQ-RES-002 REQ-RES-003 REQ-RES-004 REQ-RES-005

export interface JsonResumeExportResult {
  /** Canonical JSON: sorted keys, two-space indents, a final newline. */
  text: string;
  used: string[];
  career_breaks: number;
}

export function exportJsonResume(store: Store): JsonResumeExportResult {
  const { document, used, career_breaks } = buildJsonResume(cvRecords(store));
  return { text: stringifyCanonical(document), used, career_breaks };
}

export interface JsonResumeImportResult {
  source_label: string;
  proposed: { id: string; kind: string; from: string; possible_duplicates: string[] }[];
  skipped: string[];
}

type WriteFn = (store: Store, input: ProposeInput, label: ActorLabel) => { record: PersonaRecord; duplicates: { visible: string[] } };

/**
 * Validation failures write nothing. A write failure stops the import and reports the IDs already written.
 * The write function is a parameter so that a test can make a write fail.
 */
export function importJsonResume(store: Store, bytes: Uint8Array, write: WriteFn = propose): JsonResumeImportResult {
  if (bytes.byteLength > TEXT_INPUT_LIMIT) throw new PersonaKitError("invalid", "Nothing was imported. The file is larger than 1 MiB.", { problems: ["/ the file is larger than 1 MiB"] });
  const label = `json-resume:${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}`;
  const plan = planJsonResumeImport(Buffer.from(bytes).toString("utf8"), label);
  const problems = [...plan.problems];
  // One read of the store: every proposal is checked against the same set of IDs.
  const ids = new Set(readAll(store).records.map((r) => r.id));
  for (const item of plan.items) for (const p of checkProposal(store, item.input, ids)) problems.push(problemAt(item, p));
  if (problems.length) {
    throw new PersonaKitError("invalid", `Nothing was imported. ${problems.join("; ")}.`, { problems });
  }
  const actor: ActorLabel = { actor: "cli" };
  const proposed: JsonResumeImportResult["proposed"] = [];
  for (const item of plan.items) {
    try {
      const { record, duplicates } = write(store, item.input, actor);
      proposed.push({ id: record.id, kind: record.kind, from: item.pointer, possible_duplicates: duplicates.visible });
    } catch (err) {
      const written = proposed.map((p) => p.id);
      const code = err instanceof PersonaKitError ? err.code : "unexpected";
      throw new PersonaKitError(code, `The import stopped after ${written.length} of ${plan.items.length} records. Written: ${written.join(", ") || "none"}. Run "personakit doctor".`, { written });
    }
  }
  return { source_label: label, proposed, skipped: plan.skipped };
}
