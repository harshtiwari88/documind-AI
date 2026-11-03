import { useEffect, useState } from "react"; import { useSearchParams } from "react-router-dom"; import { kb, post, save } from "../lib/api"; import { add } from "../lib/docs"; import { LOCAL } from "../lib/clientTools";
export const TOOLS: any[] = [
  { id: "merge", t: "Merge PDFs", d: "Combine several PDFs into one", ep: "/pdf/merge", multi: true, accept: "application/pdf" },
  { id: "split", t: "Split / extract pages", d: "Keep only the page ranges you choose", ep: "/pdf/split", fields: [{ n: "pages", l: "Pages, e.g. 1-3,5" }] },
  { id: "rotate", t: "Rotate pages", d: "Rotate selected or all pages", ep: "/pdf/rotate", fields: [{ n: "pages", l: "Pages or 'all'", def: "all" }, { n: "degrees", l: "Degrees", opts: ["90", "180", "270"] }] },
  { id: "compress", t: "Compress PDF", d: "Lossless by default; optionally shrink images", ep: "/pdf/compress", fields: [{ n: "images", l: "Also shrink images (lossy)", opts: ["false", "true"] }] },
  { id: "batch", t: "Batch compress", d: "Up to 10 PDFs into one zip", ep: "/batch/compress", multi: true, accept: "application/pdf", fields: [{ n: "images", l: "Also shrink images (lossy)", opts: ["false", "true"] }] },
  { id: "ocr", t: "OCR (make searchable)", d: "Adds a text layer to scanned pages, keeps the original scan", ep: "/pdf/ocr", fields: [{ n: "lang", l: "OCR language (eng, hin, mar, tam…)", def: "eng" }] },
  { id: "text", t: "PDF to text", d: "Extract text and flag scanned pages", ep: "/pdf/text", json: true },
  { id: "img", t: "PDF to images", d: "PNG or JPG per page (zip)", ep: "/convert/pdf-to-images", fields: [{ n: "fmt", l: "Format", opts: ["png", "jpg"] }, { n: "dpi", l: "DPI (72-300)", def: "150" }] },
  { id: "toimg", t: "Images to PDF", d: "PNG/JPG files into one PDF", ep: "/convert/images-to-pdf", multi: true, accept: "image/png,image/jpeg", pw: false },
  { id: "docx", t: "PDF to Word", d: "Approximate layout; complex files will differ", ep: "/convert/pdf-to-docx" },
  { id: "pptx", t: "PDF to PowerPoint", d: "Each page becomes a slide image (not editable shapes)", ep: "/convert/pdf-to-pptx" },
  { id: "xlsx", t: "PDF to Excel", d: "Detected tables become sheets", ep: "/convert/pdf-to-xlsx" },
  { id: "office", t: "Word/PPT/Excel to PDF", d: "Requires LibreOffice on the server", ep: "/convert/office-to-pdf", accept: ".docx,.pptx,.xlsx", pw: false },
  { id: "rtext", t: "Replace text (keeps font)", d: "Removes the old text from the PDF and writes yours in the same font when possible", ep: "/pdf/replace-text", keep: true, fontUpload: true, fields: [{ n: "page", l: "Page", def: "1" }, { n: "find", l: "Text to find" }, { n: "replace", l: "New text" }] },
  { id: "srep", t: "Replace text in a scan", d: "OCR finds the words, erases them and draws yours. The page becomes a rebuilt image", ep: "/pdf/scan-replace", keep: true, fontUpload: true, fields: [{ n: "page", l: "Page", def: "1" }, { n: "find", l: "Text to find" }, { n: "replace", l: "New text" }, { n: "lang", l: "OCR language (eng, hin…)", def: "eng" }] },
  { id: "web", t: "Web page to PDF", d: "Needs a safe headless browser. Use your browser\u2019s Print \u2192 Save as PDF meanwhile.", future: true },
];
function Card({ t }: { t: any }) {
  const [sp] = useSearchParams();
  const [files, setFiles] = useState<File[]>([]), [pw, setPw] = useState(""), [font, setFont] = useState<File | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [msg, setMsg] = useState(""), [txt, setTxt] = useState("");
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries((t.fields || []).map((f: any) => [f.n, sp.get(f.n) ?? f.def ?? f.opts?.[0] ?? ""])));
  async function run() {
    setErr(""); setMsg(""); setTxt("");
    if (!files.length) return setErr("Choose a file first.");
    if (t.id === "merge" && files.length < 2) return setErr("Choose at least 2 PDFs.");
    if (files.some(f => f.size > 50 * 1048576)) return setErr("A file is larger than 50 MB.");
    if (LOCAL[t.id]) {
      setBusy(true);
      try { const o = await LOCAL[t.id](files, { ...v, password: pw });
        if (o.text !== undefined) setTxt(o.text); else save(o.blob, o.name);
        setMsg((o.note ? o.note + " " : "") + (o.text !== undefined ? "" : "File downloaded. Processed on your device, nothing was uploaded.")); }
      catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      return;
    }
    const fd = new FormData(); files.forEach(f => fd.append(t.multi ? "files" : "file", f)); Object.entries(v).forEach(([k, x]) => fd.append(k, x)); if (pw) fd.append("password", pw); if (font) fd.append("font", font);
    setBusy(true);
    try {
      if (t.json) { const r = await post(t.ep, fd); setTxt(r.pages.map((p: any) => `--- Page ${p.page} ---\n${p.text || "(no text layer: run OCR)"}`).join("\n\n")); if (r.scanned_pages.length) setMsg(`Scanned pages without text: ${r.scanned_pages.join(", ")}`); }
      else { const r = await post(t.ep, fd, true); save(r.blob, r.name); const n = r.headers.get("X-New-Size");
        if (t.id === "ocr") {
          const resultFile = new File([r.blob], r.name || "searchable.pdf", { type: "application/pdf" });
          await add(resultFile);
          const ocrPages = (r.headers.get("X-OCR-Pages") || "").split(",").filter(Boolean);
          const skipped = (r.headers.get("X-Skipped-Pages") || "").split(",").filter(Boolean);
          setMsg(`Searchable PDF downloaded and saved to My Documents. OCR added to ${ocrPages.length} page(s)${ocrPages.length ? `: ${ocrPages.join(", ")}` : ""}. ${skipped.length} page(s) already had text and were preserved.`);
        } else if (t.keep) {
          await add(new File([r.blob], r.name, { type: "application/pdf" }));
          const fm = r.headers.get("X-Font-Match"), lc = r.headers.get("X-Low-Confidence");
          setMsg(`Replaced ${r.headers.get("X-Replaced")} place(s)${fm ? `. Font: ${fm.includes("embedded") ? "original font reused" : fm.includes("uploaded") ? "your uploaded font" : "closest standard font (the original font could not be reused)"}` : ""}.${r.headers.get("X-Overflow") === "yes" ? " New text is longer than the old text and may overlap." : ""}${lc === "yes" ? " Some scanned words were low-confidence: check the result." : ""} Saved to My Documents.`);
        } else setMsg(n ? `Saved. ${kb(files[0].size)} → ${kb(+n)}` : "Done. File downloaded."); }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { const h = () => { if (sp.get("tool") === t.id) run(); }; window.addEventListener("dm-run-tool", h); return () => window.removeEventListener("dm-run-tool", h); });
  return (
    <div className="card flex flex-col gap-3"><div><h3 className="font-medium">{t.t}</h3><p className="text-sm text-slate-400">{t.d}</p></div>
      {t.future ? <span className="w-fit rounded bg-white/10 px-2 py-1 text-xs">Planned feature</span> : <>
        <input type="file" multiple={t.multi} accept={t.accept || "application/pdf"} aria-label={`${t.t} file`} className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-200" onChange={e => setFiles([...(e.target.files || [])])} />
        {(t.fields || []).map((f: any) => <div key={f.n}><label className="lbl">{f.l}</label>{f.opts ? <select className="input" value={v[f.n]} onChange={e => setV({ ...v, [f.n]: e.target.value })}>{f.opts.map((o: string) => <option key={o}>{o}</option>)}</select> : <input className="input" value={v[f.n]} onChange={e => setV({ ...v, [f.n]: e.target.value })} />}</div>)}
        {!t.multi && t.pw !== false && <input className="input" type="password" placeholder="PDF password (only if protected)" autoComplete="off" value={pw} onChange={e => setPw(e.target.value)} />}
        {t.fontUpload && <div><label className="lbl">Font file for new text (optional .ttf/.otf; required for Hindi and other scripts)</label><input type="file" accept=".ttf,.otf" className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-200" onChange={e => setFont(e.target.files?.[0] || null)} /></div>}
        <button className="btn btn-p" disabled={busy} onClick={run}>{busy ? "Processing…" : "Run"}</button>
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}{msg && <p role="status" className="text-sm text-emerald-400">{msg}</p>}
        {txt && <><textarea readOnly className="input h-40 font-mono text-xs" value={txt} /><button className="btn" onClick={() => save(new Blob([txt], { type: "text/plain;charset=utf-8" }), "extracted.txt")}>Download .txt</button></>}
        <p className="text-xs text-slate-500">{LOCAL[t.id] ? "Runs privately in your browser. Nothing is uploaded." : "This tool needs the DocuMind server. The file is processed in memory and not stored."}</p></>}
    </div>);
}
export default function Tools() {
  const [p] = useSearchParams(), q = (p.get("q") || "").toLowerCase();
  const tid = p.get("tool"), list = tid ? TOOLS.filter(x => x.id === tid) : q ? TOOLS.filter(x => x.t.toLowerCase().includes(q)) : TOOLS;
  return <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-10"><h1 className="font-display text-3xl">PDF Tools</h1>
    <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map(x => <Card key={x.id} t={x} />)}</div></div>;
}
