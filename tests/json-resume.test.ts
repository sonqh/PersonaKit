// Covers: REQ-RES-002, REQ-RES-003, REQ-RES-004, REQ-RES-005
import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerAction, propose, readAll, type ActorLabel, type ProposeInput } from "../src/core/store.ts";
import { buildJsonResume, planJsonResumeImport, pointerKey } from "../src/core/json-resume.ts";
import { importJsonResume } from "../src/app/operations.ts";
import { PersonaKitError } from "../src/core/errors.ts";
import { tempStore } from "./helpers.ts";

const owner = { actor: "cli" as const };
type Seed = Partial<ProposeInput> & { statement: string; visibility?: "private" | "ai" | "public"; state?: "accepted" | "rejected" | "proposed" | "retired" };

function seed(store: Parameters<typeof propose>[0], items: Seed[]): string[] {
  return items.map((i) => {
    const { visibility, state, ...rest } = i;
    const { record } = propose(store, { kind: "experience", sources: [{ kind: "interview" }], user_stated: true, ...rest }, owner);
    if (state === "proposed") return record.id;
    if (state === "rejected") { ownerAction(store, "reject", record.id, {}, owner); return record.id; }
    ownerAction(store, "accept", record.id, { visibility: visibility ?? "public" }, owner);
    if (state === "retired") ownerAction(store, "retire", record.id, {}, owner);
    return record.id;
  });
}

test("SCN-RES-002-1 records go to their sections", () => {
  const { store } = tempStore();
  const [id, job, edu, cert, cap, brk] = seed(store, [
    { kind: "identity", statement: "A synthetic baker who trains apprentices." },
    { statement: "Ran the early shift at a synthetic bakery.", facets: { type: "employment", organization: "Crumb & Co", role: "Shift Lead", period: { start: "2019-04", end: "2022-01" } } },
    { statement: "Pastry arts", facets: { type: "education", organization: "Synthetic Culinary School", role: "Diploma", period: { start: "2016", end: "2018" } } },
    { statement: "Food hygiene level 2", facets: { type: "credential", organization: "Synthetic Safety Board", issued_on: "2023-03-01", expires_on: "2026-03-01" } },
    { kind: "capability", statement: "Laminates dough by hand.", facets: { level: "advanced", tags: ["pastry"] } },
    { statement: "Cared for a family member.", facets: { type: "career_break", period: { start: "2022-02", end: "2022-09" } } },
  ]);
  const r = buildJsonResume(readAll(store).records);
  assert.deepEqual(r.document.basics, { summary: "A synthetic baker who trains apprentices." });
  assert.deepEqual(r.document.work, [{ name: "Crumb & Co", position: "Shift Lead", startDate: "2019-04", endDate: "2022-01", summary: "Ran the early shift at a synthetic bakery." }]);
  assert.deepEqual(r.document.education, [{ institution: "Synthetic Culinary School", studyType: "Diploma", area: "Pastry arts", startDate: "2016", endDate: "2018" }]);
  assert.deepEqual(r.document.certificates, [{ name: "Food hygiene level 2", issuer: "Synthetic Safety Board", date: "2023-03-01" }]);
  assert.deepEqual(r.document.skills, [{ name: "Laminates dough by hand.", level: "advanced" }]);
  assert.deepEqual(r.used, [id, job, edu, cert, cap]);
  assert.equal(r.career_breaks, 1);
  assert.ok(!JSON.stringify(r.document).includes(brk!));
});

test("SCN-RES-002-2 dates keep their precision", () => {
  const { store } = tempStore();
  seed(store, [
    { statement: "Job A.", facets: { period: { start: "2021", end: "2021" } } },
    { statement: "Job B.", facets: { period: { start: "2021-06", end: "2021-08" } } },
    { statement: "Job C.", facets: { period: { start: "2021-06-15", end: "2021-07-01" } } },
    { statement: "Job D.", facets: { period: { start: "2023-01", ongoing: true } } },
    { statement: "Cert with a month.", facets: { type: "credential", issued_on: "2024-05" } },
  ]);
  const doc = buildJsonResume(readAll(store).records).document as any;
  assert.deepEqual(doc.work.map((w: any) => [w.summary, w.startDate, w.endDate]), [
    ["Job D.", "2023-01", undefined], ["Job C.", "2021-06-15", "2021-07-01"], ["Job B.", "2021-06", "2021-08"], ["Job A.", "2021", "2021"],
  ]);
  assert.ok(!("endDate" in doc.work[0]));
  assert.deepEqual(doc.certificates, [{ name: "Cert with a month." }]);
});

test("SCN-RES-003-1 private and ai canaries stay out", () => {
  const { store } = tempStore();
  seed(store, [
    { statement: "Public job.", facets: { organization: "Open Org" } },
    { statement: "RES-CANARY-1 private job.", visibility: "private" },
    { statement: "RES-CANARY-2 ai job.", visibility: "ai" },
    { kind: "intent", statement: "RES-CANARY-3 wants a job." },
    { kind: "preference", statement: "RES-CANARY-4 short replies." },
    { statement: "RES-CANARY-5 rejected.", state: "rejected" },
    { statement: "RES-CANARY-6 retired.", state: "retired" },
    { statement: "RES-CANARY-7 proposed.", state: "proposed" },
    { kind: "identity", statement: "RES-CANARY-8 private identity.", visibility: "private" },
  ]);
  const text = JSON.stringify(buildJsonResume(readAll(store).records));
  assert.ok(!/RES-CANARY/.test(text), text);
  assert.match(text, /Public job/);
});

test("SCN-RES-003-2 hidden fields stay out", () => {
  const { store } = tempStore();
  seed(store, [{
    statement: "Public job.",
    sources: [{ kind: "document", ref: "/home/someone/RES-HIDDEN-1.pdf", label: "RES-HIDDEN-2", excerpt: "RES-HIDDEN-3" }],
    facets: { organization: "Open Org", location: "RES-HIDDEN-4", tags: ["RES-HIDDEN-5"], scope: ["RES-HIDDEN-6"], contribution: "led" },
    extensions: { "org.example.note": "RES-HIDDEN-7" },
  }]);
  const text = JSON.stringify(buildJsonResume(readAll(store).records).document);
  assert.ok(!/RES-HIDDEN/.test(text), text);
  assert.ok(!/"(cli|interview|document|led)"/.test(text), text);
});

const sample = () => ({
  $schema: "https://example.org/schema.json",
  basics: { name: "Synthetic Person", email: "synthetic@example.org", label: "Synthetic florist", summary: "Arranges synthetic flowers.", location: { city: "Nowhere" } },
  work: [{ name: "Petal Shop", position: "Florist", startDate: "2020-01", endDate: "2022-12", summary: "Made arrangements.", highlights: ["Ran the wedding orders."] },
    { name: "Stem Studio", position: "Lead", startDate: "2023-01" }],
  education: [{ institution: "Synthetic College", area: "Horticulture", studyType: "Certificate", startDate: "2018", endDate: "2019" }],
  certificates: [{ name: "Synthetic plant care", issuer: "Synthetic Board", date: "2021-05-04" }],
  skills: [{ name: "Floral design", level: "expert", keywords: ["bouquets", "wreaths"] }],
  languages: [{ language: "Synthetic English", fluency: "native" }],
  references: [{ name: "Another Person", reference: "Good." }],
  interests: [{ name: "Gardens" }],
});

test("SCN-RES-004-1 a file becomes proposals", () => {
  const { store } = tempStore();
  const r = importJsonResume(store, Buffer.from(JSON.stringify(sample())));
  assert.deepEqual(r.proposed.map((p) => p.from), [
    "/basics/label", "/basics/summary", "/work/0", "/work/0/highlights/0", "/work/1", "/education/0", "/certificates/0", "/skills/0", "/languages/0",
  ]);
  const records = readAll(store).records;
  assert.equal(records.length, 9);
  for (const rec of records) {
    assert.equal(rec.state, "proposed");
    assert.equal(rec.visibility, "private");
    assert.equal(rec.provenance.actor, "cli");
    assert.equal(rec.provenance.user_stated, true);
    assert.equal(rec.sources[0]!.kind, "import");
  }
  const byStatement = (s: string) => records.find((x) => x.statement === s)!;
  assert.deepEqual(byStatement("Made arrangements.").facets, { type: "employment", organization: "Petal Shop", role: "Florist", period: { start: "2020-01", end: "2022-12" } });
  assert.deepEqual(byStatement("Florist".replace("Florist", "Lead, Stem Studio")).facets?.period, { start: "2023-01", ongoing: true });
  assert.deepEqual(byStatement("Synthetic plant care").facets, { type: "credential", organization: "Synthetic Board", issued_on: "2021-05-04" });
  assert.deepEqual(byStatement("Floral design").facets, { level: "expert", tags: ["bouquets", "wreaths"] });
});

test("SCN-RES-004-2 import never accepts", () => {
  const { store } = tempStore();
  importJsonResume(store, Buffer.from(JSON.stringify(sample())));
  assert.equal(readAll(store).records.filter((r) => r.state !== "proposed").length, 0);
});

test("SCN-RES-004-3 the output lists skipped sections", () => {
  const { store } = tempStore();
  const r = importJsonResume(store, Buffer.from(JSON.stringify(sample())));
  assert.deepEqual(r.skipped, ["basics.name", "basics.email", "basics.location", "interests", "references"]);
  const text = JSON.stringify(readAll(store).records);
  for (const v of ["Synthetic Person", "synthetic@example.org", "Nowhere", "Another Person", "Gardens"]) assert.ok(!text.includes(v), v);
});

test("SCN-RES-004-4 one file gives one source label", () => {
  const { store } = tempStore();
  const bytes = Buffer.from(JSON.stringify(sample()));
  const a = importJsonResume(store, bytes);
  const b = importJsonResume(store, bytes);
  assert.match(a.source_label, /^json-resume:[0-9a-f]{12}$/);
  assert.equal(a.source_label, b.source_label);
  const labels = new Set(readAll(store).records.map((r) => r.sources[0]!.label));
  assert.deepEqual([...labels], [a.source_label]);
});

function importProblems(store: Parameters<typeof propose>[0], doc: unknown): string[] {
  try {
    importJsonResume(store, Buffer.from(typeof doc === "string" ? doc : JSON.stringify(doc)));
  } catch (err) {
    assert.ok(err instanceof PersonaKitError);
    assert.equal(err.exitCode, 6);
    return err.details.problems as string[];
  }
  assert.fail("the import did not fail");
}

test("SCN-RES-005-1 one bad item stops the import", () => {
  const { store } = tempStore();
  const doc = sample();
  doc.work.push({ name: "A", summary: "Ok.", startDate: "2021" } as any, { name: "B", summary: "Bad.", startDate: "2021-13" } as any);
  const p = importProblems(store, { ...doc, work: [doc.work[0], doc.work[1], doc.work[3]] });
  assert.ok(p.some((x) => x.startsWith("/work/2/startDate ")), p.join("|"));
  const p2 = importProblems(store, { work: [{}, {}, { summary: "x", startDate: "June" }] });
  assert.deepEqual(p2, ["/work/2/startDate must be a date as YYYY, YYYY-MM, or YYYY-MM-DD"]);
  assert.equal(readAll(store).records.length, 0);
});

test("SCN-RES-005-2 problems do not quote the file", () => {
  const { store } = tempStore();
  const C = "IMPORT-CANARY-55";
  const cases: unknown[] = [
    `{"work": [ "${C}" `,
    { [C]: 1, work: [{ name: C.repeat(20), summary: `${C}\u0007`, startDate: C, highlights: [C, 5], [C]: C }] },
    { skills: [{ name: C, keywords: [C, { [C]: 1 }] }], basics: { label: 5 } },
  ];
  for (const doc of cases) {
    const p = importProblems(store, doc);
    assert.ok(p.length > 0);
    assert.ok(!p.join("\n").includes(C), p.join("\n"));
  }
  assert.equal(readAll(store).records.length, 0);
});

test("SCN-RES-005-3 too many proposals stop the import", () => {
  const { store } = tempStore();
  const p = importProblems(store, { skills: Array.from({ length: 501 }, (_, i) => ({ name: `Synthetic skill ${i}` })) });
  assert.ok(p.some((x) => /501 proposals/.test(x)));
  assert.equal(readAll(store).records.length, 0);
});

test("SCN-RES-005-4 a byte order mark and CRLF are accepted", () => {
  const { store } = tempStore();
  const text = "﻿" + JSON.stringify(sample(), null, 2).replace(/\n/g, "\r\n");
  const r = importJsonResume(store, Buffer.from(text));
  assert.equal(r.proposed.length, 9);
});

test("SCN-RES-005-5 unknown root keys and long text are problems", () => {
  const { store } = tempStore();
  const p = importProblems(store, { "secret/key~x": 1, other: 2, work: [{ name: "A", summary: "y".repeat(2001) }] });
  assert.ok(p.includes("/ has 2 unknown root keys"), p.join("|"));
  assert.ok(p.some((x) => x.startsWith("/work/0/summary must have at most 2000 characters")), p.join("|"));
  assert.ok(!p.join("|").includes("secret"));
  assert.equal(pointerKey("a/b~c"), "a~1b~0c");
  assert.deepEqual(planJsonResumeImport(JSON.stringify({ work: [{ "a/b": 1 }], skills: "x" }), "l").problems, ["/skills must be an array"]);
});

test("SCN-RES-005-6 a write failure reports the written IDs", () => {
  const { store } = tempStore();
  let n = 0;
  const failing = (s: typeof store, input: ProposeInput, label: ActorLabel) => {
    if (++n === 3) throw new Error("disk full");
    return propose(s, input, label);
  };
  try {
    importJsonResume(store, Buffer.from(JSON.stringify(sample())), failing);
    assert.fail("the import did not fail");
  } catch (err) {
    assert.ok(err instanceof PersonaKitError);
    const written = err.details.written as string[];
    assert.equal(written.length, 2);
    assert.deepEqual(written.sort(), readAll(store).records.map((r) => r.id).sort());
    assert.ok(written.every((id) => err.message.includes(id)));
    assert.ok(!err.message.includes("disk full"));
  }
});
