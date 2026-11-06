// Covers: REQ-AGT-001, REQ-AGT-002, REQ-AGT-003
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { BIN, REPO, tempDir } from "./helpers.ts";

const CODEX_SKILLS = join(REPO, ".agents", "skills");
const CLAUDE_SKILLS = join(REPO, ".claude", "skills");

function filesUnder(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(dir, join(prefix, e.name)) : [join(prefix, e.name)]).sort();
}

test("SCN-AGT-001-1 CLAUDE.md imports AGENTS.md and holds nothing else", () => {
  assert.equal(readFileSync(join(REPO, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  assert.ok(existsSync(join(REPO, "AGENTS.md")));
});

test("SCN-AGT-002-1 every skill for Codex has an identical copy for Claude Code", () => {
  const skills = readdirSync(CODEX_SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(skills.includes("personakit"));
  for (const skill of skills) {
    const a = filesUnder(join(CODEX_SKILLS, skill));
    const b = existsSync(join(CLAUDE_SKILLS, skill)) ? filesUnder(join(CLAUDE_SKILLS, skill)) : [];
    assert.deepEqual(b, a, `${skill}: file lists differ`);
    for (const f of a) {
      assert.equal(readFileSync(join(CLAUDE_SKILLS, skill, f), "utf8"), readFileSync(join(CODEX_SKILLS, skill, f), "utf8"), `${skill}/${f} differs`);
    }
  }
});

test("SCN-AGT-002-2 the personakit skill has the frontmatter and the safety rules", () => {
  const text = readFileSync(join(CODEX_SKILLS, "personakit", "SKILL.md"), "utf8");
  assert.match(text, /^---\nname: personakit\ndescription: .+\n---\n/);
  assert.match(text, /Do not pass `--yes`/);
  assert.match(text, /Do not run `accept`, `reject`, `retire`, `visibility`, or `review`/);
  assert.match(text, /Do not propose sensitive attributes that the user did not state/);
});

test("SCN-AGT-003-1 skill install copies the skill to the user folders of both agents", () => {
  const home = tempDir();
  const r = spawnSync(process.execPath, [BIN, "skill", "install", "--json"], { env: { ...process.env, HOME: home }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const source = readFileSync(join(CODEX_SKILLS, "personakit", "SKILL.md"), "utf8");
  assert.equal(readFileSync(join(home, ".claude", "skills", "personakit", "SKILL.md"), "utf8"), source);
  assert.equal(readFileSync(join(home, ".agents", "skills", "personakit", "SKILL.md"), "utf8"), source);
});
