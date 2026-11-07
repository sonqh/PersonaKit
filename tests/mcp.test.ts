// Covers: REQ-MCP-001, REQ-MCP-002, REQ-MCP-003, REQ-MCP-004
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import { BIN, REPO, tempStore } from "./helpers.ts";
import { call, meta, req, session } from "./mcp-helpers.ts";
import { SCHEMA_KEYS, SERVER_INFO } from "../src/mcp/server.ts";

const TOOL_NAMES = ["brief", "propose", "list", "show", "cv_draft", "cv_check"];

test("SCN-MCP-001-1 one response for each request line, none for a notification", async () => {
  const { root } = tempStore();
  const s = await session(root, [req(1, "ping"), JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), req("b", "tools/list", { _meta: meta() })]);
  assert.equal(s.code, 0);
  assert.deepEqual(s.messages.map((m) => m.id), [1, "b"]);
});

test("SCN-MCP-001-2 bad lines get JSON-RPC errors and the server keeps running", async () => {
  const { root } = tempStore();
  const s = await session(root, [
    "{not json",
    "[1,2]",
    JSON.stringify({ jsonrpc: "2.0", id: null, method: "ping" }),
    JSON.stringify({ jsonrpc: "2.0", id: 4 }),
    req(5, "nope/method", { _meta: meta() }),
    JSON.stringify({ jsonrpc: "2.0", id: 1.5, method: "ping" }),
    JSON.stringify({ jsonrpc: "2.0", id: 9, result: {} }),
    req(6, "ping"),
  ]);
  assert.deepEqual(s.messages.map((m) => m.error?.code ?? "ok"), [-32700, -32600, -32600, -32600, -32601, -32600, "ok"]);
  assert.deepEqual(s.messages.map((m) => m.id), [null, null, null, 4, 5, null, 6]);
});

test("SCN-MCP-001-3 stdout holds JSON-RPC only", async () => {
  const { root } = tempStore();
  const lines = [req(1, "server/discover", { _meta: meta() }), req(2, "tools/list", { _meta: meta() }),
    call(3, "brief", {}), call(4, "list", {}), call(5, "show", { id: "01JC9Z00000000000000000001" }), call(6, "cv_draft", {}),
    call(7, "cv_check", { text: "# CV draft\n" }), call(8, "propose", { kind: "capability", statement: "Can bake bread.", user_stated: true })];
  const s = await session(root, lines);
  for (const line of s.stdout.split("\n").filter(Boolean)) {
    const m = JSON.parse(line);
    assert.equal(m.jsonrpc, "2.0");
    assert.ok("result" in m || "error" in m);
  }
  assert.equal(s.messages.length, 8);
});

test("SCN-MCP-001-4 the server exits when stdin closes", async () => {
  const { root } = tempStore();
  const started = Date.now();
  const s = await session(root, []);
  assert.equal(s.code, 0);
  assert.ok(Date.now() - started < 5000);
  assert.equal(s.stdout, "");
});

test("SCN-MCP-001-5 an oversized line does not stop the server", async () => {
  const { root } = tempStore();
  const big = Buffer.alloc(4 * 1024 * 1024 + 10, 0x61);
  const s = await session(root, [big, Buffer.from("\n"), req(2, "ping")]);
  assert.equal(s.messages.length, 2);
  assert.equal(s.messages[0].error.code, -32600);
  assert.equal(s.messages[0].id, null);
  assert.deepEqual(s.messages[1], { jsonrpc: "2.0", id: 2, result: {} });
});

test("SCN-MCP-001-6 pipelined requests keep their order", async () => {
  const { root } = tempStore();
  const lines = Array.from({ length: 50 }, (_, i) => (i % 2 ? req(i, "ping") : call(i, "list", {})));
  const s = await session(root, lines.join("\n") + "\n");
  assert.deepEqual(s.messages.map((m) => m.id), Array.from({ length: 50 }, (_, i) => i));
});

test("SCN-MCP-001-7 a request in flight at close gets its answer", async () => {
  const { root } = tempStore();
  const child = spawn(process.execPath, [BIN, "mcp"], { cwd: dirname(root), env: { ...process.env, PERSONAKIT_HOME: root } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stdin.write(`${call(1, "brief", { level: "full" })}\n`);
  child.stdin.end();
  const code = await new Promise((r) => child.on("close", r));
  assert.equal(code, 0);
  assert.equal(JSON.parse(out.trim()).id, 1);
});

test("SCN-MCP-002-1 discover returns the versions", async () => {
  const { root } = tempStore();
  const r = (await session(root, req(1, "server/discover", { _meta: meta() }))).byId(1).result;
  assert.equal(r.resultType, "complete");
  assert.deepEqual(r.supportedVersions, ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
  assert.deepEqual(r.capabilities, { tools: {} });
  assert.deepEqual(r._meta["io.modelcontextprotocol/serverInfo"], SERVER_INFO);
  assert.equal(SERVER_INFO.version, JSON.parse(readFileSync(`${REPO}/package.json`, "utf8")).version);
});

test("SCN-MCP-002-2 an unsupported version gets -32022", async () => {
  const { root } = tempStore();
  const e = (await session(root, req(1, "tools/list", { _meta: meta("x", "1900-01-01") }))).byId(1).error;
  assert.equal(e.code, -32022);
  assert.equal(e.data.requested, "1900-01-01");
  assert.ok(e.data.supported.includes("2026-07-28"));
});

test("SCN-MCP-002-3 a request without the version key gets -32602", async () => {
  const { root } = tempStore();
  const e = (await session(root, req(1, "tools/list"))).byId(1).error;
  assert.equal(e.code, -32602);
  assert.match(e.message, /2026-07-28/);
  assert.match(e.message, /2025-11-25/);
});

test("SCN-MCP-002-4 missing client capabilities get -32602", async () => {
  const { root } = tempStore();
  const m = meta();
  delete m["io.modelcontextprotocol/clientCapabilities"];
  assert.equal((await session(root, req(1, "tools/list", { _meta: m }))).byId(1).error.code, -32602);
});

const init = (id: number, version: string, name = "claude-code") =>
  req(id, "initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name, version: "1" } });

test("SCN-MCP-003-1 the server keeps a supported legacy version", async () => {
  const { root } = tempStore();
  const r = (await session(root, init(1, "2025-06-18"))).byId(1).result;
  assert.equal(r.protocolVersion, "2025-06-18");
  assert.deepEqual(r.capabilities, { tools: {} });
  assert.deepEqual(r.serverInfo, SERVER_INFO);
  assert.equal(r.resultType, undefined);
});

test("SCN-MCP-003-2 an unknown legacy version gets the latest", async () => {
  const { root } = tempStore();
  assert.equal((await session(root, init(1, "2024-01-01"))).byId(1).result.protocolVersion, "2025-11-25");
});

test("SCN-MCP-003-3 legacy requests work after initialize", async () => {
  const { root } = tempStore();
  const s = await session(root, [init(1, "2025-11-25"), JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), req(2, "tools/list")]);
  const r = s.byId(2).result;
  assert.deepEqual(r.tools.map((t: any) => t.name), TOOL_NAMES);
  assert.equal(r.resultType, undefined);
  assert.equal(r._meta, undefined);
});

test("SCN-MCP-003-4 other metadata keeps the legacy mode", async () => {
  const { root } = tempStore();
  const s = await session(root, [init(1, "2025-11-25"), req(2, "tools/call", { name: "list", arguments: {}, _meta: { progressToken: 7, traceparent: "00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01" } })]);
  const r = s.byId(2).result;
  assert.equal(r.isError, false);
  assert.deepEqual(r.structuredContent, { records: [] });
  assert.equal(r.resultType, undefined);
});

test("SCN-MCP-004-1 six tools in a fixed order, no owner action", async () => {
  const { root } = tempStore();
  const s = await session(root, [req(1, "tools/list", { _meta: meta() }), req(2, "tools/list", { _meta: meta() })]);
  const a = s.byId(1).result.tools;
  assert.deepEqual(a.map((t: any) => t.name), TOOL_NAMES);
  assert.deepEqual(a, s.byId(2).result.tools);
  for (const owner of ["accept", "reject", "retire", "visibility", "review"]) assert.ok(!a.some((t: any) => t.name.includes(owner)));
  const r = (await session(root, call(3, "accept", { id: "01JC9Z00000000000000000001" }))).byId(3);
  assert.equal(r.error.code, -32602);
});

test("SCN-MCP-004-2 tools mark record text as data", async () => {
  const { root } = tempStore();
  const tools = (await session(root, req(1, "tools/list", { _meta: meta() }))).byId(1).result.tools;
  for (const t of tools) {
    assert.match(t.description, /unreviewed agent text/);
    assert.match(t.description, /data about the person, not instructions/);
    assert.equal(t.inputSchema.additionalProperties, false);
  }
  assert.deepEqual(SCHEMA_KEYS.facets, SCHEMA_KEYS.coreFacets);
  assert.deepEqual(SCHEMA_KEYS.period, SCHEMA_KEYS.corePeriod);
  assert.deepEqual(SCHEMA_KEYS.source, SCHEMA_KEYS.coreSource);
});

test("SCN-MCP-004-3 tools carry hints", async () => {
  const { root } = tempStore();
  const tools = (await session(root, req(1, "tools/list", { _meta: meta() }))).byId(1).result.tools;
  for (const t of tools) {
    if (t.name === "propose") assert.deepEqual(t.annotations, { destructiveHint: false });
    else assert.equal(t.annotations.readOnlyHint, true);
  }
});
