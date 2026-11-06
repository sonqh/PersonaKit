// Crash-safe file writes and per-record lock files.
// REQ-STO-003 REQ-STO-005

import {
  closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, readdirSync,
  renameSync, statSync, unlinkSync, writeSync,
} from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { PersonaKitError } from "./errors.ts";

/** Temporary files start with a dot and end with ".tmp". Readers only read ULID-named files. */
export const TEMP_PATTERN = /^\..+\.tmp$/;

function tempPathFor(target: string): string {
  return join(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
}

function writeAndSync(path: string, content: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function syncDir(dir: string): void {
  // Some platforms do not allow fsync on a directory. The rename is still atomic there.
  try {
    const fd = openSync(dir, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
  } catch { /* best effort */ }
}

/** Create a new file atomically. Fails with EEXIST and never overwrites an existing file. */
export function writeNewFileAtomic(target: string, content: string): void {
  const tmp = tempPathFor(target);
  writeAndSync(tmp, content);
  try {
    linkSync(tmp, target);
  } finally {
    unlinkSync(tmp);
  }
  syncDir(dirname(target));
}

/** Replace a file atomically: write a temporary file, then rename it over the target. */
export function replaceFileAtomic(target: string, content: string): void {
  const tmp = tempPathFor(target);
  writeAndSync(tmp, content);
  try {
    renameSync(tmp, target);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
  syncDir(dirname(target));
}

export interface LockInfo {
  pid: number;
  hostname: string;
  started_at: string;
  command: string;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export const STALE_LOCK_MS = 10 * 60 * 1000;

export function readLock(path: string): LockInfo | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LockInfo;
  } catch {
    return undefined;
  }
}

/** A lock is stale when its process is gone (same host) or it is older than STALE_LOCK_MS. */
export function isLockStale(path: string, now: number = Date.now()): boolean {
  const info = readLock(path);
  let age = 0;
  try { age = now - statSync(path).mtimeMs; } catch { return true; }
  if (!info) return age > 5000; // unreadable lock: allow a moment for the writer to finish.
  if (info.hostname === hostname() && !pidAlive(info.pid)) return true;
  return age > STALE_LOCK_MS;
}

function tryAcquire(path: string, command: string): boolean {
  const info: LockInfo = { pid: process.pid, hostname: hostname(), started_at: new Date().toISOString(), command };
  try {
    const fd = openSync(path, "wx", 0o600);
    try { writeSync(fd, JSON.stringify(info)); } finally { closeSync(fd); }
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

/**
 * Remove a stale lock without removing a live lock that replaced it.
 * Rename is atomic, so only one process gets the file, and rename keeps its content and mtime.
 * The process then checks the file it actually took. A live lock goes back.
 * Remaining window: if a third process takes the lock between the rename and the put-back,
 * the put-back fails and the live lock is lost. Both steps are microseconds apart.
 */
export function removeStaleLock(path: string): boolean {
  const grave = `${path}.stale.${process.pid}.${randomBytes(4).toString("hex")}`;
  try {
    renameSync(path, grave);
  } catch {
    return false; // another process removed or replaced it first
  }
  if (!isLockStale(grave)) {
    try { linkSync(grave, path); } catch { /* a newer lock exists; keep it */ }
    try { unlinkSync(grave); } catch { /* gone */ }
    return false;
  }
  try { unlinkSync(grave); } catch { /* gone */ }
  return true;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Lock several record IDs in sorted order (no deadlock between two processes), run fn, release.
 * Stale locks from a dead process on this host are removed automatically.
 */
export function withLocks<T>(lockDir: string, ids: string[], command: string, fn: () => T, timeoutMs = 10_000): T {
  const sorted = [...new Set(ids)].sort();
  const held: string[] = [];
  try {
    for (const id of sorted) {
      const path = join(lockDir, `${id}.lock`);
      const deadline = Date.now() + timeoutMs;
      let wait = 5;
      while (!tryAcquire(path, command)) {
        if (isLockStale(path)) {
          removeStaleLock(path);
          continue;
        }
        if (Date.now() > deadline) {
          throw new PersonaKitError("conflict", `Record ${id} is locked by another process. Try again. If no other PersonaKit command runs, run "personakit doctor --fix".`, { record_id: id, lock: readLock(path) });
        }
        sleep(wait);
        wait = Math.min(wait * 2, 100);
      }
      held.push(path);
    }
    return fn();
  } finally {
    for (const path of held.reverse()) {
      try { unlinkSync(path); } catch { /* removed by doctor */ }
    }
  }
}

export function listFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => pattern.test(f)).sort();
}
