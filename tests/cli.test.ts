// Covers: REQ-CLI-001, REQ-CLI-002, REQ-CLI-003
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cli, tempStore } from "./helpers.ts";

function proposeOne(root: string, statement: string, extra: string[] = []): string {
  const r = cli(root, ["propose", "--kind", "capability", "--statement", statement, "--actor", "codex", "--user-stated", "--json", ...extra]);
  assert.equal(r.code, 0, r.stderr);
  return r.json().id;
}

test("SCN-CLI-002-1 SCN-CLI-002-2 accept without an interactive terminal fails unless the owner passes --yes", () => {
  const { root } = tempStore();
  const id = proposeOne(root, "Plans weekly menus for a school kitchen.");
  const denied = cli(root, ["accept", id, "--json"]);
  assert.equal(denied.code, 4);
  assert.equal(denied.json().error.code, "confirmationRequired");
  assert.equal(cli(root, ["show", id, "--json"]).json().state, "proposed");
  const ok = cli(root, ["accept", id, "--yes", "--visibility", "ai", "--json"]);
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(ok.json().results[0].state, "accepted");
});

test("reject, retire, and visibility also need confirmation", () => {
  const { root } = tempStore();
  const id = proposeOne(root, "Repairs bicycles.");
  assert.equal(cli(root, ["reject", id]).code, 4);
  assert.equal(cli(root, ["visibility", id, "ai"]).code, 4);
  assert.equal(cli(root, ["review"]).code, 4);
});

test("SCN-CLI-001-1 an update with a stale revision exits with code 3 and leaves the accepted record unchanged", () => {
  const { root } = tempStore();
  const id = proposeOne(root, "Works night shifts.");
  cli(root, ["accept", id, "--yes", "--visibility", "ai"]);
  const path = join(root, "records", `${id}.json`);
  const before = readFileSync(path, "utf8");
  const r = cli(root, ["update", id, "--revision", "1", "--statement", "Works day shifts.", "--actor", "claude-code", "--json"]);
  assert.equal(r.code, 3);
  const out = r.json();
  assert.equal(out.conflict, true);
  assert.equal(out.outcome, "superseding_proposal");
  assert.equal(readFileSync(path, "utf8"), before);
});

test("SCN-CLI-003-1 propose --from reads JSON Lines from stdin (claude.ai export path)", () => {
  const { root } = tempStore();
  const lines = [
    { kind: "preference", statement: "Prefers examples over theory.", user_stated: true, visibility: "ai" },
    { kind: "intent", statement: "Wants a part-time teaching role.", user_stated: true },
  ].map((o) => JSON.stringify(o)).join("\n");
  const r = cli(root, ["propose", "--from", "-", "--actor", "claude-ai", "--json"], { input: lines });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json().proposed.length, 2);
  const list = cli(root, ["list", "--state", "proposed", "--json"]).json();
  assert.ok(list.records.every((x: { actor: string }) => x.actor === "claude-ai"));
});

test("SCN-CLI-001-2 usage errors exit with code 2 and JSON errors carry the code", () => {
  const { root } = tempStore();
  const kind = cli(root, ["propose", "--kind", "hobby", "--statement", "x", "--json"]);
  assert.equal(kind.code, 2);
  assert.equal(kind.json().error.code, "usage");
  const unknown = cli(root, ["frobnicate", "--json"]);
  assert.equal(unknown.code, 2);
  assert.equal(unknown.json().error.exit_code, 2);
  const flag = cli(root, ["list", "--bogus", "--json"]);
  assert.equal(flag.code, 2);
  assert.equal(flag.json().error.code, "usage");
  const r = cli(root, ["update", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "--revision", "1", "--statement", "x", "--json"]);
  assert.equal(r.code, 5);
  assert.equal(r.json().error.exit_code, 5);
});

test("the actor label can come from PERSONAKIT_ACTOR", () => {
  const { root } = tempStore();
  const r = cli(root, ["propose", "--kind", "intent", "--statement", "Learn sign language.", "--json"], { env: { PERSONAKIT_ACTOR: "codex" } });
  const id = r.json().id;
  const rec = JSON.parse(readFileSync(join(root, "records", `${id}.json`), "utf8"));
  assert.equal(rec.provenance.actor, "codex");
});

test("an invalid record is rejected with code 6", () => {
  const { root } = tempStore();
  const r = cli(root, ["propose", "--kind", "experience", "--statement", "Job", "--facets", '{"period":{"start":"2024","end":"2020"}}', "--json"]);
  assert.equal(r.code, 6);
});

test("SCN-CLI-003-2 a batch with one bad line proposes nothing and names the line", () => {
  const { root } = tempStore();
  const lines = [
    { kind: "preference", statement: "Prefers mornings.", user_stated: true },
    { kind: "experience", statement: "Job", facets: { period: { start: "2024", end: "2020" } } },
  ].map((o) => JSON.stringify(o)).join("\n");
  const r = cli(root, ["propose", "--from", "-", "--actor", "claude-ai", "--json"], { input: lines });
  assert.equal(r.code, 6);
  assert.match(r.json().error.message, /line 2/);
  assert.equal(cli(root, ["list", "--json"]).json().records.length, 0);
});
