// Covers: REQ-STO-003, REQ-STO-004, REQ-STO-005, REQ-STO-006, REQ-STO-007
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { doctor, getRecord, ownerAction, propose, readAll, readEvents, setVisibility, update, type ProposeInput } from "../src/core/store.ts";
import { withLocks } from "../src/core/fsutil.ts";
import { REPO } from "./helpers.ts";
import { PersonaKitError } from "../src/core/errors.ts";
import { tempStore } from "./helpers.ts";
import { normalizeStatement } from "../src/core/normalize.ts";

const codex = { actor: "codex" as const, model: "test-model", session: "test-session" };
const owner = { actor: "cli" as const };
const input = (statement: string, extra: Partial<ProposeInput> = {}): ProposeInput => ({
  kind: "capability", statement, sources: [{ kind: "chat" }], user_stated: true, ...extra,
});

import { hostname } from "node:os";
const require_hostname = () => hostname();

function codeOf(fn: () => unknown): string | undefined {
  try { fn(); } catch (e) { return e instanceof PersonaKitError ? e.code : "other"; }
  return undefined;
}

test("SCN-STO-004-1 an agent write creates a proposed, private record with provenance", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Speaks conversational Spanish."), codex);
  assert.equal(record.state, "proposed");
  assert.equal(record.visibility, "private");
  assert.equal(record.revision, 1);
  assert.equal(record.provenance.actor, "codex");
  assert.equal(record.provenance.model, "test-model");
  assert.equal(record.provenance.session, "test-session");
  assert.equal(record.provenance.user_stated, true);
  assert.match(record.provenance.at, /Z$/);
  assert.equal(readEvents(store).events.length, 1);
});

test("only an owner action moves a record to accepted, and accept can set visibility", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Writes clear incident summaries."), codex);
  const r = ownerAction(store, "accept", record.id, { visibility: "ai" }, owner);
  assert.equal(r.record.state, "accepted");
  assert.equal(r.record.visibility, "ai");
  assert.equal(r.record.revision, 2);
});

test("SCN-STO-004-3 state changes follow the rules", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Teaches beginner pottery."), codex);
  assert.equal(codeOf(() => ownerAction(store, "retire", record.id, {}, owner)), "invalid");
  ownerAction(store, "reject", record.id, {}, owner);
  assert.equal(codeOf(() => ownerAction(store, "accept", record.id, {}, owner)), "invalid");
  assert.equal(getRecord(store, record.id).state, "rejected");
});

test("SCN-STO-005-4 accept with a reviewed revision fails when the record changed after review", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Draft one."), codex);
  update(store, record.id, 1, { statement: "Draft two." }, codex);
  assert.equal(codeOf(() => ownerAction(store, "accept", record.id, { expectedRevision: 1 }, owner)), "conflict");
  assert.equal(getRecord(store, record.id).state, "proposed");
});

test("SCN-STO-005-1 a proposed record at the current revision updates in place", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Runs 5 km."), codex);
  const r = update(store, record.id, 1, { statement: "Runs 10 km." }, codex);
  assert.equal(r.outcome, "updated");
  assert.equal(r.conflict, false);
  assert.equal(getRecord(store, record.id).statement, "Runs 10 km.");
  assert.equal(getRecord(store, record.id).revision, 2);
});

test("SCN-STO-005-2 SCN-STO-004-2 an accepted record never changes in place: an update creates a superseding proposal", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Manages a team of 4."), codex);
  ownerAction(store, "accept", record.id, { visibility: "ai" }, owner);
  const before = readFileSync(join(store.root, "records", `${record.id}.json`), "utf8");
  const r = update(store, record.id, 2, { statement: "Manages a team of 6." }, codex);
  assert.equal(r.outcome, "superseding_proposal");
  assert.equal(r.conflict, false);
  assert.deepEqual(r.record.supersedes, [record.id]);
  assert.equal(readFileSync(join(store.root, "records", `${record.id}.json`), "utf8"), before);
  // Accepting the successor retires the old record.
  const a = ownerAction(store, "accept", r.record.id, {}, owner);
  assert.deepEqual(a.side_effects, [{ id: record.id, state: "retired" }]);
  assert.equal(getRecord(store, record.id).state, "retired");
});

test("SCN-STO-005-3 a stale revision reports a conflict, creates a proposal, and leaves the accepted record unchanged", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Lives in Lisbon."), codex);
  ownerAction(store, "accept", record.id, { visibility: "ai" }, owner);
  const before = readFileSync(join(store.root, "records", `${record.id}.json`), "utf8");
  const r = update(store, record.id, 1, { statement: "Lives in Porto." }, codex);
  assert.equal(r.conflict, true);
  assert.equal(r.outcome, "superseding_proposal");
  assert.equal(r.current_revision, 2);
  assert.equal(readFileSync(join(store.root, "records", `${record.id}.json`), "utf8"), before);
});

test("SCN-STO-006-1 SCN-STO-006-2 duplicates are flagged, never merged, and private matches stay hidden from agents", () => {
  const { store } = tempStore();
  const pub = propose(store, input("Speaks Japanese fluently.", { visibility: "ai" }), codex).record;
  const priv = propose(store, input("Has a home studio."), codex).record;
  const d1 = propose(store, input("speaks japanese, fluently!"), codex);
  assert.deepEqual(d1.record.possible_duplicate_of, [pub.id]);
  assert.deepEqual(d1.duplicates.visible, [pub.id]);
  const d2 = propose(store, input("Has a home studio"), codex);
  assert.deepEqual(d2.record.possible_duplicate_of, [priv.id]);
  assert.deepEqual(d2.duplicates.visible, []);
  assert.equal(readAll(store).records.length, 4);
});

test("SCN-STO-006-3 a statement the owner rejected is flagged on the next proposal", () => {
  const { store } = tempStore();
  const first = propose(store, input("Is a certified pilot."), codex).record;
  ownerAction(store, "reject", first.id, {}, owner);
  const again = propose(store, input("Is a certified pilot."), codex);
  assert.deepEqual(again.duplicates.rejected, [first.id]);
});

test("visibility changes write an event and keep the statement", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Prefers async updates."), codex);
  ownerAction(store, "accept", record.id, {}, owner);
  const r = setVisibility(store, record.id, "public", {}, owner);
  assert.equal(r.visibility, "public");
  assert.equal(r.statement, "Prefers async updates.");
  assert.equal(readEvents(store).events.filter((e) => e.record_id === record.id).length, 3);
});

test("SCN-STO-003-2 writes leave no temporary files and doctor reports a clean store", () => {
  const { store } = tempStore();
  for (let i = 0; i < 20; i++) propose(store, input(`Skill number ${i}.`), codex);
  for (const dir of ["records", "events"]) {
    assert.ok(readdirSync(join(store.root, dir)).every((f) => /^[0-9A-Z]{26}\.json$/.test(f)));
  }
  const report = doctor(store);
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.counts.proposed, 20);
});

test("SCN-STO-007-1 doctor detects a forked history after a git merge", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Fork me."), codex);
  ownerAction(store, "accept", record.id, {}, owner);
  // Simulate the other machine: a second event from revision 1.
  const events = readEvents(store).events.filter((e) => e.type === "accepted");
  const copy = { ...events[0]!, id: "01ZZZZZZZZZZZZZZZZZZZZZZZZ", type: "rejected" };
  writeFileSync(join(store.root, "events", `${copy.id}.json`), JSON.stringify(copy));
  const report = doctor(store);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.code === "forked-history"));
});

test("SCN-STO-007-2 doctor reports a record file with git conflict markers", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Conflicted."), codex);
  writeFileSync(join(store.root, "records", `${record.id}.json`), "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> other\n");
  const report = doctor(store);
  assert.ok(report.findings.some((f) => f.code === "bad-record" && f.message.includes("conflict markers")));
});

test("statement normalization ignores case, punctuation, and spacing", () => {
  assert.equal(normalizeStatement("Speaks  Japanese, fluently!"), normalizeStatement("speaks japanese fluently"));
  assert.notEqual(normalizeStatement("Speaks Japanese"), normalizeStatement("Speaks Korean"));
});

test("SCN-STO-004-4 the owner rejects a proposal", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Plays the cello."), codex);
  const r = ownerAction(store, "reject", record.id, {}, owner);
  assert.equal(r.record.state, "rejected");
  assert.equal(readEvents(store).events.filter((e) => e.type === "rejected").length, 1);
});

test("SCN-STO-004-5 accept refuses a second successor of one record", () => {
  const { store } = tempStore();
  const old = propose(store, input("Team of 4."), codex).record;
  ownerAction(store, "accept", old.id, { visibility: "ai" }, owner);
  const a = propose(store, input("Team of 5.", { supersedes: [old.id] }), codex).record;
  const b = propose(store, input("Team of 6.", { supersedes: [old.id] }), codex).record;
  ownerAction(store, "accept", a.id, {}, owner);
  assert.equal(codeOf(() => ownerAction(store, "accept", b.id, {}, owner)), "conflict");
  assert.equal(getRecord(store, b.id).state, "proposed");
  assert.equal(doctor(store).ok, true);
});

function runWorker(root: string, id: string, actor: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(REPO, "tests", "workers", "update-loop.ts"), root, id, "50", actor]);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.pipe(process.stderr);
    child.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

test("SCN-STO-005-5 two processes update one proposal without a lost update", { timeout: 120_000 }, async () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Shared draft."), codex);
  const [a, b] = await Promise.all([runWorker(store.root, record.id, "claude-code"), runWorker(store.root, record.id, "codex")]);
  assert.equal(a.code, 0);
  assert.equal(b.code, 0);
  const inPlace = JSON.parse(a.out).inPlace + JSON.parse(b.out).inPlace;
  const chain = readEvents(store).events.filter((e) => e.record_id === record.id && e.type === "updated").map((e) => e.from_revision).sort((x, y) => x - y);
  // Every in-place update moved the revision by one: a contiguous chain with no gap and no repeat.
  assert.deepEqual(chain, Array.from({ length: inPlace }, (_, i) => i + 1));
  assert.equal(getRecord(store, record.id).revision, inPlace + 1);
  assert.equal(doctor(store).ok, true, JSON.stringify(doctor(store).findings));
});

test("SCN-STO-005-6 a lock from a dead process is removed and a live lock times out", () => {
  const { store } = tempStore();
  const locks = join(store.root, "locks");
  const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
  // A dead process on this host.
  writeFileSync(join(locks, `${id}.lock`), JSON.stringify({ pid: 2 ** 22 + 12345, hostname: require_hostname(), started_at: "x", command: "test" }));
  assert.equal(withLocks(locks, [id], "test", () => "ran", 2000), "ran");
  assert.ok(!existsSync(join(locks, `${id}.lock`)));
  // A live lock (this process) is not stale: the second process waits, then reports a conflict.
  writeFileSync(join(locks, `${id}.lock`), JSON.stringify({ pid: process.pid, hostname: require_hostname(), started_at: "x", command: "test" }));
  assert.throws(() => withLocks(locks, [id], "test", () => "ran", 200), (e: unknown) => e instanceof PersonaKitError && e.code === "conflict");
});

test("SCN-STO-007-3 an interrupted write is an orphan event, not a fork", () => {
  const { store } = tempStore();
  const { record } = propose(store, input("Half written."), codex);
  // Simulate a crash: an event for revision 1 -> 2 whose record change never landed.
  const proposed = readEvents(store).events[0]!;
  const orphan = { ...proposed, id: "01ZZZZZZZZZZZZZZZZZZZZZZZZ", type: "updated", from_revision: 1, to_revision: 2, next_sha256: "a".repeat(64) };
  writeFileSync(join(store.root, "events", `${orphan.id}.json`), JSON.stringify(orphan));
  // The next real update also starts from revision 1.
  update(store, record.id, 1, { statement: "Fully written." }, codex);
  const report = doctor(store);
  assert.ok(report.findings.some((f) => f.code === "orphan-event"));
  assert.ok(!report.findings.some((f) => f.code === "forked-history"));
  const fixed = doctor(store, { fix: true });
  assert.ok(fixed.fixed.some((f) => f.includes("orphan")));
  assert.equal(doctor(store).ok, true);
  assert.ok(existsSync(join(store.root, "events", "orphaned", `${orphan.id}.json`)));
});

test("SCN-STO-007-4 doctor --fix removes old temporary files and stale locks", () => {
  const { store } = tempStore();
  const tmp = join(store.root, "records", ".x.json.1.ab.tmp");
  writeFileSync(tmp, "{");
  const old = (Date.now() - 60 * 60 * 1000) / 1000;
  utimesSync(tmp, old, old);
  mkdirSync(join(store.root, "locks"), { recursive: true });
  writeFileSync(join(store.root, "locks", "01ARZ3NDEKTSV4RRFFQ69G5FAV.lock"), JSON.stringify({ pid: 2 ** 22 + 54321, hostname: require_hostname(), started_at: "x", command: "test" }));
  const before = doctor(store);
  assert.ok(before.findings.some((f) => f.code === "temp-file"));
  assert.ok(before.findings.some((f) => f.code === "stale-lock"));
  const after = doctor(store, { fix: true });
  assert.equal(after.fixed.length, 2);
  assert.ok(!existsSync(tmp));
  assert.equal(doctor(store).findings.length, 0);
});
