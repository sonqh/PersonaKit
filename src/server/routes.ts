// API routes of the local web app. Each route calls src/core. Only src/core writes the store.
// REQ-WEB-005 REQ-WEB-006 REQ-WEB-007 REQ-ONB-001 REQ-ONB-003 REQ-ONB-005 REQ-ARC-001 REQ-ARC-003

import { compileBriefJson, compileBriefMarkdown } from "../core/brief.ts";
import { buildCvDraft, checkCv, renderCvMarkdown, stripCv } from "../core/cv.ts";
import { exportArchive } from "../core/archive.ts";
import { PersonaKitError } from "../core/errors.ts";
import { splitText } from "../core/text-import.ts";
import {
  ownerAction, proposeBatch, readAll, update,
  type ActorLabel, type ProposeInput, type Store, type UpdatePatch,
} from "../core/store.ts";
import { RECORD_KINDS, VISIBILITIES, type Facets, type PersonaRecord, type RecordKind, type Visibility } from "../core/schema.ts";

export interface ApiContext {
  store: Store;
  label: ActorLabel;
}

export interface ApiResult {
  status?: number;
  body?: unknown;
  /** A body that is already JSON text, such as the archive. */
  raw?: string;
  headers?: Record<string, string>;
}

/** Sources for web writes. The label says where in the app the statement came from. */
export const WEB_SOURCES = {
  manual: { kind: "manual", label: "web form" },
  interview: { kind: "interview", label: "web interview" },
  cv: { kind: "cv", label: "pasted text" },
} as const;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const bad = (message: string): PersonaKitError => new PersonaKitError("usage", message);

function needObject(body: unknown): Record<string, unknown> {
  if (!isObject(body)) throw bad("The request body must be a JSON object.");
  return body;
}

function needId(o: Record<string, unknown>): string {
  if (typeof o.id !== "string") throw bad("id is required.");
  return o.id;
}

function needRevision(o: Record<string, unknown>): number {
  if (!Number.isInteger(o.revision) || (o.revision as number) < 1) throw bad("revision must be a positive integer.");
  return o.revision as number;
}

function optVisibility(v: unknown): Visibility | undefined {
  if (v === undefined) return undefined;
  if (!(VISIBILITIES as readonly unknown[]).includes(v)) throw bad(`visibility must be one of ${VISIBILITIES.join(", ")}.`);
  return v as Visibility;
}

function readRecords(store: Store): PersonaRecord[] {
  const { records, problems } = readAll(store);
  if (problems.length) {
    throw new PersonaKitError("invalid", `${problems.length} record file${problems.length === 1 ? "" : "s"} cannot be read. Run "personakit doctor".`, { unreadable: problems.length });
  }
  return records;
}

function proposeInputs(body: unknown): ProposeInput[] {
  const o = needObject(body);
  if (!Array.isArray(o.items)) throw bad("items must be an array.");
  return o.items.map((raw, i) => {
    const where = `item ${i + 1}`;
    if (!isObject(raw)) throw bad(`${where} must be an object.`);
    if (!(RECORD_KINDS as readonly unknown[]).includes(raw.kind)) throw bad(`${where}: kind must be one of ${RECORD_KINDS.join(", ")}.`);
    if (typeof raw.statement !== "string") throw bad(`${where}: statement is required.`);
    const sourceKey = (raw.source ?? "manual") as string;
    if (!(sourceKey in WEB_SOURCES)) throw bad(`${where}: source must be manual, interview, or cv.`);
    const input: ProposeInput = {
      kind: raw.kind as RecordKind,
      statement: raw.statement,
      sources: [{ ...WEB_SOURCES[sourceKey as keyof typeof WEB_SOURCES] }],
      user_stated: true,
    };
    const visibility = optVisibility(raw.visibility);
    if (visibility) input.visibility = visibility;
    if (raw.facets !== undefined) input.facets = raw.facets as Facets;
    return input;
  });
}

export async function handleApi(ctx: ApiContext, method: string, path: string, body: unknown): Promise<ApiResult | undefined> {
  const { store, label } = ctx;
  const route = `${method} ${path}`;
  switch (route) {
    case "GET /api/state": {
      const { records, problems } = readAll(store);
      const counts: Record<string, number> = { proposed: 0, accepted: 0, rejected: 0, retired: 0 };
      for (const r of records) counts[r.state] = (counts[r.state] ?? 0) + 1;
      return { body: { store: store.root, total: records.length, counts, unreadable: problems.length, ...(store.warning ? { warning: store.warning } : {}) } };
    }
    case "GET /api/records": {
      // The owner's own page: private text appears here, as in "personakit review".
      const { records, problems } = readAll(store);
      return { body: { records: [...records].sort((a, b) => (a.id < b.id ? -1 : 1)), unreadable: problems.length } };
    }
    case "POST /api/propose": {
      const results = proposeBatch(store, proposeInputs(body), label);
      return { body: { proposed: results.map(({ record, duplicates }) => ({ id: record.id, kind: record.kind, revision: record.revision, possible_duplicates: duplicates.all, previously_rejected: duplicates.rejected })) } };
    }
    case "POST /api/update": {
      const o = needObject(body);
      const patch: UpdatePatch = { user_stated: true };
      if (o.statement !== undefined) {
        if (typeof o.statement !== "string") throw bad("statement must be a string.");
        patch.statement = o.statement;
      }
      const visibility = optVisibility(o.visibility);
      if (visibility) patch.visibility = visibility;
      if (o.facets !== undefined) patch.facets = o.facets as Facets;
      const r = update(store, needId(o), needRevision(o), patch, label);
      const data = { outcome: r.outcome, conflict: r.conflict, id: r.record.id, revision: r.record.revision, state: r.record.state, current_revision_of_target: r.current_revision };
      if (r.conflict) {
        return { status: 409, body: { error: { code: "conflict", exit_code: 3, message: `The record changed after you opened it. Your edit is in the new proposal ${r.record.id}. Review it.`, details: data } } };
      }
      return { body: data };
    }
    case "POST /api/accept":
    case "POST /api/reject": {
      const o = needObject(body);
      const action = path === "/api/accept" ? "accept" : "reject";
      const opts: { expectedRevision: number; visibility?: Visibility } = { expectedRevision: needRevision(o) };
      if (action === "accept") opts.visibility = optVisibility(o.visibility) ?? "private";
      const r = ownerAction(store, action, needId(o), opts, label);
      return { body: { id: r.record.id, state: r.record.state, visibility: r.record.visibility, revision: r.record.revision, side_effects: r.side_effects } };
    }
    case "POST /api/split": {
      const o = needObject(body);
      if (typeof o.text !== "string") throw bad("text is required.");
      return { body: { drafts: splitText(o.text) } };
    }
    case "GET /api/result": {
      const records = readRecords(store);
      const brief = compileBriefMarkdown(records, "full");
      const draft = buildCvDraft(records);
      const cv = renderCvMarkdown(draft);
      const cvCount = draft.sections.reduce((n, s) => n + s.items.length, 0);
      return { body: { brief, cv, check: checkCv(cv, records), counts: { brief: compileBriefJson(records, "full").used.length, cv: cvCount } } };
    }
    case "POST /api/cv/check":
    case "POST /api/cv/strip": {
      const o = needObject(body);
      if (typeof o.text !== "string") throw bad("text is required.");
      const records = readRecords(store);
      if (path === "/api/cv/check") return { body: checkCv(o.text, records) };
      const { text, check } = stripCv(o.text, records);
      if (text === undefined) {
        return { status: 422, body: { error: { code: "invalid", exit_code: 6, message: `The CV has ${check.errors} error${check.errors === 1 ? "" : "s"}. Run the check and solve them first.`, details: { check } } } };
      }
      return { body: { text, check } };
    }
    case "GET /api/export": {
      // REQ-ARC-003: the archive holds private records. Token only, as an attachment, never cached.
      return { raw: exportArchive(store), headers: { "Content-Disposition": 'attachment; filename="personakit-export.json"' } };
    }
    default:
      return undefined;
  }
}
