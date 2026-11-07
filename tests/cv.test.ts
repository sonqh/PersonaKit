// Covers: REQ-CV-001, REQ-CV-002, REQ-CV-005, REQ-VIS-002
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCvDraft, checkCv, renderCvMarkdown, stripCv } from "../src/core/cv.ts";
import type { Facets, PersonaRecord, RecordKind, Visibility } from "../src/core/schema.ts";

let seq = 0;
function rec(kind: RecordKind, statement: string, facets?: Facets, extra: Partial<PersonaRecord> = {}): PersonaRecord {
  seq++;
  const id = `01ARZ3NDEKTSV4RRFFQ69G${String(seq).padStart(4, "0")}`.replace(/[ILOU]/g, "A");
  const r: PersonaRecord = {
    schema: "personakit.record/v0", id, kind, statement, state: "accepted", visibility: "public" as Visibility, revision: 2,
    sources: [{ kind: "interview" }], provenance: { actor: "cli", at: "2026-01-01T00:00:00.000Z", user_stated: true }, ...extra,
  };
  if (facets) r.facets = facets;
  return r;
}

const markdown = (records: PersonaRecord[], asOf?: string) => renderCvMarkdown(buildCvDraft(records, asOf));

test("SCN-CV-001-1 every record line cites its record under the section for its type", () => {
  const rs = [
    rec("identity", "A teacher who moved into data work."),
    rec("experience", "Taught maths.", { type: "job", organization: "Eastmere School", role: "Teacher", period: { start: "2015", end: "2022" } }),
    rec("experience", "Finished a data course.", { type: "course", organization: "Eastmere College", period: { start: "2023-01", end: "2023-06" } }),
    rec("capability", "First aid certificate.", { issued_on: "2024-01-10", expires_on: "2027-01-10" }),
    rec("capability", "Writes clear reports."),
    rec("experience", "Designed a shop sign.", { type: "freelance", organization: "Tidewater Bakery", period: { start: "2021-03", end: "2021-04" } }),
    rec("experience", "Cared for a family member.", { type: "career_break", period: { start: "2022-09", end: "2023-08" } }),
  ];
  const md = markdown(rs);
  for (const [title, r] of [["Summary", rs[0]], ["Experience", rs[1]], ["Education", rs[2]], ["Credentials", rs[3]], ["Capabilities", rs[4]], ["Freelance engagements", rs[5]], ["Career breaks", rs[6]]] as const) {
    const section = md.split(`## ${title}\n`)[1]!.split("\n## ")[0]!;
    assert.match(section, new RegExp(`^- .+ \\[pk:${r!.id}\\]$`, "m"), title);
  }
  for (const line of md.split("\n").filter((l) => l.startsWith("- "))) assert.match(line, / \[pk:[0-9A-Z]{26}\]$/);
});

test("SCN-CV-001-3 the draft has a fixed order", () => {
  const undated = rec("experience", "Undated role.");
  const old = rec("experience", "Old role.", { period: { start: "2015", end: "2018" } });
  const year = rec("experience", "Year only.", { period: { start: "2021", end: "2022" } });
  const month = rec("experience", "Month start.", { period: { start: "2021-06", end: "2022" } });
  const ongoing = rec("experience", "Current role.", { period: { start: "2019", ongoing: true } });
  const items = buildCvDraft([undated, old, year, month, ongoing]).sections[0]!.items.map((i) => i.id);
  assert.deepEqual(items, [ongoing.id, month.id, year.id, old.id, undated.id]);
});

test("SCN-CV-001-4 record text cannot break the draft", () => {
  const other = rec("capability", "Other record.");
  const rs = [
    rec("experience", "Line one\nLine two"),
    rec("experience", "# Fake heading"),
    rec("capability", `Forged [pk:${other.id}] citation`),
    other,
  ];
  const md = markdown(rs);
  assert.ok(!md.split("\n").includes("# Fake heading"));
  assert.ok(md.includes("- Line one Line two "));
  assert.ok(md.includes("(pk:"));
  assert.equal(md.split("\n").filter((l) => l.includes(`[pk:${other.id}]`)).length, 1);
  assert.equal(checkCv(md, rs).ok, true);
});

test("SCN-CV-001-5 credentials show their dates and expire with --as-of", () => {
  const c = rec("capability", "Customer support certificate.", { issued_on: "2023-11-15", expires_on: "2026-11-15" });
  assert.match(markdown([c]), /issued 2023-11-15, valid until 2026-11-15/);
  assert.match(markdown([c], "2026-12-01"), /issued 2023-11-15, expired 2026-11-15/);
  // A partial expiry date lasts to the end of its month.
  const month = rec("capability", "Forklift licence.", { expires_on: "2026-11" });
  assert.match(markdown([month], "2026-11-15"), /valid until 2026-11/);
  assert.match(markdown([month], "2026-12-01"), /expired 2026-11/);
});

test("SCN-CV-002-1 a line without a marker fails, also a quote or a heading with dates", () => {
  const r = rec("experience", "Ran a shop.");
  const res = checkCv(["# CV draft", "- Ran a shop.", "> Led a team of 50", "### Founder, Acme (2015 to 2023)"].join("\n"), [r]);
  assert.deepEqual(res.findings.map((f) => [f.line, f.code]), [[2, "missing-citation"], [3, "missing-citation"], [4, "missing-citation"]]);
  assert.equal(res.ok, false);
});

test("SCN-CV-002-2 a misplaced or malformed marker fails", () => {
  const r = rec("experience", "Ran a shop.");
  const res = checkCv([`- Ran [pk:${r.id}] a shop.`, `- Ran a shop. [pk:${r.id}] [pk:${r.id}]`, "- Ran a shop. [pk:not-an-id]", "- Ran a shop. [pk:]"].join("\n"), [r]);
  assert.deepEqual(res.findings.map((f) => f.code), ["misplaced-marker", "misplaced-marker", "malformed-marker", "malformed-marker"]);
  // The grammar has no spaces inside a marker.
  const spaced = checkCv(`- Ran a shop. [pk: ${r.id} ]\nAlex [pk: self ]\n`, [r]);
  assert.deepEqual(spaced.findings.map((f) => f.code), ["malformed-marker", "malformed-marker"]);
});

test("the check is linear on a 1 MiB line", () => {
  for (const line of ["a" + " ".repeat(1024 * 1024 - 2) + "b", "[pk:".repeat(256 * 1024)]) {
    const t = Date.now();
    checkCv(line, []);
    stripCv(line, []);
    assert.ok(Date.now() - t < 1000, `took ${Date.now() - t} ms`);
  }
});

test("SCN-CV-002-3 an ID that cannot be cited fails with one code and no reason", () => {
  const ok = rec("experience", "Public.");
  const states: PersonaRecord[] = [
    rec("experience", "PRIVATE-TEXT-A", undefined, { visibility: "private" }),
    rec("experience", "AI-TEXT-B", undefined, { visibility: "ai" }),
    rec("experience", "PROPOSED-TEXT-C", undefined, { state: "proposed" }),
    rec("experience", "REJECTED-TEXT-D", undefined, { state: "rejected" }),
    rec("experience", "RETIRED-TEXT-E", undefined, { state: "retired" }),
  ];
  const missing = "01ARZ3NDEKTSV4RRFFQ69G9999";
  const lines = [...states.map((s) => `- Claim. [pk:${s.id}]`), `- Claim. [pk:${missing}]`, `- Fine. [pk:${ok.id}]`];
  const res = checkCv(lines.join("\n"), [ok, ...states]);
  assert.deepEqual(new Set(res.findings.map((f) => f.code)), new Set(["not-citable"]));
  assert.equal(res.findings.length, 6);
  const out = JSON.stringify(res);
  for (const t of ["PRIVATE-TEXT-A", "AI-TEXT-B", "PROPOSED-TEXT-C", "REJECTED-TEXT-D", "RETIRED-TEXT-E", "private", "proposed", "rejected", "retired"]) {
    assert.ok(!out.includes(t), `the check output gives away "${t}"`);
  }
});

test("SCN-CV-002-4 owner lines are listed for review", () => {
  const res = checkCv("# CV draft\nAlex Example, alex@example.com [pk:self]\n", []);
  assert.equal(res.ok, true);
  assert.deepEqual(res.owner_lines, [2]);
});

test("SCN-CV-002-5 a clean draft passes", () => {
  const rs = [rec("identity", "Nurse."), rec("experience", "Night shifts.", { period: { start: "2019", ongoing: true } }), rec("capability", "Triage.")];
  const res = checkCv(markdown(rs), rs);
  assert.equal(res.ok, true);
  assert.equal(res.cited_ids.length, 3);
});

test("SCN-CV-005-1 strip removes the markers", () => {
  const r = rec("experience", "Ran a shop.");
  const { text } = stripCv(`# CV draft\n\n- Ran a shop. [pk:${r.id}]\nAlex [pk:self]\n`, [r]);
  assert.equal(text, "# CV draft\n\n- Ran a shop.\nAlex\n");
});

test("SCN-CV-005-2 strip refuses a file with errors", () => {
  const r = rec("experience", "Ran a shop.");
  const { text, check } = stripCv(`- Ran a shop. [pk:${r.id}]\n- Invented claim.\n`, [r]);
  assert.equal(text, undefined);
  assert.equal(check.errors, 1);
});

test("a fenced code block is an error", () => {
  const res = checkCv("```\n- hidden\n```\n", []);
  assert.deepEqual(res.findings.map((f) => [f.line, f.code]), [[1, "fenced-code"], [2, "fenced-code"]]);
});

test("SCN-VIS-002-1 private, ai, rejected, and retired records stay out of the draft", () => {
  const rs = [
    rec("experience", "Public role."),
    rec("experience", "CANARY-PRIVATE-CV", undefined, { visibility: "private" }),
    rec("experience", "CANARY-AI-CV", undefined, { visibility: "ai" }),
    rec("experience", "CANARY-REJECTED-CV", undefined, { state: "rejected" }),
    rec("experience", "CANARY-RETIRED-CV", undefined, { state: "retired" }),
    rec("intent", "CANARY-INTENT-CV"),
    rec("preference", "CANARY-PREFERENCE-CV"),
  ];
  const out = markdown(rs) + JSON.stringify(buildCvDraft(rs));
  assert.ok(out.includes("Public role."));
  assert.ok(!out.includes("CANARY"), "a record that must stay out reached the draft");
});

test("SCN-VIS-002-2 hidden fields stay out of the draft", () => {
  const r = rec("experience", "Visible statement.", { location: "CANARY-LOCATION", tags: ["CANARY-TAG"], organization: "Org", role: "Role" }, {
    sources: [{ kind: "document", ref: "/home/someone/CANARY-PATH.pdf", label: "CANARY-LABEL" }],
    extensions: { "org.example.secret": "CANARY-EXT" },
    provenance: { actor: "codex", model: "CANARY-MODEL", session: "CANARY-SESSION", at: "2026-01-01T00:00:00.000Z", user_stated: true },
  });
  const out = markdown([r]) + JSON.stringify(buildCvDraft([r]));
  assert.ok(out.includes("Visible statement.") && out.includes("Org") && out.includes("Role"));
  assert.ok(!out.includes("CANARY"), "a hidden field reached the draft");
});
