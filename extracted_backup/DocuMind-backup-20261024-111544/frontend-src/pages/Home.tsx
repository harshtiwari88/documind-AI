import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { add, Doc, list, validate } from "../lib/docs";
import { save } from "../lib/api";
import { Icon } from "../editor/icons";
import { formatBytes, useStorage } from "../lib/useStorage";
import { TOOLS } from "./Tools";

const QUICK: [string, string, string, string][] = [
  ["Folders", "folder", "/documents?view=folders", "text-[#0f8a8a] bg-[#d9f3f0]"],
  ["Add Tags", "tag", "/documents?view=tags", "text-[#0f8a8a] bg-[#d9f3f0]"],
  ["Merge PDFs", "merge", "/tools?q=Merge", "text-[#2563eb] bg-[#dbeafe]"],
  ["Split PDF", "crop", "/tools?q=Split", "text-[#0f8a8a] bg-[#d9f3f0]"],
  ["OCR Scan", "scan", "/tools?q=OCR", "text-[#2563eb] bg-[#dbeafe]"],
  ["AI Chat", "chat", "/assistant", "text-[#2563eb] bg-[#dbeafe]"],
];

export default function Home() {
  const nav = useNavigate(), ref = useRef<HTMLInputElement>(null), st = useStorage();
  const [err, setErr] = useState(""), [drag, setDrag] = useState(false), [q, setQ] = useState(""), [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]), [loading, setLoading] = useState(true), [menuId, setMenuId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setDocs(await list()); } catch { setErr("Couldn't load your local documents. Please refresh the page."); }
    setLoading(false); void st.refresh();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); const f = () => void refresh(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, [refresh]);

  async function pick(files?: FileList | File[] | null) {
    const picked = Array.from(files || []); if (!picked.length) return;
    setErr(""); setBusy(true);
    const added: Doc[] = [], problems: string[] = [];
    for (const f of picked) {
      const e = validate(f); if (e) { problems.push(`${f.name}: ${e}`); continue; }
      try { added.push(await add(f)); } catch (x: any) { problems.push(`${f.name}: ${x?.message || "could not be added."}`); }
    }
    setBusy(false); if (ref.current) ref.current.value = "";
    if (problems.length) setErr(problems.join(" "));
    await refresh();
    if (added.length === 1) nav("/editor?doc=" + added[0].id); else if (added.length > 1) nav("/documents");
  }

  const now = new Date();
  const dateLine = `${now.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${now.toLocaleDateString(undefined, { weekday: "short" })}`;
  const recent = useMemo(() => [...docs].sort((a, b) => b.added - a.added).slice(0, 5), [docs]);
  const recentCount = docs.filter(d => Date.now() - d.added < 30 * 864e5).length;
  const folderCount = new Set(docs.map(d => d.folder?.trim()).filter(Boolean)).size;
  const filed = docs.filter(d => d.folder?.trim()).length, favorites = docs.filter(d => d.favorite).length, tagged = docs.filter(d => (d.tags || []).length).length;
  const found = TOOLS.filter(x => (x.t + " " + x.d).toLowerCase().includes(q.toLowerCase()));

  // storage donut: PDFs + saved versions are exact; "other" is whatever else the browser reports for this site
  const used = st.usage ?? st.pdfBytes + st.versionBytes;
  const other = st.usage != null ? Math.max(0, st.usage - st.pdfBytes - st.versionBytes) : 0;
  const total = st.quota || st.pdfBytes + st.versionBytes + other || 1;
  const R = 52, C = 2 * Math.PI * R;
  const segs: [string, string, number][] = [["PDF documents", "#0f8a8a", st.pdfBytes], ["Saved versions", "#7fe0d6", st.versionBytes], ["Other site data", "#94a3b8", other]];
  let offset = 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-8" onClick={() => menuId && setMenuId(null)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight text-[#0b2536] md:text-4xl">Welcome back!</h1>
          <p className="mt-1 text-sm text-[#4a6573] md:text-base">Manage, edit and organize your PDF documents with AI.</p></div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-2.5 text-sm shadow-card"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6f3f4] text-[#0f6f73]"><Icon n="clock" size={19} /></span><div className="leading-tight"><div className="text-[#58747f]">Today</div><div className="font-medium text-[#15323f]">{dateLine}</div></div></div>
      </header>

      {err && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Document statistics">
        <Stat title="Total Documents" value={loading ? "—" : String(docs.length)} icon="pages" tile="bg-[#dbeafe] text-[#2563eb]" wash="from-[#e4efff]" note={recentCount ? `↑ ${recentCount} new or updated in 30 days` : "No changes in the last 30 days"} />
        <Stat title="Folders" value={loading ? "—" : String(folderCount)} icon="folder" tile="bg-[#d3f1ee] text-[#0f8a8a]" wash="from-[#dff6f3]" note={`${filed} document${filed === 1 ? "" : "s"} filed`} />
        <Stat title="Favorites" value={loading ? "—" : String(favorites)} icon="star" tile="bg-[#fdefc7] text-[#d99a06]" wash="from-[#fff3d4]" note={`of ${docs.length} document${docs.length === 1 ? "" : "s"}`} />
        <div className="relative overflow-hidden rounded-2xl border border-[#e1ecef] bg-white p-5 shadow-card">
          <div className="flex items-start gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#d3f1ee] text-[#0f8a8a]"><Icon n="db" size={26} /></span>
            <div className="min-w-0"><div className="text-sm font-medium text-[#15323f]">Total Storage</div><div className="mt-0.5 text-3xl font-bold tracking-tight text-[#0b2536]">{formatBytes(st.pdfBytes + st.versionBytes)}</div>
              <div className="text-xs text-[#58747f]">{st.quota ? `of ${formatBytes(st.quota)} browser quota (${st.percent}%)` : "PDFs and saved versions"}</div></div></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dff1ef]" role="progressbar" aria-label="Browser storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={st.percent ?? 0}><div className="h-full rounded-full bg-[#0f9a96]" style={{ width: `${st.percent ?? 0}%` }} /></div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className={`relative flex min-h-[250px] flex-col items-center gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b8f90] via-[#27b3ad] to-[#8de3d8] p-6 text-[#fff] transition md:flex-row md:p-9 ${drag ? "ring-4 ring-white/70" : ""}`}
          onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }} onDrop={e => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files); }}>
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-white/10" />
          <svg viewBox="0 0 220 170" className="relative h-36 w-44 shrink-0 md:h-44 md:w-56" aria-hidden>
            <rect x="26" y="26" width="92" height="120" rx="10" fill="#fff" opacity=".45" transform="rotate(-9 72 86)" /><rect x="38" y="16" width="96" height="124" rx="10" fill="#fff" opacity=".7" transform="rotate(-3 86 78)" />
            <rect x="50" y="10" width="98" height="128" rx="10" fill="#fff" /><rect x="62" y="26" width="48" height="6" rx="3" fill="#bfe6e3" /><rect x="62" y="40" width="72" height="6" rx="3" fill="#d6efed" /><rect x="62" y="54" width="64" height="6" rx="3" fill="#d6efed" /><rect x="62" y="68" width="70" height="6" rx="3" fill="#d6efed" />
            <rect x="48" y="112" width="40" height="18" rx="5" fill="#2bb3ab" /><text x="68" y="125" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">PDF</text>
            <path d="M112 134a22 22 0 010-44 28 28 0 0153-9 22 22 0 016 53z" fill="#f4fffd" /><circle cx="146" cy="108" r="17" fill="#0f9a96" /><path d="M146 117v-17M139 106l7-7 7 7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div className="relative text-center md:text-start"><h2 className="!text-[#fff] text-3xl font-bold tracking-tight">Upload Your PDFs</h2>
            <p className="mt-2 text-lg text-white/95">Drag and drop files here, or click to browse</p><p className="mt-1 text-sm text-white/85">Supports PDF files up to 50 MB each</p>
            <button className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#0a5560] px-6 text-base font-semibold text-[#fff] shadow-lg transition hover:bg-[#0b6672] disabled:opacity-60" disabled={busy} onClick={() => ref.current?.click()}><Icon n="up" size={19} />{busy ? "Adding…" : "Upload Files"}</button>
            <input ref={ref} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => void pick(e.target.files)} /></div>
        </section>

        <section className="rounded-2xl border border-[#e1ecef] bg-white p-5 shadow-card">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#0b2536]"><span className="text-[#0f8a8a]"><Icon n="bolt" size={20} /></span>Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">{QUICK.map(([label, icon, to, tone]) => <Link key={label} to={to} className="flex min-h-[52px] items-center gap-3 rounded-xl border border-[#e6eff2] bg-[#f4f9fa] px-3 py-2 text-sm font-medium text-[#15323f] transition hover:border-brand-300 hover:bg-white hover:shadow-soft"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon n={icon} size={17} /></span>{label}</Link>)}</div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-[#e1ecef] bg-white shadow-card">
          <div className="flex items-center justify-between px-5 pb-3 pt-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-[#0b2536]"><span className="text-[#0f8a8a]"><Icon n="clock" size={20} /></span>Recent Documents</h2><Link to="/documents" className="text-sm font-medium text-[#0f8a8a] hover:underline">View All</Link></div>
          {loading ? <p className="px-5 pb-8 pt-4 text-center text-sm text-[#58747f]">Loading your documents…</p> : !recent.length ? <div className="px-5 pb-8 pt-4 text-center text-sm text-[#58747f]">No documents yet. Upload a PDF to get started.</div> :
            <div className="overflow-x-auto px-3 pb-3"><table className="w-full min-w-[620px] text-sm"><thead><tr className="bg-[#eef4f6] text-start text-xs text-[#58747f]">{["Name", "Size", "Modified", "Folder", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-start font-medium first:rounded-s-lg last:rounded-e-lg">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#edf3f5]">{recent.map(d => <tr key={d.id} className="text-[#15323f]">
                <td className="px-3 py-3"><span className="flex items-center gap-3"><span className="grid h-8 w-7 shrink-0 place-items-center rounded-md bg-[#fde8e6] text-[#e5483b]"><Icon n="pages" size={16} /></span><span className="max-w-[16rem] truncate font-medium">{d.name}</span></span></td>
                <td className="whitespace-nowrap px-3 py-3 text-[#3d5a68]">{formatBytes(d.size)}</td><td className="whitespace-nowrap px-3 py-3 text-[#3d5a68]">{new Date(d.added).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-3 py-3 text-[#3d5a68]">{d.folder?.trim() ? <span className="inline-flex items-center gap-1.5"><Icon n="folder" size={15} className="text-[#2d8fd6]" />{d.folder}</span> : "—"}</td>
                <td className="px-3 py-3"><span className="relative flex items-center gap-2"><Link to={`/editor?doc=${d.id}`} className="rounded-lg bg-[#eef4f6] px-3.5 py-1.5 text-xs font-medium hover:bg-[#dfeef1]">Open</Link>
                  <button className="grid h-8 w-8 place-items-center rounded-lg bg-[#eef4f6] hover:bg-[#dfeef1]" aria-label={`More actions for ${d.name}`} aria-haspopup="menu" aria-expanded={menuId === d.id} onClick={e => { e.stopPropagation(); setMenuId(menuId === d.id ? null : d.id); }}><Icon n="dots" size={17} /></button>
                  {menuId === d.id && <span role="menu" className="absolute end-0 top-9 z-10 flex w-44 flex-col rounded-xl border border-[#e1ecef] bg-white p-1 text-start shadow-soft">
                    <button role="menuitem" className="rounded-lg px-3 py-2 text-start text-xs hover:bg-[#eef4f6]" onClick={() => { save(d.file, d.name); setMenuId(null); }}>Download</button>
                    <Link role="menuitem" to="/documents" className="rounded-lg px-3 py-2 text-xs hover:bg-[#eef4f6]">Manage in My Documents</Link></span>}</span></td></tr>)}</tbody></table></div>}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-[#e1ecef] bg-white p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[#0b2536]"><span className="text-[#0f8a8a]"><Icon n="db" size={20} /></span>Storage Usage</h2>
            <div className="flex flex-wrap items-center gap-5">
              <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={st.percent !== null ? `${st.percent}% of browser storage used` : "Browser storage usage"}>
                <circle cx="70" cy="70" r={R} fill="none" stroke="#d2efeb" strokeWidth="16" />
                {segs.map(([name, color, bytes]) => { const len = Math.min(C - offset, (bytes / total) * C); const el = len > 0 ? <circle key={name} cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="16" strokeDasharray={`${Math.max(len, 1.5)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" /> : null; offset += len; return el; })}
                <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0b2536">{st.percent !== null ? `${st.percent}%` : "—"}</text><text x="70" y="86" textAnchor="middle" fontSize="9" fill="#58747f">{st.quota ? `of ${formatBytes(st.quota)}` : "quota unknown"}</text>
              </svg>
              <ul className="min-w-0 flex-1 space-y-2 text-sm">{segs.map(([name, color, bytes]) => <li key={name} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[#3d5a68]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{name}</span><b className="font-semibold text-[#15323f]">{formatBytes(bytes)}</b></li>)}</ul>
            </div>
            <p className="mt-3 text-xs text-[#6d8792]">Your PDFs live in this browser only. Total site data: {formatBytes(used)}.</p>
          </section>
          <section className="rounded-2xl border border-[#e1ecef] bg-white p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[#0b2536]"><span className="text-[#0f8a8a]"><Icon n="pie" size={20} /></span>Library Overview</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">{([["PDF Files", docs.length, "pages", "#e5483b", "#fde8e6"], ["Tagged", tagged, "tag", "#2563eb", "#dbeafe"], ["In Folders", filed, "folder", "#0f8a8a", "#d3f1ee"], ["Versions", st.versionCount, "history", "#7c3aed", "#ede4fe"]] as [string, number, string, string, string][]).map(([l, n, ic, c, bg]) =>
              <div key={l} className="flex items-center gap-2.5 rounded-xl bg-[#f4f9fa] p-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: bg, color: c }}><Icon n={ic} size={17} /></span><div className="leading-tight"><div className="text-[11px] text-[#58747f]">{l}</div><div className="text-xl font-bold text-[#0b2536]">{n}</div></div></div>)}</div>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-[#e1ecef] bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#0b2536]">Explore tools</h2><p className="mt-0.5 text-sm text-[#58747f]">Find the right tool for your next task.</p></div>
          <input className="input !w-full sm:!w-64" value={q} onChange={e => setQ(e.target.value)} placeholder="Search tools…" aria-label="Search tools" /></div>
        {found.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{found.slice(0, 6).map(x => <Link key={x.id} to={`/tools?q=${encodeURIComponent(x.t)}`} className="rounded-xl border border-[#e6eff2] bg-[#f4f9fa] p-4 transition hover:border-brand-300 hover:bg-white hover:shadow-soft"><div className="font-medium text-[#15323f]">{x.t}</div><p className="mt-1 text-xs leading-5 text-[#58747f]">{x.d}</p></Link>)}</div>
          : <p className="py-6 text-center text-sm text-[#58747f]">No tools match “{q}”.</p>}
        {found.length > 6 && <Link to="/tools" className="mt-4 inline-block text-sm font-medium text-[#0f8a8a] hover:underline">View all {found.length} tools →</Link>}
      </section>
    </div>
  );
}

function Stat({ title, value, note, icon, tile, wash }: { title: string; value: string; note: string; icon: string; tile: string; wash: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#e1ecef] bg-white p-5 shadow-card">
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t ${wash} to-transparent`} />
      <div className="relative flex items-start gap-4"><span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${tile}`}><Icon n={icon} size={26} /></span>
        <div className="min-w-0"><div className="text-sm font-medium text-[#15323f]">{title}</div><div className="mt-0.5 text-4xl font-bold tracking-tight text-[#0b2536]">{value}</div></div></div>
      <div className="relative mt-3 text-xs font-medium text-[#0f766e]">{note}</div>
    </div>
  );
}
