// Helpers for MCP tests. Every store lives in the OS temp folder, outside this repository.
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { BIN } from "./helpers.ts";

export const PV = "io.modelcontextprotocol/protocolVersion";
export const CAPS = "io.modelcontextprotocol/clientCapabilities";
export const CLIENT = "io.modelcontextprotocol/clientInfo";

/** Modern request metadata. Pass null as the name to leave clientInfo out. */
export function meta(name: string | null = "test-client", version = "2026-07-28"): Record<string, unknown> {
  const m: Record<string, unknown> = { [PV]: version, [CAPS]: {} };
  if (name !== null) m[CLIENT] = { name, version: "1.0.0" };
  return m;
}

export function req(id: number | string, method: string, params: Record<string, unknown> = {}): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

export function call(id: number, name: string, args: Record<string, unknown>, client: string | null = "test-client"): string {
  return req(id, "tools/call", { name, arguments: args, _meta: meta(client) });
}

export interface Session {
  code: number;
  stdout: string;
  stderr: string;
  messages: any[];
  byId: (id: number | string) => any;
}

/** Start `personakit mcp`, write the input, close stdin, and wait for the exit. */
export function session(root: string, input: string | Buffer | (string | Buffer)[], env: NodeJS.ProcessEnv = {}): Promise<Session> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [BIN, "mcp"], { cwd: dirname(root), env: { ...process.env, PERSONAKIT_HOME: root, PERSONAKIT_ACTOR: "", ...env } });
    const out: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const messages = stdout.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l));
      resolvePromise({ code: code ?? -1, stdout, stderr, messages, byId: (id) => messages.find((m) => m.id === id) });
    });
    const parts = Array.isArray(input) ? input : [input];
    for (const p of parts) child.stdin.write(typeof p === "string" && !p.endsWith("\n") ? `${p}\n` : p);
    child.stdin.end();
  });
}
