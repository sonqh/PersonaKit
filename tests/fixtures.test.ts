// Covers: REQ-VIS-001
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileBriefMarkdown } from "../src/core/brief.ts";
import { ownerAction, propose, readAll, doctor } from "../src/core/store.ts";
import { FIXTURES, fixtureLines, fixtureNames, tempStore } from "./helpers.ts";

for (const name of fixtureNames()) {
  test(`SCN-VIS-001-3 fixture ${name} builds a store whose brief has no private canary`, () => {
    assert.ok(existsSync(join(FIXTURES, name, "SYNTHETIC.md")), "SYNTHETIC.md is missing");
    assert.match(readFileSync(join(FIXTURES, name, "SYNTHETIC.md"), "utf8"), /fictional/);
    const lines = fixtureLines(name);
    const kinds = new Set(lines.map((l) => l.kind));
    assert.equal(kinds.size, 5, "every persona uses all five kinds");
    const { store } = tempStore();
    for (const line of lines) {
      assert.deepEqual(line.extensions?.["personakit.fixture"], { synthetic: true });
      const { visibility, ...input } = line;
      const { record } = propose(store, input, { actor: "cli" });
      ownerAction(store, "accept", record.id, { visibility }, { actor: "cli" });
    }
    assert.equal(doctor(store).ok, true);
    const brief = compileBriefMarkdown(readAll(store).records);
    assert.ok(!brief.includes("CANARY-PRIVATE"), "a private fixture record leaked into the brief");
    assert.ok(lines.some((l) => l.visibility === "private" && l.statement.includes(`CANARY-PRIVATE-${name}`)));
  });
}
