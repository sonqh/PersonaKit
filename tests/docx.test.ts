// Covers: REQ-ONB-008, REQ-ONB-009
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { documentText, readDocxText } from "../src/core/docx.ts";
import { PersonaKitError } from "../src/core/errors.ts";
import { readAll } from "../src/core/store.ts";
import { buildDocx, buildZip, documentXml, para } from "./docx-helpers.ts";
import { cli, tempDir, tempStore } from "./helpers.ts";

const text = (body: string): string => documentText(Buffer.from(documentXml(body), "utf8"));
const refused = (fn: () => unknown): boolean => {
  try { fn(); } catch (e) { return e instanceof PersonaKitError && e.code === "invalid"; }
  return false;
};

test("SCN-ONB-008-1 paragraphs become blocks with tabs, breaks, and decoded characters", () => {
  const body = `<w:p><w:r><w:t>Caf&#233; &amp; bar</w:t><w:tab/><w:t>2021</w:t></w:r></w:p>`
    + `<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>line two</w:t></w:r></w:p>` + para("Third paragraph");
  assert.equal(text(body), "Café & bar\t2021\n\nLine one\nline two\n\nThird paragraph\n");
  assert.equal(readDocxText(buildDocx(body)), "Café & bar\t2021\n\nLine one\nline two\n\nThird paragraph\n");
});

test("element names match exactly and in context", () => {
  // A tab stop definition is not a tab. A self-closing w:del in run properties opens no skip.
  const body = `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:rPr><w:del w:id="1"/></w:rPr><w:t>Kept</w:t></w:r></w:p>`
    + `<w:tbl><w:tr><w:tc>${para("In a table")}</w:tc></w:tr></w:tbl><w:p/>${para("After")}`;
  assert.equal(text(body), "Kept\n\nIn a table\n\nAfter\n");
});

test("text-box text appears once, from mc:Choice", () => {
  const box = `<w:txbxContent>${para("Skills: pottery")}</w:txbxContent>`;
  const body = `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>${box}</w:drawing></mc:Choice><mc:Fallback><w:pict>${box}</w:pict></mc:Fallback></mc:AlternateContent></w:r><w:r><w:t>Body</w:t></w:r></w:p>`;
  const out = text(body);
  assert.equal(out.split("Skills: pottery").length - 1, 1);
  assert.ok(out.includes("Body"));
});

test("tracked deletions and field codes stay out, field results stay in", () => {
  const body = `<w:p><w:del w:id="2"><w:r><w:delText>Old</w:delText><w:t>Old too</w:t></w:r></w:del>`
    + `<w:ins w:id="3"><w:r><w:t>New</w:t></w:r></w:ins>`
    + `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>HYPERLINK "x"</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t> link text</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
    + `<w:moveFrom w:id="4">${para("Moved away")}</w:moveFrom>`;
  assert.equal(text(body), "New link text\n");
});

test("list items, hyphens, comments, CDATA, and quoted '>' are handled", () => {
  const body = `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Trained staff</w:t></w:r></w:p>`
    + `<!-- <w:p><w:r><w:t>hidden</w:t></w:r></w:p> -->`
    + `<w:p><w:r w:rsidR="a>b"><w:t>Well</w:t><w:noBreakHyphen/><w:t>known</w:t><w:softHyphen/><w:sym w:font="Wingdings" w:char="F0FC"/><w:t><![CDATA[ <ok> ]]></w:t></w:r></w:p>`;
  assert.equal(text(body), "- Trained staff\n\nWell-known <ok>\n");
});

test("another prefix and the Strict namespace work", () => {
  const xml = documentXml(`<x:p><x:r><x:t>Strict text</x:t></x:r></x:p>`, "x", "http://purl.oclc.org/ooxml/wordprocessingml/main");
  assert.equal(documentText(Buffer.from(xml)), "Strict text\n");
});

test("SCN-ONB-008-2 a ZIP bomb is refused before it inflates past the limit", () => {
  const big = Buffer.alloc(5 * 1024 * 1024, 0x41);
  // An honest bomb: the declared sizes give a ratio above 100.
  assert.ok(refused(() => readDocxText(buildDocx("", { data: big }))));
  // A lying bomb: a small declared size, a large real stream. maxOutputLength stops the inflate.
  const stream = deflateRawSync(Buffer.alloc(3 * 1024 * 1024, 0x41));
  assert.ok(refused(() => readDocxText(buildDocx("", { rawCompressed: stream, centralUncomp: stream.length * 2 }))));
  // A declared size above 20 MiB.
  assert.ok(refused(() => readDocxText(buildDocx(para("x"), { centralUncomp: 21 * 1024 * 1024 }))));
});

test("SCN-ONB-008-3 broken or unsafe files are refused with fixed messages", () => {
  const ok = buildDocx(para("Fine"));
  const cases: [string, Buffer | (() => string)][] = [
    ["not a zip", Buffer.from("CANARY-FILE-TEXT plain text, not a zip at all")],
    ["no document.xml", buildZip([{ name: "word/other.xml", data: "<x/>" }])],
    ["encrypted", buildDocx(para("x"), { flags: 1 })],
    ["stored size mismatch", buildDocx(para("x"), { method: 0, centralComp: 5 })],
    ["duplicate name", buildZip([{ name: "word/document.xml", data: documentXml(para("a")) }, { name: "word/document.xml", data: documentXml(para("b")) }])],
    ["zip64", buildDocx(para("x"), { centralUncomp: 0xffffffff })],
    ["disk", buildZip([{ name: "word/document.xml", data: documentXml(para("a")) }], { disk: 1 })],
    ["local name mismatch", buildDocx(para("x"), { localName: "word/documenx.xml" })],
    ["crc", buildDocx(para("x"), { crc: 12345 })],
    ["truncated", ok.subarray(0, ok.length - 30)],
    ["doctype", buildDocx("", { data: `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e "CANARY-FILE-TEXT">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>` })],
    ["utf-16", buildDocx("", { data: Buffer.from([0xff, 0xfe, 0x3c, 0x00]) })],
    ["unknown entity", buildDocx(para("CANARY-FILE-TEXT &nbsp;"))],
    ["bad reference", buildDocx(para("&#xD800;"))],
    ["huge reference", buildDocx(para("&#x110000;"))],
    ["default namespace", buildDocx("", { data: `<document xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><body/></document>` })],
    ["rebound prefix", buildDocx(`<w:p xmlns:w="urn:other"><w:r><w:t>x</w:t></w:r></w:p>`)],
  ];
  for (const [label, input] of cases) {
    let message = "";
    try {
      readDocxText(input as Buffer);
      assert.fail(`${label} was not refused`);
    } catch (e) {
      assert.ok(e instanceof PersonaKitError && e.code === "invalid", `${label}: ${(e as Error).message}`);
      message = e.message;
    }
    assert.ok(!message.includes("CANARY"), `${label} quoted the file`);
  }
});

test("valid ZIP variants are accepted: data descriptor flag, different local extra, a comment with a fake end record", () => {
  assert.equal(readDocxText(buildDocx(para("A"), { flags: 0x0008 })), "A\n");
  assert.equal(readDocxText(buildDocx(para("B"), { localExtra: Buffer.from([1, 2, 3, 4, 5, 6]) })), "B\n");
  const fake = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(30)]);
  const z = buildZip([{ name: "word/document.xml", data: documentXml(para("C")) }], { comment: fake });
  assert.equal(readDocxText(z), "C\n");
  assert.equal(readDocxText(buildDocx(para("D"), { method: 0 })), "D\n");
});

test("SCN-ONB-009-1 a DOCX CV becomes private proposals with one label and no text in the output", () => {
  const { root, store } = tempStore();
  const body = para("Experience") + `<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Ran the night desk at a clinic.</w:t></w:r></w:p>`
    + `<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Trained four new staff.</w:t></w:r></w:p>`
    + `<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Kept the supply list.</w:t></w:r></w:p>`
    + para("Skills") + para("Speaks CANARYSTATEMENT Spanish.") + para("Education") + para("Nursing diploma, 2015.");
  const file = join(tempDir(), "cv.docx");
  writeFileSync(file, buildDocx(body));
  const r = cli(root, ["import", "docx", file, "--user-stated", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  const out = r.json();
  assert.equal(out.count, 5);
  assert.match(out.source, /^docx:[0-9a-f]{12}$/);
  assert.ok(!r.stdout.includes("CANARYSTATEMENT") && !r.stderr.includes("CANARYSTATEMENT"));
  const records = readAll(store).records;
  assert.equal(records.length, 5);
  for (const rec of records) {
    assert.equal(rec.state, "proposed");
    assert.equal(rec.visibility, "private");
    assert.deepEqual(rec.sources, [{ kind: "import", label: out.source }]);
    assert.equal(rec.provenance.user_stated, true);
  }
  assert.deepEqual(new Set(records.map((x) => x.kind)), new Set(["experience", "capability"]));
});

test("SCN-ONB-009-2 a refused or missing file proposes nothing and quotes nothing", () => {
  const { root, store } = tempStore();
  const dir = tempDir();
  const bomb = join(dir, "bomb.docx");
  writeFileSync(bomb, buildDocx("", { data: Buffer.alloc(5 * 1024 * 1024, 0x41) }));
  const plain = join(dir, "plain.docx");
  writeFileSync(plain, "CANARY-FILE-TEXT this is not a docx");
  for (const [file, code] of [[bomb, 6], [plain, 6], [join(dir, "missing.docx"), 5]] as const) {
    const r = cli(root, ["import", "docx", file, "--json"]);
    assert.equal(r.code, code, file);
    assert.ok(!r.stdout.includes("CANARY") && !r.stderr.includes("CANARY"));
  }
  assert.equal(readAll(store).records.length, 0);
});
