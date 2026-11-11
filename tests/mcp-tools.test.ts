// Covers: REQ-MCP-005, REQ-MCP-006, REQ-MCP-007, REQ-CV-011
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRecord, ownerAction, propose, readAll } from "../src/core/store.ts";
import { cli, tempDir, tempStore } from "./helpers.ts";
import { call, req, session } from "./mcp-helpers.ts";

const owner = { actor: "cli" as const };

function seeded() {
  const t = tempStore();
  const add = (kind: "identity" | "experience" | "capability" | "intent", statement: string, visibility: "private" | "ai" | "public", facets?: object) => {
    const { record } = propose(t.store, { kind, statement, sources: [{ kind: "interview" }], user_stated: true, ...(facets ? { facets } : {}) }, owner);
    ownerAction(t.store, "accept", record.id, { visibility }, owner);
    return record.id;
  };
  const ids = {
    identity: add("identity", "A synthetic gardener who teaches evening classes.", "public"),
    job: add("experience", "Kept the greenhouse schedule for a synthetic nursery.", "public", { organization: "Fernvale Nursery", period: { start: "2020-02", end: "2023-05" } }),
    cert: add("experience", "Holds a synthetic first aid certificate.", "public", { type: "credential", issued_on: "2024-01-10", expires_on: "2026-01-10" }),
    goal: add("intent", "Wants a synthetic part-time teaching role.", "ai"),
    secret: add("capability", "PRIVATE-CANARY-7781 synthetic secret skill.", "private"),
  };
  return { ...t, ids };
}

test("SCN-MCP-005-1 the brief equals the CLI brief", async () => {
  const { root } = seeded();
  const s = await session(root, [call(1, "brief", { level: "short" }), call(2, "brief", { level: "full" }), call(3, "brief", {})]);
  for (const [id, level] of [[1, "short"], [2, "full"], [3, "full"]] as const) {
    const r = s.byId(id).result;
    assert.equal(r.isError, false);
    assert.equal(r.content[0].text, cli(root, ["brief", "--level", level]).stdout);
    assert.deepEqual(r.structuredContent, cli(root, ["brief", "--level", level, "--json"]).json());
  }
});

test("SCN-MCP-005-2 list and show redact private records", async () => {
  const { root, ids } = seeded();
  const s = await session(root, [call(1, "list", {}), call(2, "show", { id: ids.secret }), call(3, "list", { state: "accepted", kind: "capability" })]);
  assert.ok(!s.stdout.includes("PRIVATE-CANARY-7781"));
  assert.deepEqual(s.byId(1).result.structuredContent, cli(root, ["list", "--json"]).json());
  assert.equal(s.byId(2).result.structuredContent.redacted, true);
  assert.deepEqual(s.byId(2).result.structuredContent, cli(root, ["show", ids.secret, "--json"]).json());
  assert.deepEqual(s.byId(3).result.structuredContent.records.map((r: any) => r.id), [ids.secret]);
});

test("SCN-MCP-005-3 the CV draft equals the CLI draft", async () => {
  const { root } = seeded();
  const s = await session(root, [call(1, "cv_draft", {}), call(2, "cv_draft", { as_of: "2026-06-01" })]);
  assert.equal(s.byId(1).result.content[0].text, cli(root, ["cv", "draft"]).stdout);
  assert.deepEqual(s.byId(1).result.structuredContent, cli(root, ["cv", "draft", "--json"]).json());
  assert.deepEqual(s.byId(2).result.structuredContent, cli(root, ["cv", "draft", "--json", "--as-of", "2026-06-01"]).json());
  assert.match(s.byId(2).result.content[0].text, /expired 2026-01-10/);
  const bad = await session(root, call(3, "cv_draft", { as_of: "June" }));
  assert.equal(bad.byId(3).result.isError, true);
});

test("SCN-CV-011-3 SCN-CV-011-4 the MCP tool takes a job text", async () => {
  const { root } = seeded();
  const job = "- Greenhouse schedule for a nursery\n- Forklift licence\n";
  const file = join(tempDir(), "jd.txt");
  writeFileSync(file, job);
  const big = "é".repeat(32_768) + "x";
  const s = await session(root, [call(1, "cv_draft", { job }), call(2, "cv_draft", {}), call(3, "cv_draft", { job: big }), call(4, "cv_draft", { job: "" })]);
  const withJob = s.byId(1).result;
  assert.equal(withJob.isError, false);
  assert.deepEqual(withJob.structuredContent, cli(root, ["cv", "draft", "--job", file, "--json"]).json());
  assert.ok(withJob.content[0].text.startsWith(cli(root, ["cv", "draft", "--job", file]).stdout));
  assert.match(withJob.content[0].text, /no record shares enough words/);
  assert.deepEqual(withJob.structuredContent.match.gaps, [2]);
  assert.deepEqual(s.byId(2).result.structuredContent, cli(root, ["cv", "draft", "--json"]).json());
  assert.equal(s.byId(3).result.isError, true);
  assert.equal(s.byId(4).result.isError, true);
});

test("SCN-MCP-006-1 the actor comes from the client name", async () => {
  const { root, store } = tempStore();
  const names = ["claude-code", "Claude-AI", "codex", "codex-mcp-client", "other-client", null];
  const lines = names.map((n, i) => call(i + 1, "propose", { kind: "capability", statement: `Synthetic skill number ${i}.`, user_stated: true }, n));
  const s = await session(root, lines);
  const actors = names.map((_, i) => getRecord(store, s.byId(i + 1).result.structuredContent.id).provenance.actor);
  assert.deepEqual(actors, ["claude-code", "claude-ai", "codex", "codex", "cli", "cli"]);
  // Legacy: the name comes from initialize.
  const l = await session(root, [req(1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "codex-mcp-client", version: "1" } }),
    req(2, "tools/call", { name: "propose", arguments: { kind: "capability", statement: "Synthetic legacy skill.", user_stated: false } })]);
  assert.equal(getRecord(store, l.byId(2).result.structuredContent.id).provenance.actor, "codex");
});

test("SCN-MCP-006-2 a proposal stays proposed", async () => {
  const { root, store } = tempStore();
  const s = await session(root, call(1, "propose", { kind: "experience", statement: "Ran a synthetic seed swap.", user_stated: false, visibility: "ai", facets: { type: "project" } }));
  const result = s.byId(1).result.structuredContent;
  assert.deepEqual(Object.keys(result).sort(), ["id", "possible_duplicates", "previously_rejected", "revision", "state", "visibility"]);
  assert.ok(!s.stdout.includes("seed swap"));
  const r = getRecord(store, result.id);
  assert.equal(r.state, "proposed");
  assert.equal(r.visibility, "ai");
  assert.equal(r.provenance.user_stated, false);
  assert.deepEqual(r.sources, [{ kind: "chat", label: "mcp" }]);
});

test("SCN-MCP-006-3 an invalid proposal writes nothing", async () => {
  const { root, store } = tempStore();
  const s = await session(root, [
    call(1, "propose", { kind: "dream", statement: "x", user_stated: true }),
    call(2, "propose", { kind: "capability", statement: "Synthetic.", user_stated: true, extra: 1 }),
    call(3, "propose", { kind: "capability", statement: "", user_stated: true }),
    call(4, "propose", { kind: "capability", statement: "Synthetic.", user_stated: true, supersedes: ["01JC9Z00000000000000000001"] }),
    call(5, "propose", { kind: "capability", statement: "Synthetic.", user_stated: true, facets: { period: { start: "2024-13" } } }),
  ]);
  for (const id of [1, 2, 3, 4, 5]) assert.equal(s.byId(id).result.isError, true, `call ${id}`);
  assert.equal(s.byId(1).result.structuredContent.error.code, "usage");
  assert.equal(s.byId(3).result.structuredContent.error.code, "invalid");
  assert.equal(readAll(store).records.length, 0);
});

test("SCN-MCP-007-1 the check equals the CLI check", async () => {
  const { root, ids } = seeded();
  const text = `${cli(root, ["cv", "draft"]).stdout}- An uncited line.\n- A private line. [pk:${ids.secret}]\n`;
  const file = join(tempDir(), "cv.md");
  writeFileSync(file, text);
  const s = await session(root, call(1, "cv_check", { text }));
  assert.deepEqual(s.byId(1).result.structuredContent, cli(root, ["cv", "check", file, "--json"]).json());
  assert.equal(s.byId(1).result.structuredContent.ok, false);
});

test("SCN-MCP-007-2 the tool refuses oversized text", async () => {
  const { root } = seeded();
  const s = await session(root, call(1, "cv_check", { text: "é".repeat(600 * 1024) }));
  const r = s.byId(1).result;
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /1 MiB/);
  assert.ok(!s.stdout.includes("ééé"));
});
