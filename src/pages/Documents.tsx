import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Doc,
  DocVersion,
  add,
  addVersion,
  list,
  remove,
  removeMany,
  rename,
  restoreVersion,
  updateMany,
  updateMetadata,
  validate,
  versions,
} from "../lib/docs";
import { kb, save } from "../lib/api";
import { Icon } from "../editor/icons";
import SmartSummarizerModal from "../components/SmartSummarizerModal";
import CloudStoragePicker from "../components/CloudStoragePicker";
import { safeStorage } from "../lib/safeStorage";

type ModalState =
  | { type: "rename"; doc: Doc; name: string }
  | { type: "folder"; doc: Doc; folder: string }
  | { type: "tags"; doc: Doc; tags: string[] }
  | { type: "bulkFolder"; folder: string }
  | { type: "bulkTag"; tags: string[] }
  | { type: "delete"; doc: Doc }
  | { type: "bulkDelete" }
  | { type: "restore"; doc: Doc; version: DocVersion }
  | null;

export default function Documents() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [folderFilter, setFolderFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [versionRows, setVersionRows] = useState<Record<string, DocVersion[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [tagInput, setTagInput] = useState("");
  const [showSummarizer, setShowSummarizer] = useState(false);
  const [summarizerDocId, setSummarizerDocId] = useState<string | null>(null);
  const [showCloudPicker, setShowCloudPicker] = useState(false);

  const [sp] = useSearchParams();
  const view = sp.get("view") || "";
  const urlQuery = sp.get("q") || "";
  const ref = useRef<HTMLInputElement>(null);
  const versionRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Doc | null>(null);

  const hist: any[] = (() => {
    try {
      return JSON.parse(safeStorage.getItem("dm_hist") || "[]");
    } catch {
      return [];
    }
  })();

  const load = async () => setDocs(await list());
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setQuery(urlQuery);
    setFavoritesOnly(view === "favorites");
    setFolderFilter("all");
    setTagFilter("");
    setSelected([]);
  }, [view, urlQuery]);

  useEffect(() => {
    if (view === "bulk") setSelected(docs.map((d) => d.id));
  }, [view, docs.length]);

  const folders = useMemo(
    () =>
      Array.from(new Set(docs.map((d) => d.folder?.trim()).filter((f): f is string => !!f))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [docs]
  );
  const tags = useMemo(
    () => Array.from(new Set(docs.flatMap((d) => d.tags || []))).sort((a, b) => a.localeCompare(b)),
    [docs]
  );

  async function up(f?: File) {
    if (!f) return;
    const e = validate(f);
    if (e) {
      setErr(e);
      return;
    }
    setErr("");
    try {
      await add(f);
      await load();
    } catch (e: any) {
      setErr(e.message || "Could not add this PDF.");
    }
    if (ref.current) ref.current.value = "";
  }

  async function addNewVersion(f?: File) {
    if (!f || !target) return;
    const e = validate(f);
    if (e) {
      setErr(e);
      return;
    }
    setErr("");
    setBusy(target.id);
    try {
      await addVersion(target.id, f);
      await load();
      setVersionRows({ ...versionRows, [target.id]: await versions(target.id) });
    } catch (e: any) {
      setErr(e.message || "Could not save this version.");
    } finally {
      setBusy(null);
      setTarget(null);
      if (versionRef.current) versionRef.current.value = "";
    }
  }

  async function toggleVersions(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    setVersionRows({ ...versionRows, [id]: await versions(id) });
  }

  async function handleConfirmModal() {
    if (!modal) return;
    try {
      if (modal.type === "rename") {
        const cleanName = modal.name.trim().toLowerCase().endsWith(".pdf")
          ? modal.name.trim()
          : modal.name.trim() + ".pdf";
        if (cleanName) {
          await rename(modal.doc.id, cleanName);
          await load();
        }
      } else if (modal.type === "folder") {
        await updateMetadata(modal.doc.id, { folder: modal.folder.trim() });
        await load();
      } else if (modal.type === "tags") {
        await updateMetadata(modal.doc.id, { tags: modal.tags });
        await load();
      } else if (modal.type === "bulkFolder") {
        await updateMany(selected, { folder: modal.folder.trim() });
        await load();
        setSelected([]);
      } else if (modal.type === "bulkTag") {
        await updateMany(selected, { tags: modal.tags });
        await load();
        setSelected([]);
      } else if (modal.type === "delete") {
        await remove(modal.doc.id);
        await load();
        setSelected((old) => old.filter((id) => id !== modal.doc.id));
      } else if (modal.type === "bulkDelete") {
        await removeMany(selected);
        await load();
        setSelected([]);
        setVersionRows({});
        setExpanded(null);
      } else if (modal.type === "restore") {
        await restoreVersion(modal.doc.id, modal.version.id);
        await load();
        setVersionRows({ ...versionRows, [modal.doc.id]: await versions(modal.doc.id) });
      }
      setModal(null);
    } catch (e: any) {
      setErr(e?.message || "Operation failed.");
    }
  }

  const shown = docs
    .filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((d) => folderFilter === "all" || (folderFilter === "none" ? !d.folder : d.folder === folderFilter))
    .filter((d) => !favoritesOnly || d.favorite)
    .filter((d) => !tagFilter || (d.tags || []).includes(tagFilter))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.added - b.added : b.added - a.added));

  const chipCls = (on: boolean) => "chip " + (on ? "!border-brand-600 !bg-brand-100 !text-brand-900 font-semibold" : "");
  const allShownSelected = shown.length > 0 && shown.every((d) => selected.includes(d.id));

  function toggleSelected(id: string, checked: boolean) {
    setSelected((old) => (checked ? Array.from(new Set([...old, id])) : old.filter((x) => x !== id)));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0b2536]">
            {({ folders: "Folders", tags: "Tags", favorites: "Favorites", bulk: "Bulk Actions" } as Record<string, string>)[view] ||
              "Document Management"}
          </h1>
          <p className="mt-1 text-sm text-[#4a6573]">
            Organize documents with folders, searchable tags, version control, and multi-file actions.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            className="btn !bg-sky-50 !text-sky-700 !border-sky-300 hover:!bg-sky-100 font-semibold"
            onClick={() => setShowCloudPicker(true)}
            title="Import from Google Drive, Dropbox, or OneDrive"
          >
            <Icon n="folder" size={16} /> Cloud Import
          </button>
          <button className="btn btn-p" onClick={() => ref.current?.click()}>
            <Icon n="plus" size={16} /> Upload PDF
          </button>
          <input ref={ref} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => up(e.target.files?.[0])} />
        </div>
      </div>

      {err && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 flex items-center justify-between">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="text-red-600 hover:text-red-800 font-bold">✕</button>
        </div>
      )}

      {/* Filter Views (Folders & Tags) */}
      {(view === "folders" || view === "tags") && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 border border-[#e1ecef] shadow-card">
          {view === "folders" ? (
            <>
              <button className={chipCls(folderFilter === "all")} onClick={() => setFolderFilter("all")}>
                All ({docs.length})
              </button>
              {folders.map((f) => (
                <button key={f} className={chipCls(folderFilter === f)} onClick={() => setFolderFilter(f)}>
                  📁 {f} ({docs.filter((d) => d.folder === f).length})
                </button>
              ))}
              <button className={chipCls(folderFilter === "none")} onClick={() => setFolderFilter("none")}>
                Unfiled ({docs.filter((d) => !d.folder).length})
              </button>
            </>
          ) : (
            <>
              <button className={chipCls(!tagFilter)} onClick={() => setTagFilter("")}>
                All tags
              </button>
              {tags.map((t) => (
                <button key={t} className={chipCls(tagFilter === t)} onClick={() => setTagFilter(tagFilter === t ? "" : t)}>
                  #{t} ({docs.filter((d) => (d.tags || []).includes(t)).length})
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Search and Filter Toolbar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <input
            className="input !ps-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by file name…"
            aria-label="Search documents"
          />
          <Icon n="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <select className="input" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} aria-label="Filter by folder">
          <option value="all">All Folders</option>
          <option value="none">Unfiled Only</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              📁 {f}
            </option>
          ))}
        </select>
        <select className="input" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag">
          <option value="">All Tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort documents">
          <option value="newest">Sort: Newest First</option>
          <option value="oldest">Sort: Oldest First</option>
          <option value="name">Sort: Name (A–Z)</option>
        </select>
      </div>

      {/* Selection controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#4a6573]">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 font-medium cursor-pointer">
            <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} className="rounded" />
            ★ Favorites Only
          </label>
          <span>•</span>
          <span>{shown.length} displayed</span>
          <span>•</span>
          <span>{selected.length} selected</span>
        </div>
        <div className="flex gap-2">
          <button
            className="btn !min-h-[36px] text-xs font-semibold"
            onClick={() =>
              setSelected(
                allShownSelected
                  ? selected.filter((id) => !shown.some((d) => d.id === id))
                  : Array.from(new Set([...selected, ...shown.map((d) => d.id)]))
              )
            }
          >
            {allShownSelected ? "Deselect All" : "Select All"}
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 !p-3 border-[#0f766e]/30 bg-[#f0fdfa]">
          <span className="text-sm font-semibold text-[#0f766e] me-2">Actions for {selected.length} document(s):</span>
          <button className="btn !min-h-[36px] text-xs" onClick={() => setModal({ type: "bulkFolder", folder: "" })}>
            <Icon n="folder" size={14} /> Move to Folder
          </button>
          <button className="btn !min-h-[36px] text-xs" onClick={() => setModal({ type: "bulkTag", tags: [] })}>
            <Icon n="tag" size={14} /> Set Tags
          </button>
          <button className="btn !min-h-[36px] text-xs !border-red-300 text-red-700 hover:bg-red-50" onClick={() => setModal({ type: "bulkDelete" })}>
            <Icon n="erase" size={14} /> Delete Selected
          </button>
          <button className="btn !min-h-[36px] text-xs ms-auto" onClick={() => setSelected([])}>
            Cancel
          </button>
        </div>
      )}

      {/* Documents List */}
      {!docs.length ? (
        <div className="card py-16 text-center text-slate-500">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#e6f3f4] text-[#0f6f73] mb-4">
            <Icon n="pages" size={32} />
          </span>
          <h3 className="text-lg font-semibold text-[#0b2536]">No documents yet</h3>
          <p className="mt-1 text-sm">Upload or create a PDF to start organizing your files.</p>
          <button className="btn btn-p mt-4 mx-auto" onClick={() => ref.current?.click()}>
            Upload Your First PDF
          </button>
        </div>
      ) : !shown.length ? (
        <div className="card py-12 text-center text-slate-400">No documents match your active filters.</div>
      ) : (
        <div className="space-y-3">
          {shown.map((d) => (
            <div key={d.id} className="card card-hover !p-4 transition">
              <div className="flex flex-wrap items-start gap-4">
                <input
                  type="checkbox"
                  className="mt-1 rounded h-4 w-4"
                  aria-label={`Select ${d.name}`}
                  checked={selected.includes(d.id)}
                  onChange={(e) => toggleSelected(d.id, e.target.checked)}
                />
                <button
                  className="text-2xl transition hover:scale-110"
                  title={d.favorite ? "Remove from favorites" : "Add to favorites"}
                  onClick={() => void updateMetadata(d.id, { favorite: !d.favorite }).then(load)}
                >
                  {d.favorite ? <span className="text-amber-500">★</span> : <span className="text-slate-300 hover:text-amber-400">☆</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-base text-[#0b2536] truncate">{d.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#58747f]">
                    <span>{kb(d.size)}</span>
                    <span>•</span>
                    <span>Updated {new Date(d.added).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {d.folder && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#e0f2fe] px-2 py-0.5 text-xs font-medium text-[#0369a1]">
                        <Icon n="folder" size={12} /> {d.folder}
                      </span>
                    )}
                    {(d.tags || []).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-0.5 rounded-md bg-[#f1f5f9] px-2 py-0.5 text-xs text-[#334155] border border-[#e2e8f0]">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link className="btn btn-p !min-h-[36px] text-xs font-semibold" to={`/editor?doc=${d.id}`}>
                    <Icon n="edit" size={14} /> Open
                  </Link>
                  <button
                    className="btn !min-h-[36px] text-xs font-bold !bg-emerald-50 !text-emerald-700 !border-emerald-300 hover:!bg-emerald-100 transition"
                    onClick={() => save(d.file, d.name)}
                    title={`1-Click Direct Download ${d.name}`}
                  >
                    <Icon n="down" size={14} /> Download
                  </button>
                  <button
                    className="btn !min-h-[36px] text-xs font-semibold !bg-cyan-50 !text-cyan-700 !border-cyan-300 hover:!bg-cyan-100 transition"
                    onClick={() => {
                      setSummarizerDocId(d.id);
                      setShowSummarizer(true);
                    }}
                    title="Generate Visual Mind Map & Summary"
                  >
                    <Icon n="merge" size={14} /> Mind Map
                  </button>
                  <button className="btn !min-h-[36px] text-xs" onClick={() => setModal({ type: "rename", doc: d, name: d.name.replace(/\.pdf$/i, "") })}>
                    Rename
                  </button>
                  <button className="btn !min-h-[36px] text-xs" onClick={() => setModal({ type: "folder", doc: d, folder: d.folder || "" })}>
                    Folder
                  </button>
                  <button className="btn !min-h-[36px] text-xs" onClick={() => setModal({ type: "tags", doc: d, tags: d.tags || [] })}>
                    Tags
                  </button>
                  <button
                    className="btn !min-h-[36px] text-xs"
                    disabled={busy === d.id}
                    onClick={() => {
                      setTarget(d);
                      versionRef.current?.click();
                    }}
                  >
                    {busy === d.id ? "Saving…" : "Add Version"}
                  </button>
                  <button className="btn !min-h-[36px] text-xs" onClick={() => void toggleVersions(d.id)}>
                    {expanded === d.id ? "Hide History" : "Versions"}
                  </button>
                  <button className="btn !min-h-[36px] text-xs !border-red-200 text-red-600 hover:bg-red-50" onClick={() => setModal({ type: "delete", doc: d })}>
                    <Icon n="trash" size={14} />
                  </button>
                </div>
              </div>

              {/* Version History Sub-Panel */}
              {expanded === d.id && (
                <section className="mt-4 border-t border-[#e1ecef] pt-4">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#475569]">Saved Version History</h4>
                  {(versionRows[d.id] || []).length ? (
                    <div className="space-y-2">
                      {versionRows[d.id].map((v) => (
                        <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-3 text-sm">
                          <div>
                            <p className="font-medium text-[#1e293b]">{v.name}</p>
                            <p className="text-xs text-[#64748b]">
                              {kb(v.size)} • {new Date(v.added).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button className="btn !min-h-[32px] text-xs" onClick={() => save(v.file, v.name)}>
                              Download
                            </button>
                            <button className="btn btn-p !min-h-[32px] text-xs" onClick={() => setModal({ type: "restore", doc: d, version: v })}>
                              Restore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#64748b]">No previous snapshots yet. Click &ldquo;Add Version&rdquo; to store a version checkpoint.</p>
                  )}
                </section>
              )}
            </div>
          ))}
        </div>
      )}

      <input ref={versionRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void addNewVersion(e.target.files?.[0])} />

      {/* Download History Section */}
      <section className="card">
        <h2 className="mb-3 text-base font-semibold text-[#0b2536]">Recent Downloads</h2>
        {hist.length ? (
          <div className="divide-y divide-[#f1f5f9]">
            {hist.slice(0, 8).map((h, i) => (
              <div key={i} className="flex justify-between items-center py-2 text-sm text-[#475569]">
                <span className="truncate font-medium">{h.name}</span>
                <span className="shrink-0 text-xs text-[#94a3b8]">{new Date(h.t).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No documents downloaded in this session yet.</p>
        )}
      </section>

      {/* In-Page Interactive Modal Dialogs */}
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {modal.type === "rename" && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-[#0b2536]">Rename Document</h3>
                <input
                  className="input"
                  autoFocus
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  placeholder="Enter file name"
                />
                <div className="flex justify-end gap-2">
                  <button className="btn" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-p" onClick={handleConfirmModal}>Save Name</button>
                </div>
              </div>
            )}

            {(modal.type === "folder" || modal.type === "bulkFolder") && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-[#0b2536]">
                  {modal.type === "folder" ? "Move to Folder" : "Move Selected to Folder"}
                </h3>
                <p className="text-xs text-slate-500">Pick an existing folder or type a new one:</p>
                {folders.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {folders.map((f) => (
                      <button
                        key={f}
                        className={`chip ${modal.folder === f ? "!border-brand-600 !bg-brand-100" : ""}`}
                        onClick={() => setModal({ ...modal, folder: f })}
                      >
                        📁 {f}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  className="input"
                  autoFocus
                  value={modal.folder}
                  onChange={(e) => setModal({ ...modal, folder: e.target.value })}
                  placeholder="Folder name (leave blank for no folder)"
                />
                <div className="flex justify-end gap-2">
                  <button className="btn" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-p" onClick={handleConfirmModal}>Apply Folder</button>
                </div>
              </div>
            )}

            {(modal.type === "tags" || modal.type === "bulkTag") && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-[#0b2536]">
                  {modal.type === "tags" ? "Edit Tags" : "Set Tags for Selected"}
                </h3>
                <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-[#f8fafc] rounded-xl border border-[#e2e8f0]">
                  {modal.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-100 text-brand-900 px-2.5 py-0.5 text-xs font-medium">
                      #{t}
                      <button
                        type="button"
                        onClick={() => setModal({ ...modal, tags: modal.tags.filter((x) => x !== t) })}
                        className="hover:text-red-700 font-bold ms-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {!modal.tags.length && <span className="text-xs text-slate-400">No tags added yet</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagInput.trim()) {
                        e.preventDefault();
                        const newTag = tagInput.trim().replace(/^#/, "");
                        if (!modal.tags.includes(newTag)) {
                          setModal({ ...modal, tags: [...modal.tags, newTag] });
                        }
                        setTagInput("");
                      }
                    }}
                    placeholder="Type tag & press enter"
                  />
                  <button
                    type="button"
                    className="btn shrink-0"
                    onClick={() => {
                      if (tagInput.trim()) {
                        const newTag = tagInput.trim().replace(/^#/, "");
                        if (!modal.tags.includes(newTag)) {
                          setModal({ ...modal, tags: [...modal.tags, newTag] });
                        }
                        setTagInput("");
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-p" onClick={handleConfirmModal}>Save Tags</button>
                </div>
              </div>
            )}

            {(modal.type === "delete" || modal.type === "bulkDelete") && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-red-600">Confirm Deletion</h3>
                <p className="text-sm text-slate-600">
                  {modal.type === "delete"
                    ? `Are you sure you want to permanently delete “${modal.doc.name}” and all its version history?`
                    : `Are you sure you want to delete ${selected.length} selected documents and their histories?`}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button className="btn" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-p !bg-red-600 hover:!bg-red-700" onClick={handleConfirmModal}>Delete Permanently</button>
                </div>
              </div>
            )}

            {modal.type === "restore" && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-[#0b2536]">Restore Document Version</h3>
                <p className="text-sm text-slate-600">
                  Restore version from {new Date(modal.version.added).toLocaleString()}? Your current file will be preserved as a previous version.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button className="btn" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-p" onClick={handleConfirmModal}>Restore Version</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Summarizer & Mind Map Modal */}
      <SmartSummarizerModal
        isOpen={showSummarizer}
        onClose={() => setShowSummarizer(false)}
        initialDocId={summarizerDocId}
      />

      {/* Cloud Storage Picker Modal */}
      <CloudStoragePicker
        isOpen={showCloudPicker}
        onClose={() => setShowCloudPicker(false)}
        onFileLoaded={() => void load()}
      />
    </div>
  );
}
