// Build DOCX files in tests. No binary fixtures in the repository: every file is synthetic.

import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer | string;
  method?: 0 | 8;
  flags?: number;
  /** Overrides for hostile files. */
  centralComp?: number;
  centralUncomp?: number;
  crc?: number;
  localName?: string;
  localExtra?: Buffer;
  rawCompressed?: Buffer;
}

export interface ZipOptions {
  comment?: Buffer;
  disk?: number;
  entriesField?: number;
}

export function buildZip(entries: ZipEntry[], opts: ZipOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const method = e.method ?? 8;
    const comp = e.rawCompressed ?? (method === 8 ? deflateRawSync(data) : data);
    const crc = e.crc ?? crc32(data);
    const name = Buffer.from(e.name, "utf8");
    const localName = Buffer.from(e.localName ?? e.name, "utf8");
    const extra = e.localExtra ?? Buffer.alloc(0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(e.flags ?? 0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(localName.length, 26);
    lh.writeUInt16LE(extra.length, 28);
    const local = Buffer.concat([lh, localName, extra, comp]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(e.flags ?? 0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.centralComp ?? comp.length, 20);
    ch.writeUInt32LE(e.centralUncomp ?? data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const comment = opts.comment ?? Buffer.alloc(0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(opts.disk ?? 0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(opts.entriesField ?? entries.length, 8);
  eocd.writeUInt16LE(opts.entriesField ?? entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...locals, cd, eocd, comment]);
}

export const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";

export function documentXml(body: string, prefix = "w", ns = W_NS): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${prefix}:document xmlns:${prefix}="${ns}" xmlns:mc="${MC_NS}"><${prefix}:body>${body}</${prefix}:body></${prefix}:document>`;
}

/** A paragraph with one run of text. */
export const para = (text: string): string => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** A complete minimal DOCX that Word and mammoth can open. */
export function buildDocx(body: string, doc?: Partial<ZipEntry>): Buffer {
  return buildZip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: RELS },
    { name: "word/document.xml", data: documentXml(body), ...doc },
  ]);
}
