// Paths shared by tests. Every temporary folder is in the OS temp folder, outside this repository.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES = join(REPO, "fixtures");

export function tempDir(prefix = "pk-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
