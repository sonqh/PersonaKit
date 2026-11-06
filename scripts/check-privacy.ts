// Privacy gate. Exit 1 when:
// REQ-STO-002
// - a fixture folder has no SYNTHETIC.md, or a fixture line lacks the synthetic marker;
// - the configured store path (PERSONAKIT_HOME) is inside this repository;
// - a PersonaKit store (store.json with the store schema) exists inside this repository.
// Run: node scripts/check-privacy.ts

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isInside, realPathLoose, STORE_ENV } from "../src/core/location.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors: string[] = [];

const fixtures = join(repo, "fixtures");
if (existsSync(fixtures)) {
  for (const entry of readdirSync(fixtures, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(fixtures, entry.name);
    if (!existsSync(join(dir, "SYNTHETIC.md"))) errors.push(`fixtures/${entry.name}: SYNTHETIC.md is missing.`);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
      readFileSync(join(dir, file), "utf8").split("\n").forEach((line, i) => {
        if (line.trim() === "") return;
        let marker: unknown;
        try { marker = JSON.parse(line)?.extensions?.["personakit.fixture"]?.synthetic; } catch { /* reported below */ }
        if (marker !== true) errors.push(`fixtures/${entry.name}/${file}:${i + 1}: the line has no synthetic marker.`);
      });
    }
  }
}

const configured = process.env[STORE_ENV];
if (configured && isInside(realPathLoose(configured), realPathLoose(repo))) {
  errors.push(`${STORE_ENV} points inside the repository (${configured}). Personal data must stay outside it.`);
}

const SKIP = new Set([".git", "node_modules"]);
function scan(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name === "store.json") {
      try {
        if (JSON.parse(readFileSync(path, "utf8")).schema === "personakit.store/v0") {
          errors.push(`${relative(repo, path)}: a PersonaKit store is inside the repository.`);
        }
      } catch { /* not a store file */ }
    }
  }
}
scan(repo);

if (errors.length) {
  process.stderr.write(`Privacy check failed:\n${errors.map((e) => `- ${e}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Privacy check passed.\n");
