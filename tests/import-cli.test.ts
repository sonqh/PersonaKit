// Covers: REQ-ONB-004
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAll } from "../src/core/store.ts";
import { cli, tempStore } from "./helpers.ts";

const CV = "Experience\n- Ran a synthetic ferry ticket desk.\n- Trained two synthetic staff.\n\nSkills\n- Synthetic sign language\n- Calm with upset customers\n";

test("SCN-ONB-004-1 the file becomes proposals", () => {
  const { root, cwd, store } = tempStore();
  const file = join(cwd, "cv.txt");
  writeFileSync(file, CV);
  const r = cli(root, ["import", "text", file, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json().count, 4);
  assert.equal(r.json().proposed.length, 4);
  const records = readAll(store).records;
  assert.equal(records.length, 4);
  assert.ok(records.every((rec) => rec.state === "proposed" && rec.sources[0]!.kind === "cv" && rec.provenance.actor === "cli"));
  assert.deepEqual(records.map((rec) => rec.kind).sort(), ["capability", "capability", "experience", "experience"]);
});

test("SCN-ONB-004-2 one draft that is not valid stops the import", () => {
  const { root, cwd } = tempStore();
  const file = join(cwd, "cv.txt");
  writeFileSync(file, `- A short synthetic line.\n\n${"long ".repeat(500)}\n`);
  const r = cli(root, ["import", "text", file, "--json"]);
  assert.equal(r.code, 6);
  assert.match(r.json().error.message, /draft 2/);
  assert.equal(readdirSync(join(root, "records")).length, 0);
});

test("SCN-ONB-004-3 the output holds no statement text", () => {
  const { root, cwd } = tempStore();
  const file = join(cwd, "cv.txt");
  writeFileSync(file, "- SYNTHETIC-CANARY-7741 sorted mail.\n");
  for (const args of [["import", "text", file], ["import", "text", file, "--json"]]) {
    const r = cli(root, args);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(!r.stdout.includes("CANARY") && !r.stderr.includes("CANARY"));
  }
});

test("import text uses the actor option and refuses a missing file", () => {
  const { root, cwd, store } = tempStore();
  const file = join(cwd, "cv.txt");
  writeFileSync(file, "- Synthetic line.\n");
  assert.equal(cli(root, ["import", "text", file, "--actor", "codex"]).code, 0);
  assert.equal(readAll(store).records[0]!.provenance.actor, "codex");
  assert.equal(cli(root, ["import", "text", join(cwd, "missing.txt")]).code, 5);
  assert.equal(cli(root, ["import", "nothing"]).code, 2);
});
