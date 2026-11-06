// Covers: REQ-CLI-001, REQ-STO-003
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initStore } from "../src/core/store.ts";
import { PersonaKitError } from "../src/core/errors.ts";
import { REPO, cli, tempDir } from "./helpers.ts";

test("SCN-CLI-001-3 a store inside the repository is refused", () => {
  const r = cli(join(REPO, "never-store"), ["init", "--json"], { cwd: REPO });
  assert.equal(r.code, 7);
  assert.equal(r.json().error.code, "unsafeStore");
  assert.throws(() => initStore(join(REPO, "never-store"), { cwd: "/" }), (e: unknown) => e instanceof PersonaKitError && e.code === "unsafeStore");
});

test("SCN-STO-003-3 init creates the store files and git settings", () => {
  const root = join(tempDir(), "store");
  const init = cli(root, ["init", "--json"]);
  assert.equal(init.code, 0, init.stderr);
  assert.equal(init.json().created, true);
  for (const f of ["store.json", ".gitattributes", ".gitignore", "records", "events", "locks"]) assert.ok(existsSync(join(root, f)), f);
  assert.equal(readFileSync(join(root, ".gitattributes"), "utf8"), "*.json text eol=lf\n");
  const r = cli(root, ["doctor", "--json"]);
  assert.equal(r.code, 0, r.stdout);
  assert.ok(!r.json().findings.some((f: { code: string }) => f.code === "git-setup"));
});
