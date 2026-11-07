// Covers: REQ-ONB-002
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { splitText, TEXT_IMPORT_MAX_BYTES } from "../src/core/text-import.ts";
import { PersonaKitError } from "../src/core/errors.ts";
import { tempStore } from "./helpers.ts";

test("SCN-ONB-002-1 list items and paragraphs become drafts", () => {
  const text = "Synthetic person who runs a community kitchen.\nShe plans menus for events.\n\n- Cooked for 80 guests a night.\n* Trained four volunteers.\n• Kept the food safety log.\n";
  const drafts = splitText(text);
  assert.deepEqual(drafts.map((d) => d.statement), [
    "Synthetic person who runs a community kitchen. She plans menus for events.",
    "Cooked for 80 guests a night.",
    "Trained four volunteers.",
    "Kept the food safety log.",
  ]);
  assert.ok(drafts.every((d) => d.kind === "experience" && d.problems.length === 0));
});

test("SCN-ONB-002-2 section headings set the kind", () => {
  const drafts = splitText("Skills\n- Conversational Portuguese\n\n## Goals:\n- Lead a small bakery team\n");
  assert.deepEqual(drafts.map((d) => [d.kind, d.statement]), [
    ["capability", "Conversational Portuguese"],
    ["intent", "Lead a small bakery team"],
  ]);
});

test("SCN-ONB-002-3 the splitter is deterministic", () => {
  const text = "Summary\nCalm under pressure.\n\nExperience\n1. Ran a ferry ticket desk.\n2) Sorted parcels\n   on the night shift.\n";
  const a = splitText(text);
  const b = splitText(`﻿${text.replace(/\n/g, "\r\n")}`);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((d) => d.statement), ["Calm under pressure.", "Ran a ferry ticket desk.", "Sorted parcels on the night shift."]);
  assert.equal(a[0]!.kind, "identity");
});

test("SCN-ONB-002-4 the splitter refuses oversized text", () => {
  const big = "a".repeat(TEXT_IMPORT_MAX_BYTES + 1);
  assert.throws(() => splitText(big), (e: unknown) => e instanceof PersonaKitError && e.exitCode === 6);
  const many = Array.from({ length: 501 }, (_, i) => `- item ${i}`).join("\n");
  assert.throws(() => splitText(many), (e: unknown) => e instanceof PersonaKitError && e.exitCode === 6 && /501 drafts/.test(e.message));
});

test("the splitter writes nothing and marks long drafts", () => {
  const { root } = tempStore();
  const drafts = splitText(`${"word ".repeat(500)}\n\n- short`);
  assert.equal(drafts[0]!.problems.length, 1);
  assert.equal(drafts[1]!.problems.length, 0);
  assert.equal(readdirSync(join(root, "records")).length, 0);
});

test("control characters and NFC are handled", () => {
  const drafts = splitText("- Café shift lead​\u0007\n");
  assert.equal(drafts[0]!.statement, "Café shift lead");
});
