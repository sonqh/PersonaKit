// Store location rules. Personal data lives outside the PersonaKit repository and outside
// REQ-STO-001
// the project an agent works in.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";

export const STORE_ENV = "PERSONAKIT_HOME";

export function defaultStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[STORE_ENV];
  if (fromEnv && fromEnv.trim() !== "") return resolve(fromEnv);
  return join(homedir(), ".personakit");
}

/** Resolve symbolic links of the longest existing ancestor, so a link cannot hide the real location. */
export function realPathLoose(path: string): string {
  let current = resolve(path);
  const rest: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    rest.unshift(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    current = parent;
  }
  let base = current;
  try { base = realpathSync(current); } catch { /* keep resolved path */ }
  return rest.length ? join(base, ...rest) : base;
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Nearest ancestor directory (start included) that holds a .git entry. */
export function findGitRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function isPersonaKitRepo(root: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name?: string };
    return pkg.name === "personakit";
  } catch {
    return false;
  }
}

export interface LocationCheck {
  store: string;
  /** Set when the store must not be used. */
  refusal?: string;
  /** Set when the store can be used but the owner should look at its location. */
  warning?: string;
}

/**
 * The store may be its own git repository. It must not sit inside the PersonaKit repository,
 * or inside the repository of the current working directory (the project an agent works in).
 * Inside any other repository (for example a dotfiles home) the CLI warns.
 */
export function checkStoreLocation(storePath: string, cwd: string = process.cwd()): LocationCheck {
  const store = realPathLoose(storePath);
  const enclosing = findGitRoot(dirname(store));
  if (!enclosing) return { store };
  const realCwd = realPathLoose(cwd);
  if (isPersonaKitRepo(enclosing)) {
    return { store, refusal: `The store ${store} is inside the PersonaKit repository ${enclosing}. Personal data must stay outside the public repository. Set ${STORE_ENV} to a path outside it.` };
  }
  if (isInside(realCwd, enclosing)) {
    return { store, refusal: `The store ${store} is inside the git repository ${enclosing} of the current directory. Personal data could be committed to that project. Set ${STORE_ENV} to a path outside it.` };
  }
  return { store, warning: `The store ${store} is inside the git repository ${enclosing}. Make sure that repository is private.` };
}
