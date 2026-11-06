// Covers: REQ-PER-005
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateRecord, type PersonaRecord, type Facets, type Visibility } from "../src/core/schema.ts";
import { FIXTURES } from "./paths.ts";

interface Line { kind: string; statement: string; visibility: Visibility; facets?: Facets; extensions?: Record<string, unknown>; sources?: unknown; user_stated?: boolean }

const names = () => readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const lines = (name: string): Line[] => readFileSync(join(FIXTURES, name, "proposals.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

test("SCN-PER-005-1 every fixture line is a valid record", () => {
  for (const n of ["software-engineer", "support-specialist", "designer", "career-changer"]) assert.ok(names().includes(n), n);
  for (const name of names()) {
    assert.match(readFileSync(join(FIXTURES, name, "SYNTHETIC.md"), "utf8"), /fictional/, `${name}/SYNTHETIC.md`);
    const all = lines(name);
    assert.equal(new Set(all.map((l) => l.kind)).size, 5, `${name} uses all five kinds`);
    all.forEach((l, i) => {
      assert.deepEqual(l.extensions?.["personakit.fixture"], { synthetic: true }, `${name}:${i + 1} synthetic marker`);
      const { user_stated, ...rest } = l;
      const record = {
        ...rest, schema: "personakit.record/v0", id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", state: "proposed", revision: 1,
        provenance: { actor: "cli", at: "2026-01-01T00:00:00.000Z", user_stated: user_stated === true },
      } as unknown as PersonaRecord;
      assert.deepEqual(validateRecord(record), [], `${name}:${i + 1}`);
    });
  }
  assert.ok(existsSync(FIXTURES));
});

test("SCN-PER-005-2 the fixtures cover the required cases", () => {
  const all = names().flatMap(lines);
  assert.ok(all.some((l) => l.facets?.type === "career_break" && l.facets.period), "career break");
  assert.ok(all.some((l) => l.facets?.expires_on && l.facets.issued_on), "expiring credential");
  assert.ok(lines("designer").filter((l) => l.facets?.type === "freelance").length >= 5, "freelancer engagements");
  for (const name of names()) {
    assert.ok(lines(name).some((l) => l.visibility === "private" && l.statement.includes(`CANARY-PRIVATE-${name}`)), `${name} private canary`);
  }
});
