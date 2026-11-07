// Covers: REQ-ARC-001, REQ-ARC-002, REQ-ARC-004
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { exportArchive, parseArchive, restoreArchive, validateEvent, ARCHIVE_FORMAT_VERSION } from "../src/core/archive.ts";
import { PersonaKitError } from "../src/core/errors.ts";
import { doctor, openStore, ownerAction, propose, readEvents, update, type Store } from "../src/core/store.ts";
import { tempDir, tempStore } from "./helpers.ts";

const label = { actor: "cli" as const };

function filledStore(): { root: string; store: Store; cwd: string } {
  const s = tempStore();
  const a = propose(s.store, { kind: "experience", statement: "Ran a synthetic bike repair stall.", sources: [{ kind: "manual" }], user_stated: true }, label).record;
  const b = propose(s.store, { kind: "capability", statement: "Speaks synthetic Esperanto.", visibility: "ai", sources: [{ kind: "chat" }], user_stated: false }, label).record;
  propose(s.store, { kind: "intent", statement: "SYNTHETIC-PRIVATE-CANARY wants a quiet job.", sources: [{ kind: "manual" }], user_stated: true }, label);
  ownerAction(s.store, "accept", a.id, { visibility: "public" }, label);
  update(s.store, b.id, 1, { statement: "Speaks synthetic Esperanto well." }, label);
  return s;
}

const emptyTarget = (): { root: string; cwd: string } => {
  const cwd = tempDir();
  return { root: join(cwd, "restored"), cwd };
};

const countFiles = (root: string, dir: string): number => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => f.endsWith(".json")).length : 0);

test("SCN-ARC-001-1 the export is deterministic", () => {
  const { store } = filledStore();
  const first = exportArchive(store);
  const tz = process.env.TZ;
  process.env.TZ = "Pacific/Kiritimati";
  const second = exportArchive(store);
  process.env.TZ = tz;
  assert.equal(first, second);
  const parsed = JSON.parse(first);
  assert.equal(parsed.schema, "personakit.archive/v0");
  assert.equal(parsed.records.length, 3);
  assert.ok(parsed.events.length >= 5);
  assert.ok(!first.includes(store.root), "the archive holds no path");
});

test("SCN-ARC-001-2 an unreadable record stops the export", () => {
  const { store, root } = filledStore();
  writeFileSync(join(root, "records", "01ARZ3NDEKTSV4RRFFQ69G5FAV.json"), "{ not json");
  assert.throws(() => exportArchive(store), (e: unknown) => e instanceof PersonaKitError && e.exitCode === 6 && /01ARZ3NDEKTSV4RRFFQ69G5FAV/.test(e.message));
});

test("validateEvent refuses a bad event", () => {
  assert.deepEqual(validateEvent({ schema: "personakit.event/v0", id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", type: "proposed", record_id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", from_revision: 0, to_revision: 1, actor: "cli", at: "2026-01-01T00:00:00.000Z" }), []);
  assert.ok(validateEvent({ id: "../x" }).length > 3);
});

test("SCN-ARC-002-1 a round trip keeps every byte", () => {
  const { store } = filledStore();
  const archive = exportArchive(store);
  const target = emptyTarget();
  const result = restoreArchive(target.root, archive, { cwd: target.cwd });
  assert.equal(result.records, 3);
  const restored = openStore(target.root, { cwd: target.cwd });
  assert.equal(exportArchive(restored), archive);
  const report = doctor(restored);
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  for (const f of readdirSync(join(target.root, "records"))) {
    assert.equal(statSync(join(target.root, "records", f)).mode & 0o077, 0, "record files are 0600");
  }
});

test("SCN-ARC-002-2 restore refuses a store with data", () => {
  const archive = exportArchive(filledStore().store);
  const other = tempStore();
  propose(other.store, { kind: "capability", statement: "Knits synthetic socks.", sources: [{ kind: "manual" }], user_stated: true }, label);
  const before = readdirSync(join(other.root, "records")).length;
  assert.throws(() => restoreArchive(other.root, archive, { cwd: other.cwd }), (e: unknown) => e instanceof PersonaKitError && e.exitCode === 6 && /not empty/.test(e.message));
  assert.equal(readdirSync(join(other.root, "records")).length, before);
  assert.equal(countFiles(other.root, "events"), 1);
});

test("SCN-ARC-002-3 restore refuses a newer format", () => {
  const archive = JSON.parse(exportArchive(filledStore().store));
  archive.format_version = ARCHIVE_FORMAT_VERSION + 1;
  const target = emptyTarget();
  assert.throws(() => restoreArchive(target.root, JSON.stringify(archive), { cwd: target.cwd }), /Update PersonaKit/);
  assert.equal(existsSync(target.root), false);
});

test("SCN-ARC-002-4 one record that is not valid stops the restore", () => {
  const archive = JSON.parse(exportArchive(filledStore().store));
  archive.records[1].kind = "hobby";
  const target = emptyTarget();
  assert.throws(() => restoreArchive(target.root, JSON.stringify(archive), { cwd: target.cwd }), (e: unknown) => e instanceof PersonaKitError && e.message.includes(archive.records[1].id));
  assert.equal(countFiles(target.root, "records"), 0);
  assert.equal(countFiles(target.root, "events"), 0);
});

test("restore keeps the store.json of the target and writes the archive store.json to a new store", () => {
  const archive = exportArchive(filledStore().store);
  const target = emptyTarget();
  restoreArchive(target.root, archive, { cwd: target.cwd });
  assert.deepEqual(JSON.parse(readFileSync(join(target.root, "store.json"), "utf8")), JSON.parse(archive).store);
});

test("SCN-ARC-004-1 restore refuses a path in an ID", () => {
  for (const where of ["records", "events"] as const) {
    const archive = JSON.parse(exportArchive(filledStore().store));
    archive[where][0].id = "../x";
    const target = emptyTarget();
    assert.throws(() => restoreArchive(target.root, JSON.stringify(archive), { cwd: target.cwd }), /not a ULID/);
    assert.equal(countFiles(target.root, "records"), 0);
    assert.equal(countFiles(target.root, "events"), 0);
    assert.equal(existsSync(join(target.root, "..", "x.json")), false);
  }
});

test("restore refuses an event whose record is not in the archive, and a record without events", () => {
  const archive = JSON.parse(exportArchive(filledStore().store));
  archive.events[0].record_id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
  assert.throws(() => parseArchive(JSON.stringify(archive)), /not in the archive/);
});

test("SCN-ARC-004-2 a stopped restore can finish", () => {
  const archive = exportArchive(filledStore().store);
  const target = emptyTarget();
  assert.throws(() => restoreArchive(target.root, archive, { cwd: target.cwd, afterEvents: () => { throw new Error("synthetic crash"); } }), /synthetic crash/);
  assert.equal(countFiles(target.root, "records"), 0);
  assert.ok(countFiles(target.root, "events") > 0);
  assert.equal(existsSync(join(target.root, "locks", "restore.lock")), false, "the lock is released");
  const second = restoreArchive(target.root, archive, { cwd: target.cwd });
  assert.equal(second.resumed, true);
  assert.equal(second.written.events, 0);
  assert.equal(second.written.records, 3);
  const restored = openStore(target.root, { cwd: target.cwd });
  assert.equal(doctor(restored).ok, true);
  assert.equal(exportArchive(restored), archive);
});

test("SCN-ARC-004-3 a write during a restore fails", () => {
  const { store, root } = tempStore();
  // A live lock: this process holds it.
  writeFileSync(join(root, "locks", "restore.lock"), JSON.stringify({ pid: process.pid, hostname: hostname(), started_at: new Date().toISOString(), command: "restore" }));
  assert.throws(() => propose(store, { kind: "capability", statement: "Juggles.", sources: [{ kind: "manual" }], user_stated: true }, label), (e: unknown) => e instanceof PersonaKitError && e.exitCode === 3);
  assert.equal(countFiles(root, "records"), 0);
  assert.equal(readEvents(store).events.length, 0);
});

test("a stale restore lock does not block writes", () => {
  const { store, root } = tempStore();
  writeFileSync(join(root, "locks", "restore.lock"), JSON.stringify({ pid: 2 ** 22 + 7, hostname: hostname(), started_at: "2020-01-01T00:00:00.000Z", command: "restore" }));
  propose(store, { kind: "capability", statement: "Juggles.", sources: [{ kind: "manual" }], user_stated: true }, label);
  assert.equal(countFiles(root, "records"), 1);
});

test("SCN-ARC-004-4 another archive cannot finish a partial restore", () => {
  const first = exportArchive(filledStore().store);
  const second = exportArchive(filledStore().store);
  const target = emptyTarget();
  assert.throws(() => restoreArchive(target.root, first, { cwd: target.cwd, afterEvents: () => { throw new Error("synthetic crash"); } }));
  const before = readdirSync(join(target.root, "events")).sort();
  assert.throws(() => restoreArchive(target.root, second, { cwd: target.cwd }), /not empty/);
  assert.deepEqual(readdirSync(join(target.root, "events")).sort(), before);
  assert.equal(countFiles(target.root, "records"), 0);
});
