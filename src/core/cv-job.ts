// REQ-CV-008 REQ-CV-009 REQ-CV-010 REQ-CV-012
// A job text as an input to the CV draft. Deterministic, English stop words, no model.
// The job text is untrusted data. The core never stores it, and no error repeats it.

import { buildCvDraft, cvEligible, sectionOf, type CvDraft, type CvSection } from "./cv.ts";
import { recordWords } from "./cv-facts.ts";
import { PersonaKitError } from "./errors.ts";
import type { PersonaRecord } from "./schema.ts";

export const JOB_MAX_BYTES = 65_536;
export const JOB_MAX_REQUIREMENTS = 100;
export const REQUIREMENT_TEXT_MAX = 500;

export interface JobRequirement {
  /** 1-based position in the job text. */
  n: number;
  /** One line, no control characters, at most 500 characters. */
  text: string;
  /** Distinct terms in text order. */
  terms: string[];
}

export interface ParsedJob {
  requirements: JobRequirement[];
  /** Requirements past the first 100. */
  truncated: number;
}

// Function words and words that most job texts use without meaning a skill.
const STOP_WORDS: ReadonlySet<string> = new Set([
  "a", "about", "above", "across", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are", "as", "at",
  "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "could", "did", "do", "does",
  "doing", "down", "during", "each", "etc", "few", "for", "from", "further", "had", "has", "have", "having", "he", "her",
  "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most",
  "must", "my", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "out", "over",
  "own", "per", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up", "us", "very", "via", "was",
  "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "within", "would", "you",
  "your", "yours",
  // Job text filler.
  "ability", "able", "candidate", "candidates", "desired", "experience", "experienced", "familiarity", "good", "great",
  "ideal", "ideally", "including", "join", "knowledge", "looking", "minimum", "nice", "plus", "preferred", "proven",
  "required", "requirement", "requirements", "responsibilities", "role", "seeking", "skill", "skills", "solid", "strong",
  "understanding", "work", "working", "year", "years", "yrs",
]);

const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}+#]*/gu;
const HAS_LETTER = /\p{L}/u;
const HEADING = /^#{1,6}\s/u;
const LIST_PREFIX = /^(?:[-*+•‣◦▪]|\d{1,3}[.)]|\p{L}\))\s+/u;
// C0 and C1 control characters, and DEL. Tabs and line feeds are already gone after oneLine.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/gu;

/** Lower case, locale-independent. A plural s goes from a term of five letters or more. */
function normalizeTerm(token: string): string | undefined {
  const t = token.toLowerCase();
  if (t.length < 2 || !HAS_LETTER.test(t) || STOP_WORDS.has(t)) return undefined;
  if (t.length >= 5 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** Distinct terms of a text, in text order. NFKC first, so full-width and ligature forms match. */
export function termsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.normalize("NFKC").matchAll(TOKEN_RE)) {
    const t = normalizeTerm(m[0]);
    if (t !== undefined) seen.add(t);
  }
  return [...seen];
}

/** One line without control characters, cut at 500 characters. Safe to print to a terminal. */
export function safeRequirementText(text: string): string {
  const one = text.replace(CONTROL, " ").replace(/\s+/gu, " ").trim();
  const chars = [...one];
  return chars.length > REQUIREMENT_TEXT_MAX ? chars.slice(0, REQUIREMENT_TEXT_MAX).join("") : one;
}

function sentences(line: string): string[] {
  return line.split(/(?<=[.?!])\s+/u);
}

/**
 * Split a job text into requirements. A list item is one requirement. A prose sentence with two
 * terms or more is one. A heading or a line that ends with a colon gives context only.
 */
export function parseJob(text: string): ParsedJob {
  // Fixed messages: an error never repeats the job text.
  if (Buffer.byteLength(text, "utf8") > JOB_MAX_BYTES) throw new PersonaKitError("usage", `The job text is larger than ${JOB_MAX_BYTES} bytes. Give a shorter job text.`);
  if (text.trim() === "") throw new PersonaKitError("usage", "The job text is empty. Give the text of a job description.");
  const lines = text.replace(/^﻿/u, "").replace(/\r\n?/gu, "\n").normalize("NFKC").split("\n");
  const found: { text: string; terms: string[] }[] = [];
  for (const raw of lines) {
    const line = raw.replace(CONTROL, " ").trim();
    if (line === "" || HEADING.test(line) || line.endsWith(":")) continue;
    const item = LIST_PREFIX.exec(line);
    if (item) {
      const body = line.slice(item[0].length);
      const terms = termsOf(body);
      if (terms.length >= 1) found.push({ text: body, terms });
      continue;
    }
    for (const s of sentences(line)) {
      const terms = termsOf(s);
      if (terms.length >= 2) found.push({ text: s, terms });
    }
  }
  if (found.length === 0) throw new PersonaKitError("usage", "The job text holds no requirement. Give list items or full sentences.");
  const kept = found.slice(0, JOB_MAX_REQUIREMENTS);
  return {
    requirements: kept.map((r, i) => ({ n: i + 1, text: safeRequirementText(r.text), terms: r.terms })),
    truncated: found.length - kept.length,
  };
}

// ---------- match ----------

export interface MatchRequirement {
  n: number;
  text: string;
  /** Records that share words, most common terms first, then by ID. */
  ids: string[];
}

/** Requirement text, record IDs, and counts. Never record text. */
export interface CvMatch {
  schema: "personakit.cv-match/v0";
  requirements: MatchRequirement[];
  /** Numbers of the requirements that no record shares enough words with. */
  gaps: number[];
  /** Eligible records that share words with no requirement, by ID. */
  unused: string[];
  /** Linked records outside the whole sections. Zero gives the full draft. */
  matched: number;
  truncated: number;
}

/** Sections that a tailored draft keeps whole. */
export const WHOLE_SECTIONS: ReadonlySet<CvSection> = new Set(["Summary", "Education", "Credentials", "Career breaks"]);

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0); // code-point order

/** Link each requirement with the CV-eligible records that share words with it. */
export function matchJob(job: ParsedJob, records: PersonaRecord[]): CvMatch {
  const eligible = records.filter(cvEligible);
  const prepared = eligible.map((r) => ({
    r,
    terms: new Set(termsOf(recordWords(r).join(" \n "))),
    tags: (r.facets?.tags ?? []).map(termsOf).filter((t) => t.length > 0),
  }));
  const linked = new Set<string>();
  const requirements: MatchRequirement[] = job.requirements.map((req) => {
    const want = new Set(req.terms);
    const hits: { id: string; common: number }[] = [];
    for (const p of prepared) {
      let common = 0;
      for (const t of want) if (p.terms.has(t)) common++;
      const byTag = p.tags.some((tag) => tag.every((t) => want.has(t)));
      if (common >= 2 || (common >= 1 && want.size <= 3) || byTag) hits.push({ id: p.r.id, common });
    }
    hits.sort((a, b) => b.common - a.common || byId(a.id, b.id));
    for (const h of hits) linked.add(h.id);
    return { n: req.n, text: req.text, ids: hits.map((h) => h.id) };
  });
  return {
    schema: "personakit.cv-match/v0",
    requirements,
    gaps: requirements.filter((r) => r.ids.length === 0).map((r) => r.n),
    unused: eligible.filter((r) => !linked.has(r.id)).map((r) => r.id).sort(byId),
    matched: eligible.filter((r) => linked.has(r.id) && !WHOLE_SECTIONS.has(sectionOf(r))).length,
    truncated: job.truncated,
  };
}

export const MATCH_HINT = "A link means that a record shares words with a requirement. It is a hint, not proof that you meet the requirement.";

/** The report as text. Requirement text is already one safe line. */
export function renderMatchText(m: CvMatch): string {
  const out = ["Job match", "", MATCH_HINT, ""];
  for (const r of m.requirements) {
    out.push(`${r.n}. ${r.text}`);
    out.push(r.ids.length ? `   shares words with ${r.ids.join(", ")}` : "   no record shares enough words");
  }
  out.push("");
  out.push(`${m.requirements.length} requirements, ${m.requirements.length - m.gaps.length} with links, ${m.gaps.length} with no record.`);
  if (m.truncated) out.push(`${m.truncated} more requirements were left out. Only the first ${JOB_MAX_REQUIREMENTS} count.`);
  if (m.unused.length) out.push(`Records that share words with no requirement: ${m.unused.join(", ")}`);
  return out.join("\n") + "\n";
}

// ---------- tailored draft ----------

export interface TailoredDraft {
  draft: CvDraft;
  /** Eligible records that the tailored draft leaves out, by ID. */
  left_out: string[];
}

/**
 * Keep the whole sections and the records that share words with a requirement.
 * When no record outside the whole sections shares words, keep the full draft.
 */
export function buildTailoredDraft(records: PersonaRecord[], match: CvMatch, asOf?: string): TailoredDraft {
  if (match.matched === 0) return { draft: buildCvDraft(records, asOf), left_out: [] };
  const linked = new Set(match.requirements.flatMap((r) => r.ids));
  const keep = (r: PersonaRecord) => WHOLE_SECTIONS.has(sectionOf(r)) || linked.has(r.id);
  const eligible = records.filter(cvEligible);
  return {
    draft: buildCvDraft(eligible.filter(keep), asOf),
    left_out: eligible.filter((r) => !keep(r)).map((r) => r.id).sort(byId),
  };
}
