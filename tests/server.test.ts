// Covers: REQ-WEB-001, REQ-WEB-002, REQ-WEB-003, REQ-WEB-004, REQ-WEB-009
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, connect } from "node:net";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { BIN, REPO, tempStore } from "./helpers.ts";
import { call, spawnServe, withServer } from "./web-helpers.ts";
import { CODE_TTL_MS, SECURITY_HEADERS } from "../src/server/server.ts";

// ---------- REQ-WEB-001 ----------

test("SCN-WEB-001-1 the server listens on the loopback address only and prints one URL with a token", async () => {
  const { root } = tempStore();
  const s = await spawnServe(root);
  try {
    assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43}$/);
    assert.equal((s.out().match(/#token=/g) ?? []).length, 1);
    const r = await call(s, { path: "/api/state" });
    assert.equal(r.status, 200);
  } finally {
    assert.equal(await s.stop(), 0);
  }
  await withServer(async (srv) => {
    assert.equal((srv.server.address() as { address: string }).address, "127.0.0.1");
  });
});

test("SCN-WEB-001-2 the server sends the static app", async () => {
  await withServer(async (s) => {
    const r = await call(s, { path: "/", token: null });
    assert.equal(r.status, 200);
    assert.match(String(r.headers["content-type"]), /text\/html/);
    assert.equal(r.text, readFileSync(join(REPO, "src", "web", "index.html"), "utf8"));
    for (const p of ["/app.js", "/logic.js", "/app.css", "/questions.json"]) assert.equal((await call(s, { path: p, token: null })).status, 200, p);
    assert.equal((await call(s, { path: "/../package.json", token: null })).status, 404);
    assert.equal((await call(s, { path: "/src/web/app.js", token: null })).status, 404);
  });
});

test("SCN-WEB-001-3 a busy port stops the server with a message", async () => {
  const blocker = createServer();
  await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", () => r()));
  const port = (blocker.address() as { port: number }).port;
  const { root } = tempStore();
  const child = spawn(process.execPath, [BIN, "serve", "--port", String(port)], { cwd: dirname(root), env: { ...process.env, PERSONAKIT_HOME: root } });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  const code = await new Promise<number | null>((r) => child.on("close", r));
  blocker.close();
  assert.equal(code, 1);
  assert.match(err, new RegExp(`Port ${port}`));
});

test("serve creates a missing store", async () => {
  const { cwd } = tempStore();
  const root = join(cwd, "new-store");
  await withServer(async () => {}, { storePath: root, cwd });
  assert.ok(readdirSync(root).includes("store.json"));
});

// ---------- REQ-WEB-002 ----------

test("SCN-WEB-002-1 a request without the token gets no data", async () => {
  await withServer(async (s) => {
    await call(s, { path: "/api/propose", body: { items: [{ kind: "capability", statement: "SYNTH-CANARY-1 sings." }] } });
    for (const path of ["/api/state", "/api/records", "/api/result", "/api/export"]) {
      const r = await call(s, { path, token: null });
      assert.equal(r.status, 401, path);
      assert.ok(!r.text.includes("CANARY") && !/[0-9A-HJKMNP-TV-Z]{26}/.test(r.text), path);
    }
  });
});

test("SCN-WEB-002-2 a wrong token gets no data", async () => {
  await withServer(async (other) => {
    await withServer(async (s) => {
      const r = await call(s, { path: "/api/records", token: other.token });
      assert.equal(r.status, 401);
      const w = await call(s, { path: "/api/propose", token: other.token, body: { items: [{ kind: "capability", statement: "Sings." }] } });
      assert.equal(w.status, 401);
      assert.equal(readdirSync(join(s.root, "records")).length, 0);
    });
  });
});

test("SCN-WEB-002-3 the correct token opens the API", async () => {
  await withServer(async (s) => {
    const r = await call(s, { path: "/api/records" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json().records, []);
  });
});

test("SCN-WEB-002-4 a token in the query string does not count", async () => {
  await withServer(async (s) => {
    assert.equal((await call(s, { path: `/api/records?token=${s.token}`, token: null })).status, 401);
  });
});

// ---------- REQ-WEB-003 ----------

test("SCN-WEB-003-1 the server refuses a rebound host name", async () => {
  await withServer(async (s) => {
    const r = await call(s, { path: "/api/records", host: `attacker.example:${s.port}` });
    assert.equal(r.status, 403);
    assert.ok(!r.text.includes("records"));
    assert.equal((await call(s, { path: "/", host: `attacker.example:${s.port}`, token: null })).status, 403);
    assert.equal((await call(s, { path: "/api/records", host: `localhost:${s.port}` })).status, 200);
  });
});

test("SCN-WEB-003-2 a foreign origin cannot write", async () => {
  await withServer(async (s) => {
    const r = await call(s, { path: "/api/propose", origin: "http://attacker.example", body: { items: [{ kind: "capability", statement: "Sings." }] } });
    assert.equal(r.status, 403);
    assert.equal(readdirSync(join(s.root, "records")).length, 0);
    const noOrigin = await call(s, { path: "/api/propose", origin: null, body: { items: [{ kind: "capability", statement: "Sings." }] } });
    assert.equal(noOrigin.status, 403);
    const form = await call(s, { path: "/api/propose", rawBody: "a=b", contentType: "application/x-www-form-urlencoded" });
    assert.equal(form.status, 415);
    assert.equal(readdirSync(join(s.root, "records")).length, 0);
  });
});

test("SCN-WEB-003-3 a preflight request gets no CORS permission", async () => {
  await withServer(async (s) => {
    const r = await call(s, { method: "OPTIONS", path: "/api/records" });
    assert.equal(r.status, 405);
    assert.equal(r.headers["access-control-allow-origin"], undefined);
    const g = await call(s, { path: "/api/records" });
    assert.ok(!Object.keys(g.headers).some((h) => h.startsWith("access-control-")));
  });
});

test("SCN-WEB-003-4 a request without a Host header fails", async () => {
  await withServer(async (s) => {
    const text = await new Promise<string>((resolveText) => {
      const sock = connect(s.port, "127.0.0.1", () => sock.write(`GET /api/records HTTP/1.0\r\nX-PersonaKit-Token: ${s.token}\r\n\r\n`));
      let buf = "";
      sock.on("data", (d) => (buf += d));
      sock.on("end", () => resolveText(buf));
    });
    assert.match(text, /^HTTP\/1\.[01] 400/);
    assert.ok(!text.includes("\"records\""));
  });
});

test("SCN-WEB-003-5 the Origin null fails", async () => {
  await withServer(async (s) => {
    assert.equal((await call(s, { path: "/api/records", origin: "null" })).status, 403);
  });
});

test("SCN-WEB-003-6 an Origin with another port fails", async () => {
  await withServer(async (s) => {
    assert.equal((await call(s, { path: "/api/records", origin: `http://127.0.0.1:${s.port + 1}` })).status, 403);
  });
});

test("every answer carries the security headers", async () => {
  await withServer(async (s) => {
    for (const r of [await call(s, { path: "/", token: null }), await call(s, { path: "/api/state" }), await call(s, { path: "/api/state", token: null })]) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers[k.toLowerCase()], v, k);
    }
  });
});

// ---------- REQ-WEB-004 ----------

test("SCN-WEB-004-1 the owner sees a private record through the API", async () => {
  await withServer(async (s) => {
    await call(s, { path: "/api/propose", body: { items: [{ kind: "intent", statement: "SYNTH private plan." }] } });
    const r = await call(s, { path: "/api/records" });
    assert.equal(r.json().records[0].visibility, "private");
    assert.equal(r.json().records[0].statement, "SYNTH private plan.");
  });
});

test("SCN-WEB-004-2 the server output holds no record text", async () => {
  const { root } = tempStore();
  const s = await spawnServe(root);
  const p = await call(s, { path: "/api/propose", body: { items: [{ kind: "intent", statement: "SYNTH-SERVE-CANARY-55 wants a boat." }] } });
  assert.equal(p.status, 200, p.text);
  assert.equal((await call(s, { path: "/api/export" })).status, 200);
  await call(s, { path: "/api/propose", body: { items: [{ kind: "nope", statement: "SYNTH-SERVE-CANARY-55 again." }] } });
  await s.stop();
  assert.ok(!s.out().includes("CANARY") && !s.err().includes("CANARY"));
});

test("SCN-WEB-004-3 every API answer is JSON with no-store", async () => {
  await withServer(async (s) => {
    for (const r of [await call(s, { path: "/api/state" }), await call(s, { path: "/api/export" }), await call(s, { path: "/api/nothing" }), await call(s, { path: "/api/state", token: null })]) {
      assert.equal(r.headers["cache-control"], "no-store");
      assert.match(String(r.headers["content-type"]), /^application\/json/);
    }
  });
});

test("the body limit answers 413", async () => {
  await withServer(async (s) => {
    const r = await call(s, { path: "/api/split", rawBody: JSON.stringify({ text: "a".repeat(1024 * 1024 + 10) }) });
    assert.equal(r.status, 413);
  });
});

// ---------- REQ-WEB-009 ----------

test("SCN-WEB-009-1 SCN-WEB-009-3 the code gives the token once, and the opener never sees the token", async () => {
  const opened: string[] = [];
  await withServer(async (s) => {
    assert.equal(opened.length, 1);
    const m = /^http:\/\/127\.0\.0\.1:(\d+)\/#code=([A-Za-z0-9_-]+)$/.exec(opened[0]!);
    assert.ok(m, opened[0]);
    assert.equal(Number(m[1]), s.port);
    assert.ok(!opened[0]!.includes(s.token));
    const first = await call(s, { path: "/api/session", token: null, body: { code: m[2] } });
    assert.equal(first.status, 200);
    assert.equal(first.json().token, s.token);
    const second = await call(s, { path: "/api/session", token: null, body: { code: m[2] } });
    assert.equal(second.status, 401);
  }, { open: true, opener: (url) => opened.push(url) });
});

test("SCN-WEB-009-2 an expired code fails", async () => {
  let clock = 1_000_000;
  let url = "";
  await withServer(async (s) => {
    clock += CODE_TTL_MS + 1;
    const code = url.split("#code=")[1];
    const r = await call(s, { path: "/api/session", token: null, body: { code } });
    assert.equal(r.status, 401);
    assert.ok(!r.text.includes(s.token));
  }, { open: true, opener: (u) => { url = u; }, now: () => clock });
});

test("without --open the session route gives no token", async () => {
  await withServer(async (s) => {
    const r = await call(s, { path: "/api/session", token: null, body: { code: "x".repeat(22) } });
    assert.equal(r.status, 401);
  });
});

test("SCN-WEB-009-4 the launchers start the server", () => {
  for (const f of ["personakit-web.command", "personakit-web.bat"]) {
    const text = readFileSync(join(REPO, "scripts", f), "utf8");
    assert.match(text, /personakit serve --open/, f);
  }
});
