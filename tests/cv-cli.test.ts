// Covers: REQ-CV-001, REQ-CV-005, REQ-CV-006, REQ-VIS-002
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownerAction, propose, readAll } from "../src/core/store.ts";
import { buildCvDraft, renderCvMarkdown } from "../src/core/cv.ts";
import { cli, fixtureLines, fixtureNames, tempDir, tempStore } from "./helpers.ts";
import type { ProposeInput } from "../src/core/store.ts";

const owner = { actor: "cli" as const };

function seed(store: Parameters<typeof propose>[0], items: (Partial<ProposeInput> & { statement: string; visibility?: "private" | "ai" | "public" })[]): string[] {
  return items.map((i) => {
    const { visibility, ...rest } = i;
    const { record } = propose(store, { kind: "experience", sources: [{ kind: "interview" }], user_stated: true, ...rest }, owner);
    ownerAction(store, "accept", record.id, { visibility: visibility ?? "public" }, owner);
    return record.id;
  });
}

test("SCN-CV-001-2 the draft is byte-identical across time zones and locales", () => {
  const { root, store } = tempStore();
  seed(store, [
    { statement: "Ran the evening shift.", facets: { organization: "Northwind Transit", period: { start: "2021-03", end: "2023-08" } } },
    { kind: "capability", statement: "Speaks Spanish." },
  ]);
  const a = cli(root, ["cv", "draft"], { env: { TZ: "UTC", LANG: "C", LC_ALL: "C" } }).stdout;
  const b = cli(root, ["cv", "draft"], { env: { TZ: "Asia/Ho_Chi_Minh", LANG: "vi_VN.UTF-8", LC_ALL: "vi_VN.UTF-8" } }).stdout;
  assert.equal(a, b);
  assert.ok(a.startsWith("# CV draft\n"));
  assert.equal(cli(root, ["cv", "draft", "--json"]).stdout, cli(root, ["cv", "draft", "--json"]).stdout);
});

test("SCN-CV-006-1 CRLF line ends and a byte order mark are accepted", () => {
  const { root, store } = tempStore();
  seed(store, [{ statement: "Ran the evening shift." }]);
  const file = join(tempDir(), "cv.md");
  const draft = cli(root, ["cv", "draft"]).stdout;
  writeFileSync(file, "﻿" + draft.replace(/\n/g, "\r\n"));
  const r = cli(root, ["cv", "check", file, "--json"]);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json().ok, true);
  const s = cli(root, ["cv", "strip", file]);
  assert.equal(s.code, 0);
  assert.ok(!s.stdout.includes("\r") && !s.stdout.includes("[pk:"));
});

test("SCN-CV-006-2 a missing file exits 5 and a file over 1 MiB exits 6", () => {
  const { root } = tempStore();
  assert.equal(cli(root, ["cv", "check", join(tempDir(), "nope.md"), "--json"]).code, 5);
  const big = join(tempDir(), "big.md");
  writeFileSync(big, "x".repeat(1024 * 1024 + 1));
  const r = cli(root, ["cv", "check", big, "--json"]);
  assert.equal(r.code, 6);
  assert.match(r.json().error.message, /1 MiB/);
});

test("SCN-CV-006-3 a corrupt record file stops the CV path", () => {
  const { root, store } = tempStore();
  const [id] = seed(store, [{ statement: "Ran the evening shift." }]);
  const file = join(tempDir(), "cv.md");
  writeFileSync(file, cli(root, ["cv", "draft"]).stdout);
  writeFileSync(join(root, "records", `${id}.json`), "{ not json");
  for (const args of [["cv", "draft", "--json"], ["cv", "check", file, "--json"]]) {
    const r = cli(root, args);
    assert.equal(r.code, 6, args.join(" "));
    assert.match(r.json().error.message, /1 record file cannot be read/);
  }
});

test("SCN-CV-005-2 strip with errors prints nothing to stdout and exits 6", () => {
  const { root, store } = tempStore();
  seed(store, [{ statement: "Ran the evening shift." }]);
  const file = join(tempDir(), "cv.md");
  writeFileSync(file, cli(root, ["cv", "draft"]).stdout + "- Invented a new product.\n");
  const r = cli(root, ["cv", "strip", file]);
  assert.equal(r.code, 6);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /missing-citation/);
  const j = cli(root, ["cv", "strip", file, "--json"]);
  assert.equal(j.code, 6);
  assert.equal(j.json().error.code, "invalid");
  assert.ok(!("text" in j.json()), "no CV text on stdout with --json");
});

test("cv strip --json returns the text inside a JSON object", () => {
  const { root, store } = tempStore();
  seed(store, [{ statement: "Ran the evening shift." }]);
  const file = join(tempDir(), "cv.md");
  writeFileSync(file, cli(root, ["cv", "draft"]).stdout + "Alex Example [pk:self]\n");
  const r = cli(root, ["cv", "strip", file, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  const out = r.json();
  assert.ok(out.text.includes("- Ran the evening shift."));
  assert.ok(!out.text.includes("[pk:"));
  assert.equal(out.owner_lines.length, 1);
});

test("SCN-VIS-002-3 cv check never prints record text, also with --json", () => {
  const { root, store } = tempStore();
  const [pub, priv] = seed(store, [
    { statement: "CANARY-PUBLIC-STATEMENT about a role." },
    { statement: "CANARY-PRIVATE-STATEMENT about health.", visibility: "private" },
  ]);
  const file = join(tempDir(), "cv.md");
  writeFileSync(file, `# CV draft\n\n- Worked in a role. [pk:${pub}]\n- Another claim. [pk:${priv}]\n- No marker here.\n`);
  for (const args of [["cv", "check", file], ["cv", "check", file, "--json"], ["cv", "strip", file], ["cv", "strip", file, "--json"]]) {
    const r = cli(root, args);
    assert.equal(r.code, 6, args.join(" "));
    for (const out of [r.stdout, r.stderr]) {
      assert.ok(!out.includes("CANARY"), `"${args.join(" ")}" printed record text`);
    }
  }
});

test("the draft hint counts ai records on stderr and never prints their text", () => {
  const { root, store } = tempStore();
  seed(store, [{ statement: "CANARY-AI-HINT role.", visibility: "ai" }, { statement: "Second ai role.", visibility: "ai" }]);
  const r = cli(root, ["cv", "draft"]);
  assert.equal(r.code, 0);
  assert.match(r.stderr, /2 accepted records have visibility ai/);
  assert.ok(!r.stdout.includes("CANARY") && !r.stderr.includes("CANARY"));
  seed(store, [{ statement: "Public one." }, { statement: "Public two." }, { statement: "Public three." }]);
  assert.equal(cli(root, ["cv", "draft"]).stderr, "", "no hint when the draft has three or more records");
});

for (const name of fixtureNames()) {
  test(`SCN-VIS-002-4 fixture ${name} gives a CV draft with public records only`, () => {
    const { store } = tempStore();
    for (const line of fixtureLines(name)) {
      const { visibility, ...input } = line;
      const { record } = propose(store, input, owner);
      ownerAction(store, "accept", record.id, { visibility }, owner);
    }
    const records = readAll(store).records;
    const md = renderCvMarkdown(buildCvDraft(records));
    assert.ok(!md.includes("CANARY-PRIVATE"), "a private canary reached the CV draft");
    const cited = [...md.matchAll(/\[pk:([0-9A-Z]{26})\]/g)].map((m) => m[1]);
    assert.ok(cited.length > 0);
    for (const id of cited) assert.equal(records.find((r) => r.id === id)?.visibility, "public");
  });
}

test("cv draft --out writes the file", () => {
  const { root, store } = tempStore();
  seed(store, [{ statement: "Ran the evening shift." }]);
  const out = join(tempDir(), "draft.md");
  const r = cli(root, ["cv", "draft", "--out", out, "--json"]);
  assert.equal(r.code, 0);
  assert.equal(r.json().records, 1);
  assert.ok(readFileSync(out, "utf8").includes("[pk:"));
});
