// Covers: REQ-CV-008, REQ-CV-010, REQ-CV-011, REQ-CV-012
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownerAction, propose, readAll } from "../src/core/store.ts";
import { buildTailoredDraft, matchJob, parseJob } from "../src/core/cv-job.ts";
import { renderCvMarkdown } from "../src/core/cv.ts";
import { cli, tempDir, tempStore } from "./helpers.ts";
import type { ProposeInput, Store } from "../src/core/store.ts";

const owner = { actor: "cli" as const };

function seed(store: Store, items: (Partial<ProposeInput> & { statement: string })[]): string[] {
  return items.map((i) => {
    const { record } = propose(store, { kind: "experience", sources: [{ kind: "interview" }], user_stated: true, ...i }, owner);
    ownerAction(store, "accept", record.id, { visibility: "public" }, owner);
    return record.id;
  });
}

function setup() {
  const { root, store } = tempStore();
  const [who, a, b, c] = seed(store, [
    { kind: "identity", statement: "Sam is an office clerk." },
    { statement: "Did the bookkeeping for 40 small clients.", facets: { period: { start: "2022" } } },
    { statement: "Ran payroll and invoicing for clients.", facets: { period: { start: "2020", end: "2021" } } },
    { statement: "Painted fences in summer.", facets: { period: { start: "2018", end: "2018" } } },
  ]);
  const dir = tempDir();
  const job = join(dir, "jd.txt");
  const text = "# Office clerk\nRequirements:\n- Bookkeeping for small clients\n- Payroll and invoicing\n- Forklift licence\n";
  writeFileSync(job, text);
  return { root, store, dir, job, text, ids: { who: who!, a: a!, b: b!, c: c! } };
}

function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

test("SCN-CV-011-1 the CLI prints the report", () => {
  const { root, job, ids } = setup();
  const r = cli(root, ["cv", "match", "--job", job, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  const m = r.json();
  assert.equal(m.schema, "personakit.cv-match/v0");
  // "Bookkeeping for small clients" has three terms, so one shared term ("client") links the payroll record too.
  assert.deepEqual(m.requirements.map((q: { ids: string[] }) => q.ids), [[ids.a, ids.b], [ids.b], []]);
  assert.deepEqual(m.gaps, [3]);
  assert.deepEqual(m.unused, [ids.who, ids.c].sort());
  const t = cli(root, ["cv", "match", "--job", job]);
  assert.equal(t.code, 0);
  assert.match(t.stdout, /shares words with/);
  assert.match(t.stdout, /no record shares enough words/);
});

test("SCN-CV-011-2 SCN-CV-010-1 the CLI writes a tailored draft from a file or stdin", () => {
  const { root, store, dir, job, text, ids } = setup();
  const expected = renderCvMarkdown(buildTailoredDraft(readAll(store).records, matchJob(parseJob(text), readAll(store).records)).draft);
  const out1 = join(dir, "cv1.md");
  const r1 = cli(root, ["cv", "draft", "--job", job, "--out", out1]);
  assert.equal(r1.code, 0, r1.stderr);
  assert.equal(readFileSync(out1, "utf8"), expected);
  assert.ok(!expected.includes(ids.c));
  assert.match(r1.stderr, new RegExp(`Left out 1 record that share no words with the job text: ${ids.c}\\.`));
  assert.match(r1.stderr, /personakit cv match --job/);
  const out2 = join(dir, "cv2.md");
  const r2 = cli(root, ["cv", "draft", "--job", "-", "--out", out2], { input: text });
  assert.equal(r2.code, 0, r2.stderr);
  assert.equal(readFileSync(out2, "utf8"), expected);
  const j = cli(root, ["cv", "draft", "--job", job, "--json"]);
  assert.equal(j.code, 0);
  assert.deepEqual(Object.keys(j.json()).sort(), ["draft", "match"]);
  assert.equal(j.json().draft.schema, "personakit.cv-draft/v0");
});

test("SCN-CV-011-4 bad job input is refused", () => {
  const { root, dir } = setup();
  const empty = join(dir, "empty.txt");
  writeFileSync(empty, "");
  const big = join(dir, "big.txt");
  writeFileSync(big, "é".repeat(32_768) + "x");
  assert.equal(statSync(big).size, 65_537);
  for (const file of [join(dir, "missing.txt"), empty, big]) {
    const out = join(dir, "never.md");
    const r = cli(root, ["cv", "draft", "--job", file, "--out", out]);
    assert.equal(r.code, 2, `${file}: ${r.stderr}`);
    assert.ok(!existsSync(out));
  }
  assert.equal(cli(root, ["cv", "match"]).code, 2);
  assert.equal(cli(root, ["cv", "match", "--job", "-"], { input: "é".repeat(32_768) + "x" }).code, 2);
});

test("SCN-CV-008-3 the job text is never stored or printed to stderr", () => {
  const { root, job, dir } = setup();
  const marker = "QZXMARKER4242";
  writeFileSync(job, `- Bookkeeping for small clients ${marker}\n- ${marker} forklift\n`);
  const r1 = cli(root, ["cv", "draft", "--job", job, "--out", join(dir, "cv.md")]);
  const r2 = cli(root, ["cv", "match", "--job", job]);
  const r3 = cli(root, ["cv", "match", "--job", "-"], { input: `# ${marker}\n` });
  for (const r of [r1, r2, r3]) assert.ok(!r.stderr.includes(marker));
  for (const f of allFiles(root)) assert.ok(!readFileSync(f, "utf8").includes(marker), f);
});

test("SCN-CV-008-4 SCN-CV-010-4 the job output is byte-identical across time zones and locales", () => {
  const { root, job } = setup();
  const envs = [{ TZ: "UTC", LANG: "C", LC_ALL: "C" }, { TZ: "Asia/Ho_Chi_Minh", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8" }];
  for (const args of [["cv", "match", "--job", job, "--json"], ["cv", "draft", "--job", job]]) {
    const [a, b] = envs.map((env) => cli(root, args, { env }).stdout);
    assert.ok(a!.length > 0);
    assert.equal(a, b);
  }
});
