// Covers: REQ-RES-001, REQ-RES-004, REQ-RES-005
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownerAction, propose, readAll } from "../src/core/store.ts";
import { REPO, cli, fixtureLines, fixtureNames, tempDir, tempStore } from "./helpers.ts";
import { checkSchema } from "./schema-check.ts";

const owner = { actor: "cli" as const };
const SCHEMA = JSON.parse(readFileSync(join(REPO, "tests", "data", "json-resume-schema-v1.0.0.json"), "utf8"));

function fixtureStore(name: string) {
  const t = tempStore();
  for (const line of fixtureLines(name)) {
    const { visibility, ...input } = line;
    const { record } = propose(t.store, input, owner);
    ownerAction(t.store, "accept", record.id, { visibility }, owner);
  }
  return t;
}

test("SCN-RES-001-1 export is valid JSON Resume", () => {
  for (const name of fixtureNames()) {
    const { root } = fixtureStore(name);
    const r = cli(root, ["export", "json-resume"]);
    assert.equal(r.code, 0, r.stderr);
    const doc = JSON.parse(r.stdout);
    assert.deepEqual(checkSchema(SCHEMA, doc), [], name);
    assert.ok(doc.work || doc.skills || doc.education, name);
  }
  // The checker rejects a document that breaks the schema and fails closed on unknown keywords.
  assert.ok(checkSchema(SCHEMA, { work: [{ startDate: "June" }], extra: 1 }).length === 2);
  assert.throws(() => checkSchema({ type: "object", minProperties: 1 } as any, {}), /not implemented/);
  assert.throws(() => checkSchema({ type: "string", format: "hostname" } as any, "x"), /not implemented/);
});

test("SCN-RES-001-2 export is deterministic", () => {
  const { root } = fixtureStore(fixtureNames()[0]!);
  const a = cli(root, ["export", "json-resume"], { env: { TZ: "UTC", LANG: "C", LC_ALL: "C" } }).stdout;
  const b = cli(root, ["export", "json-resume"], { env: { TZ: "Asia/Ho_Chi_Minh", LANG: "vi_VN.UTF-8", LC_ALL: "vi_VN.UTF-8" } }).stdout;
  assert.equal(a, b);
  assert.ok(a.endsWith("}\n"));
  const keys = Object.keys(JSON.parse(a));
  assert.deepEqual(keys, [...keys].sort());
});

test("SCN-RES-001-3 the file is written atomically", () => {
  const { root } = fixtureStore("designer");
  const dir = tempDir();
  const out = join(dir, "resume.json");
  writeFileSync(out, "old content");
  const r = cli(root, ["export", "json-resume", "--out", out, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(readFileSync(out, "utf8"), cli(root, ["export", "json-resume"]).stdout);
  assert.deepEqual(readdirSync(dir), ["resume.json"]);
  const data = r.json();
  assert.equal(data.written, out);
  assert.equal(data.records, data.used.length);
});

const SAMPLE = {
  basics: { name: "Synthetic Person", label: "Synthetic welder", summary: "Welds synthetic frames." },
  work: [{ name: "Spark Works", position: "Welder", startDate: "2019-02", endDate: "2023-03", summary: "Welded bike frames.", highlights: ["Trained two apprentices."] }],
  skills: [{ name: "TIG welding", level: "advanced", keywords: ["steel"] }],
  references: [{ name: "Someone Else" }],
};

test("SCN-RES-004-1 the CLI imports a file as proposals", () => {
  const { root, store } = tempStore();
  const file = join(tempDir(), "resume.json");
  writeFileSync(file, JSON.stringify(SAMPLE));
  const r = cli(root, ["import", "json-resume", file, "--json"]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const data = r.json();
  assert.equal(data.proposed.length, 5);
  assert.deepEqual(data.skipped, ["basics.name", "references"]);
  assert.ok(!r.stdout.includes("Welded"), "the output echoes no statement");
  const records = readAll(store).records;
  assert.ok(records.every((x) => x.state === "proposed" && x.provenance.actor === "cli" && x.sources[0]!.label === data.source_label));
  const text = cli(root, ["import", "json-resume", file]);
  assert.match(text.stdout, /Proposed 5 records/);
  assert.match(text.stdout, /Skipped: basics.name, references/);
});

test("SCN-RES-004-2 the CLI import never accepts", () => {
  const { root } = tempStore();
  const file = join(tempDir(), "resume.json");
  writeFileSync(file, JSON.stringify(SAMPLE));
  cli(root, ["import", "json-resume", file, "--actor", "codex", "--yes"]);
  assert.deepEqual(cli(root, ["list", "--state", "accepted", "--json"]).json().records, []);
});

test("SCN-RES-005-1 a bad file exits 6 and writes nothing", () => {
  const { root, store } = tempStore();
  const dir = tempDir();
  const bad = join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ ...SAMPLE, work: [SAMPLE.work[0], SAMPLE.work[0], { summary: "x", startDate: "2020-13" }] }));
  const r = cli(root, ["import", "json-resume", bad, "--json"]);
  assert.equal(r.code, 6);
  assert.ok(r.json().error.details.problems.some((p: string) => p.startsWith("/work/2/startDate")));
  const invalid = join(dir, "invalid.json");
  writeFileSync(invalid, `{"basics": "SECRET-IMPORT-TEXT`);
  const r2 = cli(root, ["import", "json-resume", invalid, "--json"]);
  assert.equal(r2.code, 6);
  assert.ok(!(r2.stdout + r2.stderr).includes("SECRET-IMPORT-TEXT"));
  const big = join(dir, "big.json");
  writeFileSync(big, " ".repeat(1024 * 1024 + 1));
  assert.equal(cli(root, ["import", "json-resume", big, "--json"]).code, 6);
  assert.equal(cli(root, ["import", "json-resume", join(dir, "missing.json"), "--json"]).code, 5);
  assert.equal(cli(root, ["import", "pdf", bad, "--json"]).code, 2);
  assert.equal(readAll(store).records.length, 0);
});
