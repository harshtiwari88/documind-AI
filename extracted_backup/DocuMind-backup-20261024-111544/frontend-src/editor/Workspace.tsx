import { useEffect, useRef, useState } from "react";
import { editorStore as store, useEditor } from "./store";
import { Icon } from "./icons";
import PageView, { Spinner } from "./PageView";
import PagesRail from "./PagesRail";
import { DocumentPanel, FormatPanel } from "./Panels";
import VoicePanel from "./VoicePanel";
import type { Tool } from "./types";
import { list as listDocs } from "../lib/docs";
import type { Doc } from "../lib/docs";
import { useAppCommands } from "../lib/useAppCommands";
import { localParse } from "../lib/localNav";

const TOOLS: [Tool, string, string][] = [["select", "cursor", "Select"], ["text", "text", "Text"], ["edit", "edit", "Edit text"], ["erase", "erase", "Delete text"], ["hl", "hl", "Highlight"], ["ul", "ul", "Underline"], ["st", "st", "Strike"], ["draw", "draw", "Draw"], ["shape", "shape", "Shapes"], ["note", "note", "Comment"]];
type Tab = "pages" | "format" | "document" | "voice";

function TB({ icon, label, onClick, on, disabled, primary, showLabel = true }: { icon: string; label: string; onClick: () => void; on?: boolean; disabled?: boolean; primary?: boolean; showLabel?: boolean }) {
  return <button className={`tbtn ${on ? "tbtn-on" : ""} ${primary ? "tbtn-primary" : ""}`} aria-pressed={on === undefined ? undefined : on} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
    <Icon n={icon} />{showLabel && <span className="hidden text-xs 2xl:inline">{label}</span>}</button>;
}
const Sep = () => <span className="mx-1 h-6 w-px shrink-0 bg-white/10" aria-hidden />;

/* ------------------------------------------------------------ signature pad */
function SignaturePad() {
  const cv = useRef<HTMLCanvasElement>(null), [mode, setMode] = useState<"draw" | "type">("draw"), [name, setName] = useState(""), [font, setFont] = useState("'Brush Script MT', 'Segoe Script', cursive"), [dirty, setDirty] = useState(false), [keep, setKeep] = useState(true), drawing = useRef(false);
  const ctx = () => cv.current!.getContext("2d")!;
  useEffect(() => { const c = ctx(); c.lineWidth = 3; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#111"; }, []);
  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.current!.width, ((e.clientY - r.top) / r.height) * cv.current!.height]; };
  const clear = () => { ctx().clearRect(0, 0, cv.current!.width, cv.current!.height); setDirty(false); };
  const typed = () => { clear(); if (!name.trim()) return; const c = ctx(); c.fillStyle = "#111"; c.font = `64px ${font}`; c.textBaseline = "middle"; c.fillText(name, 20, 100, 560); setDirty(true); };
  useEffect(() => { if (mode === "type") typed(); }, [name, font, mode]);
  function use() {
    const c = cv.current!, d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 <= x0) return store.toast("err", "Draw or type your signature first.");
    const pad = 6, out = document.createElement("canvas"); out.width = x1 - x0 + 2 * pad; out.height = y1 - y0 + 2 * pad; out.getContext("2d")!.drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    const url = out.toDataURL("image/png"); if (keep) { try { localStorage.setItem("dm_signature", url); } catch { /* storage full */ } }
    store.addSignature(url);
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Signature" onClick={() => store.openSignature(false)}>
      <div className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-700/50 bg-[#111a2e] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-display text-xl">Add your signature</h2><button className="tbtn" aria-label="Close" onClick={() => store.openSignature(false)}><Icon n="x" /></button></div>
        <div className="flex gap-1.5" role="tablist">{(["draw", "type"] as const).map(m => <button key={m} role="tab" aria-selected={mode === m} className={`btn flex-1 ${mode === m ? "btn-p" : ""}`} onClick={() => { clear(); setMode(m); }}>{m === "draw" ? "Draw" : "Type"}</button>)}</div>
        {mode === "type" && <div className="grid grid-cols-[1fr_auto] gap-2"><input className="input" autoFocus placeholder="Type your name" value={name} onChange={e => setName(e.target.value)} aria-label="Signature text" />
          <select className="input !w-auto" value={font} onChange={e => setFont(e.target.value)} aria-label="Signature style"><option value="'Brush Script MT', 'Segoe Script', cursive">Script</option><option value="'Snell Roundhand', 'Lucida Handwriting', cursive">Formal</option><option value="'Comic Sans MS', 'Marker Felt', cursive">Casual</option></select></div>}
        <canvas ref={cv} width={600} height={200} className="w-full touch-none rounded-xl bg-white" style={{ cursor: mode === "draw" ? "crosshair" : "default" }} aria-label="Signature area"
          onPointerDown={e => { if (mode !== "draw") return; drawing.current = true; cv.current!.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx().beginPath(); ctx().moveTo(x, y); ctx().lineTo(x + 0.1, y + 0.1); ctx().stroke(); setDirty(true); }}
          onPointerMove={e => { if (!drawing.current) return; const [x, y] = pos(e); ctx().lineTo(x, y); ctx().stroke(); }} onPointerUp={() => { drawing.current = false; }} />
        <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" className="accent-brand-400" checked={keep} onChange={e => setKeep(e.target.checked)} />Remember it on this device so “add my signature” works by voice</label>
        <div className="flex gap-2"><button className="btn" onClick={clear} disabled={!dirty}>Clear</button><button className="btn btn-p flex-1" onClick={use}><Icon n="check" size={16} />Use signature</button></div>
      </div>
    </div>
  );
}


function LinkDialog({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState("Open link"), [url, setUrl] = useState("https://"), [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { store.addLink(label, url); store.toast("ok", "Hyperlink added. Select it to move or resize, then export the PDF."); onClose(); }
    catch (x: any) { setError(x?.message || "Could not add the link."); }
  };
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Add hyperlink" onClick={onClose}>
    <form className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700/60 bg-[#111a2e] p-5 shadow-2xl" onSubmit={submit} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold">Add hyperlink</h2><p className="mt-1 text-xs text-slate-400">Creates a clickable link area on the current page.</p></div><button type="button" className="tbtn" aria-label="Close" onClick={onClose}><Icon n="x" /></button></div>
      <div><label className="lbl" htmlFor="link-label">Display text</label><input id="link-label" className="input" value={label} onChange={e => setLabel(e.target.value)} maxLength={160} placeholder="Open website" /></div>
      <div><label className="lbl" htmlFor="link-url">Destination URL</label><input id="link-url" className="input" type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" /></div>
      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-p"><Icon n="link" size={16} />Add link</button></div>
    </form>
  </div>;
}

/* ------------------------------------------------------------ empty state */
function Welcome({ onOpen }: { onOpen: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  useEffect(() => { listDocs().then(setDocs).catch(() => {}); }, []);
  const features: [string, string, string][] = [["edit", "Edit anything", "Text, highlight, shapes, images, signatures"], ["pages", "Manage pages", "Add, rotate, reorder, delete"], ["mic", "Speak to edit", "“Add a heading at the top”"]];
  return (
    <div className="mx-auto flex h-full max-w-3xl animate-rise flex-col items-center justify-center gap-7 p-6 text-center">
      <div className="grid h-20 w-20 animate-floaty place-items-center rounded-3xl bg-brand-600 shadow-glow"><Icon n="pages" size={36} /></div>
      <div><span className="badge">Private · runs in your browser</span>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Open a PDF to start editing</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Drop a file anywhere on this screen, or pick one. Edit with tools or just tell the assistant what to change.</p></div>
      <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row"><button className="btn btn-p flex-1" onClick={onOpen}><Icon n="open" size={16} />Open PDF</button><button className="btn flex-1" onClick={() => store.newBlank()}><Icon n="plus" size={16} />New blank PDF</button></div>
      <div className="grid w-full gap-3 sm:grid-cols-3">{features.map(([ic, t, d]) => <div key={t} className="card !p-4 text-start"><span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300"><Icon n={ic} size={18} /></span><div className="text-sm font-medium">{t}</div><div className="mt-0.5 text-xs text-slate-400">{d}</div></div>)}</div>
      {docs.length > 0 && <div className="w-full max-w-md text-start"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent documents</h2>
        <ul className="space-y-1.5">{docs.slice(0, 5).map(d => <li key={d.id}><button className="card-hover flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 px-3.5 py-2.5 text-start text-sm" onClick={() => store.openFile(new File([d.file], d.name, { type: "application/pdf" }), true, d.id)}><Icon n="pages" size={16} className="shrink-0 text-brand-400" /><span className="min-w-0 flex-1 truncate">{d.name}</span><span className="shrink-0 text-xs text-slate-500">{(d.size / 1024).toFixed(0)} KB</span></button></li>)}</ul></div>}
    </div>
  );
}

/* ------------------------------------------------------------ workspace */
export default function Workspace({ docId, initialTab }: { docId?: string | null; initialTab?: Tab }) {
  const S = useEditor(), openRef = useRef<HTMLInputElement>(null), imgRef = useRef<HTMLInputElement>(null), stage = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab | null>(null), [drag, setDrag] = useState(false), [linkOpen, setLinkOpen] = useState(false), { run: runApp, isApp } = useAppCommands();
  const desk: Exclude<Tab, "pages"> = S.panel;
  const pickTab = (t: Tab) => { if (t !== "pages") store.setPanel(t); setTab(cur => (cur === t ? null : t)); };

  // initial panel for the Voice Studio route
  useEffect(() => { if (initialTab && initialTab !== "pages") { store.setPanel(initialTab); setTab(initialTab === "voice" ? "voice" : null); } }, [initialTab]);

  // open the document from ?doc=… unless it is already open (so edits survive switching pages)
  useEffect(() => {
    if (!docId) return; const s = store.get(); if (s.hasDoc && s.docKey === docId) return;
    (async () => { const d = (await listDocs()).find(x => x.id === docId); if (!d) return store.toast("err", "That document is no longer in My Documents."); await store.openFile(new File([d.file], d.name, { type: "application/pdf" }), true, docId); })();
  }, [docId]);

  // app-level voice commands ("open settings", "sign out") also work from the editor mic
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { store.pre = async raw => { const l = localParse(raw); if (l && isApp(l.op)) return (await runApp(l)) || "Done."; return null; }; return () => { store.pre = null; store.stopMic(); }; }, []);
  useEffect(() => { store.initFont(); }, []);
  // commands sent from the floating dock / other pages run through the same editing engine
  useEffect(() => {
    (window as any).__dmEditor = true;
    const h = (e: any) => { store.execute(e.detail).then(r => { if (!r.ok) store.toast("err", r.message); }).catch((x: any) => store.toast("err", x.message)); };
    addEventListener("dm-cmd", h);
    return () => { delete (window as any).__dmEditor; removeEventListener("dm-cmd", h); };
  }, []);

  // keep "fit to width" in sync with the stage size
  useEffect(() => { const el = stage.current; if (!el) return; const ro = new ResizeObserver(() => store.setStage(el.clientWidth)); ro.observe(el); store.setStage(el.clientWidth); return () => ro.disconnect(); }, [S.hasDoc]);

  // keyboard shortcuts (ignored while typing)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t.closest("input, textarea, select, [contenteditable]")) return; const mod = e.ctrlKey || e.metaKey, s = store.get();
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); const r = e.shiftKey ? store.redo() : store.undo(); if (!r.ok) store.toast("info", r.message); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); store.redo(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); store.download(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && s.sel != null && s.editing == null) { e.preventDefault(); store.deleteAnn(s.sel); }
      else if (e.key === "Escape") { setLinkOpen(false); store.setTool("select"); store.select(null); store.selectBlock(0, null); }
      else if (!mod && !e.altKey && s.hasDoc) {
        const shortcuts: Record<string, Tool> = { v: "select", t: "text", e: "edit", h: "hl", u: "ul", d: "draw", g: "shape", n: "note" };
        const tool = shortcuts[e.key.toLowerCase()]; if (tool) { store.setTool(tool); }
        else if (e.key === "Delete" || e.key === "Backspace") { if (s.sel != null && s.editing == null) { e.preventDefault(); store.deleteAnn(s.sel); } }
        else if (e.key === "PageDown") store.goTo(s.cur + 1); else if (e.key === "PageUp") store.goTo(s.cur - 1);
      }
      else if (e.key === "PageDown") store.goTo(s.cur + 1); else if (e.key === "PageUp") store.goTo(s.cur - 1);
      else if (mod && e.shiftKey && e.key === "ArrowRight" && s.hasDoc) { e.preventDefault(); store.rotatePage(s.cur, 90); }
      else if (mod && e.shiftKey && e.key === "ArrowLeft" && s.hasDoc) { e.preventDefault(); store.rotatePage(s.cur, -90); }
    };
    addEventListener("keydown", h); return () => removeEventListener("keydown", h);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (!f) return;
    if (f.type.startsWith("image/")) store.addImageFile(f); else store.openFile(f);
  };
  const panel = (which: Exclude<Tab, "pages">) => which === "format" ? <FormatPanel /> : which === "document" ? <DocumentPanel /> : <VoicePanel />;
  const tabBtn = (t: Tab, icon: string, label: string, desktop = false) => {
    const on = desktop ? desk === t : tab === t;
    return <button key={t} role="tab" aria-selected={on} onClick={() => (desktop ? store.setPanel(t as any) : pickTab(t))} className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition ${on ? "border-b-2 border-brand-400 text-white" : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"}`}>
      <Icon n={icon} size={16} />{label}{t === "voice" && (S.mic.state === "listening") && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}</button>;
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0b1220]" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={e => { if (e.currentTarget === e.target) setDrag(false); }} onDrop={onDrop}>
      <input ref={openRef} hidden type="file" accept="application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) store.openFile(f); e.target.value = ""; }} />
      <input ref={imgRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) store.addImageFile(f); e.target.value = ""; }} />

      {/* ---------------- toolbar ---------------- */}
      <header className="glass-bar flex shrink-0 items-center gap-1.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]" role="toolbar" aria-label="Editor toolbar">
        <div className="seg">
          <TB icon="open" label="Open PDF" onClick={() => openRef.current?.click()} />
          <TB icon="plus" label="New blank PDF" onClick={() => store.newBlank()} />
        </div>
        <div className="seg">
          <TB icon="undo" label="Undo" onClick={() => { const r = store.undo(); if (!r.ok) store.toast("info", r.message); }} disabled={!S.canUndo} />
          <TB icon="redo" label="Redo" onClick={() => { const r = store.redo(); if (!r.ok) store.toast("info", r.message); }} disabled={!S.canRedo} />
        </div>
        <div className="seg" role="group" aria-label="Tools">
          {TOOLS.map(([t, i, l]) => <TB key={t} icon={i} label={l} on={S.tool === t} disabled={!S.hasDoc} onClick={() => store.setTool(t)} />)}
        </div>
        <div className="seg">
          <TB icon="image" label="Add image" disabled={!S.hasDoc} onClick={() => imgRef.current?.click()} />
          <TB icon="sign" label="Signature" disabled={!S.hasDoc} onClick={() => store.openSignature(true)} />
          <TB icon="link" label="Add hyperlink" disabled={!S.hasDoc} onClick={() => setLinkOpen(true)} />
        </div>
        <div className="seg">
          <TB icon="minus" label="Zoom out" disabled={!S.hasDoc} onClick={() => store.zoomBy(-0.15)} showLabel={false} />
          <button className="min-w-[3.25rem] shrink-0 rounded-lg px-1 text-center text-xs tabular-nums text-slate-300 hover:bg-white/10 disabled:opacity-40" onClick={() => store.fitWidth()} title="Fit to width" disabled={!S.hasDoc}>{Math.round(S.zoom * 100)}%</button>
          <TB icon="plus" label="Zoom in" disabled={!S.hasDoc} onClick={() => store.zoomBy(0.15)} showLabel={false} />
          <TB icon="fit" label="Fit width" disabled={!S.hasDoc} onClick={() => store.fitWidth()} showLabel={false} />
        </div>
        <TB icon="eye" label="Exact preview" on={S.preview} disabled={!S.hasDoc} onClick={() => store.setPreview(!S.preview)} />
        <div className="ms-auto flex shrink-0 items-center gap-1 ps-2">
          <TB icon="save" label="Save to My Documents" disabled={!S.hasDoc} onClick={() => store.saveToDocuments()} showLabel={false} />
          <button className="btn btn-p !min-h-[40px] !px-3.5" disabled={!S.hasDoc} onClick={() => store.download()}><Icon n="download" size={16} /><span className="hidden sm:inline">Download</span></button>
        </div>
      </header>

      {S.hasDoc && <div className="flex shrink-0 items-center gap-x-3 gap-y-1 overflow-x-auto border-b border-slate-700/40 bg-[#0d1526] px-3 py-1 text-[10px] text-slate-500 [scrollbar-width:none]" aria-label="Keyboard shortcuts"><span><kbd className="rounded border border-slate-700 px-1">Ctrl/⌘ Z</kbd> Undo</span><span><kbd className="rounded border border-slate-700 px-1">Ctrl/⌘ Shift Z</kbd> Redo</span><span><kbd className="rounded border border-slate-700 px-1">V</kbd> Select</span><span><kbd className="rounded border border-slate-700 px-1">T</kbd> Text</span><span><kbd className="rounded border border-slate-700 px-1">H</kbd> Highlight</span><span><kbd className="rounded border border-slate-700 px-1">D</kbd> Draw</span><span><kbd className="rounded border border-slate-700 px-1">Ctrl/⌘ Shift ←/→</kbd> Rotate page</span></div>}

      {/* ---------------- body ---------------- */}
      <div className="flex min-h-0 flex-1">
        {S.hasDoc && <aside className="hidden w-48 shrink-0 border-e border-slate-700/50 bg-[#0e1628] p-2 lg:block" aria-label="Pages"><PagesRail /></aside>}

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div ref={stage} className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,#141d33,#0b1220_70%)] p-4 pb-20" onPointerDown={() => { /* clicking the grey area deselects */ }}>
            {S.hasDoc ? <div className="mx-auto w-fit min-w-0"><PageView pageIdx={S.cur} /></div> : <Welcome onOpen={() => openRef.current?.click()} />}
          </div>
          {S.hasDoc && <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-700/50 bg-[#111a2e]/95 px-1.5 py-1 shadow-xl backdrop-blur">
              <button className="tbtn !h-9 !w-9" aria-label="Previous page" disabled={S.cur === 0} onClick={() => store.goTo(S.cur - 1)}><Icon n="left" size={16} className="rotate-180" /></button>
              <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-slate-200" aria-live="polite">Page {S.cur + 1} / {S.pages.length}</span>
              <button className="tbtn !h-9 !w-9" aria-label="Next page" disabled={S.cur >= S.pages.length - 1} onClick={() => store.goTo(S.cur + 1)}><Icon n="left" size={16} /></button>
            </div></div>}
          {/* mobile bottom sheet */}
          <div className="shrink-0 border-t border-slate-700/50 bg-[#111a2e] lg:hidden">
            {tab && <div className="max-h-[46dvh] overflow-y-auto p-3">{tab === "pages" ? <PagesRail horizontal /> : panel(tab)}</div>}
            <div className="flex border-t border-white/5" role="tablist" aria-label="Editor panels">
              {tabBtn("pages", "pages", "Pages")}{tabBtn("format", "sliders", "Format")}{tabBtn("document", "layers", "Document")}{tabBtn("voice", "mic", "Voice")}
            </div>
          </div>
        </main>

        <aside className="hidden w-[350px] shrink-0 flex-col border-s border-slate-700/50 bg-[#0e1628] lg:flex" aria-label="Editing panel">
          <div className="flex shrink-0 border-b border-slate-700/50" role="tablist">{tabBtn("format", "sliders", "Format", true)}{tabBtn("document", "layers", "Document", true)}{tabBtn("voice", "mic", "Voice", true)}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{panel(desk)}</div>
        </aside>
      </div>

      {/* ---------------- overlays ---------------- */}
      {S.sigOpen && <SignaturePad />}
      {linkOpen && S.hasDoc && <LinkDialog onClose={() => setLinkOpen(false)} />}
      {drag && <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center border-4 border-dashed border-brand-400 bg-brand-500/10 text-lg font-medium">Drop a PDF to open it (or an image to insert it)</div>}
      {S.busy && <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-[2px]" role="alert" aria-busy><div className="flex items-center gap-3 rounded-2xl border border-slate-700/50 bg-[#111a2e] px-5 py-3 text-sm shadow-2xl"><Spinner />{S.busy}</div></div>}
      {S.toast && <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-3 md:bottom-6" role="status" aria-live="polite">
        <div className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-2xl ${S.toast.kind === "err" ? "border-red-400/40 bg-[#2a1216] text-red-100" : S.toast.kind === "ok" ? "border-emerald-400/40 bg-[#10231b] text-emerald-100" : "border-white/15 bg-[#16213a] text-slate-100"}`}>
          <Icon n={S.toast.kind === "err" ? "warn" : S.toast.kind === "ok" ? "check" : "info"} size={17} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{S.toast.text}</span>
          {S.toast.action && <button className="shrink-0 font-semibold underline" onClick={() => { S.toast!.action!.run(); store.dismissToast(); }}>{S.toast.action.label}</button>}
          <button className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss" onClick={() => store.dismissToast()}><Icon n="x" size={15} /></button>
        </div></div>}
    </div>
  );
}
