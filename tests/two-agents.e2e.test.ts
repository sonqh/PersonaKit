// Covers: REQ-STO-003, REQ-STO-005, REQ-AIP-001
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateRecord } from "../src/core/schema.ts";
import { BIN, cli, tempStore } from "./helpers.ts";

const PER_AGENT = 100;

/** One shell process that runs the CLI 100 times in a row, like an agent session. */
function agentProcess(root: string, actor: string): Promise<number> {
  const script = `
    const { spawnSync } = require("node:child_process");
    let failures = 0;
    for (let i = 0; i < ${PER_AGENT}; i++) {
      const r = spawnSync(process.execPath, [${JSON.stringify(BIN)}, "propose", "--kind", "capability",
        "--statement", "${actor} fact " + i, "--actor", "${actor}", "--user-stated", "--json"], { encoding: "utf8" });
      if (r.status !== 0) { failures++; process.stderr.write(r.stderr); }
    }
    process.exit(failures === 0 ? 0 : 1);
  `;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", script], { env: { ...process.env, PERSONAKIT_HOME: root }, stdio: ["ignore", "ignore", "inherit"] });
    child.on("close", (code) => resolve(code ?? -1));
  });
}

test("SCN-STO-003-1 claude-code and codex propose 100 records each at the same time", { timeout: 300_000 }, async () => {
  const { root } = tempStore();
  const codes = await Promise.all([agentProcess(root, "claude-code"), agentProcess(root, "codex")]);
  assert.deepEqual(codes, [0, 0]);

  const files = readdirSync(join(root, "records"));
  assert.equal(files.length, 2 * PER_AGENT, "200 record files, no lost writes, no temp files");
  const statements = new Set<string>();
  const byActor: Record<string, number> = {};
  for (const f of files) {
    const rec = JSON.parse(readFileSync(join(root, "records", f), "utf8"));
    assert.deepEqual(validateRecord(rec), [], `${f} is corrupted`);
    statements.add(rec.statement);
    byActor[rec.provenance.actor] = (byActor[rec.provenance.actor] ?? 0) + 1;
  }
  assert.equal(statements.size, 2 * PER_AGENT);
  assert.deepEqual(byActor, { "claude-code": PER_AGENT, codex: PER_AGENT });
  assert.equal(readdirSync(join(root, "events")).length, 2 * PER_AGENT);

  // Accept everything as ai, then the brief must be byte-identical on two runs.
  const ids = files.map((f) => f.replace(".json", ""));
  assert.equal(cli(root, ["accept", ...ids, "--yes", "--visibility", "ai"]).code, 0);
  const a = cli(root, ["brief"]).stdout;
  const b = cli(root, ["brief"]).stdout;
  assert.equal(a, b);
  assert.ok(a.includes("Records: 200."));
  assert.equal(cli(root, ["doctor", "--json"]).json().ok, true);
});
