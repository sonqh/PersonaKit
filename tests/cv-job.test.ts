// Covers: REQ-CV-008, REQ-CV-009, REQ-CV-010, REQ-CV-012
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JOB_MAX_BYTES, MATCH_HINT, buildTailoredDraft, matchJob, parseJob, renderMatchText, termsOf } from "../src/core/cv-job.ts";
import { buildCvDraft, checkCv, cvEligible, renderCvMarkdown } from "../src/core/cv.ts";
import { ownerAction, propose, readAll } from "../src/core/store.ts";
import { FIXTURES, fixtureLines, fixtureNames, tempStore } from "./helpers.ts";
import type { Facets, PersonaRecord, RecordKind, RecordState, Visibility } from "../src/core/schema.ts";
import { PersonaKitError } from "../src/core/errors.ts";

const usage = (fn: () => unknown) =>
  assert.throws(fn, (e: unknown) => e instanceof PersonaKitError && e.code === "usage");

test("SCN-CV-008-1 list items and sentences become requirements", () => {
  const job = [
    "# Office assistant",
    "Requirements:",
    "- Bookkeeping for small clients",
    "* Excel",
    "1. Answer phone calls from customers",
    "",
    "You will plan the weekly schedule. You will order office supplies for the team.",
  ].join("\n");
  const { requirements, truncated } = parseJob(job);
  assert.deepEqual(requirements.map((r) => r.text), [
    "Bookkeeping for small clients",
    "Excel",
    "Answer phone calls from customers",
    "You will plan the weekly schedule.",
    "You will order office supplies for the team.",
  ]);
  assert.deepEqual(requirements.map((r) => r.n), [1, 2, 3, 4, 5]);
  assert.equal(truncated, 0);
});

test("SCN-CV-008-1 a one-term prose sentence is context, a one-term list item is a requirement", () => {
  const { requirements } = parseJob("Welcome.\n- CPR\nWe care about patient safety.");
  assert.deepEqual(requirements.map((r) => r.text), ["CPR", "We care about patient safety."]);
});

test("SCN-CV-008-2 empty, requirement-free, and oversize texts are refused", () => {
  usage(() => parseJob(""));
  usage(() => parseJob("  \n\t\n"));
  usage(() => parseJob("# Heading\nAbout us:\nHello."));
  // Multibyte text one byte over the limit: 2-byte characters plus one ASCII byte.
  const big = "é".repeat(JOB_MAX_BYTES / 2) + "x";
  assert.equal(Buffer.byteLength(big, "utf8"), JOB_MAX_BYTES + 1);
  usage(() => parseJob(big));
  const atLimit = "- Excel\n" + " ".repeat(JOB_MAX_BYTES - 8);
  assert.equal(parseJob(atLimit).requirements.length, 1);
});

test("SCN-CV-008-2 an error never repeats the job text", () => {
  const marker = "ZZMARKERQQ";
  for (const t of [`# ${marker}`, marker.repeat(10_000)]) {
    try {
      parseJob(t);
      assert.fail("expected an error");
    } catch (e) {
      assert.ok(!(e as Error).message.includes(marker));
    }
  }
});

test("SCN-CV-008-1 only the first 100 requirements are kept", () => {
  const job = Array.from({ length: 105 }, (_, i) => `- Task number ${i} filing`).join("\n");
  const { requirements, truncated } = parseJob(job);
  assert.equal(requirements.length, 100);
  assert.equal(truncated, 5);
});

test("SCN-CV-009-4 digits and code names follow the term rule", () => {
  assert.deepEqual(termsOf("5+ years of C++"), ["c++"]);
  assert.deepEqual(termsOf("C# and node.js"), ["c#", "node", "js"]);
  assert.deepEqual(termsOf("e.g."), []);
  assert.deepEqual(termsOf("2020 5 5+"), []);
  assert.deepEqual(termsOf("C"), []);
});

test("SCN-CV-009 terms: NFKC, lower case, stop words, plural s", () => {
  assert.deepEqual(termsOf("Strong EXCEL skills required"), ["excel"]);
  assert.deepEqual(termsOf("Ｅｘｃｅｌ"), ["excel"]);
  assert.deepEqual(termsOf("clients classes business"), ["client", "classe", "business"]);
  assert.deepEqual(termsOf("Café cafe"), ["café", "cafe"]);
});

test("SCN-CV-008 the e.g. split drops the fragment without terms", () => {
  const { requirements } = parseJob("Use office tools, e.g. Excel and Word daily.");
  assert.ok(requirements.every((r) => r.terms.length >= 2));
  assert.ok(requirements.some((r) => r.terms.includes("excel")));
});

// ---------- match ----------

let seq = 0;
function rec(statement: string, facets?: Facets, extra: { kind?: RecordKind; state?: RecordState; visibility?: Visibility } = {}): PersonaRecord {
  seq++;
  const r: PersonaRecord = {
    schema: "personakit.record/v0", id: `01BX5ZZKBKACTAV9WEVGEM${String(seq).padStart(4, "0")}`, kind: extra.kind ?? "experience", statement,
    state: extra.state ?? "accepted", visibility: extra.visibility ?? "public", revision: 2, sources: [{ kind: "interview" }],
    provenance: { actor: "cli", at: "2026-01-01T00:00:00.000Z", user_stated: true },
  };
  if (facets) r.facets = facets;
  return r;
}
const match = (job: string, records: PersonaRecord[]) => matchJob(parseJob(job), records);

test("SCN-CV-009-1 a requirement with shared terms finds its record", () => {
  const r = rec("Did the bookkeeping for 40 small clients");
  const m = match("- Bookkeeping for small clients", [r]);
  assert.deepEqual(m.requirements[0]!.ids, [r.id]);
  assert.deepEqual(m.gaps, []);
});

test("SCN-CV-009-2 a requirement without a record is a gap", () => {
  const r = rec("Did the bookkeeping for 40 small clients");
  const m = match("- Bookkeeping for small clients\n- Forklift licence and warehouse safety training", [r]);
  assert.deepEqual(m.gaps, [2]);
  assert.deepEqual(m.requirements[1]!.ids, []);
});

test("SCN-CV-009-3 a tag of several words matches as a whole", () => {
  const r = rec("Answered calls at the clinic front desk", { tags: ["customer support"] });
  const m = match("- Customer support by phone and email\n- Support the regional sales partners", [r]);
  assert.deepEqual(m.requirements.map((q) => q.ids), [[r.id], []]);
});

test("SCN-CV-009-3 a one-word tag links a long requirement", () => {
  const r = rec("Kept the accounts of a small shop", { tags: ["QuickBooks"] });
  const m = match("- Keep daily records in QuickBooks for the finance office", [r]);
  assert.deepEqual(m.requirements[0]!.ids, [r.id]);
});

test("SCN-CV-009-4 digits and code names follow the term rule", () => {
  const five = rec("Gave 5 talks");
  const c = rec("Wrote C");
  const cpp = rec("Wrote C++ drivers");
  const m = match("- 5+ years of C++", [five, c, cpp]);
  assert.deepEqual(m.requirements[0]!.ids, [cpp.id]);
});

test("SCN-CV-009 links are sorted by common terms, then by ID", () => {
  const a = rec("Ran payroll");
  const b = rec("Ran payroll and invoicing for clients");
  const m = match("- Payroll and invoicing for clients", [a, b]);
  assert.deepEqual(m.requirements[0]!.ids, [b.id, a.id]);
});

test("SCN-CV-012-1 the report holds no record text", () => {
  const r = rec("Did the bookkeeping for 40 small clients", { role: "Clerk Uniquerole", organization: "Orgzzname", tags: ["Tagzzname"] });
  const json = JSON.stringify(match("- Bookkeeping for small clients\n- Tagzzname", [r]));
  for (const text of ["40 small", "Uniquerole", "Orgzzname"]) assert.ok(!json.includes(text), text);
  assert.ok(json.includes(r.id));
});

test("SCN-CV-012-2 excluded records never appear", () => {
  const text = "Managed the hospital pharmacy stock";
  const excluded = [
    rec(text, undefined, { visibility: "private" }),
    rec(text, undefined, { visibility: "ai" }),
    rec(text, undefined, { state: "proposed" }),
    rec(text, undefined, { state: "rejected" }),
    rec(text, undefined, { state: "retired" }),
    rec(text, undefined, { kind: "intent" }),
    rec(text, undefined, { kind: "preference" }),
  ];
  const m = match("- Hospital pharmacy stock control", excluded);
  assert.deepEqual(m.gaps, [1]);
  assert.deepEqual(m.unused, []);
  const json = JSON.stringify(m);
  for (const r of excluded) assert.ok(!json.includes(r.id));
});

test("SCN-CV-012-3 untrusted job text cannot change the terminal", () => {
  const line = "- Excel \u001b[31mred\u001b[0m \u0007bell \u009b2J " + "word ".repeat(400);
  const m = match(line, []);
  const t = m.requirements[0]!.text;
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/u.test(t));
  assert.ok([...t].length <= 500);
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/u.test(renderMatchText(m).replace(/\n/gu, "")));
});

test("SCN-CV-012-4 the wording makes no claim of fit", () => {
  const r = rec("Did the bookkeeping for 40 small clients");
  const out = renderMatchText(match("- Bookkeeping for small clients\n- Forklift licence", [r]));
  assert.ok(out.includes(MATCH_HINT));
  assert.ok(out.includes(`shares words with ${r.id}`));
  assert.ok(out.includes("no record shares enough words"));
  assert.ok(!/\b(covered|covers|meets|qualified|verified)\b/iu.test(out.replace(MATCH_HINT, "")));
});

test("SCN-CV-009 the match of 100 requirements and 1,000 records is fast", () => {
  const records = Array.from({ length: 1000 }, (_, i) => rec(`Handled case files and filing number${i} for the archive team`, { tags: [`tag${i}`] }));
  const job = Array.from({ length: 100 }, (_, i) => `- Archive filing and case handling item${i}`).join("\n");
  const start = performance.now();
  const m = match(job, records);
  assert.equal(m.requirements.length, 100);
  assert.ok(performance.now() - start < 2000);
});

// ---------- tailored draft ----------

const ids = (md: string) => [...md.matchAll(/\[pk:([0-9A-Z]{26})\]/gu)].map((m) => m[1]!);

test("SCN-CV-010-1 unmatched records leave the draft", () => {
  const who = rec("Sam is an office clerk", undefined, { kind: "identity" });
  const a = rec("Did the bookkeeping for 40 small clients", { period: { start: "2022" } });
  const b = rec("Ran payroll and invoicing for clients", { period: { start: "2020", end: "2021" } });
  const c = rec("Painted fences in summer", { period: { start: "2018", end: "2018" } });
  const d = rec("Sang in a choir", { period: { start: "2016", end: "2017" } });
  const school = rec("Studied history", { type: "education" });
  const licence = rec("Forklift licence", { issued_on: "2019" });
  const pause = rec("Cared for a parent", { type: "career_break", period: { start: "2019", end: "2019" } });
  const records = [who, a, b, c, d, school, licence, pause];
  const m = match("- Bookkeeping for small clients\n- Payroll and invoicing", records);
  assert.equal(m.matched, 2);
  const { draft, left_out } = buildTailoredDraft(records, m);
  const md = renderCvMarkdown(draft);
  assert.deepEqual(new Set(ids(md)), new Set([who.id, a.id, b.id, school.id, licence.id, pause.id]));
  assert.deepEqual(left_out, [c.id, d.id].sort());
  assert.deepEqual(draft.sections.find((x) => x.title === "Experience")!.items.map((i) => i.id), [a.id, b.id]);
});

test("SCN-CV-010-3 no match, or a Summary-only match, gives the full draft", () => {
  const who = rec("Sam is an office clerk", undefined, { kind: "identity" });
  const a = rec("Did the bookkeeping for 40 small clients");
  const records = [who, a];
  const full = renderCvMarkdown(buildCvDraft(records));
  for (const job of ["- Forklift licence and warehouse safety", "- Office clerk"]) {
    const m = match(job, records);
    assert.equal(m.matched, 0);
    const t = buildTailoredDraft(records, m);
    assert.equal(renderCvMarkdown(t.draft), full);
    assert.deepEqual(t.left_out, []);
  }
});

for (const name of fixtureNames()) {
  test(`SCN-CV-010-2 SCN-CV-012-2 fixture ${name} gives a useful, clean tailored draft`, () => {
    const { store } = tempStore();
    for (const { visibility, ...input } of fixtureLines(name)) {
      const { record } = propose(store, input, { actor: "cli" });
      ownerAction(store, "accept", record.id, { visibility }, { actor: "cli" });
    }
    // One proposed, one rejected, and one retired record with the words of a linked requirement.
    const job = parseJob(readFileSync(join(FIXTURES, name, "job.md"), "utf8"));
    const words = job.requirements[0]!.text;
    const extra = ["proposed", "reject", "retire"].map((how) => {
      const { record } = propose(store, { kind: "experience", statement: `${words} again`, user_stated: true, sources: [{ kind: "interview" }] }, { actor: "cli" });
      if (how === "reject") ownerAction(store, "reject", record.id, {}, { actor: "cli" });
      if (how === "retire") {
        ownerAction(store, "accept", record.id, { visibility: "public" }, { actor: "cli" });
        ownerAction(store, "retire", record.id, {}, { actor: "cli" });
      }
      return record.id;
    });
    const records = readAll(store).records;
    const m = matchJob(job, records);
    assert.ok(m.requirements.some((r) => r.ids.length > 0), "at least one link");
    assert.ok(m.gaps.length > 0, "at least one gap");
    const { draft } = buildTailoredDraft(records, m);
    const md = renderCvMarkdown(draft);
    const check = checkCv(md, records);
    assert.equal(check.errors, 0);
    assert.equal(check.warnings, 0);
    const excluded = records.filter((r) => !cvEligible(r)).map((r) => r.id);
    for (const id of [...excluded, ...extra]) {
      assert.ok(!JSON.stringify(m).includes(id), `excluded ${id} in the report`);
      assert.ok(!md.includes(id), `excluded ${id} in the draft`);
    }
    assert.ok(!md.includes("CANARY") && !JSON.stringify(m).includes("CANARY"));
  });
}
