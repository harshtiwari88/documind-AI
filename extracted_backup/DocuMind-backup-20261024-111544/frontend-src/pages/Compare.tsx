import { useEffect, useState } from "react"; import { Doc, list } from "../lib/docs"; import { post, save } from "../lib/api";
const asFile = (d: Doc) => new File([d.file], d.name, { type: "application/pdf" });
function Pick({ docs, v, set, label }: any) {
  return <div><label className="lbl">{label}</label><select className="input" value={v} onChange={e => set(e.target.value)}>{docs.map((d: Doc) => <option key={d.id} value={d.id}>{d.name}</option>)}{!docs.length && <option>No documents yet</option>}</select></div>;
}
export default function Compare() {
  const [docs, setDocs] = useState<Doc[]>([]), [a, setA] = useState(""), [b, setB] = useState(""), [q, setQ] = useState(""), [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [cmp, setCmp] = useState<any>(null), [hits, setHits] = useState<any[] | null>(null), [tables, setTables] = useState<any[] | null>(null);
  const [lang, setLang] = useState("eng"), [pg, setPg] = useState("1"), [words, setWords] = useState<any[] | null>(null), [fix, setFix] = useState("");
  useEffect(() => { list().then(d => { setDocs(d); if (d[0]) { setA(d[0].id); setB((d[1] || d[0]).id); } }); }, []);
  const get = (id: string) => docs.find(d => d.id === id);
  async function run(k: string, fn: () => Promise<void>) { setErr(""); setBusy(k); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(""); } }
  const doCompare = () => run("c", async () => {
    if (!ok) throw new Error("Please accept the disclosure first."); const x = get(a), y = get(b); if (!x || !y || x.id === y.id) throw new Error("Choose two different documents.");
    const fd = new FormData(); fd.append("files", asFile(x)); fd.append("files", asFile(y)); fd.append("question", q); fd.append("consent", "true"); setCmp(await post("/ai/compare", fd));
  });
  const doSearch = () => run("s", async () => {
    if (!q.trim()) throw new Error("Type something to search for."); const out: any[] = [];
    for (const d of docs) { const fd = new FormData(); fd.append("file", asFile(d)); fd.append("q", q); try { (await post("/pdf/search", fd)).hits.forEach((h: any) => out.push({ ...h, doc: d.name })); } catch { /* skip protected or unreadable files */ } }
    setHits(out);
  });
  const doTables = () => run("t", async () => { const d = get(a); if (!d) throw new Error("Choose a document."); const fd = new FormData(); fd.append("file", asFile(d)); setTables((await post("/pdf/tables", fd)).tables); });
  const doOcr = () => run("o", async () => { const d = get(a); if (!d) throw new Error("Choose a document."); const fd = new FormData(); fd.append("file", asFile(d)); fd.append("page", pg); fd.append("lang", lang); const r = await post("/pdf/ocr-text", fd); setWords(r.words); setFix(r.text); });
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5 md:p-10"><h1 className="font-display text-3xl">Compare & Search</h1>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      <section className="card space-y-3"><h2 className="font-medium">Compare two documents (AI)</h2>
        <div className="grid gap-3 sm:grid-cols-2"><Pick docs={docs} v={a} set={setA} label="Document A" /><Pick docs={docs} v={b} set={setB} label="Document B" /></div>
        <input className="input" placeholder="Focus (optional), e.g. differences in payment terms" value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex gap-2 text-xs text-slate-400"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />I understand text from both documents will be sent to an external AI service.</label>
        <button className="btn btn-p" disabled={!!busy} onClick={doCompare}>{busy === "c" ? "Comparing…" : "Compare"}</button>
        {cmp && <div className="space-y-2"><div className="whitespace-pre-wrap">{cmp.answer}</div><p className="text-xs text-slate-500">Cited pages come from the retrieved passages ({cmp.sources.length} used). Verify important points in the documents.</p></div>}</section>
      <section className="card space-y-3"><h2 className="font-medium">Search across all my documents</h2>
        <div className="flex gap-2"><input className="input" placeholder="Search text…" value={q} onChange={e => setQ(e.target.value)} /><button className="btn btn-p" disabled={!!busy} onClick={doSearch}>{busy === "s" ? "…" : "Search"}</button></div>
        {hits && (hits.length ? hits.map((h, i) => <div key={i} className="rounded-xl border border-slate-700/50 bg-black/20 p-3 text-sm"><span className="me-2 rounded bg-brand-500/20 px-2 py-0.5 text-xs text-brand-400">{h.doc} · p.{h.page}</span><span className="text-slate-400">{h.snippet}</span></div>) : <p className="text-sm text-slate-500">No matches. Scanned documents need OCR first.</p>)}</section>
      <section className="card space-y-3"><h2 className="font-medium">Extract tables</h2><Pick docs={docs} v={a} set={setA} label="Document" />
        <button className="btn btn-p" disabled={!!busy} onClick={doTables}>{busy === "t" ? "Working…" : "Find tables"}</button>
        {tables && (tables.length ? tables.map((t, i) => <div key={i} className="overflow-auto"><p className="mb-1 text-xs text-slate-500">Page {t.page}</p><table className="w-full text-sm"><tbody>{t.rows.map((r: string[], j: number) => <tr key={j}>{r.map((c, k) => <td key={k} className="border border-slate-700/50 px-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>) : <p className="text-sm text-slate-500">No tables detected.</p>)}</section>
      <section className="card space-y-3"><h2 className="font-medium">OCR review and correction</h2><Pick docs={docs} v={a} set={setA} label="Scanned document" />
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl">Page</label><input className="input" value={pg} onChange={e => setPg(e.target.value)} /></div><div><label className="lbl">Language (eng, hin, mar…)</label><input className="input" value={lang} onChange={e => setLang(e.target.value)} /></div></div>
        <button className="btn btn-p" disabled={!!busy} onClick={doOcr}>{busy === "o" ? "Reading…" : "Run OCR on this page"}</button>
        {words && <><p className="text-sm text-slate-400">Words the engine was unsure about are highlighted. Fix the text below, then download it.</p>
          <div className="rounded-xl border border-slate-700/50 bg-black/20 p-3 text-sm leading-7">{words.map((w, i) => <span key={i} className={w.uncertain ? "me-1 rounded bg-amber-500/25 px-1 text-amber-200" : "me-1"} title={`confidence ${Math.round(w.conf)}%`}>{w.text}</span>)}</div>
          <textarea className="input h-40 font-mono text-xs" value={fix} onChange={e => setFix(e.target.value)} /><button className="btn" onClick={() => save(new Blob([fix], { type: "text/plain;charset=utf-8" }), "ocr-corrected.txt")}>Download corrected text</button></>}</section>
    </div>);
}
