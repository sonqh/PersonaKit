// Helpers for the web server tests. Every store lives in the OS temp folder.
import { request } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname } from "node:path";
import { startServer, type RunningServer, type ServeOptions } from "../src/server/server.ts";
import { BIN, tempStore } from "./helpers.ts";

export interface Reply { status: number; headers: Record<string, string | string[] | undefined>; text: string; json: () => any }

export interface ReqOptions {
  method?: string;
  path: string;
  host?: string | null;
  origin?: string | null;
  token?: string | null;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
}

/** One HTTP request. host null sends no Host header. origin undefined sends the matching origin on POST. */
export function call(server: { port: number; token?: string }, o: ReqOptions): Promise<Reply> {
  const method = o.method ?? (o.body !== undefined || o.rawBody !== undefined ? "POST" : "GET");
  const host = o.host === undefined ? `127.0.0.1:${server.port}` : o.host;
  const headers: Record<string, string> = {};
  if (host !== null) headers.Host = host;
  const origin = o.origin === undefined ? (method === "POST" ? `http://${host}` : null) : o.origin;
  if (origin !== null) headers.Origin = origin;
  const token = o.token === undefined ? server.token : o.token;
  if (token) headers["X-PersonaKit-Token"] = token;
  const payload = o.rawBody ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined);
  if (payload !== undefined) headers["Content-Type"] = o.contentType ?? "application/json";
  return new Promise((resolveReply, reject) => {
    const req = request({ host: "127.0.0.1", port: server.port, method, path: o.path, headers, setHost: false }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (text += d));
      res.on("end", () => resolveReply({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) }));
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

export async function withServer<T>(fn: (s: RunningServer & { root: string }) => Promise<T>, opts: Partial<ServeOptions> = {}): Promise<T> {
  const { root, cwd } = tempStore();
  const s = await startServer({ storePath: root, cwd, ...opts });
  try {
    return await fn(Object.assign(s, { root }));
  } finally {
    await s.close();
  }
}

export interface ServeProcess { child: ChildProcess; url: string; port: number; token: string; out: () => string; err: () => string; stop: () => Promise<number | null> }

/** Run "personakit serve" as a child process and wait for the URL. */
export function spawnServe(root: string, args: string[] = []): Promise<ServeProcess> {
  const child = spawn(process.execPath, [BIN, "serve", ...args], { cwd: dirname(root), env: { ...process.env, PERSONAKIT_HOME: root } });
  let out = "";
  let err = "";
  child.stdout!.on("data", (d) => (out += d));
  child.stderr!.on("data", (d) => (err += d));
  const exited = new Promise<number | null>((r) => child.on("close", (code) => r(code)));
  return new Promise((resolveServe, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve did not start: ${out} ${err}`)), 10_000);
    const check = (): void => {
      const m = /http:\/\/127\.0\.0\.1:(\d+)\/#token=([A-Za-z0-9_-]+)/.exec(out);
      if (!m) return;
      clearTimeout(timer);
      resolveServe({
        child, url: m[0], port: Number(m[1]), token: m[2]!, out: () => out, err: () => err,
        stop: async () => { child.kill("SIGTERM"); return exited; },
      });
    };
    child.stdout!.on("data", check);
    void exited.then((code) => { clearTimeout(timer); reject(new Error(`serve exited with ${code}: ${out} ${err}`)); });
  });
}
