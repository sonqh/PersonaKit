// Covers: REQ-ONB-003, REQ-ONB-005, REQ-WEB-006, REQ-WEB-007, REQ-ARC-001, REQ-ARC-002
// The full M2 flow through the API with a synthetic CV: paste, review, result, print text, export, restore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { printEnabled, startScreen } from "../src/web/logic.js";
import { cli, tempDir } from "./helpers.ts";
import { call, withServer } from "./web-helpers.ts";

const SYNTHETIC_CV = [
  "Summary",
  "Synthetic Sam, a calm and patient front desk lead.",
  "",
  "Experience",
  "- Ran the front desk of a synthetic community pool for three years.",
  "- Trained six synthetic lifeguards on the booking system.",
  "",
  "Skills",
  "- Conversational synthetic sign language",
  "",
  "Goals",
  "- SYNTH-PRIVATE-GOAL find a role near the sea",
].join("\n");

test("a new owner finishes the flow without a terminal step", async () => {
  await withServer(async (s) => {
    assert.equal(startScreen((await call(s, { path: "/api/state" })).json()), "start");

    const drafts = (await call(s, { path: "/api/split", body: { text: SYNTHETIC_CV } })).json().drafts as { kind: string; statement: string }[];
    assert.deepEqual(drafts.map((d) => d.kind), ["identity", "experience", "experience", "capability", "intent"]);
    const proposed = (await call(s, { path: "/api/propose", body: { items: drafts.map((d) => ({ ...d, source: "cv" })) } })).json().proposed as { id: string; kind: string }[];
    assert.equal(proposed.length, 5);
    assert.equal(startScreen((await call(s, { path: "/api/state" })).json()), "review");

    for (const p of proposed) {
      const visibility = p.kind === "intent" ? "private" : p.kind === "capability" ? "ai" : "public";
      const r = await call(s, { path: "/api/accept", body: { id: p.id, revision: 1, visibility } });
      assert.equal(r.status, 200, r.text);
    }

    const result = (await call(s, { path: "/api/result" })).json();
    assert.equal(result.counts.brief, 4);
    assert.equal(result.counts.cv, 3);
    assert.ok(!result.brief.includes("SYNTH-PRIVATE-GOAL") && !result.cv.includes("SYNTH-PRIVATE-GOAL"));
    assert.ok(result.cv.includes("community pool") && !result.cv.includes("sign language"));
    assert.equal(printEnabled(result.cv, { text: result.cv, check: result.check }), true);
    const final = (await call(s, { path: "/api/cv/strip", body: { text: result.cv } })).json().text as string;
    assert.ok(!final.includes("[pk:"));

    const exported = await call(s, { path: "/api/export" });
    assert.equal(exported.status, 200);
    const dir = tempDir();
    const file = join(dir, "backup.json");
    writeFileSync(file, exported.text);
    const target = join(dir, "new-machine");
    const restored = cli(target, ["import", "archive", file, "--json"]);
    assert.equal(restored.code, 0, restored.stderr);
    const again = join(dir, "again.json");
    assert.equal(cli(target, ["export", "--out", again]).code, 0);
    assert.equal(readFileSync(again, "utf8"), exported.text);
    assert.equal(cli(target, ["brief"]).stdout, result.brief);
  });
});
