// Local web server for the PersonaKit app. It binds 127.0.0.1 only and calls src/core for every read and write.
// REQ-WEB-001 REQ-WEB-002 REQ-WEB-003 REQ-WEB-004 REQ-WEB-009
// The token and the host checks protect against other web pages. They are a safeguard, not a security boundary.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ExitCode, PersonaKitError } from "../core/errors.ts";
import { initStore, openStore, type ActorLabel, type Store } from "../core/store.ts";
import { handleApi, type ApiContext } from "./routes.ts";

export const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "web");
export const BODY_LIMIT = 1024 * 1024;
export const CODE_TTL_MS = 2 * 60 * 1000;
export const TOKEN_HEADER = "x-personakit-token";

/** The fixed list of static files. The server never maps a URL to a file path. */
export const STATIC_FILES: Readonly<Record<string, { file: string; type: string }>> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/logic.js": { file: "logic.js", type: "text/javascript; charset=utf-8" },
  "/questions.json": { file: "questions.json", type: "application/json; charset=utf-8" },
};

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

const HTTP_STATUS: Record<string, number> = {
  usage: 400, notFound: 404, conflict: 409, invalid: 422, confirmationRequired: 403, unsafeStore: 422, unexpected: 500,
};

export type Opener = (url: string) => void;

/** Open a URL with the platform opener. An argument list and no shell. */
export const OPEN_URL = /^http:\/\/127\.0\.0\.1:\d+\/#code=[A-Za-z0-9_-]+$/;

export function platformOpener(url: string): void {
  // The URL comes from this server only. Check its form anyway: on Windows, "cmd /c start" parses
  // the command line again, so a URL with characters such as & or ^ could run another command.
  if (!OPEN_URL.test(url)) throw new PersonaKitError("unexpected", "The URL to open has an unexpected form.");
  // "start" takes its first quoted argument as the window title. The empty string fills that place.
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(cmd as string, args as string[], { stdio: "ignore", detached: true, shell: false });
  child.on("error", () => { /* the printed URL still works */ });
  child.unref();
}

export interface ServeOptions {
  storePath: string;
  cwd: string;
  port?: number;
  open?: boolean;
  opener?: Opener;
  now?: () => number;
}

export interface RunningServer {
  server: Server;
  port: number;
  url: string;
  token: string;
  storeRoot: string;
  warning?: string;
  close: () => Promise<void>;
}

export function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(text);
}

export function sendError(res: ServerResponse, status: number, code: string, message: string, details: Record<string, unknown> = {}): void {
  const exit = (ExitCode as Record<string, number>)[code] ?? ExitCode.unexpected;
  sendJson(res, status, { error: { code, exit_code: exit, message, details } });
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let tooLarge = false;
    let settled = false;
    const chunks: Buffer[] = [];
    const fail = (err: Error): void => { if (!settled) { settled = true; reject(err); } };
    req.on("data", (c: Buffer) => {
      size += c.length;
      // Above the limit: keep reading and drop the data, so the client gets the 413 answer.
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        if (size > 8 * limit) {
          // Settle first, then drop the connection.
          fail(Object.assign(new Error("too large"), { tooLarge: true }));
          req.destroy();
        }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (tooLarge) reject(Object.assign(new Error("too large"), { tooLarge: true }));
      else resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    // A client that goes away must not leave the promise open.
    req.on("aborted", () => fail(new Error("the client aborted the request")));
    req.on("close", () => fail(new Error("the connection closed before the body ended")));
    req.on("error", (err) => fail(err));
  });
}

function sameSecret(given: string | undefined, secret: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startServer(opts: ServeOptions): Promise<RunningServer> {
  const init = initStore(opts.storePath, { cwd: opts.cwd });
  const store: Store = openStore(init.root, { cwd: opts.cwd });
  const now = opts.now ?? Date.now;
  const token = randomBytes(32).toString("base64url");
  let oneTime: { code: string; expires: number } | undefined;
  const label: ActorLabel = { actor: "web" };
  let port = 0;

  const ctx: ApiContext = { store, label };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // REQ-WEB-003: Host first. A rebound page sends its own host name.
    const host = req.headers.host;
    if (!host) return sendError(res, 400, "usage", "The request has no Host header.");
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return sendError(res, 403, "forbidden", "The Host header is not allowed.");
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://${host}`) return sendError(res, 403, "forbidden", "The Origin header is not allowed.");
    if (req.method === "OPTIONS") return sendError(res, 405, "usage", "OPTIONS is not allowed.");
    const path = new URL(req.url ?? "/", `http://${host}`).pathname;

    if (path.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "POST") return sendError(res, 405, "usage", "Use GET or POST.");
      let body: unknown;
      if (req.method === "POST") {
        if (origin === undefined) return sendError(res, 403, "forbidden", "A POST request needs an Origin header.");
        const type = req.headers["content-type"] ?? "";
        if (!/^application\/json(\s*;|$)/i.test(type)) return sendError(res, 415, "usage", "Send JSON with the content type application/json.");
        let text: string;
        try {
          text = await readBody(req, BODY_LIMIT);
        } catch (err) {
          if ((err as { tooLarge?: boolean }).tooLarge) return sendError(res, 413, "invalid", "The request body is larger than 1 MiB.");
          throw err;
        }
        try { body = text === "" ? {} : JSON.parse(text); } catch { return sendError(res, 400, "usage", "The request body is not valid JSON."); }
      }
      // REQ-WEB-009: the one-time code from serve --open. It works once and expires after two minutes.
      if (path === "/api/session") {
        if (req.method !== "POST") return sendError(res, 405, "usage", "Use POST.");
        const code = (body as { code?: unknown })?.code;
        if (!oneTime || now() > oneTime.expires || !sameSecret(typeof code === "string" ? code : undefined, oneTime.code)) {
          return sendError(res, 401, "unauthorized", "The code is not valid. Start PersonaKit again.");
        }
        oneTime = undefined;
        return sendJson(res, 200, { token });
      }
      // REQ-WEB-002: the header is the only carrier of the token.
      const given = req.headers[TOKEN_HEADER];
      if (!sameSecret(Array.isArray(given) ? undefined : given, token)) {
        return sendError(res, 401, "unauthorized", "The session is not valid. Open the URL that PersonaKit printed.");
      }
      try {
        const out = await handleApi(ctx, req.method, path, body);
        if (!out) return sendError(res, 404, "notFound", "No such API path.");
        if (out.raw !== undefined) {
          res.writeHead(out.status ?? 200, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", ...(out.headers ?? {}) });
          res.end(out.raw);
          return;
        }
        return sendJson(res, out.status ?? 200, out.body);
      } catch (err) {
        if (err instanceof PersonaKitError) return sendError(res, HTTP_STATUS[err.code] ?? 500, err.code, err.message, err.details);
        // No request body and no record text in the answer or the terminal.
        return sendError(res, 500, "unexpected", "The server had an unexpected error.");
      }
    }

    if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "usage", "Use GET.");
    const entry = STATIC_FILES[path];
    if (!entry) return sendError(res, 404, "notFound", "Not found.");
    const content = readFileSync(join(WEB_DIR, entry.file));
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": entry.type });
    res.end(req.method === "HEAD" ? undefined : content);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) sendError(res, 500, "unexpected", "The server had an unexpected error.");
      else res.end();
    });
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") reject(new PersonaKitError("unexpected", `Port ${opts.port} is in use by another program. Choose another port with --port, or leave it out.`, { port: opts.port }));
      else reject(err);
    });
    // REQ-WEB-001: the loopback address only, never localhost or 0.0.0.0.
    server.listen(opts.port ?? 0, "127.0.0.1", () => resolveListen());
  });
  port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/#token=${token}`;
  if (opts.open) {
    oneTime = { code: randomBytes(16).toString("base64url"), expires: now() + CODE_TTL_MS };
    (opts.opener ?? platformOpener)(`http://127.0.0.1:${port}/#code=${oneTime.code}`);
  }
  const result: RunningServer = {
    server, port, url, token, storeRoot: store.root,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
  if (init.warning) result.warning = init.warning;
  return result;
}
