// personakit CLI. A thin wrapper around src/core. Agents pass --json and read JSON from stdout.
// REQ-CLI-001 REQ-CLI-002 REQ-CLI-003 REQ-VIS-001

import { parseArgs, type ParseArgsConfig } from "node:util";
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringifyCanonical } from "../core/canonical.ts";
import { ExitCode, PersonaKitError } from "../core/errors.ts";
import { defaultStorePath } from "../core/location.ts";
import { agentView, compileBriefJson, compileBriefMarkdown, type BriefLevel } from "../core/brief.ts";
import {
  checkProposal, doctor, getRecord, initStore, openStore, ownerAction, propose, readAll, setVisibility, update,
  type ActorLabel, type OwnerAction, type ProposeInput, type Store, type UpdatePatch,
} from "../core/store.ts";
import {
  ACTORS, RECORD_KINDS, RECORD_STATES, SOURCE_KINDS, VISIBILITIES,
  type Actor, type Facets, type PersonaRecord, type RecordKind, type Source, type Visibility,
} from "../core/schema.ts";

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  readStdin: () => string;
  isInteractive: boolean;
  env: NodeJS.ProcessEnv;
  cwd: string;
  prompt?: (question: string) => Promise<string>;
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
} as const satisfies ParseArgsConfig["options"];

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

const HELP = `personakit: keep one sourced record of who you are.

Usage: personakit <command> [options]

Agent commands (never print private records):
  brief [--level short|full] [--json] [--out FILE]   Compile the AI brief
  propose --kind K --statement TEXT [options]        Propose one record
  propose --from FILE|-                              Propose records from JSON Lines
  update ID --revision N [fields]                    Change a proposal, or propose a change to an accepted record
  list [--state S] [--kind K]                        List records
  show ID                                            Show one record

Owner commands (ask for confirmation):
  init                                               Create the store
  review                                             Go through pending proposals one by one
  accept ID... [--visibility V] [--revision N]       Accept proposals
  reject ID... [--revision N]                        Reject proposals
  retire ID...                                       Retire accepted records
  visibility ID LEVEL                                Change visibility: private, ai, or public
  doctor [--fix]                                     Check the store

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
  if (!v.statement) throw usage("--statement is required.");
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
  lines.push("Next: propose a record, or ask an agent to propose one.");
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
  // All or nothing: check every proposal before the first write.
  const ids = new Set(readAll(store).records.map((r) => r.id));
  const problems = inputs.flatMap((input, i) => checkProposal(store, input, ids).map((p) => (inputs.length > 1 ? `line ${i + 1}: ${p}` : p)));
  if (problems.length) {
    throw new PersonaKitError("invalid", `Nothing was proposed. ${problems.join("; ")}.`, { problems });
  }
  const results = inputs.map((input) => {
    const { record, duplicates } = propose(store, input, label);
    // Echo no statement in any mode: no CLI output path prints the text of a private record.
    // Report only duplicates the caller may see.
    return { id: record.id, state: record.state, revision: record.revision, visibility: record.visibility, possible_duplicates: duplicates.visible, previously_rejected: duplicates.rejected.length > 0 };
  });
  const text = results.map((r, i) => `Proposed ${r.id} (${inputs[i]!.kind}, rev ${r.revision}, ${r.visibility}).${r.possible_duplicates.length ? `\n  Possible duplicate of ${r.possible_duplicates.join(", ")}` : ""}${r.previously_rejected ? "\n  The owner rejected the same statement before." : ""}`).join("\n");
  return { data: results.length === 1 ? results[0] : { proposed: results }, text: `${text}\nThe owner reviews proposals with "personakit review".` };
}

async function cmdUpdate(v: Values, io: Io, args: string[]): Promise<Result> {
  const id = args[0];
  if (!id) throw usage("update needs a record ID.");
  const store = storeFor(v, io);
  const patch: UpdatePatch = {};
  if (v.statement) patch.statement = v.statement;
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
  const { records, problems } = readAll(store);
  const views = records.filter((r) => (!state || r.state === state) && (!kind || r.kind === kind)).map(agentView);
  const data: Record<string, unknown> = { records: views };
  if (problems.length) data.problems = problems.length;
  const text = views.length ? views.map(describeView).join("\n") : "No records match.";
  return { data, text: problems.length ? `${text}\n${problems.length} record files have problems. Run "personakit doctor".` : text };
}

async function cmdShow(v: Values, io: Io, args: string[]): Promise<Result> {
  const id = args[0];
  if (!id) throw usage("show needs a record ID.");
  const view = agentView(getRecord(storeFor(v, io), id));
  return { data: view, text: describeView(view) };
}

async function cmdBrief(v: Values, io: Io): Promise<Result> {
  const store = storeFor(v, io);
  const level = (pickEnum("level", ["short", "full"] as const, v.level) ?? "full") as BriefLevel;
  const { records } = readAll(store);
  const out = v.json ? stringifyCanonical(compileBriefJson(records, level)) : compileBriefMarkdown(records, level);
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
  if (!v.yes && io.isInteractive) io.stderr(records.map(describe).join("\n") + "\n");
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
