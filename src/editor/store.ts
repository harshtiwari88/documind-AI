import { useSyncExternalStore } from "react";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { save as saveBlob, postJson } from "../lib/api";
import { add as addDocument, validate } from "../lib/docs";
import { safeStorage } from "../lib/safeStorage";
import { analyze, buildPdf, dataUrlToBytes, loadPdf, readSizes, sampleColors } from "./engine";
import type { SrcDoc } from "./engine";
import { autosaveDocumentKey } from "./autosaveKey";
import { normalizeLinkUrl } from "./linkUtils";
import { describe, fillClarification, parseCommand, HELP } from "./commands";
import type { Cmd, Need, ParseCtx } from "./commands";
import type { Align, Analysis, Ann, Block, DocOpts, FontKey, Fmt, ImgData, Line, PageState, ShapeKind, TextAnn, Tool } from "./types";
import { FontMatchResult, matchFontAttributes, matchLineFont, matchBlockFont } from "./fontMatcher";

export interface Toast { id: number; kind: "ok" | "err" | "info"; text: string; action?: { label: string; run: () => void } }
export interface VoiceEntry { id: number; heard: string; interpreted: string; status: "running" | "done" | "error" | "confirm" | "clarify" | "cancelled"; message: string; source: "voice" | "text" | "ai"; cmd?: Cmd }
export interface MicState { state: "idle" | "starting" | "listening" | "denied" | "unsupported"; interim: string; error: string; handsFree: boolean }
export interface State {
  hasDoc: boolean; name: string; docKey: string | null; pages: PageState[]; cur: number; zoom: number; fit: boolean; tool: Tool;
  sel: number | null; selBlock: { page: number; id: string } | null; editing: number | null; fmt: Fmt; opts: DocOpts;
  busy: string | null; toast: Toast | null; preview: boolean; previewBusy: boolean; previewVer: number; canUndo: boolean; canRedo: boolean; version: number;
  sigOpen: boolean; hits: Record<number, { x: number; y: number; w: number; h: number }[]>; hint: string; panel: "format" | "document" | "voice";
  history: string[]; hasUni: boolean; mic: MicState; log: VoiceEntry[];
  pending: { cmd: Cmd; entry: number } | null; clarify: { question: string; partial: Cmd; need: Need; entry: number } | null; autoNotice: boolean;
  voiceMode: "auto" | "convo" | "edit"; ttsEnabled: boolean;
  fontMatch: FontMatchResult | null;
}
export interface Exec { ok: boolean; message: string }
export interface LineRef { page: number; line: Line; block?: Block; rect?: { x: number; w: number } }
class Clarify extends Error { constructor(public question: string, public need: Need) { super(question); } }

const HINTS: Record<Tool, string> = {
  select: "Click an item to select it, drag to move. Double-click text to edit. Click original text to select its paragraph.",
  text: "Click on the page where the text should go.", edit: "Click any existing line of text to edit it.", erase: "Click existing text to remove it. Undo brings it back.",
  hl: "Drag across text to highlight it, or click a line.", ul: "Drag across text to underline it, or click a line.", st: "Drag across text to strike it through, or click a line.",
  draw: "Draw freehand on the page.", shape: "Drag on the page to draw the shape.", note: "Click where the comment should go.",
};
const DEFAULT_FMT: Fmt = { font: "helv", size: 16, color: "#111111", bold: false, italic: false, underline: false, align: "left", stroke: "#e03131", fill: null, sw: 2, shape: "rect", hl: "#ffe000", lineHeight: 1.2, letterSpacing: 0, rotation: 0, opacity: 1 };
const DEFAULT_OPTS: DocOpts = { wm: "", pn: "", hd: "", ft: "", bg: "" };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lineKey = (l: Line) => `${Math.round(l.x)}_${Math.round(l.base)}`;

class EditorStore {
  s: State = {
    hasDoc: false, name: "document", docKey: null, pages: [], cur: 0, zoom: 1, fit: true, tool: "select", sel: null, selBlock: null, editing: null,
    fmt: { ...DEFAULT_FMT }, opts: { ...DEFAULT_OPTS }, busy: null, toast: null, preview: false, previewBusy: false, previewVer: 0, canUndo: false, canRedo: false, version: 0,
    sigOpen: false, hits: {}, hint: HINTS.select, panel: "format", history: [], hasUni: false, mic: { state: "idle", interim: "", error: "", handsFree: false }, log: [], pending: null, clarify: null, autoNotice: false,
    voiceMode: "auto", ttsEnabled: true,
    fontMatch: null,
  };
  private listeners = new Set<() => void>();
  docs: SrcDoc[] = []; images = new Map<string, ImgData>(); previewDoc: SrcDoc | null = null;
  private U: { s: string; label: string }[] = []; private R: { s: string; label: string }[] = [];
  private nextId = 1; private pageId = 1; private logId = 1; private toastId = 1; private imgId = 1;
  private uni: Uint8Array | null = null; private stageW = 800; private asTimer: any; private pvTimer: any; private pvSeq = 0; private burst = { label: "", t: 0 }; private toastTimer: any;
  /** Hook set by Workspace so app-level navigation commands (open page, sign out, etc.) are
   *  handled before the PDF-editing command parser runs. Return a message string if handled,
   *  or null to fall through to the PDF editing parser. */
  pre: ((raw: string) => Promise<string | null>) | null = null;
  private sr: any = null; private ana = new Map<string, Analysis>(); private editSnapped = false;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  get = () => this.s;
  private emit(patch: Partial<State> = {}, keepPreview = false) {
    this.s = { ...this.s, ...patch, version: this.s.version + 1, canUndo: this.U.length > 0, canRedo: this.R.length > 0, history: this.U.map(u => u.label) };
    this.listeners.forEach(f => f());
    if (this.s.preview && !keepPreview) this.schedulePreview();
  }
  set(patch: Partial<State>) { this.emit(patch); }

  /* ------------------------------------------------------------ feedback */
  toast(kind: Toast["kind"], text: string, action?: Toast["action"]) {
    clearTimeout(this.toastTimer); const t = { id: this.toastId++, kind, text, action };
    this.emit({ toast: t }, true); this.toastTimer = setTimeout(() => { if (this.s.toast?.id === t.id) this.emit({ toast: null }, true); }, kind === "err" ? 9000 : action ? 8000 : 4500);
  }
  dismissToast() { this.emit({ toast: null }, true); }
  private async busy<T>(label: string, fn: () => Promise<T>): Promise<T> { this.emit({ busy: label }, true); try { return await fn(); } finally { this.emit({ busy: null }, true); } }

  /* ------------------------------------------------------------ undo / redo */
  private snapStr() { return JSON.stringify({ p: this.s.pages, o: this.s.opts, c: this.s.cur }); }
  private checkpoint(label: string, burst = false) {
    if (burst && this.burst.label === label && Date.now() - this.burst.t < 1200) { this.burst.t = Date.now(); return; }
    this.burst = { label: burst ? label : "", t: Date.now() };
    this.U.push({ s: this.snapStr(), label }); if (this.U.length > 100) this.U.shift(); this.R = [];
  }
  private applySnap(sn: { s: string }) {
    const o = JSON.parse(sn.s); const cur = Math.min(this.s.cur, o.p.length - 1);
    this.emit({ pages: o.p, opts: o.o, cur: Math.max(0, cur), sel: null, selBlock: null, editing: null }); this.recomputeFit(); this.autosave();
  }
  undo(): Exec {
    const u = this.U.pop(); if (!u) return { ok: false, message: "Nothing to undo." };
    this.R.push({ s: this.snapStr(), label: u.label }); this.burst = { label: "", t: 0 }; this.applySnap(u); return { ok: true, message: `Undid “${u.label}”.` };
  }
  redo(): Exec {
    const r = this.R.pop(); if (!r) return { ok: false, message: "Nothing to redo." };
    this.U.push({ s: this.snapStr(), label: r.label }); if (this.U.length > 100) this.U.shift();
    this.applySnap(r); return { ok: true, message: `Redid “${r.label}”.` };
  }
  jumpHistory(i: number) { while (this.U.length > i) { if (!this.undo().ok) break; } }
  /** run a mutation as one undo step */
  private mutate<T>(label: string, fn: () => T, burst = false): T { this.checkpoint(label, burst); const r = fn(); this.emit(); this.autosave(); return r; }

  /* ------------------------------------------------------------ opening files */
  hasDoc() { return this.s.hasDoc; }
  async openFile(file: File, replace = true, docKey?: string) {
    const e = validate(file); if (e) { this.toast("err", e); return false; }
    return this.openBytes(new Uint8Array(await file.arrayBuffer()), file.name, replace, docKey);
  }
  async openBytes(bytes: Uint8Array, fileName: string, replace = true, docKey?: string) {
    return this.busy("Opening PDF…", async () => {
      try {
        const sd = await loadPdf(bytes), sizes = await readSizes(sd);
        const name = fileName.replace(/\.pdf$/i, "");
        const effectiveDocKey = docKey || autosaveDocumentKey(bytes, name);
        // Replacing a document resets docs to [sd], so its pages must point to index 0.
        // When merging, the new source is appended at the current docs.length.
        const sourceIndex = replace ? 0 : this.docs.length;
        const mk = (n: number): PageState => ({ id: this.pageId++, d: sourceIndex, i: n, rot: 0, w: sizes[n].w, h: sizes[n].h, a: [] });
        if (replace) {
          clearTimeout(this.asTimer);
          this.images.forEach(v => { try { URL.revokeObjectURL(v.url); } catch { /* non-browser test runtime */ } });
          this.images.clear();
          this.docs = []; this.U = []; this.R = []; this.ana.clear(); this.previewDoc = null;
          const pages = sizes.map((_, n) => mk(n)); this.docs.push(sd);
          this.emit({ hasDoc: true, name, docKey: effectiveDocKey, pages, cur: 0, sel: null, selBlock: null, editing: null, opts: { ...DEFAULT_OPTS }, hits: {}, tool: "select", hint: HINTS.select });
          this.recomputeFit(); await this.restoreAutosave(sizes.length);
          this.toast("ok", `Opened ${fileName}: ${sizes.length} page${sizes.length > 1 ? "s" : ""}.`);
        } else {
          this.checkpoint("Merge PDF"); const add = sizes.map((_, n) => mk(n)); this.docs.push(sd);
          this.emit({ pages: [...this.s.pages, ...add] }); this.autosave();
          this.toast("ok", `Added ${sizes.length} page${sizes.length > 1 ? "s" : ""} from ${fileName}.`);
        }
        return true;
      } catch (err: any) { this.toast("err", err.message || "Could not open this PDF."); return false; }
    });
  }
  async mergeFiles(files: FileList | File[]) {
    if (!this.s.hasDoc) { this.toast("err", "Open a PDF first, then merge others into it."); return; }
    for (const f of Array.from(files)) { const e = validate(f); if (e) { this.toast("err", e); continue; } await this.openBytes(new Uint8Array(await f.arrayBuffer()), f.name, false); }
  }
  async newBlank() {
    const sd = await loadPdf(new Uint8Array(await (async () => { const { PDFDocument } = await import("pdf-lib"); const d = await PDFDocument.create(); d.addPage([595.28, 841.89]); return d.save(); })()));
    clearTimeout(this.asTimer);
    this.images.forEach(v => { try { URL.revokeObjectURL(v.url); } catch { /* non-browser test runtime */ } }); this.images.clear();
    this.docs = [sd]; this.U = []; this.R = []; this.ana.clear();
    this.emit({ hasDoc: true, name: "untitled", docKey: "untitled_" + Date.now(), pages: [{ id: this.pageId++, d: 0, i: 0, rot: 0, w: 595.28, h: 841.89, a: [] }], cur: 0, sel: null, selBlock: null, opts: { ...DEFAULT_OPTS }, tool: "select" });
    this.recomputeFit(); this.autosave();
  }

  /* ------------------------------------------------------------ autosave (IndexedDB, includes images) */
  private autosave() {
    clearTimeout(this.asTimer); if (!this.s.hasDoc || !this.s.docKey) return;
    const key = this.s.docKey;
    this.asTimer = setTimeout(async () => {
      // A document switch cancels the old timer; this guard also prevents stale callbacks
      // from writing one document's state under another document's key.
      if (!this.s.hasDoc || this.s.docKey !== key) return;
      try {
        const imgs: Record<string, { bytes: Uint8Array; mime: string }> = {};
        this.images.forEach((v, k) => (imgs[k] = { bytes: v.bytes, mime: v.mime }));
        // Persist source bytes too: otherwise merged PDFs cannot be reconstructed after reload,
        // because page states reference multiple source-document indices.
        const sources = this.docs.map(d => d.bytes.slice());
        await idbSet("dm_auto_" + key, { snap: this.snapStr(), imgs, t: Date.now(), docs: this.docs.length, sources, docKey: key });
      } catch { /* storage may be unavailable in private mode or quota may be exhausted */ }
    }, 700);
  }
  private async restoreAutosave(count: number) {
    try {
      const o: any = await idbGet("dm_auto_" + this.s.docKey);
      if (!o || !Number.isInteger(o.docs) || o.docs < 1) return;
      // Older single-source autosaves did not store `sources`; keep them compatible.
      if (o.docs > 1 && (!Array.isArray(o.sources) || o.sources.length !== o.docs)) return;
      const restoredDocs: SrcDoc[] = [this.docs[0]];
      if (Array.isArray(o.sources) && o.sources.length === o.docs) {
        const first = o.sources[0] instanceof Uint8Array ? o.sources[0] : new Uint8Array(o.sources[0]);
        const current = this.docs[0]?.bytes;
        if (!current || first.length !== current.length || first.some((v: number, i: number) => v !== current[i])) return;
        for (let i = 1; i < o.sources.length; i++) restoredDocs.push(await loadPdf(o.sources[i] instanceof Uint8Array ? o.sources[i] : new Uint8Array(o.sources[i])));
      }
      const sourceSizes = await Promise.all(restoredDocs.map(readSizes));
      if (sourceSizes[0]?.length !== count) return;
      const sn = JSON.parse(o.snap);
      if (!Array.isArray(sn.p) || !sn.p.length || !sn.p.every((p: PageState) => Number.isInteger(p.d) && p.d >= 0 && p.d < restoredDocs.length && Number.isInteger(p.i) && p.i >= 0 && p.i < sourceSizes[p.d].length)) return;
      if (!sn.p.some((p: PageState) => p.a.length) && !Object.values(sn.o || {}).some(Boolean) && sn.p.length === count && restoredDocs.length === 1) return;
      this.docs = restoredDocs;
      for (const [k, v] of Object.entries<any>(o.imgs || {})) this.images.set(k, { bytes: v.bytes, mime: v.mime, url: URL.createObjectURL(new Blob([v.bytes], { type: v.mime })) });
      sn.p.forEach((p: PageState) => { p.id = this.pageId++; p.a.forEach((a: Ann) => (this.nextId = Math.max(this.nextId, a.id + 1))); });
      const original = this.snapStr(); this.emit({ pages: sn.p, opts: sn.o || { ...DEFAULT_OPTS }, cur: Math.min(sn.c || 0, sn.p.length - 1) });
      this.recomputeFit();
      this.toast("info", `Restored your unsaved edits from ${new Date(o.t).toLocaleString()}.`, { label: "Start over", run: () => { this.U.push({ s: this.snapStr(), label: "Restored edits" }); this.applySnap({ s: original }); } });
    } catch { /* ignore corrupt autosave or browser storage quota failures */ }
  }

  /* ------------------------------------------------------------ view */
  page() { return this.s.pages[this.s.cur]; }
  goTo(n: number) { if (!this.s.pages.length) return; this.emit({ cur: clamp(n, 0, this.s.pages.length - 1), sel: null, selBlock: null, editing: null }); this.recomputeFit(); }
  setZoom(z: number) { this.emit({ zoom: clamp(z, 0.25, 4), fit: false }); }
  zoomBy(d: number) { this.setZoom(Math.round((this.s.zoom + d) * 100) / 100); }
  fitWidth() { this.emit({ fit: true }); this.recomputeFit(); }
  setStage(w: number) { if (Math.abs(w - this.stageW) > 2) { this.stageW = w; this.recomputeFit(); } }
  private recomputeFit() {
    if (!this.s.fit) return; const p = this.page(); if (!p) return;
    const dw = p.rot % 180 ? p.h : p.w, z = Math.round(clamp((this.stageW - 32) / dw, 0.25, 1.6) * 100) / 100;
    if (Math.abs(z - this.s.zoom) > 0.004) this.emit({ zoom: z }, true);
  }
  setTool(t: Tool) { this.emit({ tool: t, editing: null, hint: HINTS[t], ...(t !== "select" ? { selBlock: null } : {}) }, true); if (["select", "edit", "erase", "hl", "ul", "st"].includes(t)) this.loadAnalysis(this.s.cur); }
  setPanel(p: State["panel"]) { this.emit({ panel: p }, true); }
  select(id: number | null) { const a = id != null ? this.findAnn(id)?.a : null; const f: Partial<Fmt> = {};
    let fontMatch: FontMatchResult | null = null;
    if (a?.t === "text") {
      Object.assign(f, { font: a.font, size: a.size, color: a.color, bold: a.bold, italic: a.italic, underline: a.underline, align: a.align });
      fontMatch = matchFontAttributes({ fam: a.font, size: a.size, bold: a.bold, italic: a.italic, color: a.color });
    }
    this.emit({ sel: id, selBlock: null, editing: null, fontMatch, fmt: { ...this.s.fmt, ...f }, ...(id != null ? { panel: "format" as const } : {}) }, true); }
  selectBlock(page: number, id: string | null) {
    let fontMatch: FontMatchResult | null = null;
    if (id) {
      const b = this.peek(page)?.blocks.find(x => x.id === id);
      if (b) fontMatch = matchBlockFont(b);
    }
    this.emit({ selBlock: id ? { page, id } : null, sel: null, editing: null, fontMatch, ...(id ? { panel: "format" as const } : {}) }, true);
  }
  findAnn(id: number) { for (const p of this.s.pages) { const a = p.a.find(x => x.id === id); if (a) return { p, a }; } return null; }
  startEdit(id: number) { this.editSnapped = false; this.emit({ editing: id, sel: id }, true); }
  liveText(id: number, text: string) { const f = this.findAnn(id); if (!f || (f.a.t !== "text" && f.a.t !== "note")) return; if (!this.editSnapped) { this.checkpoint("Edit text"); this.editSnapped = true; } f.a.text = text; this.emit({}, false); this.autosave(); }
  stopEdit(id: number) {
    const f = this.findAnn(id); if (f && f.a.t === "text" && !(f.a.text || "").trim() && !f.a.cover) { f.p.a = f.p.a.filter(x => x.id !== id); this.emit({ editing: null, sel: null }); this.autosave(); return; }
    this.emit({ editing: null }, true);
  }

  /* ------------------------------------------------------------ analysis */
  private pageKey(p: PageState) { return p.d < 0 ? "" : this.docs[p.d].id + "_" + p.i; }
  peek(pageIdx: number): Analysis | null { const p = this.s.pages[pageIdx]; return p && p.d >= 0 ? this.ana.get(this.pageKey(p)) || null : null; }
  async analysis(pageIdx: number): Promise<Analysis | null> {
    const p = this.s.pages[pageIdx]; if (!p || p.d < 0) return null; const k = this.pageKey(p); let a = this.ana.get(k);
    if (!a) { try { a = await analyze(this.docs[p.d], p.i); this.ana.set(k, a); } catch { return null; } }
    return a;
  }
  async loadAnalysis(pageIdx: number) { if (!this.peek(pageIdx) && this.s.pages[pageIdx]?.d >= 0) { await this.analysis(pageIdx); this.emit({}, true); } }

  /* ------------------------------------------------------------ pages */
  private idx(n?: number): number { // 1-based public number -> 0-based index, validated
    const i = (n ?? this.s.cur + 1) - 1; if (!Number.isInteger(i) || i < 0 || i >= this.s.pages.length) throw new Error(`Page ${n} doesn't exist. This document has ${this.s.pages.length} page${this.s.pages.length > 1 ? "s" : ""}.`); return i;
  }
  rotatePage(i: number, deg = 90) { const p = this.s.pages[i]; this.mutate(`Rotate page ${i + 1}`, () => { p.rot = (((p.rot + deg) % 360) + 360) % 360; }); this.recomputeFit(); }
  deletePage(i: number) {
    if (this.s.pages.length === 1) throw new Error("A PDF needs at least one page, so the last page can't be deleted.");
    this.mutate(`Delete page ${i + 1}`, () => { this.s.pages.splice(i, 1); this.s.cur = Math.min(this.s.cur, this.s.pages.length - 1); this.s.sel = null; this.s.selBlock = null; });
  }
  duplicatePage(i: number) {
    this.mutate(`Duplicate page ${i + 1}`, () => { const c: PageState = JSON.parse(JSON.stringify(this.s.pages[i])); c.id = this.pageId++; c.a.forEach(a => (a.id = this.nextId++)); this.s.pages.splice(i + 1, 0, c); this.s.cur = i + 1; });
  }
  addBlank(after?: number) {
    const i = after ?? this.s.cur, ref = this.s.pages[i] || this.s.pages[0];
    this.mutate(`Add blank page`, () => { const w = ref ? (ref.rot % 180 ? ref.h : ref.w) : 595.28, h = ref ? (ref.rot % 180 ? ref.w : ref.h) : 841.89; this.s.pages.splice(i + 1, 0, { id: this.pageId++, d: -1, i: 0, rot: 0, w, h, a: [] }); this.s.cur = i + 1; });
    this.recomputeFit();
  }
  movePage(from: number, to: number) {
    to = clamp(to, 0, this.s.pages.length - 1); if (from === to) return;
    this.mutate(`Move page ${from + 1}`, () => { const [p] = this.s.pages.splice(from, 1); this.s.pages.splice(to, 0, p); this.s.cur = to; });
  }
  async extractPage(i: number) { await this.download([this.s.pages[i]], `${this.s.name}-page${i + 1}.pdf`); }
  async downloadRange(startPage: number, endPage: number) {
    const start = Math.floor(startPage), end = Math.floor(endPage);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > this.s.pages.length) {
      this.toast("err", `Choose a valid page range from 1 to ${this.s.pages.length}.`); return { ok: false, message: "Invalid page range." };
    }
    return this.download(this.s.pages.slice(start - 1, end), `${this.s.name}-pages-${start}-${end}.pdf`);
  }
  async splitAtCurrentPage() {
    const cut = this.s.cur + 1;
    if (cut <= 1 || cut >= this.s.pages.length) {
      this.toast("info", "To split into two files, choose a page between the first and last page.");
      return;
    }
    await this.downloadRange(1, cut);
    await this.downloadRange(cut + 1, this.s.pages.length);
  }

  /* ------------------------------------------------------------ annotations */
  private newId() { return this.nextId++; }
  private fmtText(over: Partial<TextAnn>): TextAnn {
    const f = this.s.fmt; return { id: this.newId(), t: "text", x: 40, y: 40, w: 240, text: "", font: f.font, size: f.size, color: f.color, bold: f.bold, italic: f.italic, underline: f.underline, align: f.align, ...over };
  }
  private patchOf(a: Ann, pi: number) { return pi; }
  addAnn(pageIdx: number, a: Ann, label: string, select = true) { this.mutate(label, () => { this.s.pages[pageIdx].a.push(a); if (select) { this.s.sel = a.id; this.s.selBlock = null; } }); return a; }
  addTextAt(pageIdx: number, x: number, y: number) {
    const p = this.s.pages[pageIdx], w = Math.min(240, p.w - x - 8);
    const a = this.fmtText({ x, y, w: Math.max(60, w), text: "Text" }); this.addAnn(pageIdx, a, "Add text"); this.emit({ tool: "select", editing: a.id, hint: HINTS.select }, true); this.editSnapped = true; return a;
  }
  patchAnn(id: number, patch: Partial<Ann> | Record<string, any>, label = "Edit item", burst = true) {
    const f = this.findAnn(id); if (!f) return; this.mutate(label, () => Object.assign(f.a, patch), burst);
  }
  /** begin a drag/resize: one undo step, then call moveAnn repeatedly */
  beginDrag(label: string) { this.checkpoint(label); }
  moveAnn(id: number, patch: Record<string, any>) { const f = this.findAnn(id); if (!f) return; Object.assign(f.a, patch); this.emit({}, false); }
  endDrag() { this.autosave(); }
  deleteAnn(id: number) {
    const f = this.findAnn(id); if (!f) return; const restored = f.a.t === "text" && f.a.cover;
    this.mutate("Delete item", () => { f.p.a = f.p.a.filter(x => x.id !== id); this.s.sel = null; this.s.editing = null; });
    if (restored) this.toast("info", "Item deleted. The original text is visible again.");
  }
  duplicateAnn(id: number) { const f = this.findAnn(id); if (!f) return; const c: any = JSON.parse(JSON.stringify(f.a)); c.id = this.newId(); delete c.cover; delete c.ref;
    if ("x" in c) { c.x += 14; c.y += 14; } if ("x1" in c) { c.x1 += 14; c.x2 += 14; c.y1 += 14; c.y2 += 14; } if (c.pts) c.pts = c.pts.map((q: number[]) => [q[0] + 14, q[1] + 14]);
    this.mutate("Duplicate item", () => { f.p.a.push(c); this.s.sel = c.id; }); }
  reorderAnn(id: number, dir: 1 | -1) { const f = this.findAnn(id); if (!f) return; const i = f.p.a.indexOf(f.a), j = clamp(i + dir, 0, f.p.a.length - 1); if (i === j) return;
    this.mutate(dir > 0 ? "Bring forward" : "Send backward", () => { f.p.a.splice(i, 1); f.p.a.splice(j, 0, f.a); }); }
  bringToFront(id: number) { const f = this.findAnn(id); if (!f) return;
    this.mutate("Bring to front", () => { f.p.a = f.p.a.filter(x => x.id !== id).concat([f.a]); }); }
  sendToBack(id: number) { const f = this.findAnn(id); if (!f) return;
    this.mutate("Send to back", () => { f.p.a = [f.a, ...f.p.a.filter(x => x.id !== id)]; }); }
  rotateAnn(id: number, deg = 90) { const f = this.findAnn(id); if (!f) return;
    this.mutate(`Rotate ${deg}°`, () => { f.a.rotation = (((f.a.rotation || 0) + deg) % 360 + 360) % 360; }); }
  setVoiceMode(mode: "auto" | "convo" | "edit") { this.emit({ voiceMode: mode }, true); }
  setTtsEnabled(enabled: boolean) { this.emit({ ttsEnabled: enabled }, true); }

  /** Format controls: updates the defaults for new items AND the selected item, in one place. */
  setFmt(patch: Partial<Fmt>) {
    const fmt = { ...this.s.fmt, ...patch }, id = this.s.sel; this.emit({ fmt }, true);
    if (id != null) { const f = this.findAnn(id); if (f) this.styleAnn(f.a, { ...patch }, true); }
  }
  private styleAnn(a: Ann, p: Record<string, any>, burst: boolean): boolean {
    const clean: any = {}; let ok = false;
    this.checkpoint("Format item", burst);
    if (a.t === "text") {
      for (const k of ["color", "bold", "italic", "underline", "align", "font", "lineHeight", "letterSpacing", "rotation", "opacity"]) if (p[k] !== undefined) { clean[k] = p[k]; ok = true; }
      if (p.size !== undefined || p.delta !== undefined) { const curSize = a.size ?? 14; const ns = clamp(p.size ?? (curSize + (p.delta ?? 0)), 4, 200); if (a.ref && a.y !== undefined && a.size !== undefined) a.y = a.y + 0.95 * a.size - 0.95 * ns; clean.size = ns; ok = true; }
    }
    else if (a.t === "img") {
      for (const k of ["rotation", "opacity", "w", "h"]) if (p[k] !== undefined) { clean[k] = p[k]; ok = true; }
    }
    else if (a.t === "shape") { if (p.stroke !== undefined || p.color !== undefined) { clean.stroke = p.stroke ?? p.color; ok = true; } if (p.fill !== undefined) { clean.fill = p.fill; ok = true; } if (p.sw !== undefined) { clean.sw = p.sw; ok = true; } if (p.k) { clean.k = p.k; ok = true; } if (p.opacity !== undefined) { clean.opacity = p.opacity; ok = true; } }
    else if (a.t === "draw" || a.t === "ul" || a.t === "st") { if (p.color !== undefined || p.stroke !== undefined) { clean.color = p.color ?? p.stroke; ok = true; } if (p.sw !== undefined) { clean.sw = p.sw; ok = true; } if (p.opacity !== undefined) { clean.opacity = p.opacity; ok = true; } }
    else if (a.t === "hl") { if (p.color !== undefined || p.hl !== undefined) { clean.color = p.hl ?? p.color; ok = true; } }
    if (ok) { Object.assign(a, clean); this.emit(); this.autosave(); } else if (!burst) this.U.pop();
    return ok;
  }

  /* text lines from the original PDF */
  private async lineStyle(pageIdx: number, l: Line) { const p = this.s.pages[pageIdx]; return sampleColors(this.docs[p.d], p.i, { x: l.x, y: l.y ?? 0, w: l.w, h: l.h ?? (l.s || 12) }); }
  private lineAnn(pageIdx: number, l: Line, colors: { bg: string; fg: string }): TextAnn {
    return { id: this.newId(), t: "text", x: l.x, y: l.base - 0.95 * l.s, w: Math.max(l.w, 4), text: l.str, font: l.font, size: l.s, color: colors.fg, bold: l.bold, italic: l.italic, underline: false, align: "left", nowrap: true,
      cover: { x: l.x, y: l.y, w: l.w, h: l.h, color: colors.bg }, ref: lineKey(l) };
  }
  private findLineAnn(pageIdx: number, l: Line) { return this.s.pages[pageIdx].a.find(a => a.t === "text" && a.ref === lineKey(l)) as TextAnn | undefined; }
  async editLine(pageIdx: number, l: Line) {
    let a = this.findLineAnn(pageIdx, l);
    const c = await this.lineStyle(pageIdx, l);
    const matched = matchLineFont(l, c);
    if (!a) { a = this.lineAnn(pageIdx, l, c); this.addAnn(pageIdx, a, "Edit text"); }
    this.emit({ sel: a.id, editing: a.id, tool: "select", hint: HINTS.select, fontMatch: matched }, true); this.editSnapped = true;
    this.toast("ok", `🎯 Matched Font: ${matched.matchedStandardFontName} (${matched.confidence}%) · ${matched.size}pt`);
  }
  applyMatchedFont(matched: FontMatchResult) {
    this.setFmt({
      font: matched.matchedStandardFont,
      size: Math.round(matched.size),
      bold: matched.bold,
      italic: matched.italic,
      color: matched.fgColor,
    });
    if (this.s.sel != null) {
      this.styleAnn(this.findAnn(this.s.sel)?.a, {
        font: matched.matchedStandardFont,
        size: Math.round(matched.size),
        bold: matched.bold,
        italic: matched.italic,
        color: matched.fgColor,
      });
    }
    this.toast("ok", `Applied matched ${matched.matchedStandardFontName} (${matched.size}pt, ${matched.fgColor})`);
  }
  async restyleLines(refs: LineRef[], patch: Record<string, any>, label: string) {
    const made: [number, TextAnn][] = [], touched: TextAnn[] = [], seen = new Set<string>();
    for (const r of refs) {
      const k = r.page + "_" + lineKey(r.line); if (seen.has(k)) continue; seen.add(k);
      let a = this.findLineAnn(r.page, r.line);
      if (!a) { a = this.lineAnn(r.page, r.line, await this.lineStyle(r.page, r.line)); made.push([r.page, a]); }
      touched.push(a);
    }
    this.checkpoint(label);
    for (const [pg, a] of made) this.s.pages[pg].a.push(a);
    refs.forEach((r) => { const a = this.findLineAnn(r.page, r.line)!; this.styleAnn(a, patch, true);
      if (patch.align && patch.align !== "left" && r.block) { a.x = r.block.x; a.w = r.block.w; a.nowrap = true; a.cover = { x: r.block.x, y: r.line.y, w: r.block.w, h: r.line.h, color: a.cover!.color }; } });
    this.U[this.U.length - 1].label = label; this.emit(); this.autosave();
    return touched;
  }
  async eraseLines(refs: LineRef[], label = "Delete text") {
    const add: [number, Ann][] = [], clear: TextAnn[] = [];
    for (const r of refs) { const ex = this.findLineAnn(r.page, r.line); if (ex) { clear.push(ex); continue; }
      if (this.s.pages[r.page].a.some(a => a.t === "erase" && a.ref === lineKey(r.line))) continue;
      const c = await this.lineStyle(r.page, r.line); add.push([r.page, { id: this.newId(), t: "erase", x: r.line.x, y: r.line.y, w: r.line.w, h: r.line.h, color: c.bg, ref: lineKey(r.line) }]); }
    this.mutate(label, () => { add.forEach(([p, a]) => this.s.pages[p].a.push(a)); clear.forEach(a => { a.text = ""; }); this.s.sel = null; this.s.selBlock = null; });
  }
  async replaceBlock(pageIdx: number, b: Block, text: string) {
    const lines = b.lines || [];
    const first = lines[0] || { x: b.x, y: b.y, w: b.w, h: b.h, s: b.size || 12, base: b.y + (b.size || 12), str: b.text, font: "helv", bold: false, italic: false };
    const c = await this.lineStyle(pageIdx, first), cover = { x: b.x, y: b.y, w: b.w, h: b.h, color: c.bg };
    const matched = matchBlockFont(b, c);
    // Checkpoint before removing any existing overlays so Undo restores the exact prior state.
    this.checkpoint("Replace text");
    this.s.pages[pageIdx].a = this.s.pages[pageIdx].a.filter(a => !(a.t === "text" && a.ref && lines.some(l => lineKey(l) === a.ref)) && !(a.t === "erase" && a.ref && lines.some(l => lineKey(l) === a.ref)));
    const a: TextAnn = { id: this.newId(), t: "text", x: b.x, y: first.base - 0.95 * first.s, w: b.w, text, font: matched.matchedStandardFont, size: matched.size, color: matched.fgColor, bold: matched.bold, italic: matched.italic, underline: false, align: "left", cover, ref: lineKey(first), role: b.kind === "paragraph" ? undefined : "heading" };
    this.s.pages[pageIdx].a.push(a); this.s.sel = a.id; this.s.selBlock = null;
    this.emit({ tool: "select", editing: a.id, hint: HINTS.select, fontMatch: matched }); this.editSnapped = true; this.autosave();
    this.toast("ok", `Seamlessly replaced with font-matched ${matched.matchedStandardFontName} (${matched.size}pt)`);
  }

  /* markup */
  private markRects(kind: "hl" | "ul" | "st", segs: { x: number; w: number; line: Line }[], color?: string): Ann[] {
    return segs.map(sg => { const l = sg.line, sw = Math.max(0.8, l.s / 14);
      if (kind === "hl") return { id: this.newId(), t: "hl" as const, x: sg.x, y: l.y + 0.04 * l.s, w: sg.w, h: l.h - 0.02 * l.s, color: color || this.s.fmt.hl };
      return { id: this.newId(), t: kind, x: sg.x, y: kind === "ul" ? l.base + 0.14 * l.s : l.base - 0.3 * l.s, w: sg.w, color: color || (kind === "ul" ? this.s.fmt.stroke === "#e03131" ? "#000000" : this.s.fmt.stroke : "#e03131"), sw }; });
  }
  addMarkup(pageIdx: number, kind: "hl" | "ul" | "st", segs: { x: number; w: number; line: Line }[], color?: string, label?: string) {
    if (!segs.length) return 0; const L = { hl: "Highlight", ul: "Underline", st: "Strike through" };
    this.mutate(label || L[kind], () => { this.s.pages[pageIdx].a.push(...this.markRects(kind, segs, color)); }); return segs.length;
  }
  async markRect(kind: "hl" | "ul" | "st", pageIdx: number, r: { x: number; y: number; w: number; h: number }) {
    const an = await this.analysis(pageIdx), segs: { x: number; w: number; line: Line }[] = [];
    for (const l of an?.lines || []) { const ov = Math.min(l.y + l.h, r.y + r.h) - Math.max(l.y, r.y), hx = Math.min(l.x + l.w, r.x + r.w) - Math.max(l.x, r.x); if (ov > 0.5 * l.h && hx > 1) segs.push({ x: Math.max(l.x, r.x), w: hx, line: l }); }
    if (segs.length) return this.addMarkup(pageIdx, kind, segs);
    const fake: Line = { str: "", x: r.x, y: r.y, w: r.w, h: r.h, s: Math.max(8, r.h), base: kind === "ul" ? r.y + r.h - 0.14 * r.h : r.y + r.h * 0.65, font: "helv", bold: false, italic: false };
    return this.addMarkup(pageIdx, kind, [{ x: r.x, w: r.w, line: fake }]);
  }
  markLine(kind: "hl" | "ul" | "st", pageIdx: number, l: Line) { this.addMarkup(pageIdx, kind, [{ x: l.x, w: l.w, line: l }]); }
  addDraw(pageIdx: number, pts: [number, number][]) { if (pts.length < 2) return; this.addAnn(pageIdx, { id: this.newId(), t: "draw", pts, color: this.s.fmt.stroke, sw: this.s.fmt.sw }, "Draw", false); }
  addShape(pageIdx: number, k: ShapeKind, x1: number, y1: number, x2: number, y2: number, color?: string) {
    if (Math.hypot(x2 - x1, y2 - y1) < 3) return null;
    return this.addAnn(pageIdx, { id: this.newId(), t: "shape", k, x1, y1, x2, y2, stroke: color || this.s.fmt.stroke, fill: this.s.fmt.fill, sw: this.s.fmt.sw }, "Add shape");
  }
  addNote(pageIdx: number, x: number, y: number, text = "Comment") { const a = this.addAnn(pageIdx, { id: this.newId(), t: "note", x, y, text }, "Add comment"); this.emit({ tool: "select", editing: a.id, hint: HINTS.select }, true); this.editSnapped = true; return a; }
  addLink(label: string, url: string, pageIdx = this.s.cur) {
    const normalized = normalizeLinkUrl(url);
    const p = this.s.pages[pageIdx]; if (!p) throw new Error("Open a PDF page first.");
    const text = label.trim() || normalized;
    const w = Math.min(Math.max(100, text.length * 7), Math.max(100, p.w - 80));
    const a = this.addAnn(pageIdx, { id: this.newId(), t: "link", x: 40, y: 80, w, h: 24, text, url: normalized, color: "#1d4ed8" }, "Add hyperlink");
    this.emit({ tool: "select", hint: HINTS.select }, true);
    return a;
  }

  /* images & signatures */
  async addImageFile(file: File) {
    if (!this.s.hasDoc) return this.toast("err", "Open a PDF first.");
    if (file.size > 10 * 1048576) return this.toast("err", "Image is larger than 10 MB.");
    try {
      let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer()), mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "";
      if (!mime) { const bmp = await createImageBitmap(file), cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; cv.getContext("2d")!.drawImage(bmp, 0, 0);
        bytes = dataUrlToBytes(cv.toDataURL("image/png")).bytes; mime = "image/png"; }
      await this.placeImage(bytes, mime, false); this.toast("ok", "Image added. Drag to move, drag the corner handle to resize.");
    } catch { this.toast("err", "That image could not be read. Use a PNG or JPG."); }
  }
  async placeImage(bytes: Uint8Array, mime: string, sig: boolean, pageIdx = this.s.cur) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })), key = "i" + this.imgId++ + "_" + Date.now().toString(36);
    const dim = await new Promise<{ w: number; h: number }>((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = url; });
    this.images.set(key, { bytes, mime, url }); const p = this.s.pages[pageIdx], w = Math.min(sig ? 170 : 220, p.w * 0.5), h = (w * dim.h) / dim.w;
    return this.addAnn(pageIdx, { id: this.newId(), t: "img", key, x: (p.w - w) / 2, y: sig ? p.h - h - 90 : Math.min(60, p.h / 4), w, h, sig }, sig ? "Add signature" : "Add image");
  }
  async addSignature(dataUrl: string, pageIdx = this.s.cur) { const { bytes, mime } = dataUrlToBytes(dataUrl); await this.placeImage(bytes, mime, true, pageIdx); this.emit({ sigOpen: false, tool: "select" }, true); this.toast("ok", "Signature placed. Drag it into position."); }
  openSignature(open: boolean) { this.emit({ sigOpen: open }, true); }
  async cropImage(id: number, crop: number[]) {
    const f = this.findAnn(id); if (!f || f.a.t !== "img") return this.toast("err", "Select an image first.");
    const a = f.a, [l, t, r, b] = crop.map(n => clamp(+n || 0, 0, 90) / 100); if (l + r >= 0.95 || t + b >= 0.95) return this.toast("err", "That crop is too large.");
    if (!a.key) return this.toast("err", "Image key not found."); const src = this.images.get(a.key); if (!src || !src.url) return this.toast("err", "Image data is missing."); const im = new Image(); await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = src.url; });
    const sw = im.naturalWidth * (1 - l - r), sh = im.naturalHeight * (1 - t - b), cv = document.createElement("canvas"); cv.width = sw; cv.height = sh;
    cv.getContext("2d")!.drawImage(im, im.naturalWidth * l, im.naturalHeight * t, sw, sh, 0, 0, sw, sh);
    const { bytes } = dataUrlToBytes(cv.toDataURL("image/png")), key = "i" + this.imgId++ + "_c", url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/png" }));
    this.images.set(key, { bytes, mime: "image/png", url });
    this.mutate("Crop image", () => { (a as any).x += ((a as any).w || 0) * l; (a as any).y += ((a as any).h || 0) * t; (a as any).w *= 1 - l - r; (a as any).h *= 1 - t - b; a.key = key; }); this.toast("ok", "Image cropped.");
  }

  /* document-wide options */
  setOpt(k: keyof DocOpts, v: string, label?: string) { this.mutate(label || "Document option", () => { this.s.opts = { ...this.s.opts, [k]: v }; }); }
  async loadUniFont(file: File) {
    if (file.size > 8 * 1048576) return this.toast("err", "Font file is larger than 8 MB.");
    this.uni = new Uint8Array(await file.arrayBuffer()); try { await idbSet("dm_unifont", this.uni); } catch { /* session only */ }
    this.emit({ hasUni: true }, true); this.toast("ok", `Unicode font loaded: ${file.name}. It is used automatically for Hindi and other non-Latin text.`);
  }
  async initFont() { try { const b: any = await idbGet("dm_unifont"); if (b) { this.uni = b; this.emit({ hasUni: true }, true); } } catch { /* none */ } }

  /* search */
  async search(q: string) {
    const ql = q.toLowerCase(), hits: State["hits"] = {}, pages: number[] = [];
    this.emit({ busy: "Searching…" }, true);
    for (let n = 0; n < this.s.pages.length; n++) { const an = await this.analysis(n); if (!an) continue;
      const rs = an.lines.filter(l => l.str.toLowerCase().includes(ql)).map(l => { const r = this.phraseRect(l, ql); return { x: r.x, y: l.y ?? 0, w: r.w, h: l.h ?? (l.s || 12) }; }); if (rs.length) { hits[n] = rs; pages.push(n); } }
    this.emit({ busy: null, hits }, true);
    if (pages.length) { this.goTo(pages.includes(this.s.cur) ? this.s.cur : pages[0]); this.emit({ hits }, true); }
    return pages;
  }
  clearSearch() { this.emit({ hits: {} }, true); }
  async findAndReplaceAll(findText: string, replaceText: string, matchCase = false): Promise<{ count: number; pages: number[] }> {
    if (!findText) return { count: 0, pages: [] };
    const query = matchCase ? findText : findText.toLowerCase();
    let totalCount = 0;
    const affectedPages: number[] = [];

    this.checkpoint("Find and replace all");
    for (let pageIdx = 0; pageIdx < this.s.pages.length; pageIdx++) {
      let pageModified = false;
      const p = this.s.pages[pageIdx];

      // 1. Check existing text annotations on the page
      for (const ann of p.a) {
        if (ann.t === "text" && ann.text) {
          const hay = matchCase ? ann.text : ann.text.toLowerCase();
          if (hay.includes(query)) {
            const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
            const matches = ann.text.match(regex);
            if (matches) {
              totalCount += matches.length;
              ann.text = ann.text.replace(regex, replaceText);
              pageModified = true;
            }
          }
        }
      }

      // 2. Check original document lines
      const an = await this.analysis(pageIdx);
      if (an?.lines) {
        for (const line of an.lines) {
          const hay = matchCase ? line.str : line.str.toLowerCase();
          if (hay.includes(query)) {
            const existing = this.findLineAnn(pageIdx, line);
            if (!existing) {
              const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
              const matches = line.str.match(regex);
              if (matches) {
                totalCount += matches.length;
                const newStr = line.str.replace(regex, replaceText);
                const col = await this.lineStyle(pageIdx, line);
                const a = this.lineAnn(pageIdx, line, col);
                a.text = newStr;
                p.a.push(a);
                pageModified = true;
              }
            }
          }
        }
      }

      if (pageModified) {
        affectedPages.push(pageIdx + 1);
      }
    }

    this.emit();
    this.autosave();
    if (totalCount > 0) {
      this.toast("ok", `Replaced ${totalCount} occurrence${totalCount > 1 ? "s" : ""} across page${affectedPages.length > 1 ? "s" : ""} ${affectedPages.join(", ")}.`);
    } else {
      this.toast("info", `No occurrences found for "${findText}".`);
    }
    return { count: totalCount, pages: affectedPages };
  }
  phraseRect(l: Line, phraseLower: string): { x: number; w: number } {
    const i = l.str.toLowerCase().indexOf(phraseLower); if (i < 0) return { x: l.x, w: l.w };
    try { const ctx = document.createElement("canvas").getContext("2d")!, fam = l.font === "times" ? "Times New Roman, serif" : l.font === "courier" ? "Courier New, monospace" : "Arial, Helvetica, sans-serif";
      ctx.font = `${l.bold ? "bold " : ""}${l.s}px ${fam}`; const full = ctx.measureText(l.str).width || 1, pre = ctx.measureText(l.str.slice(0, i)).width, mid = ctx.measureText(l.str.slice(i, i + phraseLower.length)).width;
      return { x: l.x + (pre / full) * l.w, w: Math.max(2, (mid / full) * l.w) };
    } catch { return { x: l.x + (i / l.str.length) * l.w, w: (phraseLower.length / l.str.length) * l.w }; }
  }

  /* ------------------------------------------------------------ export + preview */
  async build(pages = this.s.pages) { return buildPdf({ pages, docs: this.docs, images: this.images, opts: this.s.opts, uniFont: this.uni }); }
  /** Build and parse the final bytes before they are offered as a download/save.
   *  This catches malformed exports and page-count regressions before the user loses time. */
  private async buildVerified(pages = this.s.pages): Promise<Uint8Array> {
    const bytes = await this.build(pages);
    if (!(bytes instanceof Uint8Array) || bytes.length < 8 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error("The PDF export did not produce a valid PDF file.");
    }
    const check = await loadPdf(bytes);
    try {
      if (check.pj.numPages !== pages.length) {
        throw new Error(`The exported PDF has ${check.pj.numPages} pages, but ${pages.length} were expected. No file was downloaded.`);
      }
    } finally {
      try { await check.pj.destroy(); } catch { /* parser cleanup is best effort */ }
    }
    return bytes;
  }
  async download(pages?: PageState[], fileName?: string): Promise<Exec> {
    if (!this.s.hasDoc) return { ok: false, message: "Open a PDF first." };
    try {
      const selectedPages = pages || this.s.pages;
      if (!selectedPages.length) throw new Error("A PDF must contain at least one page.");
      const bytes = await this.busy("Building and verifying your PDF…", () => this.buildVerified(selectedPages));
      const name = fileName || `${this.s.name}-edited.pdf`;
      saveBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      const msg = `Downloaded and verified ${name} (${(bytes.length / 1024).toFixed(0)} KB, ${selectedPages.length} page${selectedPages.length > 1 ? "s" : ""}).`;
      this.toast("ok", msg); return { ok: true, message: msg };
    } catch (e: any) { const msg = "Export failed: " + (e.message || "unknown error"); this.toast("err", msg); return { ok: false, message: msg }; }
  }
  async saveToDocuments() {
    try {
      if (!this.s.pages.length) throw new Error("A PDF must contain at least one page.");
      const bytes = await this.busy("Building and verifying your PDF…", () => this.buildVerified());
      await addDocument(new File([bytes as BlobPart], `${this.s.name}-edited.pdf`, { type: "application/pdf" }));
      this.toast("ok", "Saved a verified copy to My Documents.");
    } catch (e: any) { this.toast("err", "Could not save: " + e.message); }
  }
  setPreview(on: boolean) {
    this.emit({ preview: on, ...(on ? {} : { previewBusy: false }) }, true);
    if (on) this.schedulePreview(0);
    else { this.pvSeq++; clearTimeout(this.pvTimer); this.previewDoc = null; }
  }
  private schedulePreview(delay = 350) {
    clearTimeout(this.pvTimer);
    const seq = ++this.pvSeq;
    this.pvTimer = setTimeout(async () => {
      if (seq !== this.pvSeq || !this.s.preview || !this.s.hasDoc) return;
      this.emit({ previewBusy: true }, true);
      try {
        const bytes = await this.build();
        const d = await loadPdf(bytes);
        // A slower build must never overwrite a preview for newer edits/pages.
        if (seq !== this.pvSeq || !this.s.preview || !this.s.hasDoc) return;
        this.previewDoc = d;
        this.emit({ previewBusy: false, previewVer: this.s.previewVer + 1 }, true);
      } catch (e: any) {
        if (seq !== this.pvSeq) return;
        this.emit({ previewBusy: false, preview: false }, true);
        this.toast("err", "Preview failed: " + (e.message || "unknown error"));
      }
    }, delay);
  }

  /* ------------------------------------------------------------ voice: execution */
  private ctx(): ParseCtx { return { pageCount: this.s.pages.length, cur: this.s.cur + 1, hasSelection: this.s.sel != null || !!this.s.selBlock }; }
  private blockLabel(b: Block, p: number) { return `${b.kind === "paragraph" ? "the paragraph" : "the " + b.kind} on page ${p + 1}`; }
  private async resolveTarget(c: Cmd): Promise<{ refs: LineRef[]; anns: Ann[]; label: string; pages: number[]; block?: Block; phrase?: string }> {
    const tg = (c.target || "selection").trim(), page0 = c.page ? this.idx(c.page) : undefined;
    const noText = (p: number) => `I couldn't find any text on page ${p + 1}. If it is a scanned page, it needs OCR first (PDF Tools → OCR).`;
    if (tg === "selection") {
      if (this.s.sel != null) { const f = this.findAnn(this.s.sel); if (f) return { refs: [], anns: [f.a], label: "the selected item", pages: [this.s.pages.indexOf(f.p)] }; }
      if (this.s.selBlock) { const { page, id } = this.s.selBlock, b = (await this.analysis(page))?.blocks.find(x => x.id === id);
        if (b && b.lines) return { refs: b.lines.map(line => ({ page, line, block: b })), anns: [], label: this.blockLabel(b, page), pages: [page], block: b }; }
      throw new Clarify(c.hint === "paragraph" ? "Which paragraph do you mean? Click one on the page, or say “paragraph 2”, “the first paragraph”, or the exact words." : "Which element do you mean? Select it on the page first, or say “the title”, “paragraph 2”, or the exact words.", "target");
    }
    if (tg === "title" || tg === "heading") {
      const order = page0 !== undefined ? [page0] : tg === "title" ? [...new Set([this.s.cur, 0])] : [this.s.cur];
      for (const p of order) {
        const own = this.s.pages[p].a.filter(a => a.t === "text" && a.role === "heading").sort((a, b) => (a as any).y - (b as any).y)[0];
        if (own) return { refs: [], anns: [own], label: `the ${tg} on page ${p + 1}`, pages: [p] };
        const an = await this.analysis(p), pool = an?.blocks.filter(b => (tg === "title" ? b.kind === "title" : b.kind === "title" || b.kind === "heading")) || [];
        const b = tg === "heading" && c.ordinal ? pool[(c.ordinal === -1 ? pool.length : c.ordinal) - 1] : pool[0];
        if (b && b.lines) return { refs: b.lines.map(line => ({ page: p, line, block: b })), anns: [], label: `the ${tg} on page ${p + 1}`, pages: [p], block: b };
      }
      const p = order[0], an = await this.analysis(p);
      throw new Error(an && an.lines.length ? `I couldn't find a ${tg} on page ${p + 1}. Select the text and say “this heading”, or use the Edit text tool.` : noText(p));
    }
    if (tg === "paragraph") {
      const p = page0 ?? this.s.cur, an = await this.analysis(p), paras = an?.blocks.filter(b => b.kind === "paragraph") || [];
      if (!paras.length) throw new Error(an?.lines.length ? `I couldn't find a paragraph on page ${p + 1}.` : noText(p));
      let b: Block | undefined;
      if (c.ordinal) { b = paras[c.ordinal === -1 ? paras.length - 1 : c.ordinal - 1]; if (!b) throw new Error(`Page ${p + 1} has only ${paras.length} paragraph${paras.length > 1 ? "s" : ""}.`); }
      else if (paras.length === 1) b = paras[0];
      else throw new Clarify(`Which paragraph? Page ${p + 1} has ${paras.length}. Click one, or say “paragraph 2”, “the first paragraph” or “the last paragraph”.`, "target");
      if (b && b.lines) return { refs: b.lines.map(line => ({ page: p, line, block: b })), anns: [], label: `${c.ordinal ? (c.ordinal === -1 ? "the last paragraph" : "paragraph " + c.ordinal) : "the paragraph"} on page ${p + 1}`, pages: [p], block: b };
      throw new Error(`Unable to resolve paragraph on page ${p + 1}.`);
    }
    // a phrase: first page (current page first) that contains it
    const q = tg.toLowerCase(), order = page0 !== undefined ? [page0] : [this.s.cur, ...this.s.pages.map((_, i) => i).filter(i => i !== this.s.cur)];
    for (const p of order) { const an = await this.analysis(p), hits = an?.lines.filter(l => l.str.toLowerCase().includes(q)) || [];
      if (hits.length) return { refs: hits.map(line => ({ page: p, line, rect: this.phraseRect(line, q) })), anns: [], label: `“${tg}” on page ${p + 1}`, pages: [p], phrase: q }; }
    throw new Error(`I couldn't find “${tg}” ${page0 !== undefined ? "on page " + (page0 + 1) : "in this document"}. Check the spelling, or note that scanned pages need OCR first.`);
  }

  async execute(c: Cmd): Promise<Exec> {
    const S = this.s, ok = (message: string): Exec => ({ ok: true, message }), assumed = c.assumed ? ` (${c.assumed})` : "";
    if (!S.hasDoc && !["help", "undo", "redo", "confirm", "cancel", "set_tool"].includes(c.op)) throw new Error("Open a PDF first. Use Open PDF or drop a file here.");
    switch (c.op) {
      case "help": return ok(HELP);
      case "undo": return this.undo(); case "redo": return this.redo();
      case "download": return this.download();
      case "zoom_in": this.zoomBy(0.25); return ok(`Zoom ${Math.round(this.s.zoom * 100)}%.`);
      case "zoom_out": this.zoomBy(-0.25); return ok(`Zoom ${Math.round(this.s.zoom * 100)}%.`);
      case "zoom_fit": this.fitWidth(); return ok("Page fitted to width.");
      case "zoom_to": this.setZoom((c.value || 100) / 100); return ok(`Zoom ${c.value}%.`);
      case "goto": { const i = this.idx(c.page); this.goTo(i); return ok(`Showing page ${i + 1}.`); }
      case "set_tool": this.setTool(c.tool || "select"); return ok(`${c.tool} tool ready. ${HINTS[c.tool || "select"]}`);
      case "rotate_page": { const i = this.idx(c.page); this.rotatePage(i, c.deg || 90); this.goTo(i); return ok(`Rotated page ${i + 1}${assumed}.`); }
      case "delete_page": { const i = this.idx(c.page); this.deletePage(i); return ok(`Deleted page ${i + 1}${assumed}. Say “undo” to bring it back.`); }
      case "duplicate_page": { const i = this.idx(c.page); this.duplicatePage(i); return ok(`Duplicated page ${i + 1}; the copy is page ${i + 2}.`); }
      case "extract_page": { const i = this.idx(c.page); await this.extractPage(i); return ok(`Downloaded page ${i + 1} as its own PDF.`); }
      case "move_page": { const i = this.idx(c.page), to = c.to ? this.idx(c.to) : c.dir === "up" ? i - 1 : i + 1; if (to < 0 || to >= S.pages.length) throw new Error("That page can't move any further."); this.movePage(i, to); return ok(`Moved page ${i + 1} to position ${to + 1}.`); }
      case "add_blank": { const i = c.page ? this.idx(c.page) : S.cur; this.addBlank(i); return ok(`Added a blank page after page ${i + 1}; it is now page ${i + 2}.`); }
      case "add_text": {
        const i = c.page ? this.idx(c.page) : S.cur, p = S.pages[i], w = p.w - 96, head = c.kind === "heading", size = c.size || (head ? 28 : S.fmt.size), pos = c.position || (head ? "top" : "");
        let y = 40; if (pos === "bottom" || pos === "end") y = p.h - 40 - size * 1.4; else if (pos === "center") y = p.h / 2 - size;
        else if (!head) y = 48 + p.a.filter(a => a.t === "text" && !a.cover).length * (size * 1.6 + 6);
        let overlap = false; const an = await this.analysis(i); if (an) overlap = an.blocks.some(b => b.x < 48 + w && b.x + b.w > 48 && b.y < y + size * 1.3 && b.y + b.h > y);
        if (!head && !pos && an) { const last = an.blocks[an.blocks.length - 1]; if (last && !p.a.some(a => a.t === "text" && !a.cover)) y = Math.min(p.h - 60, last.y + last.h + 18); }
        const a = this.fmtText({ x: 48, y, w, text: c.text || "", size, bold: head ? true : S.fmt.bold, role: head ? "heading" : undefined, font: head ? "helv" : S.fmt.font, align: S.fmt.align });
        this.addAnn(i, a, head ? "Add heading" : "Add text"); this.goTo(i); this.emit({ sel: a.id }, true);
        return ok(`Added ${head ? "the heading" : "the text"} “${c.text}” ${pos ? "at the " + pos + " " : ""}of page ${i + 1}.${overlap ? " It overlaps existing content there, so drag it where you want it." : ""}`);
      }
      case "add_comment": { const i = c.page ? this.idx(c.page) : S.cur; const n = S.pages[i].a.filter(a => a.t === "note").length; this.addAnn(i, { id: this.newId(), t: "note", x: 40, y: 40 + n * 56, text: c.text || "Comment" }, "Add comment"); this.goTo(i); return ok(`Added a comment on page ${i + 1}.`); }
      case "add_shape": { const i = c.page ? this.idx(c.page) : S.cur, p = S.pages[i], k = c.shape || "rect"; this.addAnn(i, { id: this.newId(), t: "shape", k, x1: p.w * 0.25, y1: p.h * 0.3, x2: p.w * 0.75, y2: p.h * (k === "line" || k === "arrow" ? 0.3 : 0.42), stroke: c.color || S.fmt.stroke, fill: S.fmt.fill, sw: S.fmt.sw }, "Add shape"); this.goTo(i); return ok(`Added ${k === "ell" ? "an ellipse" : k === "rect" ? "a rectangle" : "a " + k} on page ${i + 1}. Drag to move it; use the handles to resize.`); }
      case "add_signature": { const i = c.page ? this.idx(c.page) : S.cur; this.goTo(i); const saved = safeStorage.getItem("dm_signature");
        if (saved) { await this.addSignature(saved, i); return ok(`Placed your saved signature on page ${i + 1}. Drag it into position.`); } this.openSignature(true); return ok("Signature pad opened. Draw or type your signature, then tap Use signature. Voice can't draw it for you."); }
      case "add_image": this.emit({ hint: "Tap the Image button in the toolbar to choose a file." }, true); return ok("Tap the Image button in the toolbar. Browsers don't let voice commands open the file picker, so this one step is manual.");
      case "crop_image": { const id = S.sel; if (id == null || this.findAnn(id)?.a.t !== "img") throw new Error("Select the image you want to crop first."); await this.cropImage(id, c.crop || [0, 0, 0, 0]); return ok("Cropped the image."); }
      case "watermark": this.setOpt("wm", (c.text || "").trim(), c.text ? "Watermark" : "Remove watermark"); return ok(c.text ? `Watermark “${c.text}” will appear on every page of the export.` : "Watermark removed.");
      case "page_numbers": this.setOpt("pn", c.text === "" ? "" : c.text || "Page {n} of {N}", "Page numbers"); return ok(c.text === "" ? "Page numbers removed." : "Page numbers added to the bottom of every page.");
      case "set_header": this.setOpt("hd", c.text || "", "Header"); return ok(c.text ? `Header set to “${c.text}”.` : "Header removed.");
      case "set_footer": this.setOpt("ft", c.text || "", "Footer"); return ok(c.text ? `Footer set to “${c.text}”.` : "Footer removed.");
      case "set_background": if (c.color && !/^#[0-9a-f]{6}$/i.test(c.color)) throw new Error("I need a colour like #FFF8E1."); this.setOpt("bg", c.color || "", "Page background"); return ok(c.color ? "Page background applied (it tints the page; text stays readable)." : "Page background removed.");
      case "show_history": this.setPanel("document"); return ok("Edit history is in the Document tab.");
      case "search": { const pages = await this.search(c.text || ""); return pages.length ? ok(`“${c.text}” found on page${pages.length > 1 ? "s" : ""} ${pages.map(n => n + 1).join(", ")}.`) : { ok: false, message: `No matches for “${c.text}”. Scanned pages have no text until they are run through OCR.` }; }
      case "highlight": case "underline": case "strikethrough": {
        const r = await this.resolveTarget(c), kind = c.op === "highlight" ? "hl" : c.op === "underline" ? "ul" : "st";
        if (!r.refs.length) throw new Error(`I can only ${c.op} text that is part of the PDF. Select a paragraph or say the words.`);
        const segs = r.refs.map(x => ({ x: x.rect ? x.rect.x : x.line.x, w: x.rect ? x.rect.w : x.line.w, line: x.line }));
        this.addMarkup(r.pages[0], kind, segs, c.color); this.goTo(r.pages[0]);
        return ok(`${c.op === "highlight" ? "Highlighted" : c.op === "underline" ? "Underlined" : "Struck through"} ${r.label}.`);
      }
      case "set_font": case "set_style": {
        const patch: Record<string, any> = {}; for (const k of ["color", "bold", "italic", "underline", "size", "delta", "align", "font"] as const) if ((c as any)[k] !== undefined) patch[k] = (c as any)[k];
        if (!Object.keys(patch).length) throw new Error("I didn't hear what style to apply. Try a colour, bold, italic, a size, or an alignment.");
        const r = await this.resolveTarget(c), label = "Format " + r.label.replace(/^the /, "");
        if (r.refs.length) { if (r.refs[0].line.str && patch.align && patch.align !== "left" && !r.block) delete patch.align; await this.restyleLines(r.refs, patch, label); this.goTo(r.pages[0]); }
        else { let any = false; this.checkpoint(label); for (const a of r.anns) any = this.styleAnn(a, patch, true) || any; if (!any) { this.U.pop(); throw new Error(`That item can't take this style (${r.label}). Text, shapes, drawings and highlights can be recoloured.`); } this.emit(); this.autosave(); this.goTo(r.pages[0]); }
        const bits = [patch.color && "colour", patch.bold !== undefined && "weight", patch.italic !== undefined && "italics", (patch.size || patch.delta) && "size", patch.align && "alignment", patch.font && "font"].filter(Boolean).join(" and ");
        const lim = r.refs.length ? " The original text is covered and redrawn in the closest built-in font (Helvetica, Times or Courier)." : "";
        return ok(`Changed the ${bits} of ${r.label}.${lim}`);
      }
      case "replace_text": {
        if (!c.text) throw new Clarify("What should the new text say?", "text");
        const r = await this.resolveTarget({ ...c, hint: undefined });
        if (r.block) { await this.replaceBlock(r.pages[0], r.block, c.text); this.goTo(r.pages[0]); return ok(`Replaced ${r.label}. The original is covered and the new text uses the closest built-in font.`); }
        if (r.phrase) { const ref = r.refs[0], line = ref.line, newStr = line.str.replace(new RegExp(r.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), c.text);
          const col = await this.lineStyle(ref.page, line), a = this.lineAnn(ref.page, line, col); a.text = newStr; this.s.pages[ref.page].a = this.s.pages[ref.page].a.filter(x => !(x.t === "text" && x.ref === a.ref));
          this.addAnn(ref.page, a, "Replace text"); this.goTo(ref.page); return ok(`Replaced “${c.target}” with “${c.text}” on page ${ref.page + 1}${r.refs.length > 1 ? ` (first matching line; ${r.refs.length} lines contain it)` : ""}.`); }
        const a = r.anns[0]; if (a?.t === "text") { this.patchAnn(a.id, { text: c.text }, "Replace text", false); return ok("Replaced the text."); }
        throw new Error("I can only replace text.");
      }
      case "delete_target": {
        const r = await this.resolveTarget(c);
        if (r.refs.length) { await this.eraseLines(r.refs); this.goTo(r.pages[0]); return ok(`Deleted ${r.label}. It is covered in the export; say “undo” to restore it.`); }
        r.anns.forEach(a => this.deleteAnn(a.id)); return ok("Deleted the selected item.");
      }
      case "find_replace": {
        const fText = (c as any).find || (c as any).target || "";
        const rText = (c as any).replace || (c as any).text || "";
        if (!fText) throw new Clarify("What text should be replaced?", "text");
        const res = await this.findAndReplaceAll(fText, rText);
        return ok(`Replaced ${res.count} occurrence${res.count === 1 ? "" : "s"} of “${fText}” with “${rText}”.`);
      }
      case "bring_to_front": {
        if (S.sel == null) throw new Error("Select an item first to bring it to front.");
        this.bringToFront(S.sel);
        return ok("Moved item to the front.");
      }
      case "send_to_back": {
        if (S.sel == null) throw new Error("Select an item first to send it to back.");
        this.sendToBack(S.sel);
        return ok("Moved item to the back.");
      }
      case "rotate_ann": {
        if (S.sel == null) throw new Error("Select an item first to rotate it.");
        const deg = (c as any).deg || (c as any).degrees || 90;
        this.rotateAnn(S.sel, deg);
        return ok(`Rotated item by ${deg}°.`);
      }
      default: throw new Error(`I don't know how to “${c.op.replace(/_/g, " ")}” yet. ${HELP}`);
    }
  }

  /* ------------------------------------------------------------ voice: conversation flow */
  private logAdd(e: VoiceEntry) { this.emit({ log: [...this.s.log.slice(-39), e] }, true); }
  private logSet(id: number, patch: Partial<VoiceEntry>) { this.emit({ log: this.s.log.map(e => (e.id === id ? { ...e, ...patch } : e)) }, true); }
  clearLog() { this.emit({ log: [], pending: null, clarify: null }, true); }
  private async finish(id: number, cmd: Cmd): Promise<Exec> {
    try {
      const r = await this.execute(cmd);
      this.logSet(id, { status: r.ok ? "done" : "error", message: r.message, cmd });
      if (!r.ok) {
        this.toast("err", r.message);
      } else {
        if (cmd.op !== "download") this.toast("ok", r.message.split(". ")[0]);
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            const vocal = new SpeechSynthesisUtterance(r.message.split(". ")[0]);
            const vl = safeStorage.getItem("dm_voice_lang");
            if (vl && vl !== "auto") vocal.lang = vl;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(vocal);
          } catch { /* TTS fallback */ }
        }
      }
      return r;
    } catch (e: any) {
      if (e instanceof Clarify) { this.emit({ clarify: { question: e.question, partial: cmd, need: e.need, entry: id } }, true); this.logSet(id, { status: "clarify", message: e.question }); return { ok: false, message: e.question }; }
      this.logSet(id, { status: "error", message: e.message }); this.toast("err", e.message); return { ok: false, message: e.message };
    }
  }
  async confirmPending(yes: boolean) {
    const p = this.s.pending; if (!p) return; this.emit({ pending: null }, true);
    if (!yes) { this.logSet(p.entry, { status: "cancelled", message: "Cancelled. Nothing was changed." }); return; }
    this.logSet(p.entry, { status: "running", message: "Working…" }); await this.finish(p.entry, p.cmd);
  }
  cancelClarify() { const c = this.s.clarify; if (!c) return; this.emit({ clarify: null }, true); this.logSet(c.entry, { status: "cancelled", message: "Cancelled." }); }

  /** Entry point for every spoken or typed command. */
  async runUtterance(raw: string, o: { source?: "voice" | "text"; ai?: { consent: boolean; lang: string } | null } = {}): Promise<Exec & { handled: boolean }> {
    const heard = raw.trim(); if (!heard) return { ok: false, handled: false, message: "" };
    // Give app-level hook first chance (navigation, sign-out, etc.)
    if (this.pre) {
      const appResult = await this.pre(heard);
      if (appResult !== null) {
        const id = this.logId++;
        this.logAdd({ id, heard, interpreted: "App command", status: "done", message: appResult, source: o.source || "text" });
        return { ok: true, handled: true, message: appResult };
      }
    }
    const id = this.logId++, src = o.source || "text"; this.logAdd({ id, heard, interpreted: "Understanding…", status: "running", message: "", source: src });
    const ctx = this.ctx(); let res: ReturnType<typeof parseCommand>;
    const p = this.s.pending, cl = this.s.clarify;
    if (p) { const r = parseCommand(heard, ctx);
      if ("cmd" in r && r.cmd.op === "confirm") { this.logSet(id, { interpreted: "Confirm", status: "done", message: "Confirmed." }); await this.confirmPending(true); return { ok: true, handled: true, message: "Confirmed." }; }
      if ("cmd" in r && r.cmd.op === "cancel") { this.logSet(id, { interpreted: "Cancel", status: "done", message: "Cancelled." }); await this.confirmPending(false); return { ok: true, handled: true, message: "Cancelled." }; }
      await this.confirmPending(false); }
    if (cl) {
      const r = parseCommand(heard, ctx);
      if ("cmd" in r && r.cmd.op === "cancel") { this.logSet(id, { interpreted: "Cancel", status: "done", message: "Cancelled." }); this.cancelClarify(); return { ok: true, handled: true, message: "Cancelled." }; }
      if ("none" in r || ("cmd" in r && r.cmd.op === "confirm")) { this.emit({ clarify: null }, true); this.logSet(cl.entry, { status: "cancelled", message: "Answered below." }); res = fillClarification(cl, heard, ctx); }
      else { this.emit({ clarify: null }, true); this.logSet(cl.entry, { status: "cancelled", message: "Replaced by a new command." }); res = r; }
    } else res = parseCommand(heard, ctx);

    if ("none" in res || this.s.voiceMode === "convo") {
      try {
        const an = await this.analysis(this.s.cur);
        const outline = an ? an.blocks.slice(0, 15).map(b => `${b.kind}: ${b.text.slice(0, 70)}`).join("; ") : "";
        let selText = "";
        if (this.s.sel != null) {
          const ann = this.findAnn(this.s.sel)?.a;
          if (ann?.text) selText = ann.text;
        } else if (this.s.selBlock) {
          const blk = this.peek(this.s.selBlock.page)?.blocks.find((b: any) => b.id === this.s.selBlock!.id);
          if (blk?.text) selText = blk.text;
        }

        const r = await postJson("/ai/voice-assistant", {
          utterance: heard,
          mode: this.s.voiceMode,
          language: (o.ai?.lang || "en-IN").split("-")[0],
          page_count: Math.max(1, this.s.pages.length),
          current_page: this.s.cur + 1,
          context: outline.slice(0, 2000),
          has_selection: this.s.sel != null || this.s.selBlock != null,
          selected_text: selText,
        });

        if (r.type === "convo") {
          this.logSet(id, { interpreted: "AI Conversation", status: "done", message: r.reply, source: "ai" });
          if (this.s.ttsEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
            try {
              const vocal = new SpeechSynthesisUtterance(r.spoken || r.reply.slice(0, 180));
              const vl = safeStorage.getItem("dm_voice_lang");
              if (vl && vl !== "auto") vocal.lang = vl;
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(vocal);
            } catch { /* TTS error ignored */ }
          }
          return { ok: true, handled: true, message: r.reply };
        }

        if (r.command) {
          const cmd = r.command as Cmd;
          this.logSet(id, { interpreted: cmd.op === "clarify" ? "Needs clarification" : describe(cmd, ctx) + " (AI)", source: "ai" });
          if (cmd.op === "clarify") {
            const q = (cmd as any).question || r.reply || "Could you please rephrase that instruction?";
            this.emit({ clarify: { question: q, partial: { op: "clarify" }, need: "text", entry: id } }, true);
            this.logSet(id, { status: "clarify", message: q });
            return { ok: false, handled: true, message: q };
          }
          if (r.needs_confirmation || cmd.op === "delete_page") {
            this.emit({ pending: { cmd, entry: id } }, true);
            this.logSet(id, { status: "confirm", message: r.reply || "Please confirm this change." });
            return { ok: true, handled: true, message: "Waiting for confirmation." };
          }
          const x = await this.finish(id, cmd);
          if (r.spoken && this.s.ttsEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
            try {
              const vocal = new SpeechSynthesisUtterance(r.spoken);
              const vl = safeStorage.getItem("dm_voice_lang");
              if (vl && vl !== "auto") vocal.lang = vl;
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(vocal);
            } catch { /* TTS error ignored */ }
          }
          return { ...x, handled: true };
        }
      } catch (e: any) {
        // Fall back to rule-based messages
      }
      const msg = "I didn't understand that command. Try saying 'rotate this page', 'add heading Report', or switch to Conversation mode to ask questions.";
      this.logSet(id, { interpreted: "Not understood", status: "error", message: msg });
      return { ok: false, handled: false, message: msg };
    }
    if ("clarify" in res) { this.emit({ clarify: { ...res.clarify, entry: id } }, true); this.logSet(id, { interpreted: "Needs more information", status: "clarify", message: res.clarify.question }); return { ok: false, handled: true, message: res.clarify.question }; }
    let cmd = res.cmd; this.logSet(id, { interpreted: describe(cmd, ctx) });
    if (cmd.op === "confirm" || cmd.op === "cancel") { this.logSet(id, { status: "done", message: "There is nothing waiting for confirmation." }); return { ok: true, handled: true, message: "Nothing to confirm." }; }
    if (cmd.page !== undefined && (cmd.page < 1 || cmd.page > this.s.pages.length) && this.s.hasDoc) { const m = `Page ${cmd.page} doesn't exist. This document has ${this.s.pages.length} page${this.s.pages.length > 1 ? "s" : ""}.`; this.logSet(id, { status: "error", message: m }); return { ok: false, handled: true, message: m }; }
    if (cmd.op === "delete_page" && this.s.hasDoc) { this.emit({ pending: { cmd, entry: id } }, true); this.logSet(id, { status: "confirm", message: "Deleting a page needs confirmation. Say “confirm” or tap Confirm. You can undo it afterwards." }); return { ok: true, handled: true, message: "Waiting for confirmation." }; }
    const x = await this.finish(id, cmd); return { ...x, handled: true };
  }

  /* ------------------------------------------------------------ microphone */
  startMic(o: { lang: string; ai?: { consent: boolean; lang: string } | null }) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const fail = (state: MicState["state"], error: string) => this.emit({ mic: { ...this.s.mic, state, interim: "", error } }, true);
    if (!SR) return fail("unsupported", "Speech recognition isn't available in this browser. Use Chrome, Edge or Safari, or type the command below.");
    if (!window.isSecureContext) return fail("unsupported", "The microphone needs a secure page (https or localhost). Type the command instead.");
    this.stopMic(); const r = new SR(); this.sr = r; let got = false, submitted = false;
    r.lang = o.lang === "auto" ? "en-IN" : o.lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onstart = () => this.emit({ mic: { ...this.s.mic, state: "listening", error: "", interim: "" } }, true);
    r.onresult = (e: any) => { let interim = "", fin = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else interim += t; }
      if (fin && !submitted) { submitted = true; got = true; this.emit({ mic: { ...this.s.mic, interim: "" } }, true); void this.runUtterance(fin, { source: "voice", ai: o.ai }); } else this.emit({ mic: { ...this.s.mic, interim } }, true); };
    r.onerror = (e: any) => { const m: Record<string, string> = {
        "not-allowed": "Microphone access is blocked. Click the lock icon in the address bar, allow the microphone for this site, then tap the mic again.",
        "service-not-allowed": "This browser blocked speech recognition for this site. Allow the microphone in site settings, or type the command.",
        "no-speech": "I didn't hear anything. Tap the mic and speak right after it starts listening.", "audio-capture": "No microphone was found. Connect one, or type the command.",
        network: "Speech recognition couldn't reach its service (the browser sends audio to an online service). Check your connection, or type the command." };
      if (e.error === "aborted") return; fail(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : "idle", m[e.error] || "Speech error: " + e.error); };
    r.onend = () => {
      // A previous recognition session can fire `onend` after a new session starts.
      // Only clear the active handle when this exact instance still owns it.
      const wasActive = this.sr === r;
      // An older recognition instance can end after the user has restarted the mic.
      // It must not overwrite the newer session's listening state or restart it.
      if (!wasActive) return;
      this.sr = null;
      const mic = this.s.mic;
      if (mic.state === "denied") return;
      this.emit({ mic: { ...mic, state: "idle", interim: "" } }, true);
      if (wasActive && mic.handsFree && got && !mic.error) {
        setTimeout(() => {
          if (!this.sr && this.s.mic.handsFree && this.s.mic.state === "idle") this.startMic(o);
        }, 250);
      }
    };
    this.emit({ mic: { ...this.s.mic, state: "starting", error: "" } }, true);
    try { r.start(); } catch { fail("idle", "Could not start the microphone. Tap again."); }
  }
  stopMic() { try { this.sr?.stop(); } catch { /* already stopped */ } this.sr = null; if (this.s.mic.state === "listening" || this.s.mic.state === "starting") this.emit({ mic: { ...this.s.mic, state: "idle", interim: "" } }, true); }
  setHandsFree(v: boolean) { this.emit({ mic: { ...this.s.mic, handsFree: v } }, true); }
}

export const editorStore = new EditorStore();
export const useEditor = () => useSyncExternalStore(editorStore.subscribe, editorStore.get);
export type { Align, FontKey };
