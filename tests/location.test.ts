// Covers: REQ-STO-001
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { checkStoreLocation, defaultStorePath } from "../src/core/location.ts";
import { REPO, tempDir } from "./paths.ts";

test("SCN-STO-001-1 default and override", () => {
  assert.ok(defaultStorePath({ HOME: "/home/x" } as NodeJS.ProcessEnv).endsWith(".personakit"));
  assert.equal(defaultStorePath({ PERSONAKIT_HOME: "/data/pk" } as NodeJS.ProcessEnv), "/data/pk");
});

test("SCN-STO-001-2 the check refuses a store in the PersonaKit repository", () => {
  assert.ok(checkStoreLocation(join(REPO, "my-store"), "/").refusal);
});

test("SCN-STO-001-3 the check refuses a store in the current project", () => {
  const project = tempDir();
  mkdirSync(join(project, ".git"));
  assert.ok(checkStoreLocation(join(project, "data", "store"), join(project, "src")).refusal);
});

test("SCN-STO-001-4 a store in another repository gets a warning", () => {
  const dotfiles = tempDir();
  mkdirSync(join(dotfiles, ".git"));
  const check = checkStoreLocation(join(dotfiles, ".personakit"), tempDir());
  assert.equal(check.refusal, undefined);
  assert.ok(check.warning);
});

test("SCN-STO-001-5 a store can be its own repository", () => {
  const home = tempDir();
  const store = join(home, ".personakit");
  mkdirSync(join(store, ".git"), { recursive: true });
  const check = checkStoreLocation(store, home);
  assert.equal(check.refusal, undefined);
  assert.equal(check.warning, undefined);
});
