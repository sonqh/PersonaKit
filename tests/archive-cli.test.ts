// Covers: REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, REQ-ARC-004
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, tempDir, tempStore } from "./helpers.ts";

function filled(): { root: string; cwd: string } {
  const s = tempStore();
  for (const st of ["SYNTHETIC-PRIVATE-CANARY-1 likes quiet rooms.", "Ran a synthetic library desk."]) {
    const r = cli(s.root, ["propose", "--kind", "experience", "--statement", st, "--json"]);
    assert.equal(r.code, 0, r.stderr);
  }
  return s;
}

test("SCN-ARC-001-1 the CLI export is deterministic across time zones", () => {
  const { root, cwd } = filled();
  const a = join(cwd, "a.json");
  const b = join(cwd, "b.json");
  assert.equal(cli(root, ["export", "--out", a], { env: { TZ: "UTC" } }).code, 0);
  assert.equal(cli(root, ["export", "--out", b], { env: { TZ: "Asia/Ho_Chi_Minh" } }).code, 0);
  assert.equal(readFileSync(a, "utf8"), readFileSync(b, "utf8"));
  assert.equal(statSync(a).mode & 0o077, 0, "the archive is 0600");
});

test("SCN-ARC-001-2 an unreadable record stops the CLI export", () => {
  const { root, cwd } = filled();
  writeFileSync(join(root, "records", "01ARZ3NDEKTSV4RRFFQ69G5FAV.json"), "nope");
  const out = join(cwd, "a.json");
  const r = cli(root, ["export", "--out", out, "--json"]);
  assert.equal(r.code, 6);
  assert.match(r.json().error.message, /01ARZ3NDEKTSV4RRFFQ69G5FAV/);
  assert.throws(() => statSync(out));
});

test("SCN-ARC-001-3 the export does not overwrite a file", () => {
  const { root, cwd } = filled();
  const out = join(cwd, "a.json");
  writeFileSync(out, "keep me");
  assert.equal(cli(root, ["export", "--out", out]).code, 6);
  assert.equal(readFileSync(out, "utf8"), "keep me");
  assert.equal(cli(root, ["export"]).code, 2);
});

test("SCN-ARC-003-1 the CLI warns after an export", () => {
  const { root, cwd } = filled();
  const r = cli(root, ["export", "--out", join(cwd, "a.json")]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /private records too/);
  assert.ok(!r.stdout.includes("CANARY"));
});

test("SCN-ARC-002-1 import archive restores into a new store and a round trip keeps every byte", () => {
  const { root, cwd } = filled();
  const a = join(cwd, "a.json");
  cli(root, ["export", "--out", a]);
  const target = join(tempDir(), "restored");
  const r = cli(target, ["import", "archive", a, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json().records, 2);
  assert.ok(!r.stdout.includes("CANARY"));
  const b = join(cwd, "b.json");
  assert.equal(cli(target, ["export", "--out", b]).code, 0);
  assert.equal(readFileSync(a, "utf8"), readFileSync(b, "utf8"));
  assert.equal(cli(target, ["doctor", "--json"]).json().ok, true);
});

test("SCN-ARC-002-2 import archive refuses a store with data", () => {
  const src = filled();
  const a = join(src.cwd, "a.json");
  cli(src.root, ["export", "--out", a]);
  const other = filled();
  const before = readdirSync(join(other.root, "records")).sort();
  assert.equal(cli(other.root, ["import", "archive", a]).code, 6);
  assert.deepEqual(readdirSync(join(other.root, "records")).sort(), before);
});

test("SCN-ARC-004-1 import archive refuses a traversal ID", () => {
  const src = filled();
  const a = join(src.cwd, "a.json");
  cli(src.root, ["export", "--out", a]);
  const archive = JSON.parse(readFileSync(a, "utf8"));
  archive.records[0].id = "../x";
  const bad = join(src.cwd, "bad.json");
  writeFileSync(bad, JSON.stringify(archive));
  const target = join(tempDir(), "restored");
  const r = cli(target, ["import", "archive", bad, "--json"]);
  assert.equal(r.code, 6);
  assert.match(r.json().error.message, /not a ULID/);
});
