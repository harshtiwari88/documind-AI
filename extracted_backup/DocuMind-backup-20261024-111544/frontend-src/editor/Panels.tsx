import { useEffect, useRef, useState } from "react";
import { editorStore as store, useEditor } from "./store";
import { Icon } from "./icons";
import type { Cmd } from "./commands";
import type { Align, FontKey, ShapeKind } from "./types";
import { normalizeLinkUrl } from "./linkUtils";

const SWATCHES = ["#111111", "#e03131", "#1d4ed8", "#2f9e44", "#f76707", "#7048e8", "#6b7280", "#ffffff"];
const HL = ["#ffe000", "#69db7c", "#74c0fc", "#ffa8a8", "#eebefa", "#ffc078"];
const FONTS: [FontKey, string][] = [["helv", "Helvetica (sans-serif)"], ["times", "Times (serif)"], ["courier", "Courier (monospace)"]];
const SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

const run = (c: Cmd) => store.execute(c).then(r => { if (!r.ok) store.toast("err", r.message); }).catch((e: any) => store.toast("err", e.message));

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return <section className="space-y-2.5 border-b border-slate-700/50 pb-4 last:border-0"><div className="flex items-baseline justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>{hint && <span className="text-[11px] text-slate-500">{hint}</span>}</div>{children}</section>;
}
function Colors({ value, onPick, none, label }: { value: string | null; onPick: (c: string | null) => void; none?: boolean; label: string }) {
  return <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
    {none && <button className={`h-7 w-7 rounded-full border text-[10px] text-slate-300 ${value === null ? "border-brand-400 ring-2 ring-brand-400/50" : "border-white/20"}`} title="No fill" aria-label="No fill" onClick={() => onPick(null)}>∅</button>}
    {SWATCHES.map(c => <button key={c} title={c} aria-label={`${label} ${c}`} onClick={() => onPick(c)} className={`h-7 w-7 rounded-full border ${value?.toLowerCase() === c ? "border-brand-400 ring-2 ring-brand-400/50" : "border-white/20"}`} style={{ background: c }} />)}
    <label className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-white/20 bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" title="Custom colour"><input type="color" aria-label={`Custom ${label}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value || "#000000"} onChange={e => onPick(e.target.value)} /></label>
  </div>;
}
const Toggle = ({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: string; label: string }) => <button className={`tbtn ${on ? "tbtn-on" : ""}`} aria-pressed={on} title={label} aria-label={label} onClick={onClick}><Icon n={icon} /></button>;

/* ============================================================ FORMAT */
export function FormatPanel() {
  const S = useEditor(), f = S.fmt, selA = S.sel != null ? store.findAnn(S.sel)?.a : null;
  const blockSel = S.selBlock ? store.peek(S.selBlock.page)?.blocks.find(b => b.id === S.selBlock!.id) : null;
  const [crop, setCrop] = useState<string[]>(["0", "0", "0", "0"]), [newText, setNewText] = useState(""), [linkUrl, setLinkUrl] = useState("");
  useEffect(() => { setNewText(blockSel?.text || ""); }, [S.selBlock?.id]);
  useEffect(() => { setLinkUrl(selA?.t === "link" ? String(selA.url || "") : ""); }, [selA?.id]);
  // When an original paragraph is selected, style changes restyle that paragraph (cover-and-redraw); otherwise they update the tool defaults / selected item.
  const apply = (patch: Record<string, any>) => { if (S.selBlock) run({ op: "set_style", target: "selection", ...patch } as Cmd); else store.setFmt(patch); };
  const textish = S.tool === "text" || selA?.t === "text" || !!blockSel || S.tool === "select" || S.tool === "edit";
  const shapeish = S.tool === "shape" || S.tool === "draw" || selA?.t === "shape" || selA?.t === "draw";
  const hlish = S.tool === "hl" || selA?.t === "hl";
  const markish = S.tool === "ul" || S.tool === "st" || selA?.t === "ul" || selA?.t === "st";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 text-xs text-slate-300" role="status"><Icon n="info" size={14} className="-mt-0.5 me-1.5 inline text-brand-400" />{S.hint}</div>

      {blockSel && <Section title="Selected paragraph" hint={blockSel.kind}>
        <textarea className="input !min-h-[88px] text-sm" aria-label="Replacement text" value={newText} onChange={e => setNewText(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-p" disabled={!newText.trim() || newText === blockSel.text} onClick={() => store.replaceBlock(S.selBlock!.page, blockSel, newText)}><Icon n="edit" size={15} />Replace text</button>
          <button className="btn" onClick={() => run({ op: "delete_target", target: "selection" })}><Icon n="trash" size={15} />Delete</button>
          <button className="btn" onClick={() => run({ op: "highlight", target: "selection", color: f.hl })}><Icon n="hl" size={15} />Highlight</button>
          <button className="btn" onClick={() => run({ op: "underline", target: "selection" })}><Icon n="ul" size={15} />Underline</button>
        </div>
        <p className="text-[11px] text-slate-500">Original text is covered and redrawn in the closest built-in font (Helvetica, Times or Courier). The PDF's own font can't be edited in place by the browser engine.</p>
      </Section>}

      {textish && <Section title="Text" hint={selA?.t === "text" ? "selected item" : blockSel ? "selected paragraph" : "new text"}>
        <div><label className="lbl" htmlFor="ff">Font</label><select id="ff" className="input" value={f.font} onChange={e => apply({ font: e.target.value as FontKey })}>{FONTS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div><label className="lbl" htmlFor="fs">Size (pt)</label>
            <div className="flex gap-1.5"><button className="tbtn !h-11 !w-11" aria-label="Smaller" onClick={() => apply({ size: Math.max(4, f.size - 1) })}><Icon n="minus" /></button>
              <input id="fs" className="input text-center" type="number" min={4} max={200} value={f.size} onChange={e => { const v = +e.target.value; if (v >= 4 && v <= 200) apply({ size: v }); }} list="sizes" />
              <button className="tbtn !h-11 !w-11" aria-label="Larger" onClick={() => apply({ size: Math.min(200, f.size + 1) })}><Icon n="plus" /></button></div>
            <datalist id="sizes">{SIZES.map(s => <option key={s} value={s} />)}</datalist></div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Toggle on={f.bold} icon="bold" label="Bold" onClick={() => apply({ bold: !f.bold })} />
          <Toggle on={f.italic} icon="italic" label="Italic" onClick={() => apply({ italic: !f.italic })} />
          <Toggle on={f.underline} icon="underline" label="Underline" onClick={() => apply({ underline: !f.underline })} />
          <span className="mx-1 h-6 w-px bg-white/10" />
          {(["left", "center", "right"] as Align[]).map(a => <Toggle key={a} on={f.align === a} icon={a} label={`Align ${a}`} onClick={() => apply({ align: a })} />)}
        </div>
        <div><span className="lbl">Text colour</span><Colors label="Text colour" value={f.color} onPick={c => apply({ color: c })} /></div>
      </Section>}

      {(shapeish || S.tool === "shape") && <Section title={S.tool === "draw" || selA?.t === "draw" ? "Pen" : "Shape & stroke"}>
        {(S.tool === "shape" || selA?.t === "shape") && <div className="flex gap-1.5" role="group" aria-label="Shape type">
          {([["rect", "rect", "Rectangle"], ["ell", "ell", "Ellipse"], ["line", "line", "Line"], ["arrow", "arrow", "Arrow"]] as [ShapeKind, string, string][]).map(([k, i, l]) => <Toggle key={k} on={f.shape === k} icon={i} label={l} onClick={() => store.setFmt({ shape: k })} />)}</div>}
        <div><span className="lbl">Stroke colour</span><Colors label="Stroke colour" value={f.stroke} onPick={c => store.setFmt({ stroke: c! })} /></div>
        {(S.tool === "shape" || selA?.t === "shape") && <div><span className="lbl">Fill</span><Colors label="Fill" none value={f.fill} onPick={c => store.setFmt({ fill: c })} /></div>}
        <div><label className="lbl" htmlFor="sw">Line width: {f.sw}pt</label><input id="sw" type="range" min={1} max={14} step={0.5} className="w-full accent-brand-400" value={f.sw} onChange={e => store.setFmt({ sw: +e.target.value })} /></div>
      </Section>}

      {hlish && <Section title="Highlight colour"><div className="flex flex-wrap gap-1.5">{HL.map(c => <button key={c} aria-label={`Highlight ${c}`} onClick={() => store.setFmt({ hl: c })} className={`h-8 w-8 rounded-lg border ${f.hl === c ? "border-brand-400 ring-2 ring-brand-400/50" : "border-white/20"}`} style={{ background: c }} />)}</div></Section>}
      {markish && <Section title="Line colour"><Colors label="Line colour" value={f.stroke} onPick={c => store.setFmt({ stroke: c! })} /></Section>}

      {selA && <Section title="Selected item" hint={selA.t}>
        {selA.t === "link" && <div className="mb-3 space-y-2"><div><label className="lbl" htmlFor="edit-link-label">Display text</label><input id="edit-link-label" className="input" value={String(selA.text || "")} onChange={e => store.patchAnn(selA.id, { text: e.target.value }, "Edit link label", true)} /></div><div><label className="lbl" htmlFor="edit-link-url">Destination URL</label><input id="edit-link-url" className="input" type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} /></div><button className="btn btn-p w-full" onClick={() => { try { const normalized = normalizeLinkUrl(linkUrl); store.patchAnn(selA.id, { url: normalized }, "Update hyperlink"); setLinkUrl(normalized); store.toast("ok", "Hyperlink destination updated."); } catch (e: any) { store.toast("err", e.message || "Enter a valid URL."); } }}>Update destination</button></div>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn" onClick={() => store.duplicateAnn(selA.id)}><Icon n="copy" size={15} />Duplicate</button>
          <button className="btn hover:!bg-red-500/20" onClick={() => store.deleteAnn(selA.id)}><Icon n="trash" size={15} />Delete</button>
          <button className="btn" onClick={() => store.reorderAnn(selA.id, 1)}><Icon n="front" size={15} />Forward</button>
          <button className="btn" onClick={() => store.reorderAnn(selA.id, -1)}><Icon n="back" size={15} />Backward</button>
        </div>
        {selA.t === "img" && <div><span className="lbl">Crop (% from left, top, right, bottom)</span>
          <div className="grid grid-cols-4 gap-1.5">{crop.map((v, i) => <input key={i} className="input !px-2 text-center" type="number" min={0} max={90} aria-label={["Left", "Top", "Right", "Bottom"][i]} value={v} onChange={e => setCrop(crop.map((x, j) => (j === i ? e.target.value : x)))} />)}</div>
          <button className="btn mt-2 w-full" onClick={() => { store.cropImage(selA.id, crop.map(Number)); setCrop(["0", "0", "0", "0"]); }}><Icon n="crop" size={15} />Apply crop</button></div>}
      </Section>}
      {!selA && !blockSel && <p className="text-xs text-slate-500">Tip: pick a tool in the toolbar, or select something on the page to edit its style. Formatting you set here is also used for new text.</p>}
    </div>
  );
}

/* ============================================================ DOCUMENT */
function OptField({ label, k, placeholder, help }: { label: string; k: "wm" | "hd" | "ft" | "pn"; placeholder: string; help?: string }) {
  const S = useEditor(), [v, setV] = useState(S.opts[k]);
  useEffect(() => setV(S.opts[k]), [S.opts[k]]);
  const commit = () => { if (v.trim() !== S.opts[k]) store.setOpt(k, v.trim(), label); };
  return <div><label className="lbl" htmlFor={"o" + k}>{label}</label><div className="flex gap-1.5">
    <input id={"o" + k} className="input" placeholder={placeholder} value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && commit()} onBlur={commit} />
    {S.opts[k] && <button className="tbtn !h-11 !w-11" aria-label={`Remove ${label}`} onClick={() => { setV(""); store.setOpt(k, "", "Remove " + label); }}><Icon n="x" /></button>}</div>{help && <p className="mt-1 text-[11px] text-slate-500">{help}</p>}</div>;
}

export function DocumentPanel() {
  const S = useEditor(), merge = useRef<HTMLInputElement>(null), font = useRef<HTMLInputElement>(null), [q, setQ] = useState(""), [found, setFound] = useState<number[] | null>(null), [rangeStart, setRangeStart] = useState("1"), [rangeEnd, setRangeEnd] = useState(String(S.pages.length || 1));
  useEffect(() => { setRangeEnd(String(S.pages.length || 1)); }, [S.pages.length]);
  const doSearch = async () => { if (!q.trim()) { store.clearSearch(); setFound(null); return; } setFound(await store.search(q.trim())); };
  return (
    <div className="space-y-4">
      <Section title="Find in document">
        <div className="flex gap-1.5"><input className="input" placeholder="Search text…" aria-label="Search text" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} />
          <button className="btn btn-p !px-3" aria-label="Search" onClick={doSearch}><Icon n="search" size={16} /></button></div>
        {found && <p className="text-xs text-slate-400" role="status">{found.length ? `Found on page${found.length > 1 ? "s" : ""} ${found.map(n => n + 1).join(", ")}.` : "No matches. Scanned pages need OCR first (PDF Tools → OCR)."}</p>}
        {found && <button className="text-xs text-brand-400 underline" onClick={() => { store.clearSearch(); setFound(null); setQ(""); }}>Clear highlights</button>}
      </Section>
      <Section title="Every page" hint="applied on export">
        <OptField label="Watermark" k="wm" placeholder="e.g. CONFIDENTIAL" />
        <OptField label="Header" k="hd" placeholder="Text at the top of every page" />
        <OptField label="Footer" k="ft" placeholder="Text at the bottom of every page" />
        <div><span className="lbl">Page numbers</span><div className="flex gap-1.5"><button className={`btn flex-1 ${S.opts.pn ? "btn-p" : ""}`} onClick={() => store.setOpt("pn", S.opts.pn ? "" : "Page {n} of {N}", S.opts.pn ? "Remove page numbers" : "Page numbers")}>{S.opts.pn ? "On: remove" : "Add page numbers"}</button></div></div>
        <div><span className="lbl">Page background tint</span>
          <div className="flex flex-wrap items-center gap-1.5">{["", "#fff8e1", "#e8f5e9", "#e3f2fd", "#fce4ec", "#eeeeee"].map(c => <button key={c || "none"} aria-label={c ? `Background ${c}` : "No background"} onClick={() => store.setOpt("bg", c, c ? "Page background" : "Remove background")} className={`h-7 w-7 rounded-full border ${S.opts.bg === c ? "border-brand-400 ring-2 ring-brand-400/50" : "border-white/20"}`} style={{ background: c || "#fff" }}>{!c && <span className="text-[10px] text-slate-500">∅</span>}</button>)}</div></div>
      </Section>
      <Section title="Split / extract pages" hint={`${S.pages.length} page${S.pages.length === 1 ? "" : "s"}`}>
        <div className="grid grid-cols-2 gap-2"><div><label className="lbl" htmlFor="range-start">First page</label><input id="range-start" className="input" type="number" min={1} max={S.pages.length} value={rangeStart} onChange={e => setRangeStart(e.target.value)} /></div><div><label className="lbl" htmlFor="range-end">Last page</label><input id="range-end" className="input" type="number" min={1} max={S.pages.length} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} /></div></div>
        <button className="btn w-full" disabled={!S.hasDoc} onClick={() => store.downloadRange(Number(rangeStart), Number(rangeEnd))}><Icon n="download" size={15} />Export selected page range</button>
        <button className="btn w-full" disabled={!S.hasDoc || S.cur === 0 || S.cur === S.pages.length - 1} onClick={() => store.splitAtCurrentPage()}><Icon n="merge" size={15} />Split at current page into 2 PDFs</button>
        <p className="text-[11px] text-slate-500">Split downloads the pages up to the current page and the remaining pages as two files.</p>
      </Section>
      <Section title="File">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-p col-span-2" onClick={() => store.download()}><Icon n="download" size={16} />Download edited PDF</button>
          <button className="btn" onClick={() => store.saveToDocuments()}><Icon n="save" size={16} />Save to My Documents</button>
          <button className="btn" onClick={() => merge.current?.click()}><Icon n="merge" size={16} />Add / merge PDF</button>
        </div>
        <input ref={merge} hidden type="file" accept="application/pdf" multiple onChange={e => { if (e.target.files?.length) store.mergeFiles(e.target.files); e.target.value = ""; }} />
      </Section>
      <Section title="Non-Latin text (Hindi etc.)" hint={S.hasUni ? "font loaded" : "optional"}>
        <button className="btn w-full" onClick={() => font.current?.click()}><Icon n="text" size={16} />{S.hasUni ? "Replace Unicode font" : "Load Unicode font (.ttf / .otf)"}</button>
        <input ref={font} hidden type="file" accept=".ttf,.otf" onChange={e => { const f = e.target.files?.[0]; if (f) store.loadUniFont(f); e.target.value = ""; }} />
        <p className="text-[11px] text-slate-500">Built-in PDF fonts only cover Latin letters. For Hindi, load Noto Sans Devanagari; it is embedded automatically when needed.</p>
      </Section>
      <Section title="Edit history" hint={`${S.history.length} step${S.history.length === 1 ? "" : "s"}`}>
        {S.history.length === 0 ? <p className="text-xs text-slate-500">No edits yet.</p> :
          <ol className="max-h-48 space-y-1 overflow-auto text-xs">{S.history.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => <li key={i}><button className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-slate-300 hover:bg-white/10" onClick={() => store.jumpHistory(i)} title="Go back to before this step"><span className="truncate">{i + 1}. {h}</span><Icon n="undo" size={13} className="shrink-0 opacity-60" /></button></li>)}</ol>}
      </Section>
    </div>
  );
}
