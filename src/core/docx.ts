// REQ-ONB-008
// DOCX body text reader with Node built-ins only. A DOCX file is untrusted input:
// every size is bounded, every offset is checked, and errors use fixed messages that never quote the file.

import { crc32, inflateRawSync } from "node:zlib";
import { PersonaKitError } from "./errors.ts";

export const DOCX_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  entries: 1000,
  documentBytes: 20 * 1024 * 1024,
  ratio: 100,
} as const;

const TARGET = Buffer.from("word/document.xml", "utf8");
const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const W_URIS = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const MC_URI = "http://schemas.openxmlformats.org/markup-compatibility/2006";

function refuse(message: string): never {
  throw new PersonaKitError("invalid", `The DOCX file cannot be read: ${message}`);
}

// ---------- ZIP ----------

/** Find the end-of-central-directory record. A signature counts only when its comment reaches the end of the file. */
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD && i + 22 + buf.readUInt16LE(i + 20) === buf.length) return i;
  }
  refuse("it is not a ZIP archive.");
}

/** Return the uncompressed bytes of word/document.xml. */
export function readDocumentXml(buf: Buffer): Buffer {
  if (buf.length > DOCX_LIMITS.fileBytes) refuse("the file is larger than 10 MiB.");
  if (buf.length < 22) refuse("it is not a ZIP archive.");
  const e = findEocd(buf);
  const disk = buf.readUInt16LE(e + 4);
  const cdDisk = buf.readUInt16LE(e + 6);
  const entriesOnDisk = buf.readUInt16LE(e + 8);
  const entries = buf.readUInt16LE(e + 10);
  const cdSize = buf.readUInt32LE(e + 12);
  const cdOffset = buf.readUInt32LE(e + 16);
  if (disk !== 0 || cdDisk !== 0 || entriesOnDisk !== entries) refuse("multi-disk archives are not supported.");
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) refuse("ZIP64 archives are not supported.");
  if (entries > DOCX_LIMITS.entries) refuse("the archive has more than 1000 entries.");
  const cdEnd = cdOffset + cdSize;
  if (cdEnd > e) refuse("the central directory is out of range.");

  let found: { flags: number; method: number; crc: number; comp: number; uncomp: number; local: number } | undefined;
  let p = cdOffset;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > cdEnd || buf.readUInt32LE(p) !== SIG_CENTRAL) refuse("the central directory is damaged.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const comp = buf.readUInt32LE(p + 20);
    const uncomp = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const next = p + 46 + nameLen + extraLen + commentLen;
    if (next > cdEnd) refuse("the central directory is damaged.");
    if (comp === 0xffffffff || uncomp === 0xffffffff || local === 0xffffffff) refuse("ZIP64 archives are not supported.");
    if (buf.subarray(p + 46, p + 46 + nameLen).equals(TARGET)) {
      if (found) refuse("the archive has two word/document.xml entries.");
      found = { flags, method, crc, comp, uncomp, local };
    }
    p = next;
  }
  if (p !== cdEnd) refuse("the central directory is damaged.");
  if (!found) refuse("it has no word/document.xml. Is it a Word document?");

  const { flags, method, crc, comp, uncomp, local } = found;
  if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0 || method === 99) refuse("the file is encrypted.");
  if (method !== 0 && method !== 8) refuse("the compression method is not supported.");
  // Size checks in a fixed order, before any inflate.
  if (uncomp > DOCX_LIMITS.documentBytes) refuse("the document text is larger than 20 MiB.");
  if (comp === 0 || uncomp === 0) refuse("the document is empty.");
  if (uncomp > DOCX_LIMITS.ratio * comp) refuse("the compression ratio is too high.");
  if (local + 30 > cdOffset || buf.readUInt32LE(local) !== SIG_LOCAL) refuse("a local header is damaged.");
  const lNameLen = buf.readUInt16LE(local + 26);
  const lExtraLen = buf.readUInt16LE(local + 28);
  if (!buf.subarray(local + 30, local + 30 + lNameLen).equals(TARGET)) refuse("a local header is damaged.");
  // The data starts after the LOCAL name and extra fields, which can differ from the central ones.
  const dataStart = local + 30 + lNameLen + lExtraLen;
  if (dataStart + comp > cdOffset) refuse("the entry data is out of range.");
  const data = buf.subarray(dataStart, dataStart + comp);

  let out: Buffer;
  if (method === 0) {
    if (comp !== uncomp) refuse("the entry sizes do not match.");
    out = data;
  } else {
    try {
      // maxOutputLength bounds memory: a stream that inflates past the declared size throws.
      out = inflateRawSync(data, { maxOutputLength: uncomp });
    } catch {
      refuse("the compressed data is damaged or larger than declared.");
    }
  }
  if (out.length !== uncomp) refuse("the entry sizes do not match.");
  if (crc32(out) !== crc) refuse("the checksum does not match.");
  return out;
}

// ---------- XML ----------

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Decode the five XML entities and numeric references. Anything else refuses the file. */
function decodeText(raw: string): string {
  if (!raw.includes("&")) return raw;
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const amp = raw.indexOf("&", i);
    if (amp < 0) {
      out += raw.slice(i);
      break;
    }
    out += raw.slice(i, amp);
    const semi = raw.indexOf(";", amp + 1);
    if (semi < 0 || semi - amp > 10) refuse("it has a malformed character reference.");
    const name = raw.slice(amp + 1, semi);
    if (ENTITIES[name] !== undefined) {
      out += ENTITIES[name];
    } else {
      const m = /^#(?:([0-9]{1,7})|x([0-9A-Fa-f]{1,6}))$/u.exec(name);
      if (!m) refuse("it has an unknown entity.");
      const code = m[1] !== undefined ? Number(m[1]) : parseInt(m[2]!, 16);
      if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff || code === 0xfffe || code === 0xffff) {
        refuse("it has an invalid character reference.");
      }
      out += code < 0x20 && code !== 9 ? " " : String.fromCodePoint(code);
    }
    i = semi + 1;
  }
  return out;
}

interface Frame {
  name: string;
  skip: boolean;
}

/** Turn word/document.xml into text: each paragraph is a block, and blocks are separated by a blank line. */
export function documentText(xmlBytes: Buffer): string {
  if ((xmlBytes[0] === 0xff && xmlBytes[1] === 0xfe) || (xmlBytes[0] === 0xfe && xmlBytes[1] === 0xff)) refuse("UTF-16 text is not supported.");
  let s: string;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes);
  } catch {
    refuse("the text is not valid UTF-8.");
  }
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const decl = /^<\?xml[^>]*?encoding\s*=\s*["']([^"']+)["']/u.exec(s);
  if (decl && decl[1]!.toLowerCase().replace(/[-_]/gu, "") !== "utf8") refuse("only UTF-8 text is supported.");
  if (s.includes("<!DOCTYPE") || s.includes("<!ENTITY")) refuse("it has a DOCTYPE.");

  let w = "";
  let mc = "";
  const stack: Frame[] = [];
  const blocks: string[] = [];
  const paragraphs: { text: string; numbered: boolean }[] = [];
  const q = (local: string): string => `${w}:${local}`;
  const top = (): Frame | undefined => stack[stack.length - 1];
  const parent = (): Frame | undefined => stack[stack.length - 2];
  const skipping = (): boolean => top()?.skip === true;
  const write = (text: string): void => {
    const p = paragraphs[paragraphs.length - 1];
    if (p && !skipping()) p.text += text;
  };
  const endParagraph = (): void => {
    const p = paragraphs.pop()!;
    const text = p.text.trim();
    if (text) blocks.push(p.numbered ? `- ${text}` : text);
  };

  let i = 0;
  let root = true;
  while (i < s.length) {
    if (s.startsWith("<!--", i)) {
      const j = s.indexOf("-->", i + 4);
      if (j < 0) refuse("the XML is damaged.");
      i = j + 3;
      continue;
    }
    if (s.startsWith("<?", i)) {
      const j = s.indexOf("?>", i + 2);
      if (j < 0) refuse("the XML is damaged.");
      i = j + 2;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      const j = s.indexOf("]]>", i + 9);
      if (j < 0) refuse("the XML is damaged.");
      if (top()?.name === q("t")) write(s.slice(i + 9, j));
      i = j + 3;
      continue;
    }
    if (s[i] === "<") {
      // Find the end of the tag. A quoted attribute value can hold ">".
      let k = i + 1;
      let quote = "";
      for (; k < s.length; k++) {
        const c = s[k]!;
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      if (k >= s.length) refuse("the XML is damaged.");
      const body = s.slice(i + 1, k);
      i = k + 1;
      const closing = body.startsWith("/");
      const selfClosing = !closing && body.endsWith("/");
      const name = /^\/?([^\s/>]+)/u.exec(body)?.[1];
      if (!name) refuse("the XML is damaged.");

      if (root && !closing) {
        root = false;
        for (const m of body.matchAll(/xmlns(?::([^\s=]+))?\s*=\s*["']([^"']*)["']/gu)) {
          const prefix = m[1];
          const uri = m[2]!;
          if (W_URIS.has(uri)) {
            if (prefix === undefined) refuse("the Word namespace has no prefix.");
            w = prefix;
          } else if (uri === MC_URI && prefix !== undefined) mc = prefix;
        }
        if (!w) refuse("it is not a Word document.");
      } else if (!closing && body.includes(`xmlns:${w}=`)) {
        refuse("the Word namespace is bound again.");
      }

      if (closing) {
        const f = stack.pop();
        if (!f || f.name !== name) refuse("the XML is damaged.");
        if (name === q("p")) endParagraph();
        continue;
      }
      // Elements that write text or mark a paragraph. Context comes from the parent element.
      const inRun = top()?.name === q("r");
      if (name === q("tab") && inRun) write("\t");
      else if ((name === q("br") || name === q("cr")) && inRun) write("\n");
      else if (name === q("noBreakHyphen") && inRun) write("-");
      else if (name === q("numPr") && top()?.name === q("pPr") && parent()?.name === q("p")) {
        const p = paragraphs[paragraphs.length - 1];
        if (p) p.numbered = true;
      }
      if (selfClosing) {
        if (name === q("p") && !skipping()) blocks.push(""); // an empty paragraph
        continue; // a self-closing w:del or w:ins opens no skip
      }
      const skip = skipping() || name === q("del") || name === q("moveFrom") || (mc !== "" && name === `${mc}:Fallback`);
      stack.push({ name, skip });
      if (name === q("p")) paragraphs.push({ text: "", numbered: false });
      continue;
    }
    // Text node.
    const j = s.indexOf("<", i);
    const end = j < 0 ? s.length : j;
    if (top()?.name === q("t") && parent()?.name === q("r")) write(decodeText(s.slice(i, end)));
    i = end;
  }
  if (stack.length) refuse("the XML is damaged.");
  return blocks.filter((b) => b !== "").join("\n\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, " ") + "\n";
}

/** Read the body text of a DOCX file. */
export function readDocxText(buf: Buffer): string {
  return documentText(readDocumentXml(buf));
}
