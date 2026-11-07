// Covers: REQ-MCP-005
// Golden outputs of the CLI commands that moved to src/app/operations.ts. The move must not change any byte.
// Set UPDATE_GOLDEN=1 to write the files again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initStore, openStore, ownerAction, propose } from "../src/core/store.ts";
import { REPO, cli, fixtureLines, fixtureNames, tempDir } from "./helpers.ts";

const GOLDEN = join(REPO, "tests", "data", "golden");
const owner = { actor: "cli" as const };

/** A store with fixed IDs and a fixed clock, so every output is stable. */
function goldenStore(): { root: string; ids: string[] } {
  const cwd = tempDir();
  const root = join(cwd, "store");
  initStore(root, { cwd });
  let n = 0;
  const store = openStore(root, { cwd, now: () => new Date("2026-01-01T00:00:00.000Z"), ulid: () => `01JC9Z${String(++n).padStart(20, "0")}` });
  const ids: string[] = [];
  for (const name of fixtureNames()) {
    for (const line of fixtureLines(name)) {
      const { visibility, ...input } = line;
      const { record } = propose(store, input, owner);
      ownerAction(store, "accept", record.id, { visibility }, owner);
      ids.push(record.id);
    }
  }
  return { root, ids };
}

function compare(name: string, actual: string): void {
  const file = join(GOLDEN, `${name}.txt`);
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(file)) writeFileSync(file, actual);
  assert.equal(actual, readFileSync(file, "utf8"), `golden output ${name} changed`);
}

test("the moved CLI commands keep their golden outputs", () => {
  const { root, ids } = goldenStore();
  const draft = cli(root, ["cv", "draft"]).stdout;
  const cvFile = join(tempDir(), "cv.md");
  writeFileSync(cvFile, `${draft}- An uncited line.\n- A line for a missing record. [pk:01JC9Z99999999999999999999]\n`);
  const cases: [string, string[]][] = [
    ["brief-full", ["brief"]],
    ["brief-short", ["brief", "--level", "short"]],
    ["brief-full-json", ["brief", "--json"]],
    ["brief-short-json", ["brief", "--level", "short", "--json"]],
    ["list", ["list"]],
    ["list-json", ["list", "--json"]],
    ["list-capability-json", ["list", "--kind", "capability", "--state", "accepted", "--json"]],
    ["show-first", ["show", ids[0]!]],
    ["show-all-json", ...[]],
    ["cv-draft", ["cv", "draft"]],
    ["cv-draft-json", ["cv", "draft", "--json", "--as-of", "2026-06-01"]],
    ["cv-check", ["cv", "check", cvFile]],
    ["cv-check-json", ["cv", "check", cvFile, "--json"]],
  ].filter((c) => c.length === 2) as [string, string[]][];
  for (const [name, args] of cases) {
    const r = cli(root, args);
    compare(name, `exit ${r.code}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}`);
  }
  compare("show-all-json", ids.map((id) => cli(root, ["show", id, "--json"]).stdout).join(""));
  const p = cli(root, ["propose", "--kind", "capability", "--statement", "Can drive a forklift.", "--json"]);
  compare("propose-json", `exit ${p.code}\n${p.stdout.replace(/[0-9A-HJKMNP-TV-Z]{26}/g, "<ID>")}`);
  const pt = cli(root, ["propose", "--kind", "capability", "--statement", "Can drive a forklift."]);
  compare("propose-text", `exit ${pt.code}\n${pt.stdout.replace(/[0-9A-HJKMNP-TV-Z]{26}/g, "<ID>")}`);
  const bad = cli(root, ["propose", "--kind", "capability", "--statement", "", "--json"]);
  compare("propose-invalid-json", `exit ${bad.code}\n${bad.stdout}`);
});
