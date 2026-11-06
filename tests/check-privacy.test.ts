// Covers: REQ-STO-002
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, tempDir } from "./paths.ts";

function runCheck(cwdRepo: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [join(cwdRepo, "scripts", "check-privacy.ts")], { env: { ...process.env, PERSONAKIT_HOME: "", ...env }, encoding: "utf8" });
}

/** A minimal copy of the repository, so the test never writes into the real one. */
function repoCopy(): string {
  const dir = tempDir("pk-repo-");
  for (const p of ["scripts", "src", "fixtures", "package.json"]) cpSync(join(REPO, p), join(dir, p), { recursive: true });
  return dir;
}

test("SCN-STO-002-1 a clean repository passes", () => {
  const r = runCheck(REPO);
  assert.equal(r.status, 0, r.stderr);
});

test("SCN-STO-002-2 the configured store is inside the repository", () => {
  const r = runCheck(REPO, { PERSONAKIT_HOME: join(REPO, "data") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /inside the repository/);
});

test("SCN-STO-002-3 a fixture is not marked synthetic", () => {
  const copy = repoCopy();
  mkdirSync(join(copy, "fixtures", "unmarked"));
  writeFileSync(join(copy, "fixtures", "unmarked", "proposals.jsonl"), '{"kind":"identity","statement":"x"}\n');
  const r = runCheck(copy);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SYNTHETIC.md is missing/);
  assert.match(r.stderr, /no synthetic marker/);
});

test("SCN-STO-002-4 a store is inside the repository", () => {
  const copy = repoCopy();
  mkdirSync(join(copy, "leak"));
  writeFileSync(join(copy, "leak", "store.json"), '{"schema":"personakit.store/v0","format_version":1}\n');
  const r = runCheck(copy);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /store is inside the repository/);
});
