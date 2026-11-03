import { useEffect, useState } from "react"; import { post } from "../lib/api"; import { Doc, list } from "../lib/docs";
const TASKS = [["chat", "Ask a question"], ["summary", "Summary"], ["notes", "Study notes"], ["flashcards", "Flashcards"], ["mcq", "MCQs"], ["viva", "Viva questions"], ["chapters", "Chapter-wise summary"], ["simplify", "Explain simply"], ["translate", "Translate"], ["rewrite", "Rewrite in a tone"]];
export default function Assistant() {
  const [docs, setDocs] = useState<Doc[]>([]), [id, setId] = useState(""), [task, setTask] = useState("chat"), [q, setQ] = useState(""), [pages, setPages] = useState("");
  const [ok, setOk] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [res, setRes] = useState<any>(null);
  useEffect(() => { list().then(d => { setDocs(d); if (d[0]) setId(d[0].id); }); }, []);
  async function go() {
    setErr(""); setRes(null); const d = docs.find(x => x.id === id);
    if (!d) return setErr("Add a document first (Home or My Documents)."); if (!ok) return setErr("Please accept the disclosure below.");
    if (task === "chat" && !q.trim()) return setErr("Type a question.");
    if (task === "translate" && !q.trim()) return setErr("Enter the target language, e.g. Hindi.");
    if (task === "rewrite" && !q.trim()) return setErr("Enter a tone, e.g. professional.");
    const fd = new FormData(); fd.append("file", new File([d.file], d.name, { type: "application/pdf" })); fd.append("task", task); fd.append("question", q); fd.append("pages", pages); fd.append("consent", "true");
    setBusy(true); try { setRes(await post("/ai/assist", fd)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-5 md:p-10 lg:grid-cols-[380px_1fr]">
      <div className="card space-y-4 self-start"><h1 className="font-display text-2xl">AI Assistant</h1>
        <div><label className="lbl">Document</label><select className="input" value={id} onChange={e => setId(e.target.value)}>{docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}{!docs.length && <option>No documents yet</option>}</select></div>
        <div><label className="lbl">Task</label><select className="input" value={task} onChange={e => setTask(e.target.value)}>{TASKS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        <div><label className="lbl">{task === "translate" ? "Target language" : task === "rewrite" ? "Tone (e.g. professional)" : task === "chapters" || task === "summary" || task === "notes" ? "Optional guidance" : "Question"}</label><textarea rows={3} className="input" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div><label className="lbl">Pages (optional, e.g. 2-5)</label><input className="input" value={pages} onChange={e => setPages(e.target.value)} /></div>
        <label className="flex gap-2 text-xs text-slate-400"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />I understand that text from this document will be sent to an external AI service (Google Gemini) to produce the answer.</label>
        <button className="btn btn-p w-full" disabled={busy} onClick={go}>{busy ? "Thinking…" : "Run"}</button>
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <p className="text-xs text-slate-500">Scanned PDFs have no text: run OCR in PDF Tools first.</p></div>
      <div className="card min-h-[300px]">{!res ? <p className="text-slate-500">Answers appear here with the pages they were based on.</p> : <>
        <div className="whitespace-pre-wrap leading-relaxed">{res.answer}</div>
        <h2 className="mb-2 mt-6 text-sm font-medium text-slate-300">Passages the answer was based on</h2>
        <div className="space-y-2">{res.sources.map((s: any, i: number) => <div key={i} className="rounded-xl border border-slate-700/50 bg-black/20 p-3 text-sm"><span className="me-2 rounded bg-brand-500/20 px-2 py-0.5 text-xs text-brand-400">p.{s.page}</span><span className="text-slate-400">{s.snippet}</span></div>)}</div>
        <p className="mt-4 text-xs text-slate-500">Page tags come from the retrieved text. AI wording is an interpretation; verify important facts in the document.</p></>}</div>
    </div>);
}
