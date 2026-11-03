// Browser-side PDF tools: these run fully on-device (no server needed, nothing is uploaded).
import { PDFDocument, degrees } from "pdf-lib";
import { pdfjs } from "../editor/engine";

export type Out = { blob: Blob; name: string; note?: string; text?: string };
const buf = (f: File) => f.arrayBuffer();
const load = async (f: File, pw?: string) => {
  try { return await PDFDocument.load(await buf(f), pw ? ({ password: pw } as any) : undefined); }
  catch (e: any) { throw new Error(/encrypt/i.test(e?.message || "") ? "This PDF is password protected. Enter the password and try again." : `Could not read "${f.name}". Is it a valid PDF?`); }
};
const stem = (n: string) => n.replace(/\.[^.]+$/, "");
const pdfBlob = (b: Uint8Array) => new Blob([b as BlobPart], { type: "application/pdf" });

export function parseRanges(s: string, n: number): number[] {
  const out: number[] = [];
  for (const part of s.split(",").map(x => x.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part); if (!m) throw new Error(`"${part}" is not a valid page range. Use e.g. 1-3,5`);
    const a = +m[1], b = m[2] ? +m[2] : a; if (a < 1 || b < a || b > n) throw new Error(`Page range ${part} is outside this document (1-${n}).`);
    for (let i = a; i <= b; i++) if (!out.includes(i - 1)) out.push(i - 1);
  }
  if (!out.length) throw new Error("Enter at least one page.");
  return out;
}

async function merge(files: File[]): Promise<Out> {
  const out = await PDFDocument.create();
  for (const f of files) { const d = await load(f); (await out.copyPages(d, d.getPageIndices())).forEach(p => out.addPage(p)); }
  return { blob: pdfBlob(await out.save()), name: "merged.pdf", note: `Merged ${files.length} files into ${out.getPageCount()} pages.` };
}
async function split(f: File, v: any): Promise<Out> {
  const src = await load(f, v.password), idx = parseRanges(v.pages || "", src.getPageCount()), out = await PDFDocument.create();
  (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
  return { blob: pdfBlob(await out.save()), name: `${stem(f.name)}-pages.pdf`, note: `Extracted ${idx.length} page(s).` };
}
async function rotate(f: File, v: any): Promise<Out> {
  const d = await load(f, v.password), n = d.getPageCount(), idx = /^all$/i.test((v.pages || "all").trim()) ? d.getPageIndices() : parseRanges(v.pages, n), deg = +v.degrees || 90;
  idx.forEach(i => { const p = d.getPage(i); p.setRotation(degrees((p.getRotation().angle + deg) % 360)); });
  return { blob: pdfBlob(await d.save()), name: `${stem(f.name)}-rotated.pdf`, note: `Rotated ${idx.length} page(s) by ${deg}°.` };
}
async function compress(f: File, v: any): Promise<Out> {
  const d = await load(f, v.password); d.setProducer("DocuMind AI"); const b = await d.save({ useObjectStreams: true }), better = b.byteLength < f.size;
  return { blob: pdfBlob(better ? b : new Uint8Array(await buf(f))), name: `${stem(f.name)}-compressed.pdf`, note: better ? `Lossless optimisation: ${(f.size / 1024).toFixed(0)} KB → ${(b.byteLength / 1024).toFixed(0)} KB.` : "This file is already well optimised, so it was kept as is." };
}
async function pdfText(f: File, v: any): Promise<Out> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await buf(f)), isEvalSupported: false, password: v.password || undefined } as any).promise, parts: string[] = [], scanned: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = (await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str + (x.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim();
    if (!t) scanned.push(i); parts.push(`--- Page ${i} ---\n${t || "(no text layer: this page looks scanned)"}`);
  }
  return { blob: new Blob([parts.join("\n\n")], { type: "text/plain" }), name: `${stem(f.name)}.txt`, text: parts.join("\n\n"), note: scanned.length ? `Pages without text (probably scanned): ${scanned.join(", ")}` : undefined };
}
async function toImages(f: File, v: any): Promise<Out> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await buf(f)), isEvalSupported: false, password: v.password || undefined } as any).promise;
  const fmt = v.fmt === "jpg" ? "jpg" : "png", dpi = Math.min(300, Math.max(72, +v.dpi || 150)), files: { name: string; data: Uint8Array }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale: dpi / 72 }), cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
    const ctx = cv.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvas: cv, canvasContext: ctx, viewport: vp } as any).promise;
    const b: Blob = await new Promise(r => cv.toBlob(x => r(x!), fmt === "jpg" ? "image/jpeg" : "image/png", 0.92));
    files.push({ name: `page-${String(i).padStart(2, "0")}.${fmt}`, data: new Uint8Array(await b.arrayBuffer()) });
  }
  return { blob: zip(files), name: `${stem(f.name)}-images.zip`, note: `${files.length} image(s) saved in a zip.` };
}
async function imagesToPdf(files: File[]): Promise<Out> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const bytes = new Uint8Array(await buf(f)), img = /png$/i.test(f.type) || /\.png$/i.test(f.name) ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    out.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return { blob: pdfBlob(await out.save()), name: "images.pdf", note: `${files.length} image(s) → ${files.length}-page PDF.` };
}

/* minimal store-only zip writer */
const CRC = (() => { const t: number[] = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30)); 
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    chunks.push(new Uint8Array(h.buffer), nm, f.data); central.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + f.data.length;
  }
  const csz = central.reduce((s, a) => s + a.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob([...chunks, ...central, new Uint8Array(e.buffer)] as BlobPart[], { type: "application/zip" });
}

export const LOCAL: Record<string, (files: File[], v: any) => Promise<Out>> = {
  merge: files => merge(files), split: (f, v) => split(f[0], v), rotate: (f, v) => rotate(f[0], v), compress: (f, v) => compress(f[0], v),
  text: (f, v) => pdfText(f[0], v), img: (f, v) => toImages(f[0], v), toimg: files => imagesToPdf(files),
};
