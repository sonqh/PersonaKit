// Privacy gate. Exit 1 when:
// REQ-STO-002
// - a fixture folder has no SYNTHETIC.md, a fixture line lacks the synthetic marker,
//   or another fixture file does not start with a "# Synthetic" heading;
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
const SYNTHETIC_TEXT_HEADING = "# Synthetic";
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
    // REQ-CV-012: a text fixture, such as a job text, starts with the synthetic heading.
    for (const file of readdirSync(dir).filter((f) => !f.endsWith(".jsonl") && f !== "SYNTHETIC.md")) {
      const first = readFileSync(join(dir, file), "utf8").replace(/^\uFEFF/u, "").split(/\r?\n/u, 1)[0];
      if (!first?.startsWith(SYNTHETIC_TEXT_HEADING)) errors.push(`fixtures/${entry.name}/${file}: the first line is not "${SYNTHETIC_TEXT_HEADING} ...".`);
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
