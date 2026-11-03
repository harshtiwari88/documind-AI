import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, degrees, LineCapStyle, BlendMode, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import type { Analysis, Block, DocOpts, FontKey, ImgData, Line, PageState, TextAnn } from "./types";
import { multiplyAffine as mul, invertAffine as inv } from "./affine";
import type { Affine6 as M6 } from "./affine";

// pdf.js v4 needs an explicit worker, otherwise every PDF fails to open.
if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjs };
export interface SrcDoc { id: number; bytes: Uint8Array; pj: any }
let docUid = 1;

/* ------------------------------------------------------------------ loading */
export async function loadPdf(bytes: Uint8Array): Promise<SrcDoc> {
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) throw new Error("File content is not a valid PDF.");
  try { const pj = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise; return { id: docUid++, bytes, pj }; }
  catch (e: any) { console.error("pdf.js load failed:", e); throw new Error(e?.name === "PasswordException" ? "This PDF is password-protected. Unlock it first; password support is not available yet." : e?.name === "InvalidPDFException" ? "This PDF is corrupted or unreadable." : `Could not open this PDF (${e?.message || e?.name || "unknown error"}).`); }
}
export async function readSizes(doc: SrcDoc) {
  const out: { w: number; h: number }[] = [];
  for (let i = 0; i < doc.pj.numPages; i++) { const v = (await doc.pj.getPage(i + 1)).getViewport({ scale: 1 }); out.push({ w: v.width, h: v.height }); }
  return out;
}

/* ------------------------------------------------------------------ text analysis */
const famToFont = (fam: string, name: string): FontKey => {
  const n = (name || "").toLowerCase();
  if (/courier|mono|consolas|typewriter/.test(n) || fam === "monospace") return "courier";
  if (/times|georgia|garamond|minion|palatino|cambria|serif/.test(n) && !/sans/.test(n)) return "times";
  if (fam === "serif" && !/arial|helvet|sans|calibri|verdana|tahoma/.test(n)) return "times";
  return "helv";
};
const cache = new Map<string, Analysis>();

export async function analyze(doc: SrcDoc, i: number): Promise<Analysis> {
  const key = doc.id + "_" + i; const hit = cache.get(key); if (hit) return hit;
  const pg = await doc.pj.getPage(i + 1);
  try { await pg.getOperatorList(); } catch { /* font names are best effort */ }
  const tc = await pg.getTextContent(), vp = pg.getViewport({ scale: 1 });
  type It = { str: string; x: number; base: number; w: number; s: number; fam: string; name: string };
  const raw: It[] = [];
  for (const it of tc.items as any[]) {
    if (typeof it.str !== "string" || !it.str.trim()) continue;
    const t = pdfjs.Util.transform(vp.transform, it.transform), fs = Math.hypot(t[2], t[3]);
    if (!fs || Math.abs(t[1]) > fs * 0.2) continue;            // vertical / rotated text is not editable
    let name = ""; try { if (pg.commonObjs.has(it.fontName)) name = pg.commonObjs.get(it.fontName)?.name || ""; } catch { /* not resolved */ }
    raw.push({ str: it.str, x: t[4], base: t[5], w: it.width, s: fs, fam: tc.styles?.[it.fontName]?.fontFamily || "", name });
  }
  raw.sort((a, b) => a.base - b.base || a.x - b.x);
  const rows: It[][] = [];
  for (const it of raw) { const r = rows[rows.length - 1]; if (r && Math.abs(r[0].base - it.base) < it.s * 0.4) r.push(it); else rows.push([it]); }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: It | null = null, end = 0, str = "";
    const flush = () => { if (!cur) return; const s = cur.s, bold = /bold|black|heavy|semibold|demi/i.test(cur.name), italic = /italic|oblique/i.test(cur.name);
      lines.push({ str, x: cur.x, w: end - cur.x, y: cur.base - 0.88 * s, h: 1.1 * s, s, base: cur.base, font: famToFont(cur.fam, cur.name), bold, italic }); };
    for (const it of row) {
      if (cur && it.x - end < cur.s * 0.8) { const gap = it.x - end; if (gap > cur.s * 0.12 && !str.endsWith(" ") && !it.str.startsWith(" ")) str += " "; str += it.str; end = it.x + it.w; }
      else { flush(); cur = it; str = it.str; end = it.x + it.w; }
    }
    flush();
  }
  lines.sort((a, b) => a.base - b.base || a.x - b.x);
  // group lines into blocks: a line joins the nearest block whose last line is just above it with the same size and horizontal overlap
  const groups: Line[][] = [];
  for (const L of lines) {
    let target: Line[] | null = null;
    for (let k = groups.length - 1; k >= 0 && k > groups.length - 12; k--) {
      const g = groups[k], last = g[g.length - 1], gx = Math.min(...g.map(l => l.x)), gr = Math.max(...g.map(l => l.x + l.w));
      const gap = L.y - (last.y + last.h);
      if (gap < 0.8 * L.s && gap > -0.6 * L.s && Math.abs(L.s - last.s) < 0.12 * last.s && L.x < gr + L.s && L.x + L.w > gx - L.s && L.x - last.x < 3 * L.s && L.base > last.base + 0.3 * L.s) { target = g; break; }
    }
    if (target) target.push(L); else groups.push([L]);
  }
  const weighted = lines.flatMap(l => Array(Math.min(200, l.str.length)).fill(l.s)).sort((a, b) => a - b);
  const median = weighted.length ? weighted[Math.floor(weighted.length / 2)] : 12;
  const blocks: Block[] = groups.map((g, n) => {
    const x = Math.min(...g.map(l => l.x)), y = Math.min(...g.map(l => l.y)), r = Math.max(...g.map(l => l.x + l.w)), b = Math.max(...g.map(l => l.y + l.h));
    const text = g.map(l => l.str).join(" "), size = Math.max(...g.map(l => l.s)), bold = g.every(l => l.bold);
    const heading = (size >= median * 1.22 && g.length <= 4 && text.length <= 160) || (bold && g.length === 1 && text.length < 80 && size >= median * 1.02 && !lines.every(l => l.bold));
    return { id: `${key}_${n}`, kind: heading ? "heading" as const : "paragraph" as const, lines: g, x, y, w: r - x, h: b - y, text, size };
  });
  blocks.sort((a, b) => a.y - b.y || a.x - b.x);
  const heads = blocks.filter(b => b.kind === "heading");
  let title = heads.length ? heads.reduce((a, b) => (b.size > a.size + 0.5 ? b : a)) : null;
  if (!title && blocks[0] && blocks[0].lines.length <= 2 && blocks[0].text.length <= 50 && !/[.!?]\s+\S/.test(blocks[0].text) && blocks[0].y < vp.height * 0.3 && blocks.length > 1) title = blocks[0];
  if (title) title.kind = "title";
  const res = { blocks, lines, median }; cache.set(key, res); return res;
}

/* ------------------------------------------------------------------ colour sampling (browser only) */
const baseCache = new Map<string, HTMLCanvasElement>();
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
export async function sampleColors(doc: SrcDoc, i: number, box: { x: number; y: number; w: number; h: number }): Promise<{ bg: string; fg: string }> {
  try {
    const key = doc.id + "_" + i; let cv = baseCache.get(key);
    if (!cv) {
      const pg = await doc.pj.getPage(i + 1), vp = pg.getViewport({ scale: 1 }); cv = document.createElement("canvas");
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await pg.render({ canvas: cv, canvasContext: cv.getContext("2d")!, viewport: vp }).promise;
      baseCache.set(key, cv); if (baseCache.size > 8) baseCache.delete(baseCache.keys().next().value as string);
    }
    const x = Math.max(0, Math.min(cv.width - 1, Math.floor(box.x))), y = Math.max(0, Math.min(cv.height - 1, Math.floor(box.y)));
    const w = Math.max(1, Math.min(cv.width - x, Math.ceil(box.w))), h = Math.max(1, Math.min(cv.height - y, Math.ceil(box.h)));
    const d = cv.getContext("2d")!.getImageData(x, y, w, h).data, buckets = new Map<number, [number, number, number, number]>();
    for (let p = 0; p < d.length; p += 4) { const k = ((d[p] >> 4) << 8) | ((d[p + 1] >> 4) << 4) | (d[p + 2] >> 4), e = buckets.get(k) || [0, 0, 0, 0];
      e[0] += d[p]; e[1] += d[p + 1]; e[2] += d[p + 2]; e[3]++; buckets.set(k, e); }
    const top = [...buckets.values()].sort((a, b) => b[3] - a[3])[0], bg = [top[0] / top[3], top[1] / top[3], top[2] / top[3]];
    let far = 0, fg = [0, 0, 0];
    for (let p = 0; p < d.length; p += 4) { const dist = Math.abs(d[p] - bg[0]) + Math.abs(d[p + 1] - bg[1]) + Math.abs(d[p + 2] - bg[2]); if (dist > far) { far = dist; fg = [d[p], d[p + 1], d[p + 2]]; } }
    return { bg: toHex(bg[0], bg[1], bg[2]), fg: far > 60 ? toHex(fg[0], fg[1], fg[2]) : "#000000" };
  } catch { return { bg: "#ffffff", fg: "#000000" }; }
}

/* ------------------------------------------------------------------ export */
const hex = (c: string) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ""); return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0, 0, 0); };
const STD: Record<FontKey, string[]> = {
  helv: ["Helvetica", "HelveticaBold", "HelveticaOblique", "HelveticaBoldOblique"],
  times: ["TimesRoman", "TimesRomanBold", "TimesRomanItalic", "TimesRomanBoldItalic"],
  courier: ["Courier", "CourierBold", "CourierOblique", "CourierBoldOblique"],
};
export function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (width <= 0) { out.push(para); continue; }
    let line = ""; for (const w of para.split(" ")) { const t = line ? line + " " + w : w; if (!line || measure(t) <= width) line = t; else { out.push(line); line = w; } }
    out.push(line);
  }
  return out;
}

export interface BuildInput { pages: PageState[]; docs: SrcDoc[]; images: Map<string, ImgData>; opts: DocOpts; uniFont: Uint8Array | null }
export async function buildPdf({ pages, docs, images, opts, uniFont }: BuildInput): Promise<Uint8Array> {
  const out = await PDFDocument.create(), stdFonts: Record<string, PDFFont> = {}, srcs: Record<number, PDFDocument> = {}, embeds: Record<string, any> = {};
  let uni: PDFFont | null = null;
  const getUni = async () => {
    if (uni) return uni; if (!uniFont) return null;
    try { const fk = (await import("@pdf-lib/fontkit")).default; out.registerFontkit(fk); uni = await out.embedFont(uniFont, { subset: true }); return uni; }
    catch { throw new Error("The Unicode font could not be embedded. Load a valid .ttf or .otf file in Document → Unicode font."); }
  };
  const fontFor = async (text: string, f: FontKey = "helv", bold = false, italic = false) => {
    const k = f + (bold ? 1 : 0) + (italic ? 1 : 0);
    stdFonts[k] ??= await out.embedFont((StandardFonts as any)[STD[f][(bold ? 1 : 0) + (italic ? 2 : 0)]]);
    try { stdFonts[k].encodeText(text); return stdFonts[k]; } catch { /* needs Unicode */ }
    const u = await getUni();
    if (u) return u;
    throw new Error(`The text “${text.slice(0, 24)}” has characters the built-in PDF fonts cannot encode (non-Latin scripts). Load a Unicode font in Document → Unicode font and export again.`);
  };
  // copy source pages: one copyPages call per document keeps shared resources (fonts, images) de-duplicated
  const need = new Map<number, Set<number>>();
  for (const p of pages) if (p.d >= 0) (need.get(p.d) ?? need.set(p.d, new Set()).get(p.d)!).add(p.i);
  const spare = new Map<string, PDFPage>();
  for (const [d, set] of need) { srcs[d] = await PDFDocument.load(docs[d].bytes); const idx = [...set]; const cp = await out.copyPages(srcs[d], idx); idx.forEach((i, k) => spare.set(d + "_" + i, cp[k])); }
  for (let n = 0; n < pages.length; n++) {
    const p = pages[n]; let pg: PDFPage, M: M6 = [1, 0, 0, 1, 0, 0];
    if (p.d < 0) { pg = out.addPage([p.w, p.h]); if (p.rot) pg.setRotation(degrees(p.rot)); }
    else {
      const k = p.d + "_" + p.i; let cp = spare.get(k);
      if (cp) spare.delete(k); else cp = (await out.copyPages(srcs[p.d], [p.i]))[0];
      pg = out.addPage(cp);
      const vp = (await (await docs[p.d].pj.getPage(p.i + 1))).getViewport({ scale: 1 });
      // Annotation coordinates use the editor's page viewport with a bottom-left
      // drawing origin. Flip them back to PDF.js viewport coordinates first, then
      // apply the inverse viewport transform to get the source PDF user space.
      M = mul(inv(vp.transform as M6), [1, 0, 0, -1, 0, p.h]);
      if (p.rot) pg.setRotation(degrees((pg.getRotation().angle + p.rot) % 360));
    }
    const H = p.h, W = p.w, Y = (y: number) => H - y;
    pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(...M));
    const tint = (c: string) => { if (!opts.bg) return hex(c); const a = hex(c), b = hex(opts.bg); return rgb(a.red * b.red, a.green * b.green, a.blue * b.blue); };   // covers must match the multiplied page background
    if (opts.bg) pg.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(opts.bg), blendMode: BlendMode.Multiply });
    for (const a of p.a) {
      if (a.t === "erase") pg.drawRectangle({ x: a.x - 1, y: Y(a.y + a.h), width: a.w + 2, height: a.h, color: tint(a.color) });
      else if (a.t === "hl") pg.drawRectangle({ x: a.x, y: Y(a.y + a.h), width: a.w, height: a.h, color: hex(a.color), opacity: 0.4 });
      else if (a.t === "ul" || a.t === "st") pg.drawLine({ start: { x: a.x, y: Y(a.y) }, end: { x: a.x + a.w, y: Y(a.y) }, thickness: a.sw, color: hex(a.color) });
      else if (a.t === "text") {
        if (a.cover) pg.drawRectangle({ x: a.cover.x - 1, y: Y(a.cover.y + a.cover.h), width: a.cover.w + 2, height: a.cover.h, color: tint(a.cover.color) });
        if (!a.text.trim()) continue;
        const f = await fontFor(a.text, a.font, a.bold, a.italic), col = hex(a.color);
        const lines = a.nowrap ? a.text.split("\n") : wrapText(a.text, a.w, s => f.widthOfTextAtSize(s, a.size));
        lines.forEach((ln, k) => {
          const tw = ln ? f.widthOfTextAtSize(ln, a.size) : 0, dx = a.align === "center" ? (a.w - tw) / 2 : a.align === "right" ? a.w - tw : 0, base = Y(a.y + a.size * 0.95 + k * a.size * 1.2);
          if (ln) pg.drawText(ln, { x: a.x + dx, y: base, size: a.size, font: f, color: col });
          if (a.underline && ln.trim()) pg.drawLine({ start: { x: a.x + dx, y: base - a.size * 0.12 }, end: { x: a.x + dx + tw, y: base - a.size * 0.12 }, thickness: Math.max(0.5, a.size / 18), color: col });
        });
      }
      else if (a.t === "shape") {
        const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2), w = Math.abs(a.x2 - a.x1), h = Math.abs(a.y2 - a.y1), bc = hex(a.stroke), fc = a.fill ? hex(a.fill) : undefined;
        if (a.k === "rect") pg.drawRectangle({ x, y: Y(y + h), width: w, height: h, borderColor: bc, borderWidth: a.sw, color: fc });
        else if (a.k === "ell") pg.drawEllipse({ x: x + w / 2, y: Y(y + h / 2), xScale: Math.max(0.1, w / 2), yScale: Math.max(0.1, h / 2), borderColor: bc, borderWidth: a.sw, color: fc });
        else {
          const s = { x: a.x1, y: Y(a.y1) }, e = { x: a.x2, y: Y(a.y2) };
          pg.drawLine({ start: s, end: e, thickness: a.sw, color: bc, lineCap: LineCapStyle.Round });
          if (a.k === "arrow") { const ang = Math.atan2(e.y - s.y, e.x - s.x), L = Math.max(9, a.sw * 4);
            for (const d of [0.45, -0.45]) pg.drawLine({ start: e, end: { x: e.x - L * Math.cos(ang + d), y: e.y - L * Math.sin(ang + d) }, thickness: a.sw, color: bc, lineCap: LineCapStyle.Round }); }
        }
      }
      else if (a.t === "draw") for (let k = 1; k < a.pts.length; k++) pg.drawLine({ start: { x: a.pts[k - 1][0], y: Y(a.pts[k - 1][1]) }, end: { x: a.pts[k][0], y: Y(a.pts[k][1]) }, thickness: a.sw, color: hex(a.color), lineCap: LineCapStyle.Round });
      else if (a.t === "img") {
        const im = images.get(a.key); if (!im) continue;
        embeds[a.key] ??= im.mime === "image/png" ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes);
        pg.drawImage(embeds[a.key], { x: a.x, y: Y(a.y + a.h), width: a.w, height: a.h });
      }
      else if (a.t === "link") {
        // Draw a visible link label and create a real PDF URI annotation.
        const label = String(a.text || a.url || "Link");
        const linkFont = await fontFor(label, "helv");
        const linkY = Y(a.y + Math.min(a.h || 24, 24) * 0.72);
        pg.drawText(label, { x: a.x + 4, y: linkY, size: 10, font: linkFont, color: hex(a.color || "#1d4ed8") });
        pg.drawLine({ start: { x: a.x + 4, y: linkY - 1.5 }, end: { x: Math.min(a.x + a.w - 3, a.x + 4 + linkFont.widthOfTextAtSize(label, 10)), y: linkY - 1.5 }, thickness: 0.6, color: hex(a.color || "#1d4ed8") });
        // Link rectangles live in PDF coordinates, so transform the four viewport corners
        // through the same matrix used for the page's editable overlays.
        const point = (x: number, y: number) => ({ x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] });
        const corners = [point(a.x, Y(a.y + a.h)), point(a.x + a.w, Y(a.y + a.h)), point(a.x, Y(a.y)), point(a.x + a.w, Y(a.y))];
        const xs = corners.map(q => q.x), ys = corners.map(q => q.y);
        const uri = String(a.url || "").trim();
        if (/^(https?:|mailto:)/i.test(uri)) {
          const annot = out.context.obj({ Type: PDFName.of("Annot"), Subtype: PDFName.of("Link"), Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], Border: [0, 0, 0], A: { Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: PDFString.of(uri) } });
          pg.node.addAnnot(out.context.register(annot));
        }
      }
      else if (a.t === "note") {
        const f = await fontFor(a.text, "helv"), ls = wrapText(a.text, 142, s => f.widthOfTextAtSize(s, 9)), h = ls.length * 11 + 8;
        pg.drawRectangle({ x: a.x, y: Y(a.y + h), width: 150, height: h, color: rgb(1, 0.953, 0.627), borderColor: rgb(0.8, 0.7, 0.2), borderWidth: 0.5 });
        ls.forEach((ln, k) => ln && pg.drawText(ln, { x: a.x + 4, y: Y(a.y + 12 + k * 11), size: 9, font: f, color: rgb(0.13, 0.13, 0.13) }));
      }
    }
    const small = async (txt: string, y: number) => { const f = await fontFor(txt, "helv"), tw = f.widthOfTextAtSize(txt, 9); pg.drawText(txt, { x: (W - tw) / 2, y, size: 9, font: f, color: rgb(0.35, 0.35, 0.35) }); };
    if (opts.wm) {
      const f = await fontFor(opts.wm, "helv", true), w1 = f.widthOfTextAtSize(opts.wm, 1) || 1, size = Math.min(110, (0.78 * Math.hypot(W, H)) / w1), tw = w1 * size, th = 0.35 * size, c = Math.SQRT1_2;
      pg.drawText(opts.wm, { x: W / 2 - (tw / 2) * c + th * c, y: H / 2 - (tw / 2) * c - th * c, size, font: f, color: rgb(0.5, 0.5, 0.5), opacity: 0.2, rotate: degrees(45) });
    }
    if (opts.hd) await small(opts.hd, H - 24);
    if (opts.ft) await small(opts.ft, 18);
    if (opts.pn) await small(opts.pn.replace(/\{n\}/g, String(n + 1)).replace(/\{N\}/g, String(pages.length)), opts.ft ? 32 : 20);
    pg.pushOperators(popGraphicsState());
  }
  return out.save();
}

/* ------------------------------------------------------------------ helpers */
export function dataUrlToBytes(url: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url); if (!m) throw new Error("Bad image data.");
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: m[1] };
}
export const sameText = (a: TextAnn, ref: string) => a.ref === ref;
