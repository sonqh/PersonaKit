// REQ-CV-001 REQ-CV-002 REQ-CV-005 REQ-VIS-002
// CV draft and CV line check. No model, no clock: the same records give the same bytes.

import { ULID_PATTERN } from "./ulid.ts";
import { buildFactContext, checkFacts, type FactCode } from "./cv-facts.ts";
import type { PersonaRecord } from "./schema.ts";

export const CV_TITLE = "CV draft";
export const SECTION_TITLES = [
  "Summary", "Experience", "Freelance engagements", "Education", "Credentials", "Career breaks", "Capabilities",
] as const;
export type CvSection = (typeof SECTION_TITLES)[number];

const DATED: ReadonlySet<CvSection> = new Set(["Experience", "Freelance engagements", "Education", "Credentials", "Career breaks"]);

/** Only accepted public records enter a CV. Intents and preferences are not CV claims. */
export function cvEligible(r: PersonaRecord): boolean {
  return r.state === "accepted" && r.visibility === "public" && r.kind !== "intent" && r.kind !== "preference";
}

/** An ID a CV line may cite: accepted and public. */
export function cvCitable(r: PersonaRecord): boolean {
  return r.state === "accepted" && r.visibility === "public";
}

export function sectionOf(r: PersonaRecord): CvSection {
  if (r.kind === "identity") return "Summary";
  const f = r.facets ?? {};
  if (f.issued_on || f.expires_on) return "Credentials";
  if (r.kind === "capability") return "Capabilities";
  if (f.type === "freelance") return "Freelance engagements";
  if (f.type === "education" || f.type === "course") return "Education";
  if (f.type === "career_break") return "Career breaks";
  return "Experience";
}

/** One line of text: line feeds and runs of white space become one space; a marker in the text is defused. */
export function oneLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim().split("[pk:").join("(pk:");
}

function startOf(r: PersonaRecord): string | undefined {
  return r.facets?.period?.start ?? r.facets?.issued_on;
}
function endOf(r: PersonaRecord): string | undefined {
  return r.facets?.period?.end ?? r.facets?.expires_on;
}
const cmpDesc = (a: string | undefined, b: string | undefined): number => {
  if (a === b) return 0;
  if (a === undefined) return 1; // missing values last
  if (b === undefined) return -1;
  return a < b ? 1 : -1; // code-point order, newest first
};
const cmpId = (a: PersonaRecord, b: PersonaRecord): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Sort key for dated sections: ongoing first, start descending, end descending, ID ascending. */
export function compareDated(a: PersonaRecord, b: PersonaRecord): number {
  const ao = a.facets?.period?.ongoing === true ? 0 : 1;
  const bo = b.facets?.period?.ongoing === true ? 0 : 1;
  return ao - bo || cmpDesc(startOf(a), startOf(b)) || cmpDesc(endOf(a), endOf(b)) || cmpId(a, b);
}

export interface CvItem {
  id: string;
  line: string;
  statement: string;
  organization?: string;
  role?: string;
  period?: { start?: string; end?: string; ongoing?: boolean };
  issued_on?: string;
  expires_on?: string;
  expired?: boolean;
}

/** The printed fields only. Location, sources, tags, extensions, and provenance never enter a CV. */
export function cvItem(r: PersonaRecord, asOf?: string): CvItem {
  const f = r.facets ?? {};
  const item: CvItem = { id: r.id, statement: oneLine(r.statement), line: "" };
  if (f.organization) item.organization = oneLine(f.organization);
  if (f.role) item.role = oneLine(f.role);
  if (f.period) {
    const p: CvItem["period"] = {};
    if (f.period.start) p.start = f.period.start;
    if (f.period.end) p.end = f.period.end;
    if (f.period.ongoing) p.ongoing = true;
    item.period = p;
  }
  if (f.issued_on) item.issued_on = f.issued_on;
  if (f.expires_on) item.expires_on = f.expires_on;
  // A partial expiry date (YYYY or YYYY-MM) lasts to the end of its year or month.
  if (asOf && f.expires_on && asOf.slice(0, f.expires_on.length) > f.expires_on) item.expired = true;
  const details: string[] = [];
  if (item.role) details.push(item.role);
  if (item.organization) details.push(item.organization);
  if (item.period && (item.period.start || item.period.end || item.period.ongoing)) {
    details.push(`${item.period.start ?? "?"} to ${item.period.ongoing ? "now" : item.period.end ?? "?"}`);
  }
  if (item.issued_on) details.push(`issued ${item.issued_on}`);
  if (item.expires_on) details.push(`${item.expired ? "expired" : "valid until"} ${item.expires_on}`);
  item.line = `- ${item.statement}${details.length ? ` (${details.join(", ")})` : ""} [pk:${r.id}]`;
  return item;
}

export interface CvDraft {
  schema: "personakit.cv-draft/v0";
  sections: { title: CvSection; items: CvItem[] }[];
}

export function buildCvDraft(records: PersonaRecord[], asOf?: string): CvDraft {
  const eligible = records.filter(cvEligible);
  const sections: CvDraft["sections"] = [];
  for (const title of SECTION_TITLES) {
    const group = eligible.filter((r) => sectionOf(r) === title).sort(DATED.has(title) ? compareDated : cmpId);
    if (group.length) sections.push({ title, items: group.map((r) => cvItem(r, asOf)) });
  }
  return { schema: "personakit.cv-draft/v0", sections };
}

export function renderCvMarkdown(draft: CvDraft): string {
  const out: string[] = [`# ${CV_TITLE}`, ""];
  for (const s of draft.sections) {
    out.push(`## ${s.title}`, "", ...s.items.map((i) => i.line), "");
  }
  return out.join("\n");
}

// ---------- check ----------

export interface CvFinding {
  line: number;
  level: "error" | "warning";
  code: "missing-citation" | "misplaced-marker" | "malformed-marker" | "fenced-code" | "not-citable" | FactCode;
  message: string;
  ids?: string[];
}

export interface CvCheckResult {
  ok: boolean;
  errors: number;
  warnings: number;
  findings: CvFinding[];
  /** Lines marked [pk:self]: the owner states them. Review them before strip. */
  owner_lines: number[];
  cited_ids: string[];
}

/**
 * Find a citation marker at the end of a line in linear time: no regex backtracking.
 * Returns the text before the marker and the marker content, or undefined when the line
 * does not end with "]" after an opening "[pk:".
 */
export function splitMarker(line: string): { body: string; inner: string } | undefined {
  const t = line.trimEnd();
  if (!t.endsWith("]")) return undefined;
  const i = t.lastIndexOf("[pk:");
  if (i < 0) return undefined;
  const inner = t.slice(i + 4, -1);
  if (inner.includes("]")) return undefined;
  return { body: t.slice(0, i).trimEnd(), inner };
}
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/u;
const FENCE = /^\s*(```|~~~)/u;
const HEADING = new RegExp(`^#{1,6}\\s+(?:${[CV_TITLE, ...SECTION_TITLES].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*$`, "u");

/** Remove a byte order mark and turn CRLF and CR into LF. */
export function normalizeCvInput(text: string): string {
  return text.replace(/^﻿/u, "").replace(/\r\n?/gu, "\n");
}

/**
 * Accept a line only when it is blank, a rule, a draft section heading, or ends with a valid marker.
 * Output holds line numbers, codes, and IDs only, never record text.
 */
export function checkCv(text: string, records: PersonaRecord[]): CvCheckResult {
  const publicRecords = records.filter(cvCitable);
  const byId = new Map(publicRecords.map((r) => [r.id, r]));
  const citable = new Set(byId.keys());
  const factContext = buildFactContext(publicRecords);
  const findings: CvFinding[] = [];
  const ownerLines: number[] = [];
  const cited = new Set<string>();
  const lines = normalizeCvInput(text).split("\n");
  let inFence = false;
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (FENCE.test(raw)) {
      if (!inFence) findings.push({ line: n, level: "error", code: "fenced-code", message: "A fenced code block cannot be in a CV. Remove the fence." });
      inFence = !inFence;
      return;
    }
    if (inFence) {
      findings.push({ line: n, level: "error", code: "fenced-code", message: "This line is inside a fenced code block." });
      return;
    }
    if (raw.trim() === "" || RULE.test(raw) || HEADING.test(raw)) return;
    const m = splitMarker(raw);
    if (!m) {
      findings.push(raw.includes("[pk:")
        ? { line: n, level: "error", code: "misplaced-marker", message: "Put the citation marker at the end of the line." }
        : { line: n, level: "error", code: "missing-citation", message: "This line has no citation marker. Add [pk:<record ID>], or remove the line." });
      return;
    }
    if (m.body.includes("[pk:")) {
      findings.push({ line: n, level: "error", code: "misplaced-marker", message: "A line can have one citation marker, at the end." });
      return;
    }
    const inner = m.inner;
    if (inner === "self") {
      ownerLines.push(n);
      return;
    }
    const ids = [...new Set(inner.split(","))];
    const bad = ids.filter((id) => !ULID_PATTERN.test(id));
    if (ids.length === 0 || bad.length) {
      findings.push({ line: n, level: "error", code: "malformed-marker", message: "A marker holds record IDs of 26 characters, separated by commas, or the word self." });
      return;
    }
    let allCitable = true;
    for (const id of ids) {
      if (citable.has(id)) cited.add(id);
      else {
        allCitable = false;
        // One code for missing, not accepted, and not public: no reason, so nothing leaks about private records.
        findings.push({ line: n, level: "error", code: "not-citable", message: `Record ${id} cannot be cited. A CV can cite accepted public records only.`, ids: [id] });
      }
    }
    // REQ-CV-003 REQ-CV-004 REQ-CV-007: fact warnings run only when every cited ID is citable.
    if (allCitable) {
      const recs = ids.map((id) => byId.get(id)!);
      for (const w of checkFacts(m.body, recs, factContext)) {
        findings.push({ line: n, level: "warning", code: w.code, message: w.message, ids });
      }
    }
  });
  const errors = findings.filter((f) => f.level === "error").length;
  return { ok: errors === 0, errors, warnings: findings.length - errors, findings, owner_lines: ownerLines, cited_ids: [...cited].sort() };
}

/** Final text without markers. Returns undefined when the check has errors. */
export function stripCv(text: string, records: PersonaRecord[]): { text?: string; check: CvCheckResult } {
  const check = checkCv(text, records);
  if (!check.ok) return { check };
  const lines = normalizeCvInput(text).split("\n").map((l) => {
    const m = splitMarker(l);
    return m ? m.body : l;
  });
  let out = lines.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return { text: out, check };
}
