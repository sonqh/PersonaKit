// Compare the DOCX reader with mammoth on a file on your own computer. Development only.
// Usage: node scripts/compare-docx.ts FILE.docx
// Prints counts and the first difference. The difference shows a few words of your CV:
// do not paste this output into an issue, a log, or a pull request. Never commit a real CV to the repository.

import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import { readDocxText } from "../src/core/docx.ts";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Usage: node scripts/compare-docx.ts FILE.docx\n");
  process.exit(2);
}
const buf = readFileSync(file);
const words = (s: string): string[] => s.replace(/^- /gmu, "").split(/\s+/u).filter(Boolean);
const ours = words(readDocxText(buf));
const theirs = words((await mammoth.extractRawText({ buffer: buf })).value);
let first = -1;
for (let i = 0; i < Math.max(ours.length, theirs.length); i++) {
  if (ours[i] !== theirs[i]) { first = i; break; }
}
process.stdout.write(`PersonaKit words: ${ours.length}\nmammoth words: ${theirs.length}\n`);
if (first < 0) process.stdout.write("Same words in the same order.\n");
else process.stdout.write(`First difference at word ${first + 1}.\nPersonaKit: ${ours.slice(first, first + 8).join(" ")}\nmammoth:    ${theirs.slice(first, first + 8).join(" ")}\n`);
