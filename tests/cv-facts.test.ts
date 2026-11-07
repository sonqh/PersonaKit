// Covers: REQ-CV-003, REQ-CV-004, REQ-CV-007
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCvDraft, checkCv, renderCvMarkdown } from "../src/core/cv.ts";
import { ownerAction, propose, readAll } from "../src/core/store.ts";
import type { Facets, PersonaRecord, RecordKind, Visibility } from "../src/core/schema.ts";
import { cli, fixtureLines, fixtureNames, tempDir, tempStore } from "./helpers.ts";

let seq = 0;
function rec(statement: string, facets?: Facets, extra: Partial<PersonaRecord> = {}, kind: RecordKind = "experience"): PersonaRecord {
  seq++;
  const r: PersonaRecord = {
    schema: "personakit.record/v0", id: `01BX5ZZKBKACTAV9WEVGEM${String(seq).padStart(4, "0")}`, kind, statement,
    state: "accepted", visibility: "public" as Visibility, revision: 2, sources: [{ kind: "interview" }],
    provenance: { actor: "cli", at: "2026-01-01T00:00:00.000Z", user_stated: true }, ...extra,
  };
  if (facets) r.facets = facets;
  return r;
}
const codes = (line: string, records: PersonaRecord[]) => checkCv(line, records).findings.map((f) => f.code);

test("SCN-CV-003-1 a wrong year is flagged", () => {
  const r = rec("Ran the night desk.", { period: { start: "2021", end: "2023" } });
  assert.deepEqual(codes(`- Ran the night desk in 2019. [pk:${r.id}]`, [r]), ["year-unsupported"]);
});

test("SCN-CV-003-2 a year in the period passes", () => {
  const r = rec("Ran the night desk.", { period: { start: "2021", end: "2023" } });
  const o = rec("Teaches pottery.", { period: { start: "2021-09", ongoing: true } });
  assert.deepEqual(codes(`- Ran the night desk (2021–2023), mostly 2022. [pk:${r.id}]`, [r]), []);
  assert.deepEqual(codes(`- Teaches pottery since 2021, still in 2026. [pk:${o.id}]`, [o]), []);
  // A year that the cited text contains passes, for example a standard name.
  const iso = rec("Kept the ISO 27001 controls up to date.", { period: { start: "2020", end: "2021" } });
  assert.deepEqual(codes(`- Maintained ISO 27001 controls. [pk:${iso.id}]`, [iso]), []);
});

test("SCN-CV-003-3 an unsupported number or number word is flagged, and 4 does not match 40", () => {
  const r = rec("Trained four new staff.");
  assert.deepEqual(codes(`- Trained 40 new staff. [pk:${r.id}]`, [r]), ["number-unsupported"]);
  assert.deepEqual(codes(`- Trained ten new staff. [pk:${r.id}]`, [r]), ["number-unsupported"]);
  assert.deepEqual(codes(`- Trained 4 new staff. [pk:${r.id}]`, [r]), []);
  const big = rec("Handled 1,200 calls a month.");
  assert.deepEqual(codes(`- Handled 1200 calls a month. [pk:${big.id}]`, [big]), []);
});

for (const name of fixtureNames()) {
  test(`SCN-CV-003-4 the unchanged draft of fixture ${name} has no warning`, () => {
    const { store } = tempStore();
    for (const line of fixtureLines(name)) {
      const { visibility, ...input } = line;
      const { record } = propose(store, input, { actor: "cli" });
      ownerAction(store, "accept", record.id, { visibility }, { actor: "cli" });
    }
    const records = readAll(store).records;
    const res = checkCv(renderCvMarkdown(buildCvDraft(records, "2026-11-07")), records);
    assert.deepEqual(res.findings, []);
  });
}

test("SCN-CV-007-1 an organization from another record is flagged", () => {
  const a = rec("Ran the help desk.", { organization: "Harbor Lane Clinic" });
  const b = rec("Stocked shelves.", { organization: "Kestrel Foods" });
  assert.deepEqual(codes(`- Ran the help desk at Kestrel Foods. [pk:${a.id}]`, [a, b]), ["organization-not-cited"]);
  assert.deepEqual(codes(`- Ran the help desk at Harbor Lane Clinic. [pk:${a.id}]`, [a, b]), []);
});

test("SCN-CV-007-2 substrings and longer names do not match by mistake", () => {
  const arc = rec("Built signs.", { organization: "Arc" });
  const labs = rec("Built kiosks.", { organization: "Arc Labs" });
  assert.deepEqual(codes(`- Built kiosks at Arc Labs and kept the Archive. [pk:${labs.id}]`, [arc, labs]), []);
});

test("SCN-CV-007-3 a private organization is never used", () => {
  const pub = rec("Ran the help desk.", { organization: "Harbor Lane Clinic" });
  const priv = rec("Secret job.", { organization: "Hidden Corp" }, { visibility: "private" });
  assert.deepEqual(codes(`- Ran the help desk with Hidden Corp. [pk:${pub.id}]`, [pub, priv]), []);
});

test("SCN-CV-007-4 an added seniority word is flagged", () => {
  const r = rec("Answered customer chats.", { role: "Support Specialist" });
  assert.deepEqual(codes(`- Senior Support Specialist who answered chats. [pk:${r.id}]`, [r]), ["seniority-unsupported"]);
  assert.deepEqual(codes(`- Support Specialist who answered chats. [pk:${r.id}]`, [r]), []);
  // A role from another record is flagged too.
  const other = rec("Ran the team.", { role: "Team Manager" });
  assert.ok(codes(`- Team Manager who answered chats. [pk:${r.id}]`, [r, other]).includes("role-not-cited"));
});

test("SCN-CV-004-1 an overstated verb is flagged", () => {
  const r = rec("Helped redesign the intake form.", { contribution: "contributed" });
  assert.deepEqual(codes(`- Led the intake form redesign. [pk:${r.id}]`, [r]), ["overstated-ownership"]);
  const o = rec("Built the menu.", { contribution: "led" });
  assert.deepEqual(codes(`- Founded the menu project. [pk:${o.id}]`, [o]), ["overstated-ownership"]);
});

test("SCN-CV-004-2 supported verbs pass, and co-led does not count as led", () => {
  const led = rec("Ran the redesign.", { contribution: "led" });
  const co = rec("Planned the fair.", { contribution: "co-led" });
  const stmt = rec("Store supervisor managing rotas for twelve staff.");
  assert.deepEqual(codes(`- Led the redesign. [pk:${led.id}]`, [led]), []);
  assert.deepEqual(codes(`- Co-led the fair. [pk:${co.id}]`, [co]), []);
  assert.deepEqual(codes(`- Managed rotas for twelve staff. [pk:${stmt.id}]`, [stmt]), []);
  // No contribution level and no verb in the statement: the owner should add the level.
  const none = rec("Worked on the rota.");
  assert.deepEqual(codes(`- Managed the rota. [pk:${none.id}]`, [none]), ["contribution-unknown"]);
  // Known false positive: negation still warns.
  const c = rec("Helped plan.", { contribution: "contributed" });
  assert.deepEqual(codes(`- Did not lead the plan. [pk:${c.id}]`, [c]), ["overstated-ownership"]);
});

test("SCN-CV-004-3 several cited records use the highest level", () => {
  const a = rec("Helped plan.", { contribution: "contributed" });
  const b = rec("Ran the launch.", { contribution: "led" });
  assert.deepEqual(codes(`- Led the launch plan. [pk:${a.id},${b.id}]`, [a, b]), []);
});

test("SCN-CV-004-4 strict mode fails on a warning", () => {
  const { root, store } = tempStore();
  const { record } = propose(store, { kind: "experience", statement: "Helped plan the fair.", facets: { contribution: "contributed" }, sources: [{ kind: "chat" }], user_stated: true }, { actor: "cli" });
  ownerAction(store, "accept", record.id, { visibility: "public" }, { actor: "cli" });
  const dir = tempDir();
  writeFileSync(join(dir, "warn.md"), `- Led the fair. [pk:${record.id}]\n`);
  writeFileSync(join(dir, "clean.md"), cli(root, ["cv", "draft"]).stdout);
  assert.equal(cli(root, ["cv", "check", join(dir, "warn.md")]).code, 0);
  assert.equal(cli(root, ["cv", "check", join(dir, "warn.md"), "--strict", "--json"]).code, 6);
  assert.equal(cli(root, ["cv", "check", join(dir, "clean.md"), "--strict"]).code, 0);
  // Warnings never print record text.
  const out = cli(root, ["cv", "check", join(dir, "warn.md"), "--json"]).stdout;
  assert.ok(!out.includes("Helped plan the fair"));
});
