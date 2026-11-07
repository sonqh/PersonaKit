// Deterministic splitter for pasted CV text. No model, no file parsing, no store writes.
// REQ-ONB-002

import { PersonaKitError } from "./errors.ts";
import { CONTROL_CHARS, STATEMENT_MAX, type RecordKind } from "./schema.ts";

export const TEXT_IMPORT_MAX_BYTES = 256 * 1024;
export const TEXT_IMPORT_MAX_DRAFTS = 500;

export interface Draft {
  kind: RecordKind;
  statement: string;
  /** Problems the owner must solve before the draft can become a proposal. */
  problems: string[];
}

/** Section words (lower case, without a colon) and the kind of the drafts after them. */
export const SECTION_KINDS: Readonly<Record<string, RecordKind>> = {
  "summary": "identity",
  "profile": "identity",
  "about": "identity",
  "about me": "identity",
  "experience": "experience",
  "work": "experience",
  "work experience": "experience",
  "employment": "experience",
  "employment history": "experience",
  "education": "experience",
  "volunteering": "experience",
  "volunteer work": "experience",
  "projects": "experience",
  "certifications": "experience",
  "certificates": "experience",
  "courses": "experience",
  "training": "experience",
  "skills": "capability",
  "languages": "capability",
  "capabilities": "capability",
  "goals": "intent",
  "career goals": "intent",
  "objective": "intent",
  "objectives": "intent",
  "preferences": "preference",
  "work preferences": "preference",
};

const STRIP_CHARS = new RegExp(CONTROL_CHARS.source, "gu");
const LIST_ITEM = /^\s*(?:[-*+•‣◦▪]|\d{1,3}[.)])\s+(.*)$/u;
const MD_HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/u;

/** Remove a byte order mark, use LF, apply NFC, and remove characters that the record schema refuses. */
export function normalizeText(text: string): string {
  return text
    .replace(/^﻿/u, "")
    .replace(/\r\n?/gu, "\n")
    .normalize("NFC")
    .replace(/\t/gu, " ")
    .split("\n")
    .map((line) => line.replace(STRIP_CHARS, ""))
    .join("\n");
}

function sectionKind(line: string): RecordKind | undefined {
  const key = line.trim().replace(/:$/u, "").trim().replace(/\s+/gu, " ").toLowerCase();
  if (key.length === 0 || key.length > 40) return undefined;
  return SECTION_KINDS[key];
}

const collapse = (s: string): string => s.replace(/\s+/gu, " ").trim();

/** Turn pasted text into drafts. The same text gives the same drafts. */
export function splitText(text: string): Draft[] {
  if (typeof text !== "string") throw new PersonaKitError("usage", "The text must be a string.");
  if (Buffer.byteLength(text, "utf8") > TEXT_IMPORT_MAX_BYTES) {
    throw new PersonaKitError("invalid", `The text is larger than ${TEXT_IMPORT_MAX_BYTES / 1024} KiB. Split it into smaller parts.`);
  }
  const drafts: Draft[] = [];
  let kind: RecordKind = "experience";
  let paragraph: string[] = [];
  let lastWasItem = false;

  const push = (statement: string): void => {
    const s = collapse(statement);
    if (s.length === 0) return;
    const problems: string[] = [];
    if (s.length > STATEMENT_MAX) problems.push(`The statement has ${s.length} characters. The limit is ${STATEMENT_MAX}.`);
    drafts.push({ kind, statement: s, problems });
  };
  const flush = (): void => {
    if (paragraph.length) push(paragraph.join(" "));
    paragraph = [];
  };

  for (const line of normalizeText(text).split("\n")) {
    if (line.trim() === "") {
      flush();
      lastWasItem = false;
      continue;
    }
    const heading = MD_HEADING.exec(line);
    const headingText = heading ? heading[1]! : line;
    const section = sectionKind(headingText);
    if (section) {
      flush();
      kind = section;
      lastWasItem = false;
      continue;
    }
    if (heading) {
      // A heading that is not a section word, such as a name or a job title, is a draft of its own.
      flush();
      push(headingText);
      lastWasItem = false;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      push(item[1]!);
      lastWasItem = true;
      continue;
    }
    if (lastWasItem && /^\s/u.test(line) && drafts.length) {
      // An indented line after a list item continues that item.
      const last = drafts.pop()!;
      kind = last.kind;
      push(`${last.statement} ${line}`);
      continue;
    }
    lastWasItem = false;
    paragraph.push(line);
  }
  flush();
  if (drafts.length > TEXT_IMPORT_MAX_DRAFTS) {
    throw new PersonaKitError("invalid", `The text gives ${drafts.length} drafts. The limit is ${TEXT_IMPORT_MAX_DRAFTS}. Split it into smaller parts.`);
  }
  return drafts;
}
