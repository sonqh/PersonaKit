// The store: the only code that writes personal records. The CLI and later adapters call this module.
// REQ-STO-003 REQ-STO-004 REQ-STO-005 REQ-STO-006 REQ-STO-007

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { stringifyCanonical } from "./canonical.ts";
import { PersonaKitError } from "./errors.ts";
import { TEMP_PATTERN, isLockStale, listFiles, removeStaleLock, replaceFileAtomic, withLocks, writeNewFileAtomic } from "./fsutil.ts";
import { checkStoreLocation } from "./location.ts";
import { normalizeStatement } from "./normalize.ts";
import {
  RECORD_SCHEMA, VISIBILITY_RANK, normalizeRecord, validateRecord,
  type Actor, type Facets, type PersonaRecord, type RecordKind, type Source, type Visibility,
} from "./schema.ts";
import { createUlidFactory, isUlid } from "./ulid.ts";

export const STORE_SCHEMA = "personakit.store/v0";
export const STORE_FORMAT_VERSION = 1;
export const EVENT_SCHEMA = "personakit.event/v0";
const RECORD_FILE = /^[0-9A-HJKMNP-TV-Z]{26}\.json$/;

export type EventType = "proposed" | "updated" | "accepted" | "rejected" | "retired" | "visibility_changed";

export interface PersonaEvent {
  schema: typeof EVENT_SCHEMA;
  id: string;
  type: EventType;
  record_id: string;
  from_revision: number;
  to_revision: number;
  /** sha256 of the record file before the change. Absent for a new record. */
  prior_sha256?: string;
  /** sha256 of the record file after the change. doctor uses it to tell an interrupted write from a fork. */
  next_sha256?: string;
  actor: Actor;
  model?: string;
  session?: string;
  /** Informational. Clocks on two machines can differ, so nothing orders by this value. */
  at: string;
  details?: Record<string, unknown>;
}

export interface ActorLabel {
  actor: Actor;
  model?: string;
  session?: string;
}

export interface StoreOptions {
  now?: () => Date;
  cwd?: string;
  ulid?: () => string;
  /** Skip the location check. Only tests that build fixtures use this. */
  skipLocationCheck?: boolean;
}

export interface Store {
  root: string;
  warning?: string;
  now: () => Date;
  ulid: () => string;
}

const dirs = (root: string) => ({
  records: join(root, "records"),
  events: join(root, "events"),
  locks: join(root, "locks"),
  meta: join(root, "store.json"),
});

function assertLocation(path: string, opts: StoreOptions): { store: string; warning?: string } {
  if (opts.skipLocationCheck) return { store: path };
  const check = checkStoreLocation(path, opts.cwd);
  if (check.refusal) throw new PersonaKitError("unsafeStore", check.refusal, { store: check.store });
  return check.warning ? { store: check.store, warning: check.warning } : { store: check.store };
}

function makeStore(root: string, warning: string | undefined, opts: StoreOptions): Store {
  const now = opts.now ?? (() => new Date());
  const ulid = opts.ulid ?? createUlidFactory(() => now().getTime());
  return warning ? { root, warning, now, ulid } : { root, now, ulid };
}

export interface InitResult {
  root: string;
  created: boolean;
  warning?: string;
}

/** Create the store folders and files. Safe to run again on an existing store. */
export function initStore(path: string, opts: StoreOptions = {}): InitResult {
  const { store, warning } = assertLocation(path, opts);
  const d = dirs(store);
  const created = !existsSync(d.meta);
  for (const dir of [store, d.records, d.events, d.locks]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (created) {
    writeNewFileAtomic(d.meta, stringifyCanonical({ schema: STORE_SCHEMA, format_version: STORE_FORMAT_VERSION }));
  }
  // The store can be a private git repository. Keep JSON as LF and never sync locks or temp files.
  const gitattributes = join(store, ".gitattributes");
  if (!existsSync(gitattributes)) writeNewFileAtomic(gitattributes, "*.json text eol=lf\n");
  const gitignore = join(store, ".gitignore");
  if (!existsSync(gitignore)) writeNewFileAtomic(gitignore, "locks/\n*.tmp\n");
  const result: InitResult = { root: store, created };
  if (warning) result.warning = warning;
  return result;
}

export function openStore(path: string, opts: StoreOptions = {}): Store {
  const { store, warning } = assertLocation(path, opts);
  const meta = dirs(store).meta;
  if (!existsSync(meta)) {
    throw new PersonaKitError("notFound", `No PersonaKit store at ${store}. Run "personakit init" first.`, { store });
  }
  const info = JSON.parse(readFileSync(meta, "utf8")) as { format_version?: number };
  if ((info.format_version ?? 0) > STORE_FORMAT_VERSION) {
    throw new PersonaKitError("invalid", `The store at ${store} uses format ${info.format_version}. This PersonaKit supports format ${STORE_FORMAT_VERSION}. Update PersonaKit.`, { store });
  }
  return makeStore(store, warning, opts);
}

// ---------- reading ----------

export interface ReadProblem {
  file: string;
  message: string;
}

export interface ReadResult {
  records: PersonaRecord[];
  problems: ReadProblem[];
}

function recordPath(store: Store, id: string): string {
  if (!isUlid(id)) throw new PersonaKitError("usage", `"${id}" is not a record ID. A record ID has 26 characters.`);
  return join(dirs(store.root).records, `${id}.json`);
}

function parseRecordFile(path: string): { record?: PersonaRecord; problem?: string; raw: string } {
  const raw = readFileSync(path, "utf8");
  if (/^(<<<<<<<|>>>>>>>|=======)/m.test(raw)) return { raw, problem: "contains git conflict markers" };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { raw, problem: "is not valid JSON" }; }
  const schema = (value as { schema?: unknown })?.schema;
  if (schema !== RECORD_SCHEMA) return { raw, problem: `has unknown schema ${JSON.stringify(schema)}` };
  const issues = validateRecord(value);
  if (issues.length) return { raw, problem: issues.map((i) => `${i.path} ${i.message}`).join("; ") };
  return { raw, record: value as PersonaRecord };
}

export function readAll(store: Store): ReadResult {
  const dir = dirs(store.root).records;
  const records: PersonaRecord[] = [];
  const problems: ReadProblem[] = [];
  for (const file of listFiles(dir, RECORD_FILE)) {
    const { record, problem } = parseRecordFile(join(dir, file));
    if (problem) problems.push({ file: `records/${file}`, message: problem });
    else if (record) {
      if (`${record.id}.json` !== file) problems.push({ file: `records/${file}`, message: "file name does not match the record ID" });
      else records.push(record);
    }
  }
  return { records, problems };
}

export function getRecord(store: Store, id: string): PersonaRecord {
  const path = recordPath(store, id);
  if (!existsSync(path)) throw new PersonaKitError("notFound", `Record ${id} does not exist.`, { record_id: id });
  const { record, problem } = parseRecordFile(path);
  if (!record) throw new PersonaKitError("invalid", `Record ${id} ${problem}. Run "personakit doctor".`, { record_id: id });
  return record;
}

export function readEvents(store: Store): { events: PersonaEvent[]; problems: ReadProblem[] } {
  const dir = dirs(store.root).events;
  const events: PersonaEvent[] = [];
  const problems: ReadProblem[] = [];
  for (const file of listFiles(dir, RECORD_FILE)) {
    try {
      events.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as PersonaEvent);
    } catch {
      problems.push({ file: `events/${file}`, message: "is not valid JSON" });
    }
  }
  return { events, problems };
}

// ---------- writing helpers ----------

/**
 * REQ-ARC-004: a restore holds locks/restore.lock. Writes wait for no one: they fail with the conflict code.
 * A stale lock (dead process on this host, or older than the stale limit) does not block.
 */
export function assertNoRestore(store: Store): void {
  const path = join(dirs(store.root).locks, "restore.lock");
  if (existsSync(path) && !isLockStale(path)) {
    throw new PersonaKitError("conflict", "A restore runs on this store. Try again after it ends. If no restore runs, run \"personakit doctor --fix\".", { lock: "locks/restore.lock" });
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Call under the record lock, before a change. An event that starts from the current file
 * cannot have landed: the file would differ. It is an orphan from an interrupted write, so it
 * moves to events/orphaned/. Then a retry after a crash never looks like a fork.
 */
function sweepOrphans(store: Store, recordId: string, currentContent: string): void {
  const current = sha256(currentContent);
  const dir = dirs(store.root).events;
  for (const e of readEvents(store).events) {
    if (e.record_id !== recordId || e.prior_sha256 !== current || !e.next_sha256 || e.next_sha256 === current) continue;
    mkdirSync(join(dir, "orphaned"), { recursive: true });
    renameSync(join(dir, `${e.id}.json`), join(dir, "orphaned", `${e.id}.json`));
  }
}

function writeEvent(store: Store, e: Omit<PersonaEvent, "schema" | "id" | "at">): PersonaEvent {
  const event: PersonaEvent = { schema: EVENT_SCHEMA, id: store.ulid(), at: store.now().toISOString(), ...e };
  writeNewFileAtomic(join(dirs(store.root).events, `${event.id}.json`), stringifyCanonical(event));
  return event;
}

function assertValid(record: PersonaRecord): PersonaRecord {
  const normalized = normalizeRecord(record);
  const issues = validateRecord(normalized);
  if (issues.length) {
    throw new PersonaKitError("invalid", `The record is not valid: ${issues.map((i) => `${i.path || "record"} ${i.message}`).join("; ")}.`, { issues });
  }
  return normalized;
}

function labelFields(label: ActorLabel): Pick<PersonaEvent, "actor" | "model" | "session"> {
  const out: Pick<PersonaEvent, "actor" | "model" | "session"> = { actor: label.actor };
  if (label.model) out.model = label.model;
  if (label.session) out.session = label.session;
  return out;
}

export interface DuplicateReport {
  /** Every match, private records included. Stored in the proposal; shown only in owner review. */
  all: string[];
  /** Matches an agent may see: accepted or proposed records with visibility ai or public. */
  visible: string[];
  /** Matches with records the owner already rejected. */
  rejected: string[];
  /** Rejected matches an agent may see: visibility ai or public. */
  rejected_visible: string[];
}

export function findDuplicates(records: PersonaRecord[], kind: RecordKind, statement: string, excludeId?: string): DuplicateReport {
  const key = normalizeStatement(statement);
  const all: string[] = [];
  const visible: string[] = [];
  const rejected: string[] = [];
  const rejectedVisible: string[] = [];
  for (const r of records) {
    if (r.id === excludeId || r.kind !== kind || normalizeStatement(r.statement) !== key) continue;
    if (r.state === "rejected") {
      rejected.push(r.id);
      if (VISIBILITY_RANK[r.visibility] >= VISIBILITY_RANK.ai) rejectedVisible.push(r.id);
      continue;
    }
    if (r.state === "retired") continue;
    all.push(r.id);
    if (VISIBILITY_RANK[r.visibility] >= VISIBILITY_RANK.ai) visible.push(r.id);
  }
  return { all: all.sort(), visible: visible.sort(), rejected: rejected.sort(), rejected_visible: rejectedVisible.sort() };
}

// ---------- propose ----------

export interface ProposeInput {
  kind: RecordKind;
  statement: string;
  /** The proposer's suggestion. The owner decides on accept. Default: private. */
  visibility?: Visibility;
  facets?: Facets;
  sources: Source[];
  supersedes?: string[];
  extensions?: Record<string, unknown>;
  user_stated: boolean;
}

export interface ProposeResult {
  record: PersonaRecord;
  duplicates: DuplicateReport;
}

/** Validate a proposal without writing it. Returns readable problems; an empty list means valid. */
export function checkProposal(store: Store, input: ProposeInput, existingIds?: Set<string>): string[] {
  const ids = existingIds ?? new Set(readAll(store).records.map((r) => r.id));
  const problems: string[] = [];
  for (const id of input.supersedes ?? []) if (!ids.has(id)) problems.push(`record ${id} in supersedes does not exist`);
  const draft = {
    schema: RECORD_SCHEMA, id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", kind: input.kind,
    statement: typeof input.statement === "string" ? input.statement.normalize("NFC").trim() : input.statement,
    state: "proposed", visibility: input.visibility ?? "private", revision: 1, sources: input.sources,
    provenance: { actor: "cli", at: "2026-01-01T00:00:00.000Z", user_stated: input.user_stated },
    ...(input.facets ? { facets: input.facets } : {}),
    ...(input.extensions ? { extensions: input.extensions } : {}),
  };
  for (const i of validateRecord(draft)) problems.push(`${i.path || "record"} ${i.message}`);
  return problems;
}

export function propose(store: Store, input: ProposeInput, label: ActorLabel): ProposeResult {
  assertNoRestore(store);
  const { records } = readAll(store);
  for (const id of input.supersedes ?? []) {
    if (!records.some((r) => r.id === id)) throw new PersonaKitError("notFound", `Record ${id} in supersedes does not exist.`, { record_id: id });
  }
  const id = store.ulid();
  const statement = input.statement.normalize("NFC").trim();
  const duplicates = findDuplicates(records, input.kind, statement);
  const provenance: PersonaRecord["provenance"] = { ...labelFields(label), at: store.now().toISOString(), user_stated: input.user_stated };
  const draft: PersonaRecord = {
    schema: RECORD_SCHEMA,
    id,
    kind: input.kind,
    statement,
    state: "proposed",
    visibility: input.visibility ?? "private",
    revision: 1,
    sources: input.sources,
    provenance,
  };
  if (input.facets && Object.keys(input.facets).length) draft.facets = input.facets;
  if (input.supersedes?.length) draft.supersedes = input.supersedes;
  if (duplicates.all.length || duplicates.rejected.length) draft.possible_duplicate_of = [...duplicates.all, ...duplicates.rejected];
  if (input.extensions && Object.keys(input.extensions).length) draft.extensions = input.extensions;
  const record = assertValid(draft);
  const content = stringifyCanonical(record);
  // Commit point for a new record: the event. An event without its record is reported by doctor.
  writeEvent(store, { type: "proposed", record_id: id, from_revision: 0, to_revision: 1, next_sha256: sha256(content), ...labelFields(label) });
  writeNewFileAtomic(recordPath(store, id), content);
  return { record, duplicates };
}

// ---------- batch propose ----------
// REQ-ONB-007

export interface BatchItemResult extends ProposeResult {}

/**
 * Propose several records, all or nothing at the check step.
 * Every input is checked before the first write. Then the inputs are written in input order.
 * A crash can leave the first part of the batch. An unexpected write error lists the IDs written so far.
 */
export function proposeBatch(store: Store, inputs: ProposeInput[], label: ActorLabel): BatchItemResult[] {
  assertNoRestore(store);
  if (inputs.length === 0) throw new PersonaKitError("usage", "The batch has no records.");
  const ids = new Set(readAll(store).records.map((r) => r.id));
  const problems = inputs.flatMap((input, i) => checkProposal(store, input, ids).map((p) => (inputs.length > 1 ? `item ${i + 1}: ${p}` : p)));
  if (problems.length) {
    throw new PersonaKitError("invalid", `Nothing was proposed. ${problems.join("; ")}.`, { problems });
  }
  const results: BatchItemResult[] = [];
  for (const input of inputs) {
    try {
      results.push(propose(store, input, label));
    } catch (err) {
      const written = results.map((r) => r.record.id);
      if (err instanceof PersonaKitError) {
        throw new PersonaKitError(err.code, `${err.message} The batch wrote ${written.length} records before the error.`, { ...err.details, written });
      }
      throw new PersonaKitError("unexpected", `A write failed after ${written.length} records: ${(err as Error).message ?? String(err)}`, { written });
    }
  }
  return results;
}

// ---------- update ----------

export interface UpdatePatch {
  statement?: string;
  visibility?: Visibility;
  facets?: Facets;
  sources?: Source[];
  user_stated?: boolean;
}

export type UpdateOutcome = "updated" | "superseding_proposal";

export interface UpdateResult {
  outcome: UpdateOutcome;
  /** True when the base revision was stale. The CLI exits with the conflict code. */
  conflict: boolean;
  record: PersonaRecord;
  duplicates: DuplicateReport;
  current_revision: number;
}

/**
 * Change a record without losing data.
 * - A proposed record at the expected revision changes in place.
 * - An accepted record never changes. The update becomes a new proposal that supersedes it.
 * - A stale revision never overwrites. The update becomes a new proposal, and conflict is true.
 */
export function update(store: Store, id: string, baseRevision: number, patch: UpdatePatch, label: ActorLabel): UpdateResult {
  assertNoRestore(store);
  return withLocks(dirs(store.root).locks, [id], "update", () => {
    assertNoRestore(store); // again under the lock: a restore can start between the first check and the lock
    const path = recordPath(store, id);
    const current = getRecord(store, id);
    if (current.state === "rejected" || current.state === "retired") {
      throw new PersonaKitError("invalid", `Record ${id} is ${current.state}. Propose a new record instead.`, { record_id: id, state: current.state });
    }
    // Only the owner can raise visibility (accept or the visibility command). Otherwise an agent
    // could make a private record readable through show or list.
    if (patch.visibility && VISIBILITY_RANK[patch.visibility] > VISIBILITY_RANK[current.visibility]) {
      throw new PersonaKitError("invalid", `update cannot raise the visibility of record ${id} from ${current.visibility} to ${patch.visibility}. Only the owner can raise visibility, with accept or the visibility command.`, { record_id: id });
    }
    const conflict = current.revision !== baseRevision;
    if (current.state === "proposed" && !conflict) {
      const { records } = readAll(store);
      const next: PersonaRecord = {
        ...current,
        revision: current.revision + 1,
        statement: patch.statement?.normalize("NFC").trim() ?? current.statement,
        visibility: patch.visibility ?? current.visibility,
        sources: patch.sources ?? current.sources,
        provenance: { ...labelFields(label), at: store.now().toISOString(), user_stated: patch.user_stated ?? current.provenance.user_stated },
      };
      if (patch.facets) next.facets = patch.facets;
      const duplicates = findDuplicates(records, next.kind, next.statement, id);
      delete next.possible_duplicate_of;
      if (duplicates.all.length || duplicates.rejected.length) next.possible_duplicate_of = [...duplicates.all, ...duplicates.rejected];
      const record = assertValid(next);
      const prior = readFileSync(path, "utf8");
      sweepOrphans(store, id, prior);
      const content = stringifyCanonical(record);
      writeEvent(store, { type: "updated", record_id: id, from_revision: current.revision, to_revision: record.revision, prior_sha256: sha256(prior), next_sha256: sha256(content), ...labelFields(label) });
      replaceFileAtomic(path, content);
      return { outcome: "updated", conflict: false, record, duplicates, current_revision: record.revision };
    }
    const input: ProposeInput = {
      kind: current.kind,
      statement: patch.statement ?? current.statement,
      visibility: patch.visibility ?? current.visibility,
      sources: patch.sources ?? current.sources,
      supersedes: [id],
      user_stated: patch.user_stated ?? current.provenance.user_stated,
    };
    const facets = patch.facets ?? current.facets;
    if (facets) input.facets = facets;
    const { record, duplicates } = propose(store, input, label);
    return { outcome: "superseding_proposal", conflict, record, duplicates, current_revision: current.revision };
  });
}

// ---------- owner actions ----------

export type OwnerAction = "accept" | "reject" | "retire";

export interface OwnerActionOptions {
  /** The revision the owner reviewed. A different current revision fails with a conflict. */
  expectedRevision?: number;
  /** Visibility to set on accept. */
  visibility?: Visibility;
}

export interface OwnerActionResult {
  record: PersonaRecord;
  /** Records that changed state because the accepted record supersedes them. */
  side_effects: { id: string; state: PersonaRecord["state"] }[];
}

const TRANSITIONS: Record<OwnerAction, { from: PersonaRecord["state"][]; to: PersonaRecord["state"]; event: EventType }> = {
  accept: { from: ["proposed"], to: "accepted", event: "accepted" },
  reject: { from: ["proposed"], to: "rejected", event: "rejected" },
  retire: { from: ["accepted"], to: "retired", event: "retired" },
};

function writeTransition(store: Store, current: PersonaRecord, changes: Partial<PersonaRecord>, type: EventType, label: ActorLabel, details?: Record<string, unknown>): PersonaRecord {
  const path = recordPath(store, current.id);
  const prior = readFileSync(path, "utf8");
  sweepOrphans(store, current.id, prior);
  const record = assertValid({ ...current, ...changes, revision: current.revision + 1 });
  const content = stringifyCanonical(record);
  const event: Omit<PersonaEvent, "schema" | "id" | "at"> = {
    type, record_id: current.id, from_revision: current.revision, to_revision: record.revision,
    prior_sha256: sha256(prior), next_sha256: sha256(content), ...labelFields(label),
  };
  if (details) event.details = details;
  // Commit point: the event. If the process stops before the rename, doctor reports an orphan event.
  writeEvent(store, event);
  replaceFileAtomic(path, content);
  return record;
}

/** accept, reject, or retire. Only the owner runs these; the CLI asks for confirmation. */
export function ownerAction(store: Store, action: OwnerAction, id: string, opts: OwnerActionOptions, label: ActorLabel): OwnerActionResult {
  assertNoRestore(store);
  const first = getRecord(store, id);
  const lockIds = [id, ...(action === "accept" ? first.supersedes ?? [] : [])];
  return withLocks(dirs(store.root).locks, lockIds, action, () => {
    assertNoRestore(store); // again under the lock
    const current = getRecord(store, id);
    const rule = TRANSITIONS[action];
    if (!rule.from.includes(current.state)) {
      throw new PersonaKitError("invalid", `Cannot ${action} record ${id}: its state is ${current.state}. ${action} needs state ${rule.from.join(" or ")}.`, { record_id: id, state: current.state });
    }
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== current.revision) {
      throw new PersonaKitError("conflict", `Record ${id} changed after you reviewed it (reviewed revision ${opts.expectedRevision}, current revision ${current.revision}). Review it again.`, { record_id: id, current_revision: current.revision });
    }
    if (action === "accept" && current.supersedes?.length) {
      const all = readAll(store).records;
      for (const oldId of current.supersedes) {
        const other = all.find((r) => r.id !== id && r.state === "accepted" && r.supersedes?.includes(oldId));
        if (other) {
          throw new PersonaKitError("conflict", `Cannot accept record ${id}: accepted record ${other.id} already replaces ${oldId}. Reject this proposal, or retire ${other.id} first.`, { record_id: id, successor: other.id });
        }
      }
    }
    const changes: Partial<PersonaRecord> = { state: rule.to };
    if (action === "accept" && opts.visibility) changes.visibility = opts.visibility;
    const record = writeTransition(store, current, changes, rule.event, label);
    const side_effects: OwnerActionResult["side_effects"] = [];
    if (action === "accept") {
      for (const oldId of current.supersedes ?? []) {
        const old = getRecord(store, oldId);
        if (old.state === "accepted") {
          writeTransition(store, old, { state: "retired" }, "retired", label, { superseded_by: id });
          side_effects.push({ id: oldId, state: "retired" });
        } else if (old.state === "proposed") {
          writeTransition(store, old, { state: "rejected" }, "rejected", label, { superseded_by: id });
          side_effects.push({ id: oldId, state: "rejected" });
        }
      }
    }
    return { record, side_effects };
  });
}

/** Change who may see a proposed or accepted record. The statement does not change. */
export function setVisibility(store: Store, id: string, visibility: Visibility, opts: { expectedRevision?: number }, label: ActorLabel): PersonaRecord {
  assertNoRestore(store);
  return withLocks(dirs(store.root).locks, [id], "visibility", () => {
    assertNoRestore(store); // again under the lock
    const current = getRecord(store, id);
    if (current.state !== "proposed" && current.state !== "accepted") {
      throw new PersonaKitError("invalid", `Cannot change the visibility of record ${id}: its state is ${current.state}.`, { record_id: id });
    }
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== current.revision) {
      throw new PersonaKitError("conflict", `Record ${id} changed after you reviewed it (current revision ${current.revision}).`, { record_id: id, current_revision: current.revision });
    }
    if (current.visibility === visibility) return current;
    return writeTransition(store, current, { visibility }, "visibility_changed", label, { from: current.visibility, to: visibility });
  });
}

// ---------- doctor ----------

export interface DoctorFinding {
  level: "error" | "warning";
  code: string;
  message: string;
  file?: string;
  record_id?: string;
}

export interface DoctorReport {
  store: string;
  ok: boolean;
  counts: Record<string, number>;
  findings: DoctorFinding[];
  fixed: string[];
}

export function doctor(store: Store, opts: { fix?: boolean } = {}): DoctorReport {
  const d = dirs(store.root);
  const findings: DoctorFinding[] = [];
  const fixed: string[] = [];
  if (store.warning) findings.push({ level: "warning", code: "store-location", message: store.warning });

  const { records, problems } = readAll(store);
  for (const p of problems) findings.push({ level: "error", code: "bad-record", message: `${p.file} ${p.message}.`, file: p.file });
  const { events, problems: eventProblems } = readEvents(store);
  for (const p of eventProblems) findings.push({ level: "error", code: "bad-event", message: `${p.file} ${p.message}.`, file: p.file });

  // Revision chain. An event is applied when its result is the current file or the input of a later event.
  // Two applied events from one revision mean two machines changed one record (a fork).
  // An event whose result never became a file is an orphan from an interrupted write.
  const byRecord = new Map<string, PersonaEvent[]>();
  for (const e of events) byRecord.set(e.record_id, [...(byRecord.get(e.record_id) ?? []), e]);
  const orphans: PersonaEvent[] = [];
  for (const [recordId, list] of byRecord) {
    const file = join(d.records, `${recordId}.json`);
    const applied = new Set<string>(list.map((e) => e.prior_sha256).filter((h): h is string => Boolean(h)));
    if (existsSync(file)) applied.add(sha256(readFileSync(file, "utf8")));
    const currentSha = existsSync(file) ? sha256(readFileSync(file, "utf8")) : undefined;
    const done = list.filter((e) => !e.next_sha256 || applied.has(e.next_sha256));
    const lost: PersonaEvent[] = [];
    for (const e of list) {
      if (!e.next_sha256 || applied.has(e.next_sha256)) continue;
      // An interrupted write starts from the current file (or from nothing, for a new record).
      // An unapplied event that starts from an older state can be the other side of a git merge:
      // treat it as a fork so that no change is dropped without the owner's review.
      if (e.prior_sha256 === currentSha) orphans.push(e);
      else lost.push(e);
    }
    const seen = new Map<number, number>();
    for (const e of [...done, ...lost]) seen.set(e.from_revision, (seen.get(e.from_revision) ?? 0) + 1);
    for (const [rev, count] of seen) {
      if (count > 1) findings.push({ level: "error", code: "forked-history", record_id: recordId, message: `Record ${recordId} has ${count} changes from revision ${rev}. Two machines changed it. Review the record and retire or re-propose it.` });
    }
  }
  for (const e of orphans) {
    if (opts.fix) {
      mkdirSync(join(d.events, "orphaned"), { recursive: true });
      renameSync(join(d.events, `${e.id}.json`), join(d.events, "orphaned", `${e.id}.json`));
      fixed.push(`moved orphan event ${e.id} to events/orphaned`);
    } else {
      findings.push({ level: "error", code: "orphan-event", record_id: e.record_id, message: `Event ${e.id} for record ${e.record_id} was written, but its record change was not. A write stopped before it finished. Run "personakit doctor --fix" to move the event to events/orphaned.` });
    }
  }
  for (const r of records) {
    if (!byRecord.has(r.id)) findings.push({ level: "warning", code: "no-events", record_id: r.id, message: `Record ${r.id} has no events. It was not written by PersonaKit.` });
  }

  // Supersede rules.
  const supersededBy = new Map<string, string[]>();
  for (const r of records) {
    if (r.state !== "accepted") continue;
    for (const old of r.supersedes ?? []) supersededBy.set(old, [...(supersededBy.get(old) ?? []), r.id]);
  }
  for (const [old, by] of supersededBy) {
    if (by.length > 1) findings.push({ level: "error", code: "multiple-successors", record_id: old, message: `Record ${old} is superseded by more than one accepted record: ${by.sort().join(", ")}. Retire the records you do not want.` });
    const target = records.find((r) => r.id === old);
    if (target?.state === "accepted") findings.push({ level: "error", code: "superseded-still-accepted", record_id: old, message: `Record ${old} is still accepted, but accepted record ${by[0]} supersedes it.` });
  }

  // Leftovers from crashes.
  const now = Date.now();
  for (const dir of [d.records, d.events, store.root]) {
    for (const f of listFiles(dir, TEMP_PATTERN)) {
      const path = join(dir, f);
      const old = now - statSync(path).mtimeMs > 10 * 60 * 1000;
      if (opts.fix && old) { unlinkSync(path); fixed.push(`removed temporary file ${f}`); }
      else findings.push({ level: "warning", code: "temp-file", file: f, message: `Temporary file ${f} remains from an interrupted write.${old ? ' Run "personakit doctor --fix".' : ""}` });
    }
  }
  for (const f of listFiles(d.locks, /\.lock$/)) {
    const path = join(d.locks, f);
    if (isLockStale(path)) {
      if (opts.fix) { if (removeStaleLock(path)) fixed.push(`removed stale lock ${f}`); }
      else findings.push({ level: "warning", code: "stale-lock", file: f, message: `Lock ${f} is stale. Run "personakit doctor --fix".` });
    }
  }
  for (const f of [".gitattributes", ".gitignore"]) {
    if (!existsSync(join(store.root, f))) findings.push({ level: "warning", code: "git-setup", message: `${f} is missing from the store. Run "personakit init" again.` });
  }

  const counts: Record<string, number> = { proposed: 0, accepted: 0, rejected: 0, retired: 0, events: events.length };
  for (const r of records) counts[r.state] = (counts[r.state] ?? 0) + 1;
  return { store: store.root, ok: !findings.some((f) => f.level === "error"), counts, findings, fixed };
}
