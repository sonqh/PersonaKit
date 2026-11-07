// Covers: REQ-WEB-005, REQ-WEB-006, REQ-WEB-007, REQ-WEB-008, REQ-WEB-010, REQ-ONB-001, REQ-ONB-003, REQ-ONB-005, REQ-ARC-001, REQ-ARC-003
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openStore, readAll, readEvents, update } from "../src/core/store.ts";
import { buildInterviewBatch, printEnabled } from "../src/web/logic.js";
import { REPO, cli } from "./helpers.ts";
import { call, withServer } from "./web-helpers.ts";

const questions = JSON.parse(readFileSync(join(REPO, "src", "web", "questions.json"), "utf8"));

async function proposeOne(s: { port: number; token: string }, kind: string, statement: string): Promise<string> {
  const r = await call(s, { path: "/api/propose", body: { items: [{ kind, statement }] } });
  assert.equal(r.status, 200, r.text);
  return r.json().proposed[0].id;
}

async function acceptAs(s: { port: number; token: string }, id: string, visibility: string): Promise<void> {
  const r = await call(s, { path: "/api/accept", body: { id, revision: 1, visibility } });
  assert.equal(r.status, 200, r.text);
}

// ---------- REQ-WEB-005 ----------

test("SCN-WEB-005-1 a new record from the form is a proposal", async () => {
  await withServer(async (s) => {
    const id = await proposeOne(s, "experience", "Drove a synthetic school bus.");
    const rec = readAll(openStore(s.root, { skipLocationCheck: true })).records.find((r) => r.id === id)!;
    assert.equal(rec.state, "proposed");
    assert.equal(rec.provenance.actor, "web");
    assert.equal(rec.provenance.user_stated, true);
    assert.equal(rec.sources[0]!.kind, "manual");
  });
});

test("SCN-WEB-005-2 an edit of an accepted record makes a proposal", async () => {
  await withServer(async (s) => {
    const id = await proposeOne(s, "experience", "Drove a synthetic school bus.");
    await acceptAs(s, id, "public");
    const path = join(s.root, "records", `${id}.json`);
    const before = readFileSync(path, "utf8");
    const r = await call(s, { path: "/api/update", body: { id, revision: 2, statement: "Drove a synthetic school bus for five years." } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json().outcome, "superseding_proposal");
    assert.equal(readFileSync(path, "utf8"), before);
    const created = readAll(openStore(s.root, { skipLocationCheck: true })).records.find((x) => x.id === r.json().id)!;
    assert.deepEqual(created.supersedes, [id]);
  });
});

test("SCN-WEB-005-3 a stale edit does not overwrite", async () => {
  await withServer(async (s) => {
    const id = await proposeOne(s, "capability", "Sews synthetic costumes.");
    const store = openStore(s.root, { skipLocationCheck: true });
    update(store, id, 1, { statement: "Sews synthetic stage costumes." }, { actor: "codex" });
    const r = await call(s, { path: "/api/update", body: { id, revision: 1, statement: "Sews costumes by hand." } });
    assert.equal(r.status, 409);
    const newId = r.json().error.details.id;
    const all = readAll(store).records;
    assert.equal(all.find((x) => x.id === id)!.statement, "Sews synthetic stage costumes.");
    assert.equal(all.find((x) => x.id === newId)!.statement, "Sews costumes by hand.");
  });
});

// ---------- REQ-WEB-010 ----------

test("SCN-WEB-010-2 a script tag in a statement stays text", async () => {
  await withServer(async (s) => {
    await proposeOne(s, "capability", "<script>alert(1)</script> synthetic");
    const r = await call(s, { path: "/api/records" });
    assert.match(String(r.headers["content-type"]), /^application\/json/);
    assert.equal(r.json().records[0].statement, "<script>alert(1)</script> synthetic");
    const page = await call(s, { path: "/", token: null });
    assert.match(String(page.headers["content-security-policy"]), /script-src 'self'/);
    assert.ok(!String(page.headers["content-security-policy"]).includes("unsafe-inline"));
  });
});

// ---------- REQ-ONB-001 and REQ-ONB-003 ----------

test("SCN-ONB-001-2 interview answers become proposals", async () => {
  await withServer(async (s) => {
    const answers: Record<string, string> = { "experience-1": "Ran a synthetic night market stall.", "experience-2": "Coached a synthetic youth team.", "intent-1": "Open a small bakery.", "capability-1": "   ", "identity-name": "" };
    const items = buildInterviewBatch(questions, answers);
    assert.equal(items.length, 3);
    const r = await call(s, { path: "/api/propose", body: { items } });
    assert.equal(r.status, 200, r.text);
    const records = readAll(openStore(s.root, { skipLocationCheck: true })).records;
    assert.equal(records.length, 3);
    assert.ok(records.every((x) => x.provenance.actor === "web" && x.provenance.user_stated && x.sources[0]!.kind === "interview"));
  });
});

test("SCN-ONB-003-1 the owner edits drafts before the proposal", async () => {
  await withServer(async (s) => {
    const split = await call(s, { path: "/api/split", body: { text: "- Sorted synthetic parcels.\n- Drove a forklift.\n- Kept the stock list." } });
    assert.equal(split.status, 200);
    const drafts = split.json().drafts;
    assert.equal(drafts.length, 3);
    assert.equal(readdirSync(join(s.root, "records")).length, 0, "split writes nothing");
    const items = [drafts[0], { ...drafts[2], statement: "Kept the synthetic stock list up to date." }].map((d: { kind: string; statement: string }) => ({ kind: d.kind, statement: d.statement, source: "cv" }));
    const r = await call(s, { path: "/api/propose", body: { items } });
    assert.equal(r.status, 200, r.text);
    const records = readAll(openStore(s.root, { skipLocationCheck: true })).records;
    assert.deepEqual(records.map((x) => x.statement).sort(), ["Kept the synthetic stock list up to date.", "Sorted synthetic parcels."]);
    assert.ok(records.every((x) => x.sources[0]!.kind === "cv" && x.provenance.actor === "web"));
  });
});

test("SCN-ONB-003-2 one draft that is not valid stops the batch", async () => {
  await withServer(async (s) => {
    const items = [{ kind: "experience", statement: "One.", source: "cv" }, { kind: "experience", statement: "  ", source: "cv" }, { kind: "experience", statement: "Three.", source: "cv" }];
    const r = await call(s, { path: "/api/propose", body: { items } });
    assert.equal(r.status, 422);
    assert.match(r.json().error.message, /item 2/);
    assert.equal(readdirSync(join(s.root, "records")).length, 0);
  });
});

// ---------- REQ-ONB-005 ----------

test("SCN-ONB-005-1 the owner accepts with a visibility", async () => {
  await withServer(async (s) => {
    const id = await proposeOne(s, "capability", "Speaks synthetic Basque.");
    await acceptAs(s, id, "ai");
    const store = openStore(s.root, { skipLocationCheck: true });
    const rec = readAll(store).records[0]!;
    assert.equal(rec.state, "accepted");
    assert.equal(rec.visibility, "ai");
    const ev = readEvents(store).events.find((e) => e.type === "accepted")!;
    assert.equal(ev.actor, "web");
  });
});

test("accept without a visibility uses private", async () => {
  await withServer(async (s) => {
    const id = await proposeOne(s, "capability", "Speaks synthetic Basque.");
    const r = await call(s, { path: "/api/accept", body: { id, revision: 1 } });
    assert.equal(r.json().visibility, "private");
  });
});

test("SCN-ONB-005-2 the owner rejects a proposal", async () => {
  await withServer(async (s) => {
    const id = await proposeOne(s, "capability", "Juggles synthetic torches.");
    const r = await call(s, { path: "/api/reject", body: { id, revision: 1 } });
    assert.equal(r.status, 200);
    assert.equal(readAll(openStore(s.root, { skipLocationCheck: true })).records[0]!.state, "rejected");
  });
});

test("SCN-ONB-005-3 a changed proposal needs a new review", async () => {
  await withServer(async (s) => {
    const id = await proposeOne(s, "capability", "Juggles.");
    update(openStore(s.root, { skipLocationCheck: true }), id, 1, { statement: "Juggles synthetic torches." }, { actor: "codex" });
    const r = await call(s, { path: "/api/accept", body: { id, revision: 1, visibility: "public" } });
    assert.equal(r.status, 409);
    assert.equal(readAll(openStore(s.root, { skipLocationCheck: true })).records[0]!.state, "proposed");
  });
});

// ---------- REQ-WEB-006 and REQ-WEB-007 ----------

test("SCN-WEB-006-1 the result shows both outputs, byte for byte as the CLI", async () => {
  await withServer(async (s) => {
    await acceptAs(s, await proposeOne(s, "experience", "Ran a synthetic ferry desk."), "public");
    await acceptAs(s, await proposeOne(s, "preference", "Wants short synthetic answers."), "ai");
    await proposeOne(s, "intent", "SYNTH-PRIVATE-CANARY plan.");
    const r = await call(s, { path: "/api/result" });
    assert.equal(r.status, 200);
    const data = r.json();
    assert.equal(data.brief, cli(s.root, ["brief"]).stdout);
    assert.equal(data.cv, cli(s.root, ["cv", "draft"]).stdout);
    assert.equal(data.check.ok, true);
    assert.deepEqual(data.counts, { brief: 2, cv: 1 });
    assert.ok(!data.brief.includes("CANARY") && !data.cv.includes("CANARY"));
  });
});

test("SCN-WEB-006-2 an edited line without a marker shows a finding", async () => {
  await withServer(async (s) => {
    await acceptAs(s, await proposeOne(s, "experience", "Ran a synthetic ferry desk."), "public");
    const cv = (await call(s, { path: "/api/result" })).json().cv as string;
    const text = `${cv}I am great at everything.\n`;
    const r = await call(s, { path: "/api/cv/check", body: { text } });
    assert.equal(r.status, 200);
    const finding = r.json().findings.find((f: { level: string }) => f.level === "error");
    assert.ok(finding);
    assert.equal(finding.line, text.split("\n").length - 1);
    assert.equal(typeof finding.code, "string");
  });
});

test("SCN-WEB-007-1 a clean check turns on the print view", async () => {
  await withServer(async (s) => {
    await acceptAs(s, await proposeOne(s, "experience", "Ran a synthetic ferry desk."), "public");
    const cv = (await call(s, { path: "/api/result" })).json().cv as string;
    const check = (await call(s, { path: "/api/cv/check", body: { text: cv } })).json();
    assert.equal(printEnabled(cv, { text: cv, check }), true);
    const strip = await call(s, { path: "/api/cv/strip", body: { text: cv } });
    assert.equal(strip.status, 200);
    assert.ok(!strip.json().text.includes("[pk:"));
    assert.match(strip.json().text, /synthetic ferry desk/);
  });
});

test("SCN-WEB-007-2 a check error keeps the print view off", async () => {
  await withServer(async (s) => {
    await acceptAs(s, await proposeOne(s, "experience", "Ran a synthetic ferry desk."), "public");
    const cv = (await call(s, { path: "/api/result" })).json().cv as string;
    const broken = `${cv}No marker here.\n`;
    const check = (await call(s, { path: "/api/cv/check", body: { text: broken } })).json();
    assert.equal(printEnabled(broken, { text: broken, check }), false);
    const clean = (await call(s, { path: "/api/cv/check", body: { text: cv } })).json();
    assert.equal(printEnabled(`${cv} `, { text: cv, check: clean }), false);
    const strip = await call(s, { path: "/api/cv/strip", body: { text: broken } });
    assert.equal(strip.status, 422);
    assert.equal(strip.json().text, undefined);
  });
});

// ---------- REQ-WEB-008 ----------

test("SCN-WEB-008-1 the state names the store path", async () => {
  await withServer(async (s) => {
    const r = await call(s, { path: "/api/state" });
    assert.equal(r.json().store, s.storeRoot);
    assert.equal(r.json().total, 0);
  });
});

// ---------- REQ-ARC-001 and REQ-ARC-003 ----------

test("SCN-ARC-003-2 the export answers only with the token, as an attachment, and matches the CLI export", async () => {
  await withServer(async (s) => {
    await proposeOne(s, "intent", "SYNTH private plan.");
    assert.equal((await call(s, { path: "/api/export", token: null })).status, 401);
    const r = await call(s, { path: "/api/export" });
    assert.equal(r.status, 200);
    assert.match(String(r.headers["content-disposition"]), /^attachment; filename="personakit-export\.json"$/);
    assert.equal(r.headers["cache-control"], "no-store");
    const out = join(s.root, "..", "cli-export.json");
    assert.equal(cli(s.root, ["export", "--out", out]).code, 0);
    assert.equal(r.text, readFileSync(out, "utf8"));
  });
});

test("an unreadable record makes the result route fail with 422", async () => {
  await withServer(async (s) => {
    writeFileSync(join(s.root, "records", "01ARZ3NDEKTSV4RRFFQ69G5FAV.json"), "nope");
    assert.equal((await call(s, { path: "/api/result" })).status, 422);
  });
});
