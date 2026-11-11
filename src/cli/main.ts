// personakit CLI. A thin wrapper around src/core. Agents pass --json and read JSON from stdout.
// REQ-CLI-001 REQ-CLI-002 REQ-CLI-003 REQ-VIS-001 REQ-AGT-003 REQ-CV-006 REQ-ONB-009

import { parseArgs, type ParseArgsConfig } from "node:util";
import { createInterface } from "node:readline/promises";
import { closeSync, copyFileSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringifyCanonical } from "../core/canonical.ts";
import { ExitCode, PersonaKitError } from "../core/errors.ts";
import { defaultStorePath } from "../core/location.ts";
import { agentView, type BriefLevel } from "../core/brief.ts";
import { stripCv, type CvCheckResult } from "../core/cv.ts";
import { exportArchive, restoreArchive } from "../core/archive.ts";
import { splitText } from "../core/text-import.ts";
import { JOB_MAX_BYTES, parseJob, renderMatchText } from "../core/cv-job.ts";
import { DOCX_LIMITS, readDocxText } from "../core/docx.ts";
import { createHash } from "node:crypto";
import { writeNewFileAtomic } from "../core/fsutil.ts";
import { startServer } from "../server/server.ts";
import {
  doctor, getRecord, initStore, openStore, ownerAction, proposeBatch, readAll, setVisibility, update,
  type ActorLabel, type OwnerAction, type ProposeInput, type Store, type UpdatePatch,
} from "../core/store.ts";
import { McpServer, installCrashLogging, serveStdio } from "../mcp/server.ts";
import { replaceFileAtomic } from "../core/fsutil.ts";
import { briefText, cvCheck, cvDraft, cvDraftForJob, cvMatch, exportJsonResume, importJsonResume, cvRecords as cvRecordsOp, listRecords, proposeRecords, showRecord, TEXT_INPUT_LIMIT } from "../app/operations.ts";
import {
  ACTORS, RECORD_KINDS, RECORD_STATES, SOURCE_KINDS, VISIBILITIES,
  type Actor, type Facets, type PersonaRecord, type RecordKind, type Source, type Visibility,
} from "../core/schema.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  readStdin: () => string;
  isInteractive: boolean;
  env: NodeJS.ProcessEnv;
  cwd: string;
  prompt?: (question: string) => Promise<string>;
  /** Process streams for the MCP server. Only main() sets them. */
  streams?: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream };
}

const OPTIONS = {
  store: { type: "string" },
  json: { type: "boolean" },
  yes: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  actor: { type: "string" },
  model: { type: "string" },
  session: { type: "string" },
  kind: { type: "string" },
  statement: { type: "string" },
  visibility: { type: "string" },
  "user-stated": { type: "boolean" },
  "source-kind": { type: "string" },
  "source-label": { type: "string" },
  "source-ref": { type: "string" },
  facets: { type: "string" },
  supersedes: { type: "string", multiple: true },
  from: { type: "string" },
  revision: { type: "string" },
  state: { type: "string" },
  level: { type: "string" },
  out: { type: "string" },
  fix: { type: "boolean" },
  target: { type: "string" },
  "as-of": { type: "string" },
  job: { type: "string" },
  strict: { type: "boolean" },
  port: { type: "string" },
  open: { type: "boolean" },
} as const satisfies ParseArgsConfig["options"];

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

const HELP = `personakit: keep one sourced record of who you are.

Usage: personakit <command> [options]

Agent commands (never print private records):
  brief [--level short|full] [--json] [--out FILE]   Compile the AI brief
  cv draft [--as-of DATE] [--json] [--out FILE]      Build a cited CV draft from public records
           [--job FILE|-]                            Keep the records that share words with a job text
  cv match --job FILE|- [--json]                     Show which records share words with a job text
  cv check FILE [--strict]                           Check CV lines; --strict fails on warnings
  cv strip FILE [--out FILE]                         Print the final CV text without markers
  export json-resume [--out FILE]                    Build JSON Resume 1.0.0 from public records
  import json-resume FILE                            Propose records from a JSON Resume file
  mcp                                                Start the MCP server on stdin and stdout
  propose --kind K --statement TEXT [options]        Propose one record
  propose --from FILE|-                              Propose records from JSON Lines
  update ID --revision N [fields]                    Change a proposal, or propose a change to an accepted record
  list [--state S] [--kind K]                        List records
  show ID                                            Show one record
  import text FILE [--user-stated]                   Propose records from pasted CV text in a file
  import docx FILE [--user-stated]                   Propose private records from a Word CV (.docx)

Owner commands (ask for confirmation):
  init                                               Create the store
  review                                             Go through pending proposals one by one
  accept ID... [--visibility V] [--revision N]       Accept proposals
  reject ID... [--revision N]                        Reject proposals
  retire ID...                                       Retire accepted records
  visibility ID LEVEL                                Change visibility: private, ai, or public
  doctor [--fix]                                     Check the store
  skill install [--target claude|codex|all]          Install the personakit skill for your agents
  serve [--port N] [--open]                          Start the local web app on 127.0.0.1
  export --out FILE                                  Write the whole store to one archive file (holds private records)
  import archive FILE                                Restore an archive into an empty store

Common options:
  --store PATH      Store folder. Default: $PERSONAKIT_HOME or ~/.personakit
  --json            Print JSON
  --actor A         Who writes: ${ACTORS.join(", ")}. Default: $PERSONAKIT_ACTOR or cli
  --model M         Model label (optional)
  --session S       Session label (optional)
  --yes             Confirm an owner command without a prompt

Exit codes: 0 ok, 1 unexpected, 2 usage, 3 conflict, 4 confirmation required, 5 not found, 6 invalid, 7 unsafe store path.
`;

function usage(message: string): PersonaKitError {
  return new PersonaKitError("usage", message);
}

function pickEnum<T extends string>(name: string, list: readonly T[], value: string | undefined): T | undefined {
  if (value === undefined) return undefined;
  if (!(list as readonly string[]).includes(value)) throw usage(`--${name} must be one of: ${list.join(", ")}.`);
  return value as T;
}

function actorLabel(v: Values, env: NodeJS.ProcessEnv): ActorLabel {
  const actor = pickEnum("actor", ACTORS, v.actor || env.PERSONAKIT_ACTOR || "cli") as Actor;
  const label: ActorLabel = { actor };
  const model = v.model ?? env.PERSONAKIT_MODEL;
  const session = v.session ?? env.PERSONAKIT_SESSION;
  if (model) label.model = model;
  if (session) label.session = session;
  return label;
}

function parseJson(name: string, text: string): unknown {
  try { return JSON.parse(text); } catch { throw usage(`--${name} must be valid JSON.`); }
}

function parseRevision(v: Values, required: boolean): number | undefined {
  if (v.revision === undefined) {
    if (required) throw usage("--revision is required. Use the revision from list, show, or propose.");
    return undefined;
  }
  const n = Number(v.revision);
  if (!Number.isInteger(n) || n < 1) throw usage("--revision must be a positive integer.");
  return n;
}

function proposeInputFromObject(o: Record<string, unknown>, line: number | undefined): ProposeInput {
  const where = line === undefined ? "" : ` on line ${line}`;
  if (!RECORD_KINDS.includes(o.kind as RecordKind)) throw usage(`kind${where} must be one of: ${RECORD_KINDS.join(", ")}.`);
  if (typeof o.statement !== "string") throw usage(`statement${where} is required.`);
  const input: ProposeInput = {
    kind: o.kind as RecordKind,
    statement: o.statement,
    sources: (o.sources as Source[] | undefined) ?? [{ kind: "chat" }],
    user_stated: o.user_stated === true,
  };
  if (o.visibility !== undefined) input.visibility = o.visibility as Visibility;
  if (o.facets !== undefined) input.facets = o.facets as Facets;
  if (o.supersedes !== undefined) input.supersedes = o.supersedes as string[];
  if (o.extensions !== undefined) input.extensions = o.extensions as Record<string, unknown>;
  return input;
}

function proposeInputFromFlags(v: Values): ProposeInput {
  const kind = pickEnum("kind", RECORD_KINDS, v.kind);
  if (!kind) throw usage(`--kind is required: ${RECORD_KINDS.join(", ")}.`);
  if (v.statement === undefined) throw usage("--statement is required.");
  const source: Source = { kind: pickEnum("source-kind", SOURCE_KINDS, v["source-kind"]) ?? "chat" };
  if (v["source-label"]) source.label = v["source-label"];
  if (v["source-ref"]) source.ref = v["source-ref"];
  const input: ProposeInput = { kind, statement: v.statement, sources: [source], user_stated: v["user-stated"] === true };
  const visibility = pickEnum("visibility", VISIBILITIES, v.visibility);
  if (visibility) input.visibility = visibility;
  if (v.facets) input.facets = parseJson("facets", v.facets) as Facets;
  if (v.supersedes?.length) input.supersedes = v.supersedes;
  return input;
}

function storeFor(v: Values, io: Io): Store {
  return openStore(v.store ?? defaultStorePath(io.env), { cwd: io.cwd });
}

async function confirm(io: Io, v: Values, question: string): Promise<void> {
  if (v.yes) return;
  if (!io.isInteractive || !io.prompt) {
    throw new PersonaKitError("confirmationRequired", "This owner command needs confirmation. Run it in an interactive terminal, or add --yes if you are the owner.");
  }
  const answer = (await io.prompt(`${question} [y/N] `)).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") throw new PersonaKitError("confirmationRequired", "Not confirmed. Nothing changed.");
}

function describe(r: PersonaRecord): string {
  const parts = [`${r.id}  ${r.kind}  ${r.state}  ${r.visibility}  rev ${r.revision}`, `  ${r.statement}`];
  const f = r.facets;
  if (f) {
    const bits = [f.type, f.role, f.organization, f.period ? `${f.period.start ?? "?"} to ${f.period.ongoing ? "now" : f.period.end ?? "?"}` : undefined, f.expires_on ? `expires ${f.expires_on}` : undefined, f.contribution];
    const text = bits.filter(Boolean).join(" | ");
    if (text) parts.push(`  ${text}`);
  }
  return parts.join("\n");
}

function describeView(view: Record<string, unknown>): string {
  const head = `${view.id}  ${view.kind}  ${view.state}  ${view.visibility}  rev ${view.revision}  by ${view.actor}`;
  return view.redacted ? `${head}\n  (private: open "personakit review" to see it)` : `${head}\n  ${view.statement}`;
}

// ---------- commands ----------

type Result = { data: unknown; text: string; exitCode?: number };

async function cmdInit(v: Values, io: Io): Promise<Result> {
  const r = initStore(v.store ?? defaultStorePath(io.env), { cwd: io.cwd });
  const lines = [r.created ? `Created the store at ${r.root}.` : `The store at ${r.root} already exists.`];
  if (r.warning) lines.push(`Warning: ${r.warning}`);
  lines.push("Next: install the agent skill with \"personakit skill install\".");
  return { data: r, text: lines.join("\n") };
}

async function cmdPropose(v: Values, io: Io): Promise<Result> {
  const store = storeFor(v, io);
  const label = actorLabel(v, io.env);
  let inputs: ProposeInput[];
  if (v.from !== undefined) {
    const text = v.from === "-" ? io.readStdin() : readFileSync(v.from, "utf8");
    inputs = text.split("\n").map((l, i) => [l.trim(), i + 1] as const).filter(([l]) => l !== "")
      .map(([l, n]) => proposeInputFromObject(parseJson("from", l) as Record<string, unknown>, n));
    if (inputs.length === 0) throw usage("The input has no records. Write one JSON object per line.");
  } else {
    inputs = [proposeInputFromFlags(v)];
  }
  // All or nothing, and no statement in any mode: no CLI output path prints the text of a private record.
  const results = proposeRecords(store, inputs, label);
  const text = results.map((r, i) => `Proposed ${r.id} (${inputs[i]!.kind}, rev ${r.revision}, ${r.visibility}).${r.possible_duplicates.length ? `\n  Possible duplicate of ${r.possible_duplicates.join(", ")}` : ""}${r.previously_rejected ? "\n  The owner rejected the same statement before." : ""}`).join("\n");
  return { data: results.length === 1 ? results[0] : { proposed: results }, text: `${text}\nThe owner reviews proposals with "personakit review".` };
}

async function cmdUpdate(v: Values, io: Io, args: string[]): Promise<Result> {
  const id = args[0];
  if (!id) throw usage("update needs a record ID.");
  const store = storeFor(v, io);
  const patch: UpdatePatch = {};
  if (v.statement !== undefined) patch.statement = v.statement;
  const visibility = pickEnum("visibility", VISIBILITIES, v.visibility);
  if (visibility) patch.visibility = visibility;
  if (v.facets) patch.facets = parseJson("facets", v.facets) as Facets;
  if (v["user-stated"]) patch.user_stated = true;
  if (Object.keys(patch).length === 0) throw usage("update needs at least one change: --statement, --visibility, --facets, or --user-stated.");
  const r = update(store, id, parseRevision(v, true)!, patch, actorLabel(v, io.env));
  const data = { outcome: r.outcome, conflict: r.conflict, id: r.record.id, revision: r.record.revision, state: r.record.state, current_revision_of_target: r.current_revision, possible_duplicates: r.duplicates.visible };
  const text = r.outcome === "updated"
    ? `Updated ${id} to revision ${r.record.revision}.`
    : `${r.conflict ? `Conflict: ${id} is at revision ${r.current_revision}, not the revision you gave. ` : `${id} is accepted and does not change. `}Created proposal ${r.record.id} that supersedes it.`;
  return { data, text, exitCode: r.conflict ? ExitCode.conflict : ExitCode.ok };
}

async function cmdList(v: Values, io: Io): Promise<Result> {
  const store = storeFor(v, io);
  const state = pickEnum("state", RECORD_STATES, v.state);
  const kind = pickEnum("kind", RECORD_KINDS, v.kind);
  const filter: { state?: typeof state; kind?: typeof kind } = {};
  if (state) filter.state = state;
  if (kind) filter.kind = kind;
  const data = listRecords(store, filter);
  const views = data.records;
  const problems = data.problems ?? 0;
  const text = views.length ? views.map(describeView).join("\n") : "No records match.";
  return { data, text: problems ? `${text}\n${problems} record files have problems. Run "personakit doctor".` : text };
}

async function cmdShow(v: Values, io: Io, args: string[]): Promise<Result> {
  const id = args[0];
  if (!id) throw usage("show needs a record ID.");
  const view = showRecord(storeFor(v, io), id);
  return { data: view, text: describeView(view) };
}

async function cmdBrief(v: Values, io: Io): Promise<Result> {
  const store = storeFor(v, io);
  const level = (pickEnum("level", ["short", "full"] as const, v.level) ?? "full") as BriefLevel;
  const out = briefText(store, level, v.json === true);
  if (v.out) {
    writeFileSync(v.out, out);
    return { data: { written: resolve(v.out), level }, text: `Wrote the ${level} brief to ${resolve(v.out)}.` };
  }
  return { data: undefined, text: out, raw: true } as Result & { raw: boolean };
}

async function cmdOwner(action: OwnerAction, v: Values, io: Io, args: string[]): Promise<Result> {
  if (args.length === 0) throw usage(`${action} needs at least one record ID.`);
  const store = storeFor(v, io);
  const visibility = pickEnum("visibility", VISIBILITIES, v.visibility);
  if (visibility && action !== "accept") throw usage("--visibility works only with accept.");
  const expectedRevision = parseRevision(v, false);
  if (expectedRevision !== undefined && args.length > 1) throw usage("--revision works with one record ID only.");
  const records = args.map((id) => getRecord(store, id));
  // Redacted view: a private statement never leaves through these commands. review shows full text.
  if (!v.yes && io.isInteractive) io.stderr(records.map((r) => describeView(agentView(r))).join("\n") + "\n");
  await confirm(io, v, `${action} ${args.length} record${args.length === 1 ? "" : "s"}${visibility ? ` with visibility ${visibility}` : ""}?`);
  const label = actorLabel(v, io.env);
  const results = args.map((id) => {
    const opts: { expectedRevision?: number; visibility?: Visibility } = {};
    if (expectedRevision !== undefined) opts.expectedRevision = expectedRevision;
    if (visibility) opts.visibility = visibility;
    const r = ownerAction(store, action, id, opts, label);
    return { id, state: r.record.state, visibility: r.record.visibility, revision: r.record.revision, side_effects: r.side_effects };
  });
  const text = results.map((r) => `${r.id} is ${r.state} (${r.visibility}).${r.side_effects.map((s) => ` ${s.id} is now ${s.state}.`).join("")}`).join("\n");
  const hidden = action === "accept" && results.some((r) => r.visibility === "private");
  return { data: { results }, text: hidden ? `${text}\nPrivate records do not appear in the brief. Use --visibility ai to include them.` : text };
}

async function cmdVisibility(v: Values, io: Io, args: string[]): Promise<Result> {
  const [id, level] = args;
  if (!id || !level) throw usage("visibility needs a record ID and a level: private, ai, or public.");
  const visibility = pickEnum("visibility", VISIBILITIES, level)!;
  const store = storeFor(v, io);
  await confirm(io, v, `Set the visibility of ${id} to ${visibility}?`);
  const opts: { expectedRevision?: number } = {};
  const rev = parseRevision(v, false);
  if (rev !== undefined) opts.expectedRevision = rev;
  const r = setVisibility(store, id, visibility, opts, actorLabel(v, io.env));
  return { data: { id, visibility: r.visibility, revision: r.revision }, text: `${id} visibility is ${r.visibility}.` };
}

async function cmdReview(v: Values, io: Io): Promise<Result> {
  if (!io.isInteractive || !io.prompt) {
    throw new PersonaKitError("confirmationRequired", "review is interactive. Run it in your own terminal. Agents use list --state proposed.");
  }
  const store = storeFor(v, io);
  const label = actorLabel(v, io.env);
  const pending = readAll(store).records.filter((r) => r.state === "proposed");
  if (pending.length === 0) return { data: { reviewed: 0 }, text: "No proposals wait for review." };
  const summary = { accepted: 0, rejected: 0, skipped: 0 };
  for (const [i, r] of pending.entries()) {
    const current = getRecord(store, r.id);
    if (current.state !== "proposed") continue;
    const all = readAll(store).records;
    const lines = [`\n[${i + 1}/${pending.length}] ${describe(current)}`];
    lines.push(`  source: ${current.sources.map((s) => [s.kind, s.label, s.ref].filter(Boolean).join(" ")).join("; ")}`);
    lines.push(`  proposed by ${current.provenance.actor}${current.provenance.model ? ` (${current.provenance.model})` : ""}. ${current.provenance.user_stated ? "The user stated this." : "The user did not state this directly."}`);
    for (const id of current.supersedes ?? []) {
      const old = all.find((x) => x.id === id);
      if (old) lines.push(`  replaces ${id} (${old.state}): ${old.statement}`);
    }
    for (const id of current.possible_duplicate_of ?? []) {
      const dup = all.find((x) => x.id === id);
      if (dup) lines.push(`  possible duplicate ${id} (${dup.state}, ${dup.visibility}): ${dup.statement}`);
    }
    io.stderr(lines.join("\n") + "\n");
    const answer = (await io.prompt(`Accept as [a]i, [p]ublic, or [k] private; [r]eject; [s]kip; [q]uit. Suggested: ${current.visibility}. > `)).trim().toLowerCase();
    if (answer === "q") break;
    const accept: Record<string, Visibility> = { a: "ai", p: "public", k: "private" };
    if (accept[answer]) {
      ownerAction(store, "accept", current.id, { expectedRevision: current.revision, visibility: accept[answer]! }, label);
      summary.accepted++;
    } else if (answer === "r") {
      ownerAction(store, "reject", current.id, { expectedRevision: current.revision }, label);
      summary.rejected++;
    } else {
      summary.skipped++;
    }
  }
  return { data: summary, text: `Accepted ${summary.accepted}, rejected ${summary.rejected}, skipped ${summary.skipped}.` };
}

async function cmdDoctor(v: Values, io: Io): Promise<Result> {
  const report = doctor(storeFor(v, io), { fix: v.fix === true });
  const lines = [`Store: ${report.store}`, `Records: ${report.counts.accepted} accepted, ${report.counts.proposed} proposed, ${report.counts.rejected} rejected, ${report.counts.retired} retired.`];
  if (report.counts.proposed) lines.push(`${report.counts.proposed} proposals wait for review. Run "personakit review".`);
  for (const f of report.findings) lines.push(`${f.level}: ${f.message}`);
  for (const f of report.fixed) lines.push(`fixed: ${f}`);
  lines.push(report.ok ? "No errors found." : "Errors found.");
  return { data: report, text: lines.join("\n"), exitCode: report.ok ? ExitCode.ok : ExitCode.invalid };
}

// REQ-AGT-003
async function cmdSkill(v: Values, io: Io, args: string[]): Promise<Result> {
  if (args[0] !== "install") throw usage('Use "personakit skill install".');
  const target = pickEnum("target", ["claude", "codex", "all"] as const, v.target) ?? "all";
  const source = join(REPO_ROOT, ".agents", "skills", "personakit", "SKILL.md");
  if (!existsSync(source)) throw new PersonaKitError("notFound", `The skill file ${source} is missing.`);
  const home = io.env.HOME ?? homedir();
  const dests: string[] = [];
  if (target !== "codex") dests.push(join(home, ".claude", "skills", "personakit", "SKILL.md"));
  if (target !== "claude") dests.push(join(home, ".agents", "skills", "personakit", "SKILL.md"));
  for (const d of dests) {
    mkdirSync(dirname(d), { recursive: true });
    copyFileSync(source, d);
  }
  return { data: { installed: dests }, text: `Installed the personakit skill:\n${dests.map((d) => `  ${d}`).join("\n")}` };
}

// REQ-CV-001 REQ-CV-002 REQ-CV-005 REQ-CV-006 REQ-VIS-002
export const CV_FILE_LIMIT = TEXT_INPUT_LIMIT;

function readCvFile(path: string | undefined): string {
  if (!path) throw usage("Give the CV file: personakit cv check FILE.");
  if (!existsSync(path)) throw new PersonaKitError("notFound", `The CV file ${path} does not exist.`, { file: path });
  if (statSync(path).size > CV_FILE_LIMIT) throw new PersonaKitError("invalid", `The CV file ${path} is larger than 1 MiB.`, { file: path });
  return readFileSync(path, "utf8");
}

// REQ-CV-011: the job text is untrusted data. Errors never repeat it.
function readJob(v: Values, io: Io): string {
  const path = v.job;
  if (path === undefined || path === "") throw usage("Give the job text: --job FILE, or --job - to read stdin.");
  if (path === "-") {
    const text = io.readStdin();
    parseJob(text); // Check the size and the content before the store opens.
    return text;
  }
  if (!existsSync(path) || !statSync(path).isFile()) throw usage(`The job file ${path} does not exist or is not a file.`);
  if (statSync(path).size > JOB_MAX_BYTES) throw usage(`The job file is larger than ${JOB_MAX_BYTES} bytes. Give a shorter job text.`);
  const text = readFileSync(path, "utf8");
  parseJob(text);
  return text;
}

function cvRecords(v: Values, io: Io): PersonaRecord[] {
  return cvRecordsOp(storeFor(v, io));
}

function describeCheck(r: CvCheckResult): string {
  const lines = r.findings.map((f) => `line ${f.line}: ${f.level} ${f.code}: ${f.message}`);
  if (r.owner_lines.length) lines.push(`Owner-stated lines to review: ${r.owner_lines.join(", ")}.`);
  if (r.warnings) lines.push(`${r.warnings} warning${r.warnings === 1 ? "" : "s"}. Read each line and its records again.`);
  lines.push(r.ok ? `No errors. ${r.cited_ids.length} records cited.` : `${r.errors} error${r.errors === 1 ? "" : "s"}. Fix them before "personakit cv strip".`);
  return lines.join("\n");
}

async function cmdCv(v: Values, io: Io, args: string[]): Promise<Result> {
  const [sub, file] = args;
  if (sub === "draft") {
    if (v["as-of"] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v["as-of"])) throw usage("--as-of must be a date as YYYY-MM-DD.");
    if (v.job !== undefined) {
      // REQ-CV-010: the tailored draft. Hints go to stderr as counts and IDs, so they never enter the draft.
      // Read and check the job text before the store opens, so a bad job is a usage error.
      const jobText = readJob(v, io);
      const r = cvDraftForJob(storeFor(v, io), jobText, v["as-of"]);
      const gaps = r.match.gaps.length;
      if (r.match.matched === 0) io.stderr(`No record outside Summary, Education, Credentials, and Career breaks shares words with the job text. This is the full draft.\n`);
      if (r.left_out.length) io.stderr(`Left out ${r.left_out.length} record${r.left_out.length === 1 ? "" : "s"} that share no words with the job text: ${r.left_out.join(", ")}.\n`);
      io.stderr(`${gaps} requirement${gaps === 1 ? "" : "s"} with no record. To see the links and gaps, run "personakit cv match --job ${v.job}".\n`);
      const out = v.json ? stringifyCanonical({ draft: r.draft, match: r.match }) : r.markdown;
      if (v.out) {
        writeFileSync(v.out, out);
        return { data: { written: resolve(v.out), records: r.count, left_out: r.left_out, gaps }, text: `Wrote the tailored CV draft with ${r.count} records to ${resolve(v.out)}.` };
      }
      return { data: undefined, text: out, raw: true } as Result & { raw: boolean };
    }
    const { draft, markdown, count, ai_only: aiOnly } = cvDraft(storeFor(v, io), v["as-of"]);
    if (count < 3 && aiOnly > 0) {
      // Counts only, never text. The hint goes to stderr, so it never enters the draft.
      io.stderr(`${aiOnly} accepted records have visibility ai. A CV uses public records only. To add one, run "personakit visibility <id> public".\n`);
    }
    const out = v.json ? stringifyCanonical(draft) : markdown;
    if (v.out) {
      writeFileSync(v.out, out);
      return { data: { written: resolve(v.out), records: count }, text: `Wrote the CV draft with ${count} records to ${resolve(v.out)}.` };
    }
    return { data: undefined, text: out, raw: true } as Result & { raw: boolean };
  }
  if (sub === "check") {
    const text = readCvFile(file);
    const result = cvCheck(storeFor(v, io), text);
    // REQ-CV-004: --strict makes warnings fail.
    const failed = !result.ok || (v.strict === true && result.warnings > 0);
    return { data: result, text: describeCheck(result), exitCode: failed ? ExitCode.invalid : ExitCode.ok };
  }
  if (sub === "match") {
    if (v.out !== undefined || v["as-of"] !== undefined) throw usage('"cv match" prints the report only. It takes no --out or --as-of.');
    const jobText = readJob(v, io);
    const m = cvMatch(storeFor(v, io), jobText);
    return { data: m, text: renderMatchText(m).trimEnd() };
  }
  if (sub === "strip") {
    const text = readCvFile(file);
    const { text: final, check } = stripCv(text, cvRecords(v, io));
    if (final === undefined) {
      io.stderr(`${describeCheck(check)}\n`);
      throw new PersonaKitError("invalid", `The CV has ${check.errors} error${check.errors === 1 ? "" : "s"}. Nothing was printed.`, { errors: check.errors });
    }
    if (v.out) {
      writeFileSync(v.out, final);
      return { data: { written: resolve(v.out), owner_lines: check.owner_lines }, text: `Wrote the final CV to ${resolve(v.out)}. Review it before you send it.` };
    }
    // With --json, agents read JSON from stdout: the text goes inside the object.
    if (v.json) return { data: { text: final, owner_lines: check.owner_lines }, text: final };
    return { data: undefined, text: final, raw: true } as Result & { raw: boolean };
  }
  throw usage('Use "personakit cv draft", "personakit cv match --job FILE", "personakit cv check FILE", or "personakit cv strip FILE".');
}

// ---------- import, export ----------
// REQ-ONB-004 REQ-ARC-001 REQ-ARC-002 REQ-ARC-003

export const ARCHIVE_FILE_LIMIT = 64 * 1024 * 1024;
export const EXPORT_WARNING = "Warning: the archive holds every record, private records too. Keep the file private. Do not upload it or share it.";

function readInputFile(path: string | undefined, what: string, limit: number): string {
  if (!path) throw usage(`Give the ${what} file.`);
  if (!existsSync(path)) throw new PersonaKitError("notFound", `The ${what} file ${path} does not exist.`, { file: path });
  if (statSync(path).size > limit) throw new PersonaKitError("invalid", `The ${what} file ${path} is larger than ${limit / 1024 / 1024} MiB.`, { file: path });
  return readFileSync(path, "utf8");
}

/** Split text into drafts and propose them all or nothing. IDs and counts only in the output. */
function proposeDrafts(v: Values, io: Io, text: string, source: Source, visibility?: Visibility): Result {
  const drafts = splitText(text);
  if (drafts.length === 0) throw new PersonaKitError("invalid", "The file gives no drafts. Nothing was proposed.");
  const problems = drafts.flatMap((d, i) => d.problems.map((p) => `draft ${i + 1}: ${p}`));
  if (problems.length) throw new PersonaKitError("invalid", `Nothing was proposed. ${problems.join(" ")}`, { problems });
  const inputs: ProposeInput[] = drafts.map((d) => {
    const input: ProposeInput = { kind: d.kind, statement: d.statement, sources: [source], user_stated: v["user-stated"] === true };
    if (visibility) input.visibility = visibility;
    return input;
  });
  let batch: ReturnType<typeof proposeBatch>;
  try {
    batch = proposeBatch(storeFor(v, io), inputs, actorLabel(v, io.env));
  } catch (err) {
    if (err instanceof PersonaKitError && Array.isArray(err.details.problems)) {
      const named = (err.details.problems as string[]).map((p) => p.replace(/^item (\d+):/, "draft $1:"));
      throw new PersonaKitError(err.code, `Nothing was proposed. ${named.join("; ")}.`, { problems: named });
    }
    throw err;
  }
  // IDs and counts only: no statement text in any mode.
  const proposed = batch.map(({ record }) => ({ id: record.id, kind: record.kind, revision: record.revision, visibility: record.visibility }));
  const text2 = `Proposed ${proposed.length} records:\n${proposed.map((r) => `  ${r.id} (${r.kind})`).join("\n")}\nThe owner reviews proposals with "personakit review" or in the web app.`;
  return { data: { proposed, count: proposed.length, source: source.label }, text: text2 };
}

/** Read a binary file through one descriptor, with the size checked before the read. */
function readInputBytes(path: string | undefined, what: string, limit: number): Buffer {
  if (!path) throw usage(`Give the ${what} file.`);
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new PersonaKitError("notFound", `The ${what} file ${path} does not exist.`, { file: path });
    throw new PersonaKitError("invalid", `The ${what} file ${path} cannot be opened.`, { file: path });
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new PersonaKitError("invalid", `${path} is not a file.`, { file: path });
    const size = st.size;
    if (size > limit) throw new PersonaKitError("invalid", `The ${what} file ${path} is larger than ${limit / 1024 / 1024} MiB.`, { file: path });
    const buf = Buffer.alloc(size);
    let off = 0;
    while (off < size) {
      const n = readSync(fd, buf, off, size - off, off);
      if (n === 0) break;
      off += n;
    }
    return buf.subarray(0, off);
  } finally {
    closeSync(fd);
  }
}

async function cmdImport(v: Values, io: Io, args: string[]): Promise<Result> {
  const [sub, file] = args;
  if (sub === "json-resume") return cmdImportJsonResume(v, io, args);
  if (sub === "text") {
    const text = readInputFile(file, "text", 1024 * 1024);
    return proposeDrafts(v, io, text, { kind: "cv", label: "pasted text" });
  }
  if (sub === "docx") {
    // REQ-ONB-009: private proposals with one label for the file, so the owner can find the batch.
    const bytes = readInputBytes(file, "DOCX", DOCX_LIMITS.fileBytes);
    const text = readDocxText(bytes);
    const label = `docx:${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}`;
    return proposeDrafts(v, io, text, { kind: "import", label }, "private");
  }
  if (sub === "archive") {
    const text = readInputFile(file, "archive", ARCHIVE_FILE_LIMIT);
    const r = restoreArchive(v.store ?? defaultStorePath(io.env), text, { cwd: io.cwd });
    const msg = `${r.resumed ? "Finished the restore" : "Restored the archive"} into ${r.root}: ${r.records} records and ${r.events} events.`;
    return { data: r, text: msg };
  }
  throw usage('Use "personakit import text FILE", "personakit import docx FILE", "personakit import archive FILE", or "personakit import json-resume FILE".');
}

async function cmdExport(v: Values, io: Io, args: string[]): Promise<Result> {
  if (args[0] === "json-resume") return cmdExportJsonResume(v, io, args);
  if (args.length) throw usage('Use "personakit export --out FILE" for an archive, or "personakit export json-resume [--out FILE]".');
  if (!v.out) throw usage("export needs --out FILE.");
  const out = resolve(v.out);
  if (existsSync(out)) throw new PersonaKitError("invalid", `The file ${out} already exists. Choose a new file name.`, { file: out });
  const store = storeFor(v, io);
  const text = exportArchive(store);
  const parsed = JSON.parse(text) as { records: unknown[]; events: unknown[] };
  try {
    writeNewFileAtomic(out, text);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new PersonaKitError("invalid", `The file ${out} already exists. Choose a new file name.`, { file: out });
    throw err;
  }
  io.stderr(`${EXPORT_WARNING}\n`);
  return { data: { written: out, records: parsed.records.length, events: parsed.events.length }, text: `Wrote ${parsed.records.length} records and ${parsed.events.length} events to ${out}.` };
}

// ---------- serve ----------
// REQ-WEB-001 REQ-WEB-004 REQ-WEB-009

async function cmdServe(v: Values, io: Io): Promise<Result> {
  let port: number | undefined;
  if (v.port !== undefined) {
    port = Number(v.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw usage("--port must be a whole number from 1 to 65535.");
  }
  const opts: Parameters<typeof startServer>[0] = { storePath: v.store ?? defaultStorePath(io.env), cwd: io.cwd, open: v.open === true };
  if (port !== undefined) opts.port = port;
  const running = await startServer(opts);
  // Only the URL and the store path. No request log, no record text.
  const lines = [
    "PersonaKit is running on this computer only.",
    v.open ? "Your browser opens the app. If it does not open, use this URL:" : "Open this URL in your browser:",
    `  ${running.url}`,
    `Store: ${running.storeRoot}`,
  ];
  if (running.warning) lines.push(`Warning: ${running.warning}`);
  lines.push("Keep this window open while you use the app. Press Ctrl+C to stop.");
  io.stdout(`${lines.join("\n")}\n`);
  await new Promise<void>((resolveStop) => {
    const stop = (): void => { process.off("SIGINT", stop); process.off("SIGTERM", stop); void running.close().then(resolveStop); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  return { data: { stopped: true }, text: "PersonaKit stopped." };
}

// REQ-MCP-001 REQ-MCP-008
async function cmdMcp(v: Values, io: Io): Promise<Result> {
  if (!io.streams) throw usage("personakit mcp needs the process streams.");
  const log = (line: string): void => io.stderr(`${line}\n`);
  // Only the error class goes to stderr: an error message can quote input or record text.
  installCrashLogging(log);
  const server = new McpServer({ storePath: v.store ?? defaultStorePath(io.env), cwd: io.cwd, log });
  await serveStdio(server, io.streams.stdin as unknown as import("node:stream").Readable, io.streams.stdout as unknown as import("node:stream").Writable, log);
  return { data: undefined, text: "", raw: true } as Result & { raw: boolean };
}

// REQ-RES-001 REQ-RES-002 REQ-RES-003
async function cmdExportJsonResume(v: Values, io: Io, args: string[]): Promise<Result> {
  if (args[0] !== "json-resume" || args.length > 1) throw usage('Use "personakit export json-resume [--out FILE]".');
  const r = exportJsonResume(storeFor(v, io));
  const left = r.career_breaks ? ` ${r.career_breaks} public career break${r.career_breaks === 1 ? " was" : "s were"} left out: JSON Resume has no section for them.` : "";
  if (v.out) {
    const target = resolve(v.out);
    replaceFileAtomic(target, r.text);
    return { data: { written: target, records: r.used.length, used: r.used, career_breaks: r.career_breaks }, text: `Wrote JSON Resume with ${r.used.length} records to ${target}.${left}` };
  }
  if (left) io.stderr(`${left.trim()}\n`);
  return { data: undefined, text: r.text, raw: true } as Result & { raw: boolean };
}

// REQ-RES-004 REQ-RES-005
async function cmdImportJsonResume(v: Values, io: Io, args: string[]): Promise<Result> {
  const [format, file] = args;
  if (format !== "json-resume" || !file || args.length > 2) throw usage('Use "personakit import json-resume FILE".');
  if (!existsSync(file)) throw new PersonaKitError("notFound", `The file ${file} does not exist.`, { file });
  if (statSync(file).size > TEXT_INPUT_LIMIT) throw new PersonaKitError("invalid", "Nothing was imported. The file is larger than 1 MiB.", { problems: ["/ the file is larger than 1 MiB"] });
  const r = importJsonResume(storeFor(v, io), readFileSync(file));
  const lines = [`Proposed ${r.proposed.length} records from ${file} with source ${r.source_label}.`];
  if (r.skipped.length) lines.push(`Skipped: ${r.skipped.join(", ")}.`);
  lines.push('The owner reviews proposals with "personakit review".');
  return { data: r, text: lines.join("\n") };
}

// ---------- entry ----------

export async function run(argv: string[], io: Io): Promise<number> {
  let values: Values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true }));
  } catch (err) {
    const message = (err as Error).message;
    if (argv.includes("--json")) io.stdout(stringifyCanonical({ error: { code: "usage", exit_code: ExitCode.usage, message, details: {} } }));
    io.stderr(`${message}\nRun "personakit --help".\n`);
    return ExitCode.usage;
  }
  const [command, ...args] = positionals;
  if (values.help || !command) {
    io.stdout(HELP);
    return command || values.help ? ExitCode.ok : ExitCode.usage;
  }
  try {
    const handlers: Record<string, () => Promise<Result>> = {
      init: () => cmdInit(values, io),
      propose: () => cmdPropose(values, io),
      update: () => cmdUpdate(values, io, args),
      list: () => cmdList(values, io),
      show: () => cmdShow(values, io, args),
      brief: () => cmdBrief(values, io),
      review: () => cmdReview(values, io),
      accept: () => cmdOwner("accept", values, io, args),
      reject: () => cmdOwner("reject", values, io, args),
      retire: () => cmdOwner("retire", values, io, args),
      visibility: () => cmdVisibility(values, io, args),
      doctor: () => cmdDoctor(values, io),
      skill: () => cmdSkill(values, io, args),
      cv: () => cmdCv(values, io, args),
      import: () => cmdImport(values, io, args),
      export: () => cmdExport(values, io, args),
      serve: () => cmdServe(values, io),
      mcp: () => cmdMcp(values, io),
    };
    const handler = handlers[command];
    if (!handler) throw usage(`Unknown command "${command}". Run "personakit --help".`);
    const result = (await handler()) as Result & { raw?: boolean };
    if (result.raw) io.stdout(result.text);
    else io.stdout(values.json ? stringifyCanonical(result.data) : `${result.text}\n`);
    return result.exitCode ?? ExitCode.ok;
  } catch (err) {
    const e = err instanceof PersonaKitError ? err : new PersonaKitError("unexpected", (err as Error).message ?? String(err));
    if (values.json) io.stdout(stringifyCanonical({ error: { code: e.code, exit_code: e.exitCode, message: e.message, details: e.details } }));
    io.stderr(`Error: ${e.message}\n`);
    return e.exitCode;
  }
}

export async function main(): Promise<void> {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  let rl: ReturnType<typeof createInterface> | undefined;
  const io: Io = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    readStdin: () => readFileSync(0, "utf8"),
    isInteractive: interactive,
    env: process.env,
    cwd: process.cwd(),
    streams: { stdin: process.stdin, stdout: process.stdout },
  };
  if (interactive) {
    io.prompt = async (q) => {
      rl ??= createInterface({ input: process.stdin, output: process.stderr });
      return rl.question(q);
    };
  }
  const code = await run(process.argv.slice(2), io);
  rl?.close();
  process.exitCode = code;
}
