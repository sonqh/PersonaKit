// Record schema v0 and its validator. No external schema library: the rules are explicit code.
// REQ-PER-001 REQ-PER-002 REQ-PER-003

import { isUlid } from "./ulid.ts";

export const RECORD_SCHEMA = "personakit.record/v0";

export const RECORD_KINDS = ["identity", "experience", "capability", "preference", "intent"] as const;
export const RECORD_STATES = ["proposed", "accepted", "rejected", "retired"] as const;
export const VISIBILITIES = ["private", "ai", "public"] as const;
export const ACTORS = ["claude-code", "claude-ai", "codex", "cli", "web"] as const;
export const SOURCE_KINDS = ["chat", "interview", "cv", "document", "manual", "import"] as const;
export const CONTRIBUTIONS = ["contributed", "supported", "co-led", "led", "owned"] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];
export type RecordState = (typeof RECORD_STATES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type Actor = (typeof ACTORS)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type Contribution = (typeof CONTRIBUTIONS)[number];

/** Visibility order: private < ai < public. */
export const VISIBILITY_RANK: Record<Visibility, number> = { private: 0, ai: 1, public: 2 };

export interface Period {
  start?: string;
  end?: string;
  ongoing?: boolean;
}

/** Optional structured fields. Every field works for any profession. */
export interface Facets {
  type?: string;
  organization?: string;
  role?: string;
  location?: string;
  period?: Period;
  issued_on?: string;
  expires_on?: string;
  contribution?: Contribution;
  level?: string;
  scope?: string[];
  tags?: string[];
}

export interface Source {
  kind: SourceKind;
  label?: string;
  /** URL or local file reference. */
  ref?: string;
  /** Short quote from the source that supports the statement. */
  excerpt?: string;
}

/** Self-reported labels. They are not proof of who wrote the record. */
export interface Provenance {
  actor: Actor;
  model?: string;
  session?: string;
  at: string;
  user_stated: boolean;
}

export interface PersonaRecord {
  schema: typeof RECORD_SCHEMA;
  id: string;
  kind: RecordKind;
  statement: string;
  state: RecordState;
  visibility: Visibility;
  revision: number;
  facets?: Facets;
  sources: Source[];
  provenance: Provenance;
  supersedes?: string[];
  possible_duplicate_of?: string[];
  extensions?: Record<string, unknown>;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const RECORD_KEYS = new Set([
  "schema", "id", "kind", "statement", "state", "visibility", "revision", "facets",
  "sources", "provenance", "supersedes", "possible_duplicate_of", "extensions",
]);
const FACET_KEYS = new Set([
  "type", "organization", "role", "location", "period", "issued_on", "expires_on",
  "contribution", "level", "scope", "tags",
]);
const PERIOD_KEYS = new Set(["start", "end", "ongoing"]);
const SOURCE_KEYS = new Set(["kind", "label", "ref", "excerpt"]);
const PROVENANCE_KEYS = new Set(["actor", "model", "session", "at", "user_stated"]);

const PARTIAL_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const EXTENSION_KEY = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
// Not allowed in text: C0/C1 controls other than tab and line feed, bidi controls, zero-width characters.
// These can hide or reorder text inside an agent brief.
export const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/;

export const STATEMENT_MAX = 2000;
export const SHORT_TEXT_MAX = 200;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function checkText(issues: ValidationIssue[], path: string, v: unknown, max: number, required: boolean): void {
  if (v === undefined) {
    if (required) issues.push({ path, message: "is required" });
    return;
  }
  if (typeof v !== "string") return void issues.push({ path, message: "must be a string" });
  if (v.trim() === "") issues.push({ path, message: "must not be empty" });
  if (v.length > max) issues.push({ path, message: `must have at most ${max} characters` });
  if (CONTROL_CHARS.test(v)) issues.push({ path, message: "must not contain control characters" });
}

function checkUnknownKeys(issues: ValidationIssue[], path: string, obj: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) issues.push({ path: path ? `${path}.${key}` : key, message: "is not a known field" });
  }
}

function checkIdList(issues: ValidationIssue[], path: string, v: unknown): void {
  if (v === undefined) return;
  if (!Array.isArray(v)) return void issues.push({ path, message: "must be an array of record IDs" });
  v.forEach((id, i) => {
    if (!isUlid(id)) issues.push({ path: `${path}[${i}]`, message: "must be a ULID" });
  });
}

function checkStringList(issues: ValidationIssue[], path: string, v: unknown): void {
  if (v === undefined) return;
  if (!Array.isArray(v)) return void issues.push({ path, message: "must be an array of strings" });
  v.forEach((s, i) => checkText(issues, `${path}[${i}]`, s, SHORT_TEXT_MAX, true));
}

function checkDate(issues: ValidationIssue[], path: string, v: unknown): void {
  if (v === undefined) return;
  if (typeof v !== "string" || !PARTIAL_DATE.test(v)) {
    issues.push({ path, message: "must be a date as YYYY, YYYY-MM, or YYYY-MM-DD" });
  }
}

function checkFacets(issues: ValidationIssue[], v: unknown): void {
  if (v === undefined) return;
  if (!isObject(v)) return void issues.push({ path: "facets", message: "must be an object" });
  checkUnknownKeys(issues, "facets", v, FACET_KEYS);
  for (const key of ["type", "organization", "role", "location", "level"]) {
    checkText(issues, `facets.${key}`, v[key], SHORT_TEXT_MAX, false);
  }
  checkDate(issues, "facets.issued_on", v.issued_on);
  checkDate(issues, "facets.expires_on", v.expires_on);
  if (v.contribution !== undefined && !oneOf(CONTRIBUTIONS, v.contribution)) {
    issues.push({ path: "facets.contribution", message: `must be one of ${CONTRIBUTIONS.join(", ")}` });
  }
  checkStringList(issues, "facets.scope", v.scope);
  checkStringList(issues, "facets.tags", v.tags);
  if (v.period !== undefined) {
    if (!isObject(v.period)) {
      issues.push({ path: "facets.period", message: "must be an object" });
    } else {
      checkUnknownKeys(issues, "facets.period", v.period, PERIOD_KEYS);
      checkDate(issues, "facets.period.start", v.period.start);
      checkDate(issues, "facets.period.end", v.period.end);
      if (v.period.ongoing !== undefined && typeof v.period.ongoing !== "boolean") {
        issues.push({ path: "facets.period.ongoing", message: "must be true or false" });
      }
      if (v.period.ongoing === true && v.period.end !== undefined) {
        issues.push({ path: "facets.period", message: "must not have an end date when ongoing is true" });
      }
      const { start, end } = v.period;
      if (typeof start === "string" && typeof end === "string" && PARTIAL_DATE.test(start) && PARTIAL_DATE.test(end)) {
        // Partial ISO dates compare correctly as strings by code point.
        if (end < start && !end.startsWith(start) && !start.startsWith(end)) {
          issues.push({ path: "facets.period", message: "must not end before it starts" });
        }
      }
    }
  }
}

export function validateRecord(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) return [{ path: "", message: "must be a JSON object" }];
  const r = value;
  checkUnknownKeys(issues, "", r, RECORD_KEYS);

  if (typeof r.statement === "string" && r.statement !== r.statement.normalize("NFC")) {
    issues.push({ path: "statement", message: "must be in Unicode NFC form" });
  }
  if (r.schema !== RECORD_SCHEMA) issues.push({ path: "schema", message: `must be "${RECORD_SCHEMA}"` });
  if (!isUlid(r.id)) issues.push({ path: "id", message: "must be a ULID" });
  if (!oneOf(RECORD_KINDS, r.kind)) issues.push({ path: "kind", message: `must be one of ${RECORD_KINDS.join(", ")}` });
  checkText(issues, "statement", r.statement, STATEMENT_MAX, true);
  if (!oneOf(RECORD_STATES, r.state)) issues.push({ path: "state", message: `must be one of ${RECORD_STATES.join(", ")}` });
  if (!oneOf(VISIBILITIES, r.visibility)) issues.push({ path: "visibility", message: `must be one of ${VISIBILITIES.join(", ")}` });
  if (!Number.isInteger(r.revision) || (r.revision as number) < 1) issues.push({ path: "revision", message: "must be an integer of 1 or more" });

  checkFacets(issues, r.facets);

  if (!Array.isArray(r.sources) || r.sources.length === 0) {
    issues.push({ path: "sources", message: "must list at least one source" });
  } else {
    r.sources.forEach((s, i) => {
      const p = `sources[${i}]`;
      if (!isObject(s)) return void issues.push({ path: p, message: "must be an object" });
      checkUnknownKeys(issues, p, s, SOURCE_KEYS);
      if (!oneOf(SOURCE_KINDS, s.kind)) issues.push({ path: `${p}.kind`, message: `must be one of ${SOURCE_KINDS.join(", ")}` });
      checkText(issues, `${p}.label`, s.label, SHORT_TEXT_MAX, false);
      checkText(issues, `${p}.ref`, s.ref, 1000, false);
      checkText(issues, `${p}.excerpt`, s.excerpt, 1000, false);
    });
  }

  if (!isObject(r.provenance)) {
    issues.push({ path: "provenance", message: "is required" });
  } else {
    const p = r.provenance;
    checkUnknownKeys(issues, "provenance", p, PROVENANCE_KEYS);
    if (!oneOf(ACTORS, p.actor)) issues.push({ path: "provenance.actor", message: `must be one of ${ACTORS.join(", ")}` });
    checkText(issues, "provenance.model", p.model, SHORT_TEXT_MAX, false);
    checkText(issues, "provenance.session", p.session, SHORT_TEXT_MAX, false);
    if (typeof p.at !== "string" || !ISO_TIMESTAMP.test(p.at)) issues.push({ path: "provenance.at", message: "must be a UTC ISO timestamp" });
    if (typeof p.user_stated !== "boolean") issues.push({ path: "provenance.user_stated", message: "must be true or false" });
  }

  checkIdList(issues, "supersedes", r.supersedes);
  checkIdList(issues, "possible_duplicate_of", r.possible_duplicate_of);
  if (Array.isArray(r.supersedes) && r.supersedes.includes(r.id)) {
    issues.push({ path: "supersedes", message: "must not contain the record's own ID" });
  }

  if (r.extensions !== undefined) {
    if (!isObject(r.extensions)) {
      issues.push({ path: "extensions", message: "must be an object" });
    } else {
      for (const key of Object.keys(r.extensions)) {
        if (!EXTENSION_KEY.test(key)) issues.push({ path: `extensions.${key}`, message: "must be a namespaced key such as \"org.example.field\"" });
      }
    }
  }
  return issues;
}

/** Sort set-like arrays so the same record always serializes to the same bytes. */
export function normalizeRecord(r: PersonaRecord): PersonaRecord {
  const out: PersonaRecord = { ...r, statement: r.statement.normalize("NFC") };
  if (r.supersedes) out.supersedes = [...new Set(r.supersedes)].sort();
  if (r.possible_duplicate_of) out.possible_duplicate_of = [...new Set(r.possible_duplicate_of)].sort();
  if (out.supersedes?.length === 0) delete out.supersedes;
  if (out.possible_duplicate_of?.length === 0) delete out.possible_duplicate_of;
  return out;
}

export function isValidRecord(value: unknown): value is PersonaRecord {
  return validateRecord(value).length === 0;
}
