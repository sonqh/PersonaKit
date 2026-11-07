// Covers: REQ-MCP-008, REQ-VIS-001
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { McpServer, UNEXPECTED_MESSAGE, installCrashLogging, serveStdio } from "../src/mcp/server.ts";
import { ownerAction, propose } from "../src/core/store.ts";
import { tempStore } from "./helpers.ts";
import { call, req, session } from "./mcp-helpers.ts";

const owner = { actor: "cli" as const };
const CANARY = "MCP-CANARY-4417";

test("SCN-MCP-008-1 a canary appears in no MCP output", async () => {
  const { root, store } = tempStore();
  const { record: secret } = propose(store, { kind: "identity", statement: `${CANARY} private statement.`, sources: [{ kind: "chat", ref: `/tmp/${CANARY}` }], user_stated: true }, owner);
  ownerAction(store, "accept", secret.id, { visibility: "private" }, owner);
  const { record: pending } = propose(store, { kind: "capability", statement: `${CANARY} private proposal.`, sources: [{ kind: "chat" }], user_stated: true }, owner);
  // A corrupt record file whose bad values hold the canary. (JSON-RPC IDs are echoed by protocol, so no canary goes in an ID.)
  const corruptId = "01JC9Z00000000000000000909";
  writeFileSync(join(root, "records", `${corruptId}.json`), JSON.stringify({ schema: CANARY, id: corruptId, [CANARY]: CANARY }));
  const corrupt2 = "01JC9Z00000000000000000998";
  writeFileSync(join(root, "records", `${corrupt2}.json`), JSON.stringify({ schema: "personakit.record/v0", id: corrupt2, kind: CANARY, [CANARY]: 1 }));
  const lines = [
    `{"jsonrpc":"2.0","id":1,"method":"${CANARY}`,
    req(2, CANARY),
    JSON.stringify({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: CANARY, _meta: { "io.modelcontextprotocol/protocolVersion": CANARY, "io.modelcontextprotocol/clientCapabilities": {} } } }),
    call(3, "brief", { level: "full" }), call(4, "brief", { level: "short" }), call(5, "list", {}),
    call(6, "show", { id: secret.id }), call(7, "show", { id: pending.id }), call(8, "show", { id: corruptId }), call(9, "show", { id: corrupt2 }),
    call(10, "show", { id: CANARY }), call(11, "cv_draft", {}), call(12, "cv_check", { text: `- line [pk:${secret.id}]\n` }),
    call(13, "propose", { kind: "capability", statement: "Synthetic.", user_stated: true, [CANARY]: CANARY }),
    call(14, "propose", { kind: CANARY, statement: "Synthetic.", user_stated: true, facets: { [CANARY]: 1, period: { [CANARY]: 2 } }, sources: [{ kind: "chat", [CANARY]: 3 }] }),
    call(15, "propose", { kind: "capability", statement: "Synthetic.", user_stated: true, supersedes: [CANARY] }),
    call(16, "list", { state: CANARY }),
    call(17, CANARY, {}),
    call(18, "cv_draft", { as_of: CANARY }),
    call(19, "propose", { kind: "capability", statement: "Synthetic.", user_stated: CANARY }),
  ];
  const s = await session(root, lines);
  assert.equal(s.code, 0);
  assert.ok(!s.stdout.includes(CANARY), s.stdout.split("\n").find((l) => l.includes(CANARY)));
  assert.ok(!s.stderr.includes(CANARY), s.stderr);
  assert.equal(s.byId(8).result.isError, true);
  assert.equal(s.byId(9).result.isError, true);
  assert.equal(s.byId(6).result.structuredContent.redacted, true);
  // Bad arguments wrote nothing.
  assert.equal(readdirSync(join(root, "records")).length, 4);
});

test("SCN-MCP-008-2 a tool failure is a tool result", async () => {
  const { root } = tempStore();
  const r = (await session(root, call(1, "show", { id: "01JC9Z00000000000000000001" }))).byId(1).result;
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.error.code, "notFound");
  assert.equal(r.structuredContent.error.exit_code, 5);
  assert.equal(r.resultType, "complete");
});

test("SCN-MCP-008-3 an unknown tool gets -32602", async () => {
  const { root, store } = tempStore();
  const { record } = propose(store, { kind: "capability", statement: "Synthetic pending.", sources: [{ kind: "chat" }], user_stated: true }, owner);
  const s = await session(root, [call(1, "accept", { id: record.id }), call(2, "reject", { id: record.id })]);
  assert.equal(s.byId(1).error.code, -32602);
  assert.equal(s.byId(2).error.code, -32602);
  assert.equal((await import("../src/core/store.ts")).getRecord(store, record.id).state, "proposed");
});

test("an unexpected error gives the fixed message and logs only the class", async () => {
  const { root } = tempStore();
  const logs: string[] = [];
  class StubFailure extends Error {}
  const server = new McpServer({
    storePath: root,
    cwd: dirname(root),
    log: (line) => logs.push(line),
    operations: { listRecords: () => { throw new StubFailure(`${CANARY} raw error text`); } },
  });
  const r: any = await server.handleLine(call(1, "list", {}));
  const result = r.result;
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, UNEXPECTED_MESSAGE);
  assert.deepEqual(result.structuredContent.error, { code: "unexpected", exit_code: 1, message: UNEXPECTED_MESSAGE, details: {} });
  assert.deepEqual(logs, ["personakit mcp: unexpected error in tool list: StubFailure"]);
  assert.ok(!JSON.stringify(r).includes(CANARY));
});

test("the crash handlers log only the error class", () => {
  const emitter = new EventEmitter();
  const logs: string[] = [];
  installCrashLogging((line) => logs.push(line), emitter as unknown as NodeJS.Process);
  class CanaryCrash extends Error {}
  emitter.emit("uncaughtException", new CanaryCrash(`${CANARY} uncaught text`));
  emitter.emit("unhandledRejection", new TypeError(`${CANARY} rejection text`));
  emitter.emit("unhandledRejection", `${CANARY} a string reason`);
  assert.deepEqual(logs, ["personakit mcp: uncaught CanaryCrash", "personakit mcp: unhandled TypeError", "personakit mcp: unhandled String"]);
  assert.ok(!logs.join("\n").includes(CANARY));
});

test("a stdin error drains the queue like end of file", async () => {
  const { root } = tempStore();
  const logs: string[] = [];
  const server = new McpServer({ storePath: root, cwd: dirname(root), log: (line) => logs.push(line) });
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let out = "";
  stdout.on("data", (d) => (out += d));
  const done = serveStdio(server, stdin, stdout, (line) => logs.push(line));
  stdin.write(`${req(1, "ping")}\n${req(2, "ping")}`);
  stdin.emit("error", new Error(`${CANARY} read failure`));
  await done;
  assert.deepEqual(out.trim().split("\n").map((l) => JSON.parse(l).id), [1, 2]);
  assert.deepEqual(logs, ["personakit mcp: stdin Error"]);
});
