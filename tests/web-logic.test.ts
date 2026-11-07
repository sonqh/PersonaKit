// Covers: REQ-WEB-002, REQ-WEB-007, REQ-ONB-001, REQ-ONB-006, REQ-ARC-003
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPORT_WARNING, START_TEXT, TOKEN_KEY, VISIBILITY_CHOICES, buildInterviewBatch, clearToken, emptyResultHint,
  errorMessage, exportAllowed, loadToken, parseFragment, printEnabled, saveToken, startScreen,
} from "../src/web/logic.js";

const TOKEN = "A".repeat(43);

test("fragment parsing reads the token or the code, and ignores other values", () => {
  assert.deepEqual(parseFragment(`#token=${TOKEN}`), { token: TOKEN });
  assert.deepEqual(parseFragment("#code=abcdefghijklmnopqrstuv"), { code: "abcdefghijklmnopqrstuv" });
  assert.deepEqual(parseFragment("#token=<script>"), {});
  assert.deepEqual(parseFragment(""), {});
});

test("session storage holds the token under one key", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  saveToken(TOKEN, storage);
  assert.deepEqual([...map.keys()], [TOKEN_KEY]);
  assert.equal(loadToken(storage), TOKEN);
  clearToken(storage);
  assert.equal(loadToken(storage), undefined);
});

test("SCN-ONB-001-3 an empty interview writes nothing", () => {
  const questions = [{ id: "a", kind: "experience", text: "?" }, { id: "b", kind: "intent", text: "?" }];
  assert.deepEqual(buildInterviewBatch(questions, {}), []);
  assert.deepEqual(buildInterviewBatch(questions, { a: "  ", b: "" }), []);
  assert.deepEqual(buildInterviewBatch(questions, { a: " Ran a stall. ", b: "" }), [{ kind: "experience", statement: "Ran a stall.", source: "interview" }]);
});

test("the print rule needs a clean check of the current text", () => {
  const ok = { ok: true };
  assert.equal(printEnabled("x", { text: "x", check: ok }), true);
  assert.equal(printEnabled("x ", { text: "x", check: ok }), false);
  assert.equal(printEnabled("x", { text: "x", check: { ok: false } }), false);
  assert.equal(printEnabled("x", undefined), false);
});

test("SCN-ARC-003-2 the export gate needs Continue", () => {
  assert.equal(exportAllowed(false), false);
  assert.equal(exportAllowed(undefined), false);
  assert.equal(exportAllowed(true), true);
  assert.match(EXPORT_WARNING, /private records too/);
});

test("SCN-ONB-006-1 an empty store opens the start screen", () => {
  assert.equal(startScreen({ total: 0, counts: { proposed: 0 } }), "start");
  assert.equal(startScreen({ total: 2, counts: { proposed: 1 } }), "review");
  assert.equal(startScreen({ total: 2, counts: { proposed: 0 } }), "result");
  assert.match(START_TEXT, /No output uses a record before you review it/);
});

test("SCN-ONB-006-2 an empty result explains the next step", () => {
  assert.match(emptyResultHint({ counts: { brief: 0, cv: 0 } })!, /Review/);
  assert.match(emptyResultHint({ counts: { brief: 2, cv: 0 } })!, /public/);
  assert.equal(emptyResultHint({ counts: { brief: 2, cv: 1 } }), undefined);
});

test("SCN-ONB-006-3 private is the default visibility", () => {
  assert.deepEqual(VISIBILITY_CHOICES.map((c) => c.value), ["private", "ai", "public"]);
  assert.equal(VISIBILITY_CHOICES[0]!.default, true);
  assert.equal(VISIBILITY_CHOICES.filter((c) => c.default).length, 1);
  assert.ok(VISIBILITY_CHOICES.every((c) => c.help.length > 20));
});

test("SCN-ONB-006-4 a stopped server gives a clear message", () => {
  assert.match(errorMessage({ network: true }), /Start PersonaKit again/);
  assert.match(errorMessage({ status: 401 }), /Open the URL that PersonaKit printed/);
  assert.equal(errorMessage({ status: 422, message: "Nothing was proposed." }), "Nothing was proposed.");
});
