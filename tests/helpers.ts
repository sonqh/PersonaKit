// Test helpers. Every store lives in the OS temp folder, outside this repository.

import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { initStore, openStore, type Store } from "../src/core/store.ts";
import type { ProposeInput } from "../src/core/store.ts";

import { FIXTURES, REPO, tempDir } from "./paths.ts";

export { FIXTURES, REPO, tempDir };
export const BIN = join(REPO, "bin", "personakit.mjs");

export function tempStore(): { root: string; store: Store; cwd: string } {
  const cwd = tempDir();
  const root = join(cwd, "store");
  initStore(root, { cwd });
  return { root, store: openStore(root, { cwd }), cwd };
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  json: () => any;
}

function toResult(r: SpawnSyncReturns<string>): CliResult {
  return {
    code: r.status ?? -1,
    stdout: r.stdout,
    stderr: r.stderr,
    json: () => JSON.parse(r.stdout),
  };
}

export function cli(root: string, args: string[], opts: { input?: string; cwd?: string; env?: NodeJS.ProcessEnv } = {}): CliResult {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: opts.cwd ?? dirname(root),
    env: { ...process.env, PERSONAKIT_HOME: root, PERSONAKIT_ACTOR: "", ...opts.env },
    input: opts.input ?? "",
    encoding: "utf8",
  });
  return toResult(r);
}

export function cliAsync(root: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<CliResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: dirname(root), env: { ...process.env, PERSONAKIT_HOME: root, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr, json: () => JSON.parse(stdout) }));
  });
}

export function fixtureNames(): string[] {
  return readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export type FixtureLine = ProposeInput & { visibility: "private" | "ai" | "public" };

export function fixtureLines(name: string): FixtureLine[] {
  return readFileSync(join(FIXTURES, name, "proposals.jsonl"), "utf8")
    .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as FixtureLine);
}
