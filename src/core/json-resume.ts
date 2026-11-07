// JSON Resume 1.0.0 export and import plan. Pure functions: no clock, no files, no store writes.
// REQ-RES-001 REQ-RES-002 REQ-RES-003 REQ-RES-004 REQ-RES-005
// Export uses the CV rules: accepted public records only, a fixed field list.
// Import builds proposals and problems. Problems name JSON Pointer paths and never quote the file.

import { compareDated, cvEligible, sectionOf } from "./cv.ts";
import type { ProposeInput } from "./store.ts";
import type { Facets, PersonaRecord, RecordKind } from "./schema.ts";

export const JSON_RESUME_SCHEMA_URL = "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json";
export const JSON_RESUME_VERSION = "v1.0.0";
export const IMPORT_PROPOSAL_LIMIT = 500;

// ---------- export ----------

export interface JsonResumeExport {
  document: Record<string, unknown>;
  /** Record IDs in document order. The document itself holds no IDs. */
  used: string[];
  /** Public career breaks left out: JSON Resume has no section for them. */
  career_breaks: number;
}

const cmpId = (a: PersonaRecord, b: PersonaRecord): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dates(r: PersonaRecord, out: Record<string, unknown>): void {
  const p = r.facets?.period;
  if (p?.start) out.startDate = p.start;
  if (p?.end && !p.ongoing) out.endDate = p.end;
}

export function buildJsonResume(records: PersonaRecord[]): JsonResumeExport {
  const eligible = records.filter(cvEligible);
  const used: string[] = [];
  const doc: Record<string, unknown> = { $schema: JSON_RESUME_SCHEMA_URL, meta: { version: JSON_RESUME_VERSION } };
  const pick = (section: ReturnType<typeof sectionOf>[], dated: boolean): PersonaRecord[] =>
    eligible.filter((r) => section.includes(sectionOf(r))).sort(dated ? compareDated : cmpId);

  const identity = pick(["Summary"], false);
  if (identity.length) {
    doc.basics = { summary: identity.map((r) => r.statement).join("\n") };
    used.push(...identity.map((r) => r.id));
  }
  const work = pick(["Experience", "Freelance engagements"], true).map((r) => {
    const f = r.facets ?? {};
    const item: Record<string, unknown> = { summary: r.statement };
    if (f.organization) item.name = f.organization;
    if (f.role) item.position = f.role;
    dates(r, item);
    used.push(r.id);
    return item;
  });
  if (work.length) doc.work = work;
  const education = pick(["Education"], true).map((r) => {
    const f = r.facets ?? {};
    const item: Record<string, unknown> = { area: r.statement };
    if (f.organization) item.institution = f.organization;
    if (f.role) item.studyType = f.role;
    dates(r, item);
    used.push(r.id);
    return item;
  });
  if (education.length) doc.education = education;
  const certificates = pick(["Credentials"], true).map((r) => {
    const f = r.facets ?? {};
    const item: Record<string, unknown> = { name: r.statement };
    if (f.organization) item.issuer = f.organization;
    // Schema 1.0.0 needs a full date here and has no expiry field.
    if (f.issued_on && FULL_DATE.test(f.issued_on)) item.date = f.issued_on;
    used.push(r.id);
    return item;
  });
  if (certificates.length) doc.certificates = certificates;
  const skills = pick(["Capabilities"], false).map((r) => {
    const item: Record<string, unknown> = { name: r.statement };
    if (r.facets?.level) item.level = r.facets.level;
    used.push(r.id);
    return item;
  });
  if (skills.length) doc.skills = skills;
  const careerBreaks = eligible.filter((r) => sectionOf(r) === "Career breaks").length;
  return { document: doc, used, career_breaks: careerBreaks };
}

// ---------- import ----------

export interface ImportItem {
  input: ProposeInput;
  /** JSON Pointer of the item in the file. */
  pointer: string;
  /** Record field path -> JSON Pointer of the file field. Used to name problems. */
  fields: Record<string, string>;
}

export interface ImportPlan {
  items: ImportItem[];
  skipped: string[];
  problems: string[];
}

const ROOT_KEYS = new Set([
  "$schema", "basics", "work", "volunteer", "education", "awards", "certificates", "publications",
  "skills", "languages", "interests", "references", "projects", "meta",
]);
const SKIPPED_SECTIONS = ["awards", "publications", "interests", "references", "meta"];
const SKIPPED_BASICS = ["name", "email", "phone", "url", "image", "location", "profiles"];
const ISO8601 = /^([1-2][0-9]{3}-[0-1][0-9]-[0-3][0-9]|[1-2][0-9]{3}-[0-1][0-9]|[1-2][0-9]{3})$/;

/** Escape a key for a JSON Pointer (RFC 6901). */
export function pointerKey(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Remove a byte order mark and turn CRLF and CR into LF. */
export function normalizeImportText(text: string): string {
  return text.replace(/^﻿/u, "").replace(/\r\n?/gu, "\n");
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

class Reader {
  readonly problems: string[] = [];

  str(obj: Record<string, unknown>, key: string, ptr: string): string | undefined {
    if (!Object.hasOwn(obj, key)) return undefined;
    const v = obj[key];
    if (typeof v !== "string") return void this.problems.push(`${ptr}/${pointerKey(key)} must be a string`);
    const t = v.trim();
    return t === "" ? undefined : t;
  }

  date(obj: Record<string, unknown>, key: string, ptr: string): string | undefined {
    const v = this.str(obj, key, ptr);
    if (v !== undefined && !ISO8601.test(v)) return void this.problems.push(`${ptr}/${pointerKey(key)} must be a date as YYYY, YYYY-MM, or YYYY-MM-DD`);
    return v;
  }

  list(obj: Record<string, unknown>, key: string, ptr: string): string[] {
    if (!Object.hasOwn(obj, key)) return [];
    const v = obj[key];
    if (!Array.isArray(v)) return void this.problems.push(`${ptr}/${pointerKey(key)} must be an array of strings`), [];
    const out: string[] = [];
    v.forEach((s, i) => {
      if (typeof s !== "string") this.problems.push(`${ptr}/${pointerKey(key)}/${i} must be a string`);
      else if (s.trim() !== "") out.push(s.trim());
    });
    return out;
  }

  section(root: Record<string, unknown>, key: string): Record<string, unknown>[] {
    if (!Object.hasOwn(root, key)) return [];
    const v = root[key];
    if (!Array.isArray(v)) return void this.problems.push(`/${key} must be an array`), [];
    return v.map((item, i) => {
      if (isObject(item)) return item;
      this.problems.push(`/${key}/${i} must be an object`);
      return {};
    });
  }
}

/** Turn a parsed JSON Resume document into proposal items. Reads only mapped fields, with Object.hasOwn. */
export function planJsonResumeImport(text: string, sourceLabel: string): ImportPlan {
  const plan: ImportPlan = { items: [], skipped: [], problems: [] };
  let root: unknown;
  // Fixed text: the SyntaxError message from Node quotes the input.
  try { root = JSON.parse(normalizeImportText(text)); } catch { plan.problems.push("/ the file is not valid JSON"); return plan; }
  if (!isObject(root)) { plan.problems.push("/ must be a JSON object"); return plan; }
  const unknown = Object.keys(root).filter((k) => !ROOT_KEYS.has(k)).length;
  if (unknown) plan.problems.push(`/ has ${unknown} unknown root key${unknown === 1 ? "" : "s"}`);

  const rd = new Reader();
  const sources = [{ kind: "import" as const, label: sourceLabel }];
  const add = (kind: RecordKind, statement: string, facets: Facets, pointer: string, fields: Record<string, string>): void => {
    const input: ProposeInput = { kind, statement, sources, user_stated: true, visibility: "private" };
    if (Object.keys(facets).length) input.facets = facets;
    plan.items.push({ input, pointer, fields });
  };

  if (Object.hasOwn(root, "basics")) {
    const b = root.basics;
    if (!isObject(b)) rd.problems.push("/basics must be an object");
    else {
      for (const key of ["label", "summary"]) {
        const v = rd.str(b, key, "/basics");
        if (v !== undefined) add("identity", v, {}, `/basics/${key}`, { statement: `/basics/${key}` });
      }
      for (const key of SKIPPED_BASICS) if (Object.hasOwn(b, key)) plan.skipped.push(`basics.${key}`);
    }
  }

  // Work, volunteer, and projects: one proposal for the summary and one for each highlight.
  const dated = (section: string, type: string, org: string, role: string | null, text: string, fallback: string[]): void => {
    rd.section(root as Record<string, unknown>, section).forEach((item, i) => {
      const ptr = `/${section}/${i}`;
      const facets: Facets = { type };
      const fields: Record<string, string> = { facets: ptr, "facets.period": ptr };
      const o = rd.str(item, org, ptr);
      if (o !== undefined) { facets.organization = o; fields["facets.organization"] = `${ptr}/${org}`; }
      let r: string | undefined;
      if (role === "roles") {
        const roles = rd.list(item, "roles", ptr);
        if (roles.length) r = roles.join(", ");
      } else if (role) r = rd.str(item, role, ptr);
      if (r !== undefined) { facets.role = r; fields["facets.role"] = role === "roles" ? `${ptr}/roles` : `${ptr}/${role}`; }
      const start = rd.date(item, "startDate", ptr);
      const end = rd.date(item, "endDate", ptr);
      if (start !== undefined || end !== undefined) {
        facets.period = {};
        if (start !== undefined) { facets.period.start = start; fields["facets.period.start"] = `${ptr}/startDate`; }
        if (end !== undefined) { facets.period.end = end; fields["facets.period.end"] = `${ptr}/endDate`; }
        else facets.period.ongoing = true; // JSON Resume: no end date means the item continues.
      }
      const summary = rd.str(item, text, ptr);
      const highlights = rd.list(item, "highlights", ptr);
      if (summary !== undefined) add("experience", summary, facets, ptr, { ...fields, statement: `${ptr}/${text}` });
      highlights.forEach((h, j) => add("experience", h, facets, `${ptr}/highlights/${j}`, { ...fields, statement: `${ptr}/highlights/${j}` }));
      if (summary === undefined && highlights.length === 0) {
        const parts = fallback.map((k) => (k === "role" ? r : k === "org" ? o : rd.str(item, k, ptr))).filter((s): s is string => s !== undefined);
        if (parts.length) add("experience", parts.join(", "), facets, ptr, { ...fields, statement: ptr });
      }
    });
  };
  dated("work", "employment", "name", "position", "summary", ["role", "org"]);
  dated("volunteer", "volunteer", "organization", "position", "summary", ["role", "org"]);
  dated("projects", "project", "entity", "roles", "description", ["name"]);

  rd.section(root, "education").forEach((item, i) => {
    const ptr = `/education/${i}`;
    const facets: Facets = { type: "education" };
    const fields: Record<string, string> = { facets: ptr, "facets.period": ptr };
    const inst = rd.str(item, "institution", ptr);
    if (inst !== undefined) { facets.organization = inst; fields["facets.organization"] = `${ptr}/institution`; }
    const study = rd.str(item, "studyType", ptr);
    if (study !== undefined) { facets.role = study; fields["facets.role"] = `${ptr}/studyType`; }
    const start = rd.date(item, "startDate", ptr);
    const end = rd.date(item, "endDate", ptr);
    if (start !== undefined || end !== undefined) {
      facets.period = {};
      if (start !== undefined) { facets.period.start = start; fields["facets.period.start"] = `${ptr}/startDate`; }
      if (end !== undefined) { facets.period.end = end; fields["facets.period.end"] = `${ptr}/endDate`; }
      else facets.period.ongoing = true;
    }
    const area = rd.str(item, "area", ptr);
    const statement = area ?? study ?? inst;
    if (statement !== undefined) add("experience", statement, facets, ptr, { ...fields, statement: area !== undefined ? `${ptr}/area` : ptr });
  });

  rd.section(root, "certificates").forEach((item, i) => {
    const ptr = `/certificates/${i}`;
    const facets: Facets = { type: "credential" };
    const fields: Record<string, string> = { facets: ptr };
    const issuer = rd.str(item, "issuer", ptr);
    if (issuer !== undefined) { facets.organization = issuer; fields["facets.organization"] = `${ptr}/issuer`; }
    const date = rd.date(item, "date", ptr);
    if (date !== undefined) { facets.issued_on = date; fields["facets.issued_on"] = `${ptr}/date`; }
    const name = rd.str(item, "name", ptr);
    if (name !== undefined) add("experience", name, facets, ptr, { ...fields, statement: `${ptr}/name` });
  });

  rd.section(root, "skills").forEach((item, i) => {
    const ptr = `/skills/${i}`;
    const facets: Facets = {};
    const fields: Record<string, string> = { facets: ptr };
    const level = rd.str(item, "level", ptr);
    if (level !== undefined) { facets.level = level; fields["facets.level"] = `${ptr}/level`; }
    const keywords = rd.list(item, "keywords", ptr);
    if (keywords.length) {
      facets.tags = keywords;
      fields["facets.tags"] = `${ptr}/keywords`;
      keywords.forEach((_, j) => (fields[`facets.tags[${j}]`] = `${ptr}/keywords/${j}`));
    }
    const name = rd.str(item, "name", ptr);
    if (name !== undefined) add("capability", name, facets, ptr, { ...fields, statement: `${ptr}/name` });
  });

  rd.section(root, "languages").forEach((item, i) => {
    const ptr = `/languages/${i}`;
    const facets: Facets = {};
    const fields: Record<string, string> = { facets: ptr };
    const fluency = rd.str(item, "fluency", ptr);
    if (fluency !== undefined) { facets.level = fluency; fields["facets.level"] = `${ptr}/fluency`; }
    const language = rd.str(item, "language", ptr);
    if (language !== undefined) add("capability", language, facets, ptr, { ...fields, statement: `${ptr}/language` });
  });

  for (const key of SKIPPED_SECTIONS) if (Object.hasOwn(root, key)) plan.skipped.push(key);
  plan.problems.push(...rd.problems);
  if (plan.items.length > IMPORT_PROPOSAL_LIMIT) {
    plan.problems.push(`/ maps to ${plan.items.length} proposals. The limit is ${IMPORT_PROPOSAL_LIMIT}`);
  }
  return plan;
}

/**
 * Name a core proposal problem by the file field it came from.
 * Core problems start with a record field path, such as "facets.period.start must be ...".
 */
export function problemAt(item: ImportItem, problem: string): string {
  let best = "";
  for (const field of Object.keys(item.fields)) {
    if ((problem.startsWith(`${field} `) || problem.startsWith(`${field}.`) || problem.startsWith(`${field}[`)) && field.length > best.length) best = field;
  }
  if (!best) return `${item.pointer} ${problem}`;
  const rest = problem.slice(best.length);
  return `${item.fields[best]}${rest.startsWith(" ") ? rest : ` ${rest.replace(/^[.[]/, "")}`}`;
}
