// Covers: REQ-ONB-008
// Differential test: the hand-written reader must give the same words as mammoth's raw text,
// which is a development dependency only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";
import { readDocxText } from "../src/core/docx.ts";
import { buildDocx, para } from "./docx-helpers.ts";
import { REPO } from "./helpers.ts";

const words = (s: string): string => s.replace(/^- /gmu, "").replace(/\s+/gu, " ").trim();

const SAMPLES: Record<string, string> = {
  paragraphs: para("Summary") + para("Support specialist with eight years in health care.") + para("Experience"),
  runs: `<w:p><w:r><w:t xml:space="preserve">Split </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>across</w:t></w:r><w:r><w:t xml:space="preserve"> runs</w:t></w:r></w:p>`,
  entities: para("R&amp;D at Caf&#233; Nord, 2019&#8211;2021"),
  tabs: `<w:p><w:r><w:t>Teacher</w:t><w:tab/><w:t>2015</w:t></w:r></w:p>`,
  table: `<w:tbl><w:tr><w:tc>${para("Cell one")}</w:tc><w:tc>${para("Cell two")}</w:tc></w:tr></w:tbl>`,
  hyperlink: `<w:p><w:hyperlink w:anchor="x"><w:r><w:t>Portfolio site</w:t></w:r></w:hyperlink></w:p>`,
  insertion: `<w:p><w:ins w:id="1"><w:r><w:t>Inserted text</w:t></w:r></w:ins></w:p>`,
  deletion: `<w:p><w:del w:id="2"><w:r><w:delText>Removed</w:delText></w:r></w:del><w:r><w:t>Kept</w:t></w:r></w:p>`,
  smartTag: `<w:p><w:smartTag w:uri="x" w:element="place"><w:r><w:t>Lisbon</w:t></w:r></w:smartTag></w:p>`,
};

for (const [name, body] of Object.entries(SAMPLES)) {
  test(`the reader matches mammoth raw text: ${name}`, async () => {
    const docx = buildDocx(body);
    const ours = readDocxText(docx);
    const theirs = (await mammoth.extractRawText({ buffer: docx })).value;
    assert.equal(words(ours), words(theirs));
  });
}

test("no runtime code imports mammoth", () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(join(REPO, "src"));
  walk(join(REPO, "bin"));
  for (const f of files) assert.ok(!/mammoth/u.test(readFileSync(f, "utf8")), `${f} refers to mammoth`);
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined, "PersonaKit has no runtime dependencies");
});
