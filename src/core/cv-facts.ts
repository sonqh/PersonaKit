// REQ-CV-003 REQ-CV-004 REQ-CV-007
// Fact and wording warnings for cited CV lines. Deterministic, English word lists, no model.
// Warnings carry tokens from the owner's own line and record IDs, never record text.

import { CONTRIBUTIONS, type Contribution, type PersonaRecord } from "./schema.ts";

export type FactCode =
  | "year-unsupported" | "number-unsupported" | "organization-not-cited" | "role-not-cited"
  | "seniority-unsupported" | "overstated-ownership" | "contribution-unknown";

export interface FactWarning {
  code: FactCode;
  message: string;
}

const B = "(?<![\\p{L}\\p{N}])"; // Unicode word boundary, before
const A = "(?![\\p{L}\\p{N}])"; // Unicode word boundary, after
const ULID_ANY = /[0-9A-HJKMNP-TV-Z]{26}/gu;

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60",
  seventy: "70", eighty: "80", ninety: "90", hundred: "100",
};
const NUMBER_WORD_RE = new RegExp(`${B}(${Object.keys(NUMBER_WORDS).join("|")})${A}`, "giu");
// A digit run on word boundaries. A trailing %, +, k, or x is allowed, so "5k" gives 5 and "1st" gives nothing.
const DIGITS_RE = /(?<![\p{L}\p{N}])\d[\d,_]*(?=[%+kKxX]?(?![\p{L}\p{N}]))/gu;
const YEAR_RE = /^(19|20)\d\d$/u;

export const SENIORITY_WORDS = ["senior", "principal", "chief", "director", "manager"] as const;

/**
 * Verb families. The level is the minimum contribution that the verb claims.
 * Only the first word of a claim counts (CV lines start with their verb). Bare forms that are
 * also common nouns or adjectives (own, found, head, direct, leading) are left out.
 */
const VERB_FAMILIES: { family: string; level: Contribution; forms: string[]; related: string[] }[] = [
  { family: "co-lead", level: "co-led", forms: ["co-lead", "co-leads", "co-led", "co-managed", "co-manage", "co-manages", "co-founded", "co-own", "co-owns", "co-owned"], related: ["co-leading", "co-managing", "co-founder", "co-owner"] },
  { family: "own", level: "owned", forms: ["owns", "owned", "founded"], related: ["own", "owner", "owning", "founder"] },
  { family: "lead", level: "led", forms: ["lead", "leads", "led", "headed"], related: ["leading", "head", "heads", "heading", "leader"] },
  { family: "manage", level: "led", forms: ["manage", "manages", "managed"], related: ["managing", "manager"] },
  { family: "direct", level: "led", forms: ["directed", "spearheaded", "spearheads", "spearhead"], related: ["directing", "director", "spearheading"] },
];

const LEVEL = (c: Contribution | undefined): number => (c ? CONTRIBUTIONS.indexOf(c) : -1);

/** Remove the marker, the list prefix, and record IDs, so they are not read as facts. */
export function claimText(body: string): string {
  return body.replace(/^\s*(?:[-*+]|\d+[.)])\s+/u, "").replace(ULID_ANY, " ");
}

/** The text of a record that a CV line may use: statement and printed facets. */
export function recordText(r: PersonaRecord): string {
  const f = r.facets ?? {};
  return [r.statement, f.role, f.organization, f.level, ...(f.scope ?? []), ...(f.tags ?? []),
    f.period?.start, f.period?.end, f.issued_on, f.expires_on].filter(Boolean).join(" \n ");
}

function numberTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(DIGITS_RE)) {
    const t = m[0].replace(/[,_]/gu, "").replace(/^0+(?=\d)/u, "");
    if (t) out.push(t);
  }
  for (const m of text.matchAll(NUMBER_WORD_RE)) out.push(NUMBER_WORDS[m[1]!.toLowerCase()]!);
  return out;
}

function splitDigits(text: string): string[] {
  // Dates such as 2021-03-15 give the tokens 2021, 3, and 15.
  return numberTokens(text.replace(/[-/.]/gu, " "));
}

function yearRanges(r: PersonaRecord): [number, number][] {
  const f = r.facets ?? {};
  const year = (d?: string) => (d ? Number(d.slice(0, 4)) : undefined);
  const out: [number, number][] = [];
  if (f.period) {
    const s = year(f.period.start);
    const e = f.period.ongoing ? Infinity : year(f.period.end);
    if (s !== undefined || e !== undefined) out.push([s ?? -Infinity, e ?? s ?? Infinity]);
  }
  const i = year(f.issued_on);
  const x = year(f.expires_on);
  if (i !== undefined || x !== undefined) out.push([i ?? x!, x ?? i!]);
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Find names in a line: case-sensitive, Unicode word boundaries, longest first, each match removed. */
function findNames(line: string, index: NameIndex): NameIndex["names"] {
  let rest = line;
  const found: NameIndex["names"] = [];
  for (const entry of index.names) {
    if (!rest.includes(entry.name)) continue; // cheap test before the regex
    entry.re.lastIndex = 0;
    if (entry.re.test(rest)) {
      found.push(entry);
      entry.re.lastIndex = 0;
      rest = rest.replace(entry.re, " ");
    }
  }
  return found;
}

function wordRe(words: string[]): RegExp {
  return new RegExp(`${B}(${words.map(escapeRe).join("|")})${A}`, "giu");
}

interface NameIndex {
  /** Names longest first, each with its compiled pattern and the IDs of the records that hold it. */
  names: { name: string; re: RegExp; owners: Set<string> }[];
}

export interface FactContext {
  organizations: NameIndex;
  roles: NameIndex;
}

/** Build once per check: names come from accepted public records only. */
export function buildFactContext(publicRecords: PersonaRecord[]): FactContext {
  const index = (field: "organization" | "role"): NameIndex => {
    const map = new Map<string, Set<string>>();
    for (const r of publicRecords) {
      const v = r.facets?.[field]?.normalize("NFC");
      if (v) map.set(v, (map.get(v) ?? new Set()).add(r.id));
    }
    const names = [...map.keys()].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
    return { names: names.map((name) => ({ name, re: new RegExp(`${B}${escapeRe(name)}${A}`, "gu"), owners: map.get(name)! })) };
  };
  return { organizations: index("organization"), roles: index("role") };
}

/** Check one cited line against its cited records. */
export function checkFacts(body: string, cited: PersonaRecord[], ctx: FactContext): FactWarning[] {
  const warnings: FactWarning[] = [];
  const line = claimText(body);
  const text = cited.map(recordText).join(" \n ");
  const ids = cited.map((r) => r.id).join(", ");
  const textTokens = new Set(splitDigits(text));

  // Years and numbers. REQ-CV-003
  const ranges = cited.flatMap(yearRanges);
  const seen = new Set<string>();
  for (const tok of splitDigits(line)) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (YEAR_RE.test(tok)) {
      const y = Number(tok);
      if (textTokens.has(tok) || ranges.some(([s, e]) => y >= s && y <= e)) continue;
      warnings.push({ code: "year-unsupported", message: `The year ${tok} is outside the dates of record ${ids}.` });
    } else if (!textTokens.has(tok)) {
      warnings.push({ code: "number-unsupported", message: `The number ${tok} is not in record ${ids}.` });
    }
  }

  // Organizations and roles from uncited public records. REQ-CV-007
  const citedIds = new Set(cited.map((r) => r.id));
  const nfcLine = line.normalize("NFC");
  const nfcText = text.normalize("NFC");
  for (const [index, code, label] of [[ctx.organizations, "organization-not-cited", "organization"], [ctx.roles, "role-not-cited", "role"]] as const) {
    for (const entry of findNames(nfcLine, index)) {
      if ([...entry.owners].some((id) => citedIds.has(id))) continue;
      // A name in the cited record's own text is supported, for example a product name in the statement.
      entry.re.lastIndex = 0;
      if (entry.re.test(nfcText)) continue;
      warnings.push({ code, message: `The ${label} "${entry.name}" belongs to a record that this line does not cite.` });
    }
  }
  const lowerText = text.toLowerCase();
  for (const m of nfcLine.matchAll(wordRe([...SENIORITY_WORDS]))) {
    const w = m[1]!.toLowerCase();
    if (!new RegExp(`${B}${w}${A}`, "u").test(lowerText)) {
      warnings.push({ code: "seniority-unsupported", message: `The word "${m[1]}" is not in the role or statement of record ${ids}.` });
    }
  }

  // Ownership verbs: the first word of the claim only. REQ-CV-004
  const top = Math.max(...cited.map((r) => LEVEL(r.facets?.contribution)), -1);
  const first = /^\s*([\p{L}][\p{L}-]*)/u.exec(nfcLine)?.[1]?.toLowerCase();
  const statements = cited.map((r) => `${r.statement} \n ${r.facets?.role ?? ""}`).join(" \n ");
  for (const fam of VERB_FAMILIES) {
    if (!first || !fam.forms.includes(first)) continue; // co-lead comes first, so "co-led" never matches "led"
    const hit = [first];
    // The cited statement or role supports the claim when it has any form of the family.
    if (wordRe([...fam.forms, ...fam.related]).test(statements)) break;
    if (top < 0) {
      warnings.push({ code: "contribution-unknown", message: `"${hit[0]}" claims at least ${fam.level}, but record ${ids} has no contribution level. Add the level, or reword the line.` });
    } else if (top < LEVEL(fam.level)) {
      warnings.push({ code: "overstated-ownership", message: `"${hit[0]}" claims at least ${fam.level}. Record ${ids} says ${CONTRIBUTIONS[top]}.` });
    }
    break;
  }
  return warnings;
}
