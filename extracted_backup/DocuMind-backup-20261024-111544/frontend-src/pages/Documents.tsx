import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Doc, DocVersion, add, addVersion, list, remove, removeMany, rename, restoreVersion, updateMany, updateMetadata, validate, versions } from "../lib/docs";
import { kb, save } from "../lib/api";

export default function Documents() {
  const [docs, setDocs] = useState<Doc[]>([]), [err, setErr] = useState(""), [query, setQuery] = useState(""), [sort, setSort] = useState("newest");
  const [folderFilter, setFolderFilter] = useState("all"), [favoritesOnly, setFavoritesOnly] = useState(false), [tagFilter, setTagFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [expanded, setExpanded] = useState<string | null>(null), [versionRows, setVersionRows] = useState<Record<string, DocVersion[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sp] = useSearchParams(), view = sp.get("view") || "", urlQuery = sp.get("q") || "";
  const ref = useRef<HTMLInputElement>(null), versionRef = useRef<HTMLInputElement>(null), [target, setTarget] = useState<Doc | null>(null);
  const hist: any[] = (() => { try { return JSON.parse(localStorage.getItem("dm_hist") || "[]"); } catch { return []; } })();
  const load = async () => setDocs(await list());
  useEffect(() => { void load(); }, []);
  // Sidebar / dashboard links open this page pre-filtered: ?view=folders|tags|favorites|bulk and ?q=search
  useEffect(() => { setQuery(urlQuery); setFavoritesOnly(view === "favorites"); setFolderFilter("all"); setTagFilter(""); setSelected([]); }, [view, urlQuery]);
  useEffect(() => { if (view === "bulk") setSelected(docs.map(d => d.id)); }, [view, docs.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const folders = useMemo(() => Array.from(new Set(docs.map(d => d.folder?.trim()).filter((f): f is string => !!f))).sort((a,b) => a.localeCompare(b)), [docs]);
  const tags = useMemo(() => Array.from(new Set(docs.flatMap(d => d.tags || []))).sort((a,b) => a.localeCompare(b)), [docs]);
  async function up(f?: File) { if (!f) return; const e = validate(f); if (e) { setErr(e); return; } setErr(""); try { await add(f); await load(); } catch (e: any) { setErr(e.message || "Could not add this PDF."); } if (ref.current) ref.current.value = ""; }
  async function addNewVersion(f?: File) {
    if (!f || !target) return; const e = validate(f); if (e) { setErr(e); return; }
    setErr(""); setBusy(target.id);
    try { await addVersion(target.id, f); await load(); setVersionRows({ ...versionRows, [target.id]: await versions(target.id) }); }
    catch (e: any) { setErr(e.message || "Could not save this version."); }
    finally { setBusy(null); setTarget(null); if (versionRef.current) versionRef.current.value = ""; }
  }
  async function toggleVersions(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id); setVersionRows({ ...versionRows, [id]: await versions(id) });
  }
  async function restore(d: Doc, v: DocVersion) {
    if (!confirm(`Restore the version from ${new Date(v.added).toLocaleString()}? The current file will be kept in version history.`)) return;
    try { await restoreVersion(d.id, v.id); await load(); setVersionRows({ ...versionRows, [d.id]: await versions(d.id) }); setErr(""); }
    catch (e: any) { setErr(e.message || "Could not restore version."); }
  }
  async function setFolder(id: string) {
    const d = docs.find(x => x.id === id); if (!d) return;
    const value = prompt("Folder name (leave blank for no folder)", d.folder || ""); if (value === null) return;
    await updateMetadata(id, { folder: value.trim() }); await load();
  }
  async function setTags(id: string) {
    const d = docs.find(x => x.id === id); if (!d) return;
    const value = prompt("Tags separated by commas", (d.tags || []).join(", ")); if (value === null) return;
    const clean = Array.from(new Set(value.split(",").map(t => t.trim()).filter(Boolean))).slice(0, 20);
    await updateMetadata(id, { tags: clean }); await load();
  }
  async function bulkFolder() {
    const value = prompt(`Folder name for ${selected.length} selected document(s) (blank removes folder)`); if (value === null) return;
    await updateMany(selected, { folder: value.trim() }); await load(); setSelected([]);
  }
  async function bulkTag() {
    const value = prompt(`Replace tags for ${selected.length} selected document(s), separated by commas`); if (value === null) return;
    const clean = Array.from(new Set(value.split(",").map(t => t.trim()).filter(Boolean))).slice(0, 20);
    await updateMany(selected, { tags: clean }); await load(); setSelected([]);
  }
  async function bulkDelete() {
    if (!selected.length || !confirm(`Delete ${selected.length} selected document(s) and their version histories? This cannot be undone.`)) return;
    await removeMany(selected); await load(); setSelected([]); setVersionRows({}); setExpanded(null);
  }
  const shown = docs.filter(d => d.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(d => folderFilter === "all" || (folderFilter === "none" ? !d.folder : d.folder === folderFilter))
    .filter(d => !favoritesOnly || d.favorite)
    .filter(d => !tagFilter || (d.tags || []).includes(tagFilter))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.added - b.added : b.added - a.added);
  const chipCls = (on: boolean) => "chip " + (on ? "!border-brand-600 !bg-brand-100 !text-brand-900" : "");
  const allShownSelected = shown.length > 0 && shown.every(d => selected.includes(d.id));
  function toggleSelected(id: string, checked: boolean) { setSelected(old => checked ? Array.from(new Set([...old, id])) : old.filter(x => x !== id)); }
  return <div className="mx-auto max-w-5xl space-y-5 p-5 md:p-10">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl">{({ folders: "Folders", tags: "Tags", favorites: "Favorites", bulk: "Bulk Actions" } as Record<string, string>)[view] || "My Documents"}</h1><button className="btn btn-p" onClick={() => ref.current?.click()}>+ Add PDF</button><input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={e => up(e.target.files?.[0])} /></div>
    <p className="text-sm text-slate-400">Search, organize PDFs into folders, add tags, mark favorites, and manage version history. Files and organization stay in this browser.</p>
    {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
    {(view === "folders" || view === "tags") && <div className="flex flex-wrap gap-2" aria-label={view === "folders" ? "Folders" : "Tags"}>
      {view === "folders" ? <>
        <button className={chipCls(folderFilter === "all")} onClick={() => setFolderFilter("all")}>All ({docs.length})</button>
        {folders.map(f => <button key={f} className={chipCls(folderFilter === f)} onClick={() => setFolderFilter(f)}>📁 {f} ({docs.filter(d => d.folder === f).length})</button>)}
        <button className={chipCls(folderFilter === "none")} onClick={() => setFolderFilter("none")}>No folder ({docs.filter(d => !d.folder).length})</button>
        {!folders.length && <span className="self-center text-xs text-slate-500">No folders yet. Use “Move to folder” on a document to create one.</span>}
      </> : <>
        <button className={chipCls(!tagFilter)} onClick={() => setTagFilter("")}>All tags</button>
        {tags.map(t => <button key={t} className={chipCls(tagFilter === t)} onClick={() => setTagFilter(tagFilter === t ? "" : t)}>#{t} ({docs.filter(d => (d.tags || []).includes(t)).length})</button>)}
        {!tags.length && <span className="self-center text-xs text-slate-500">No tags yet. Use “Set tags” on a document to add some.</span>}
      </>}
    </div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search documents by name…" aria-label="Search documents" /><select className="input" value={folderFilter} onChange={e => setFolderFilter(e.target.value)} aria-label="Filter by folder"><option value="all">All folders</option><option value="none">Unfiled</option>{folders.map(f => <option key={f} value={f}>{f}</option>)}</select><select className="input" value={tagFilter} onChange={e => setTagFilter(e.target.value)} aria-label="Filter by tag"><option value="">All tags</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select><select className="input" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort documents"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></div>
    <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} /> Favorites only</label><span className="text-xs text-slate-500">{shown.length} shown · {selected.length} selected</span><button className="btn" onClick={() => setSelected(allShownSelected ? selected.filter(id => !shown.some(d => d.id === id)) : Array.from(new Set([...selected, ...shown.map(d => d.id)])))}>{allShownSelected ? "Deselect shown" : "Select shown"}</button></div>
    {selected.length > 0 && <div className="card flex flex-wrap items-center gap-2 !p-3"><span className="mr-1 text-sm">Bulk actions:</span><button className="btn" onClick={() => void bulkFolder()}>Move to folder</button><button className="btn" onClick={() => void bulkTag()}>Set tags</button><button className="btn text-red-300" onClick={() => void bulkDelete()}>Delete selected</button><button className="btn" onClick={() => setSelected([])}>Clear selection</button></div>}
    {!docs.length ? <div className="card py-16 text-center text-slate-400">No documents yet. Add a PDF to get started.<p className="mt-2 text-xs text-slate-500">Documents are stored only in this browser.</p></div> : !shown.length ? <div className="card py-10 text-center text-slate-400">No documents match the current filters.</div> :
      <div className="space-y-3">{shown.map(d => <div key={d.id} className="card !p-4">
        <div className="flex flex-wrap items-start gap-3"><input type="checkbox" className="mt-1" aria-label={`Select ${d.name}`} checked={selected.includes(d.id)} onChange={e => toggleSelected(d.id, e.target.checked)} /><button className="text-xl" title={d.favorite ? "Remove from favorites" : "Add to favorites"} aria-label={d.favorite ? "Remove from favorites" : "Add to favorites"} onClick={() => void updateMetadata(d.id, { favorite: !d.favorite }).then(load)}>{d.favorite ? "★" : "☆"}</button><div className="min-w-0 flex-1"><div className="break-words font-medium">{d.name}</div><div className="mt-1 text-xs text-slate-500">{kb(d.size)} · Updated {new Date(d.added).toLocaleString()}</div><div className="mt-2 flex flex-wrap gap-1">{d.folder && <span className="rounded-full bg-slate-700/70 px-2 py-1 text-xs">📁 {d.folder}</span>}{(d.tags || []).map(tag => <span key={tag} className="rounded-full bg-indigo-500/15 px-2 py-1 text-xs text-indigo-200">#{tag}</span>)}</div></div>
          <Link className="btn btn-p" to={`/editor?doc=${d.id}`}>Open</Link><button className="btn" onClick={() => save(d.file, d.name)}>Download</button><button className="btn" onClick={() => { const n = prompt("New name", d.name); if (n?.trim()) void rename(d.id, n.trim().toLowerCase().endsWith(".pdf") ? n.trim() : n.trim() + ".pdf").then(load); }}>Rename</button><button className="btn" onClick={() => void setFolder(d.id)}>Folder</button><button className="btn" onClick={() => void setTags(d.id)}>Tags</button><button className="btn" disabled={busy === d.id} onClick={() => { setTarget(d); versionRef.current?.click(); }}>{busy === d.id ? "Saving…" : "Add version"}</button><button className="btn" onClick={() => void toggleVersions(d.id)}>{expanded === d.id ? "Hide versions" : "Version history"}</button><button className="btn text-red-300" onClick={() => { if (confirm(`Delete “${d.name}” and its version history?`)) void remove(d.id).then(async () => { await load(); setSelected(old => old.filter(id => id !== d.id)); }); }}>Delete</button>
        </div>
        {expanded === d.id && <section className="mt-4 border-t border-slate-700/60 pt-4"><h2 className="mb-2 font-medium">Previous versions</h2>{(versionRows[d.id] || []).length ? <div className="space-y-2">{versionRows[d.id].map(v => <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/50 p-3"><div className="min-w-0 flex-1"><p className="text-sm">{v.name}</p><p className="text-xs text-slate-500">{kb(v.size)} · {new Date(v.added).toLocaleString()}</p></div><button className="btn" onClick={() => save(v.file, v.name)}>Download</button><button className="btn" onClick={() => void restore(d, v)}>Restore</button></div>)}</div> : <p className="text-sm text-slate-500">No previous versions yet. Add a version to preserve the current file before replacing it.</p>}</section>}
      </div>)}</div>}
    <input ref={versionRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => void addNewVersion(e.target.files?.[0])} />
    <section className="card"><h2 className="mb-2 font-medium">Download history</h2>{hist.length ? hist.slice(0, 10).map((h, i) => <div key={i} className="flex justify-between gap-3 text-sm text-slate-400"><span className="truncate">{h.name}</span><span className="shrink-0">{new Date(h.t).toLocaleString()}</span></div>) : <p className="text-sm text-slate-500">Nothing downloaded yet.</p>}</section>
  </div>;
}
