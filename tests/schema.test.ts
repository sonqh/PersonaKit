// Covers: REQ-PER-001, REQ-PER-002, REQ-PER-003
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRecord, normalizeRecord, type PersonaRecord } from "../src/core/schema.ts";

const base = (): PersonaRecord => ({
  schema: "personakit.record/v0",
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  kind: "experience",
  statement: "Coordinated volunteers for a community food bank.",
  state: "proposed",
  visibility: "private",
  revision: 1,
  sources: [{ kind: "interview" }],
  provenance: { actor: "codex", at: "2026-01-01T00:00:00.000Z", user_stated: true },
});

const paths = (r: unknown) => validateRecord(r).map((i) => i.path);

test("SCN-PER-001-1 a minimal record is valid", () => {
  assert.deepEqual(validateRecord(base()), []);
});

test("SCN-PER-001-2 an unknown field fails", () => {
  assert.ok(paths({ ...base(), visiblity: "ai" }).includes("visiblity"));
  assert.ok(paths({ ...base(), facets: { orgnization: "X" } }).includes("facets.orgnization"));
});

test("SCN-PER-001-3 an extension needs a namespace", () => {
  assert.deepEqual(validateRecord({ ...base(), extensions: { "org.example.field": 1 } }), []);
  assert.ok(paths({ ...base(), extensions: { field: 1 } }).includes("extensions.field"));
});

test("SCN-PER-002-1 a record without a source fails", () => {
  assert.ok(paths({ ...base(), sources: [] }).includes("sources"));
});

test("SCN-PER-002-2 an unknown actor fails", () => {
  assert.ok(paths({ ...base(), provenance: { ...base().provenance, actor: "gpt" } }).includes("provenance.actor"));
});

test("SCN-PER-003-1 hidden characters fail", () => {
  assert.ok(paths({ ...base(), statement: "Led ‮team" }).includes("statement"));
  assert.ok(paths({ ...base(), statement: "Led​team" }).includes("statement"));
  assert.ok(paths({ ...base(), statement: "Café" }).includes("statement"), "a statement that is not NFC fails");
  assert.deepEqual(validateRecord({ ...base(), statement: "Line one\nLine two" }), []);
});

test("SCN-PER-003-2 an inconsistent period fails", () => {
  assert.deepEqual(validateRecord({ ...base(), facets: { period: { start: "2020", end: "2021-06" } } }), []);
  assert.ok(paths({ ...base(), facets: { period: { start: "2022-05", end: "2021-01" } } }).includes("facets.period"));
  assert.ok(paths({ ...base(), facets: { period: { start: "2022", end: "2023", ongoing: true } } }).includes("facets.period"));
});

test("SCN-PER-003-3 a date in another format fails", () => {
  assert.deepEqual(validateRecord({ ...base(), facets: { expires_on: "2027-03-31" } }), []);
  assert.ok(paths({ ...base(), facets: { expires_on: "31/03/2027" } }).includes("facets.expires_on"));
});

test("normalizeRecord sorts set-like arrays", () => {
  const r = normalizeRecord({ ...base(), supersedes: ["01ARZ3NDEKTSV4RRFFQ69G5FB0", "01ARZ3NDEKTSV4RRFFQ69G5FAW"] });
  assert.deepEqual(r.supersedes, ["01ARZ3NDEKTSV4RRFFQ69G5FAW", "01ARZ3NDEKTSV4RRFFQ69G5FB0"]);
});
