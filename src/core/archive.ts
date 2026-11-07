// Portable archive: export the whole store to one canonical JSON file and restore it into an empty store.
// REQ-ARC-001 REQ-ARC-002 REQ-ARC-004

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stringifyCanonical } from "./canonical.ts";
import { PersonaKitError } from "./errors.ts";
import { listFiles, replaceFileAtomic, withLocks, writeNewFileAtomic } from "./fsutil.ts";
import { ACTORS, validateRecord, type PersonaRecord } from "./schema.ts";
import {
  EVENT_SCHEMA, STORE_FORMAT_VERSION, STORE_SCHEMA, initStore, openStore, readAll, readEvents,
  type PersonaEvent, type Store, type StoreOptions,
} from "./store.ts";
import { isUlid } from "./ulid.ts";

export const ARCHIVE_SCHEMA = "personakit.archive/v0";
export const ARCHIVE_FORMAT_VERSION = 1;
export const RESTORE_LOCK_ID = "restore";
const ID_FILE = /^[0-9A-HJKMNP-TV-Z]{26}\.json$/;
const EVENT_TYPES = ["proposed", "updated", "accepted", "rejected", "retired", "visibility_changed"];
const EVENT_KEYS = new Set(["schema", "id", "type", "record_id", "from_revision", "to_revision", "prior_sha256", "next_sha256", "actor", "model", "session", "at", "details"]);
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export interface ArchiveV0 {
  schema: typeof ARCHIVE_SCHEMA;
  format_version: number;
  store: Record<string, unknown>;
  records: PersonaRecord[];
  events: PersonaEvent[];
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Check one event. Returns readable problems; an empty list means valid. */
export function validateEvent(value: unknown): string[] {
  if (!isObject(value)) return ["must be a JSON object"];
  const e = value;
  const problems: string[] = [];
  for (const key of Object.keys(e)) if (!EVENT_KEYS.has(key)) problems.push(`${key} is not a known field`);
  if (e.schema !== EVENT_SCHEMA) problems.push(`schema must be "${EVENT_SCHEMA}"`);
  if (!isUlid(e.id)) problems.push("id must be a ULID");
  if (!isUlid(e.record_id)) problems.push("record_id must be a ULID");
  if (typeof e.type !== "string" || !EVENT_TYPES.includes(e.type)) problems.push(`type must be one of ${EVENT_TYPES.join(", ")}`);
  if (!Number.isInteger(e.from_revision) || (e.from_revision as number) < 0) problems.push("from_revision must be an integer of 0 or more");
  if (!Number.isInteger(e.to_revision) || e.to_revision !== (e.from_revision as number) + 1) problems.push("to_revision must be from_revision + 1");
  for (const key of ["prior_sha256", "next_sha256"]) {
    if (e[key] !== undefined && (typeof e[key] !== "string" || !SHA256.test(e[key] as string))) problems.push(`${key} must be a sha256 hex digest`);
  }
  if (typeof e.actor !== "string" || !(ACTORS as readonly string[]).includes(e.actor)) problems.push(`actor must be one of ${ACTORS.join(", ")}`);
  for (const key of ["model", "session"]) {
    if (e[key] !== undefined && (typeof e[key] !== "string" || (e[key] as string).length > 200)) problems.push(`${key} must be a short string`);
  }
  if (typeof e.at !== "string" || !ISO_TIMESTAMP.test(e.at)) problems.push("at must be a UTC ISO timestamp");
  if (e.details !== undefined && !isObject(e.details)) problems.push("details must be an object");
  return problems;
}

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Build the archive text. The same store gives the same bytes: no time, host, or path. */
export function exportArchive(store: Store): string {
  const { records, problems } = readAll(store);
  if (problems.length) {
    throw new PersonaKitError("invalid", `Nothing was exported. ${problems.map((p) => `${p.file} ${p.message}`).join("; ")}. Run "personakit doctor".`, { files: problems.map((p) => p.file) });
  }
  const { events, problems: eventProblems } = readEvents(store);
  const bad = [
    ...eventProblems.map((p) => `${p.file} ${p.message}`),
    ...events.flatMap((e) => validateEvent(e).map((m) => `events/${String((e as { id?: unknown }).id)}.json ${m}`)),
  ];
  if (bad.length) throw new PersonaKitError("invalid", `Nothing was exported. ${bad.join("; ")}. Run "personakit doctor".`, { problems: bad });
  const meta = JSON.parse(readFileSync(join(store.root, "store.json"), "utf8")) as Record<string, unknown>;
  const archive: ArchiveV0 = {
    schema: ARCHIVE_SCHEMA,
    format_version: ARCHIVE_FORMAT_VERSION,
    store: meta,
    records: [...records].sort(byId),
    events: [...events].sort(byId),
  };
  return stringifyCanonical(archive);
}

/** Parse and check an archive. Every check runs before the first write. */
export function parseArchive(text: string): ArchiveV0 {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^﻿/u, "")); } catch {
    throw new PersonaKitError("invalid", "The archive is not valid JSON.");
  }
  if (!isObject(value) || value.schema !== ARCHIVE_SCHEMA) {
    throw new PersonaKitError("invalid", `The file is not a PersonaKit archive. The schema must be "${ARCHIVE_SCHEMA}".`);
  }
  const fv = value.format_version;
  if (!Number.isInteger(fv) || (fv as number) < 1) throw new PersonaKitError("invalid", "The archive has no valid format_version.");
  if ((fv as number) > ARCHIVE_FORMAT_VERSION) {
    throw new PersonaKitError("invalid", `The archive uses format ${fv}. This PersonaKit supports format ${ARCHIVE_FORMAT_VERSION}. Update PersonaKit.`, { format_version: fv });
  }
  const meta = value.store;
  if (!isObject(meta) || meta.schema !== STORE_SCHEMA || !Number.isInteger(meta.format_version)) {
    throw new PersonaKitError("invalid", `The archive store must have the schema "${STORE_SCHEMA}" and a format_version.`);
  }
  if ((meta.format_version as number) > STORE_FORMAT_VERSION) {
    throw new PersonaKitError("invalid", `The archive holds a store of format ${meta.format_version}. This PersonaKit supports format ${STORE_FORMAT_VERSION}. Update PersonaKit.`);
  }
  if (!Array.isArray(value.records) || !Array.isArray(value.events)) {
    throw new PersonaKitError("invalid", "The archive must hold a records array and an events array.");
  }
  const problems: string[] = [];
  const recordIds = new Set<string>();
  const records = value.records as unknown[];
  const events = value.events as unknown[];
  records.forEach((r, i) => {
    const id = isObject(r) ? r.id : undefined;
    // The ID becomes a file name. Check its form before anything else uses it.
    if (!isUlid(id)) return void problems.push(`records[${i}] has an ID that is not a ULID`);
    if (recordIds.has(id)) problems.push(`record ${id} appears twice`);
    recordIds.add(id);
    for (const issue of validateRecord(r)) problems.push(`record ${id}: ${issue.path || "record"} ${issue.message}`);
  });
  const eventIds = new Set<string>();
  const reach = new Map<string, number>();
  events.forEach((e, i) => {
    const id = isObject(e) ? e.id : undefined;
    if (!isUlid(id)) return void problems.push(`events[${i}] has an ID that is not a ULID`);
    if (eventIds.has(id)) problems.push(`event ${id} appears twice`);
    eventIds.add(id);
    const issues = validateEvent(e);
    for (const m of issues) problems.push(`event ${id}: ${m}`);
    if (issues.length) return;
    const ev = e as unknown as PersonaEvent;
    if (!recordIds.has(ev.record_id)) problems.push(`event ${id}: record ${ev.record_id} is not in the archive`);
    reach.set(ev.record_id, Math.max(reach.get(ev.record_id) ?? 0, ev.to_revision));
  });
  for (const r of records as PersonaRecord[]) {
    if (!isUlid(r?.id) || !Number.isInteger(r.revision)) continue;
    const top = reach.get(r.id);
    if (top === undefined) problems.push(`record ${r.id} has no events`);
    else if (top < r.revision) problems.push(`record ${r.id} has revision ${r.revision}, but its events reach revision ${top}`);
  }
  if (problems.length) {
    throw new PersonaKitError("invalid", `Nothing was restored. ${problems.join("; ")}.`, { problems });
  }
  return value as unknown as ArchiveV0;
}

export interface RestoreOptions extends StoreOptions {
  /** Test hook: runs after the event phase and before the record phase. */
  afterEvents?: () => void;
}

export interface RestoreResult {
  root: string;
  records: number;
  events: number;
  written: { records: number; events: number };
  resumed: boolean;
}

/**
 * Restore an archive into an empty store, or finish a restore that stopped.
 * The store may hold only files that equal their archive copy. Events go first, records last.
 */
export function restoreArchive(path: string, text: string, opts: RestoreOptions = {}): RestoreResult {
  const archive = parseArchive(text);
  const existed = existsSync(join(path, "store.json"));
  const init = initStore(path, opts);
  const meta = join(init.root, "store.json");
  // Keep the store.json of the target. A new store gets the store.json of the archive.
  if (!existed) replaceFileAtomic(meta, stringifyCanonical(archive.store));
  const store = openStore(init.root, opts);
  return withLocks(join(store.root, "locks"), [RESTORE_LOCK_ID], "restore", () => {
    const want = {
      events: new Map(archive.events.map((e) => [e.id, stringifyCanonical(e)])),
      records: new Map(archive.records.map((r) => [r.id, stringifyCanonical(r)])),
    };
    let resumed = false;
    for (const kind of ["events", "records"] as const) {
      const dir = join(store.root, kind);
      for (const file of listFiles(dir, ID_FILE)) {
        const id = file.slice(0, -5);
        const expected = want[kind].get(id);
        if (expected === undefined || readFileSync(join(dir, file), "utf8") !== expected) {
          throw new PersonaKitError("invalid", `The store at ${store.root} is not empty. ${kind}/${file} is not part of this archive. Restore needs an empty store.`, { store: store.root, file: `${kind}/${file}` });
        }
        resumed = true;
      }
    }
    const written = { records: 0, events: 0 };
    for (const kind of ["events", "records"] as const) {
      const dir = join(store.root, kind);
      for (const [id, content] of [...want[kind]].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const target = join(dir, `${id}.json`);
        if (existsSync(target)) continue;
        writeNewFileAtomic(target, content);
        written[kind] += 1;
      }
      if (kind === "events") opts.afterEvents?.();
    }
    return { root: store.root, records: archive.records.length, events: archive.events.length, written, resumed };
  });
}
