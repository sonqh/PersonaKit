// Covers: REQ-WEB-004, REQ-WEB-008, REQ-WEB-010, REQ-ONB-001, REQ-ONB-005, REQ-ONB-006, REQ-WEB-007, REQ-ARC-003, REQ-WEB-009
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "./helpers.ts";
import { RECORD_KINDS } from "../src/core/schema.ts";

const WEB = join(REPO, "src", "web");
const files = readdirSync(WEB).filter((f) => !f.endsWith(".d.ts")).map((f) => ({ name: f, text: readFileSync(join(WEB, f), "utf8") }));
const read = (name: string): string => readFileSync(join(WEB, name), "utf8");

test("SCN-WEB-004-3 the app keeps only the token in browser storage", () => {
  for (const f of files) {
    for (const api of ["localStorage", "indexedDB", "document.cookie", "caches.open"]) assert.ok(!f.text.includes(api), `${f.name} uses ${api}`);
    if (f.name !== "logic.js") assert.ok(!f.text.includes("sessionStorage"), `${f.name} uses sessionStorage`);
  }
  const logic = read("logic.js");
  assert.equal((logic.match(/\.setItem\(/g) ?? []).length, 1, "one setItem call");
  assert.match(logic, /setItem\(TOKEN_KEY, token\)/);
  assert.match(read("app.js"), /credentials: "omit"/);
});

test("SCN-WEB-010-1 the static scan finds no markup sink", () => {
  const sinks = [/\binnerHTML\b/, /\bouterHTML\b/, /\binsertAdjacentHTML\b/, /document\.write/, /\beval\s*\(/, /new\s+Function\b/, /\son[a-z]+\s*=/, /javascript:/i, /<script>[^<]/];
  for (const f of files) for (const re of sinks) assert.ok(!re.test(f.text), `${f.name} matches ${re}`);
  const html = read("index.html");
  assert.ok(!/<style/i.test(html) && !/\sstyle=/i.test(html), "no inline style");
  assert.match(html, /<script type="module" src="\/app.js"><\/script>/);
  assert.match(read("app.js"), /textContent/);
});

test("SCN-ONB-001-1 every kind has questions and no question is for one profession", () => {
  const questions = JSON.parse(read("questions.json")) as { id: string; kind: string; text: string; hint?: string }[];
  for (const kind of RECORD_KINDS) assert.ok(questions.some((q) => q.kind === kind), kind);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  const devWords = /\b(github|gitlab|code|coding|programming|programmer|software|developer|repository|repo|api|framework|javascript|typescript|python|stack|commit|pull request)\b/i;
  for (const q of questions) assert.ok(!devWords.test(`${q.text} ${q.hint ?? ""}`), q.id);
});

test("the start screen offers the interview and the paste flow", () => {
  const html = read("index.html");
  assert.match(html, /id="view-start"[\s\S]*data-view="interview"[\s\S]*data-view="paste"/);
  assert.match(html, /id="start-text"/);
});

test("the review page and the record form exist", () => {
  const app = read("app.js");
  for (const route of ["/api/accept", "/api/reject", "/api/update", "/api/propose", "/api/split"]) assert.ok(app.includes(route), route);
  assert.match(app, /VISIBILITY_CHOICES/);
  assert.match(read("index.html"), /id="review-list"/);
});

test("the result screen shows plain text and the print style sheet hides the rest", () => {
  const html = read("index.html");
  assert.match(html, /<pre id="result-brief"/);
  assert.match(html, /id="print-view" hidden/);
  const css = read("app.css");
  assert.match(css, /@media print[\s\S]*body > \*:not\(#print-view\)[\s\S]*display: none/);
  assert.match(read("app.js"), /printEnabled\(/);
});

test("SCN-WEB-008-2 the data page and the README state the limit of the safeguard", () => {
  const phrase = "The token and the host checks are a safeguard, not a security boundary.";
  const html = read("index.html");
  assert.ok(html.includes(phrase));
  assert.match(html, /id="data-store"/);
  assert.match(html, /private git repository/);
  assert.match(html, /no record data in browser storage/);
  const readme = readFileSync(join(REPO, "README.md"), "utf8");
  assert.ok(readme.includes(phrase), "README");
  assert.match(readme, /personakit serve/);
});

test("the data page has the export button and the warning", () => {
  const html = read("index.html");
  assert.match(html, /id="export-start"/);
  assert.match(html, /id="export-warning"[^>]*hidden/);
  assert.match(read("app.js"), /exportAllowed\(/);
  assert.ok(!html.includes("/api/restore") && !read("app.js").includes("/api/restore"), "no web restore in M2");
});
