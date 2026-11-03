import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { add, Doc, list, validate } from "../lib/docs";
import { save } from "../lib/api";
import { Icon } from "../editor/icons";
import { formatBytes, useStorage } from "../lib/useStorage";
import { TOOLS } from "./Tools";
import HarshRobot from "../components/HarshRobot";
import { PWAInstallButton } from "../components/PWAInstallButton";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import SmartSummarizerModal from "../components/SmartSummarizerModal";
import CloudStoragePicker from "../components/CloudStoragePicker";
import { usePWAInstall } from "../lib/usePWAInstall";

const WORKSPACE_APPS: [string, string, string, string, string][] = [
  ["Harsh AI Assistant", "wand", "/assistant", "text-[#00f5d4] bg-cyan-950/60 border border-cyan-500/30", "Academic Q&A, MCQs, and Hinglish document companion"],
  ["PDF Editor Studio", "edit", "/editor", "text-emerald-400 bg-emerald-950/60 border border-emerald-500/30", "Desktop PDF editor with native cover text & signatures"],
  ["Voice Studio", "mic", "/voice", "text-blue-400 bg-blue-950/60 border border-blue-500/30", "Dual-mode conversational & voice editing in Hinglish"],
  ["Smart Summarizer & Mind Maps", "merge", "#mindmap", "text-purple-400 bg-purple-950/60 border border-purple-500/30", "Gemini AI interactive Mermaid.js visual flowchart mind maps"],
  ["Cloud Storage Vault", "folder", "#cloud", "text-sky-400 bg-sky-950/60 border border-sky-500/30", "Google Drive, Dropbox, and OneDrive direct stream/export"],
  ["PDF Tools & OCR Suite", "scan", "/tools", "text-amber-400 bg-amber-950/60 border border-amber-500/30", "OCR text layer, merge, split, compress, watermark"],
];

export default function Home() {
  const nav = useNavigate(), ref = useRef<HTMLInputElement>(null), st = useStorage();
  const [err, setErr] = useState(""), [drag, setDrag] = useState(false), [q, setQ] = useState(""), [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]), [loading, setLoading] = useState(true);
  const [showSummarizer, setShowSummarizer] = useState(false);
  const [summarizerDocId, setSummarizerDocId] = useState<string | null>(null);
  const [showCloudPicker, setShowCloudPicker] = useState(false);
  const { isInstalled, isInstallable, install } = usePWAInstall();

  const refresh = useCallback(async () => {
    try { setDocs(await list()); } catch { setErr("Couldn't load your local documents. Please refresh the page."); }
    setLoading(false); void st.refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
    const f = () => void refresh();
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, [refresh]);

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

  // Generate a verified sample PDF in 1-click
  async function loadSamplePdf(shouldDownloadOnly = false) {
    setBusy(true);
    setErr("");
    try {
      const doc = await PDFDocument.create();
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([595.28, 841.89]); // A4 size

      page.drawText("DocuMind AI & Harsh AI - Enterprise Document", {
        x: 50,
        y: 780,
        size: 19,
        font: fontBold,
        color: rgb(0.04, 0.08, 0.17),
      });

      page.drawText("Executive Briefing & Visual Mind Map Demo Document", {
        x: 50,
        y: 752,
        size: 12,
        font: fontBold,
        color: rgb(0.01, 0.52, 0.78),
      });

      page.drawText("1. Document Overview & Multimodal AI Intelligence", {
        x: 50,
        y: 710,
        size: 13,
        font: fontBold,
        color: rgb(0.05, 0.08, 0.15),
      });

      page.drawText(
        "DocuMind AI provides native text replacement, scanned OCR layer synthesis, multimodal Gemini AI chat,\nand intelligent voice-controlled PDF transformations in Hinglish and English.\nUse this document to test direct text editing, drawing, voice commands, and 1-click downloads.",
        {
          x: 50,
          y: 685,
          size: 10,
          font,
          lineHeight: 15,
          color: rgb(0.2, 0.25, 0.3),
        }
      );

      page.drawText("2. Cloud Storage & Direct Integrations", {
        x: 50,
        y: 615,
        size: 13,
        font: fontBold,
        color: rgb(0.05, 0.08, 0.15),
      });

      page.drawText(
        "Seamlessly stream and export documents between Google Drive, Dropbox, and Microsoft OneDrive\nwith enterprise token validation and binary buffer streaming.\nGenerate visual Mermaid.js flowcharts and executive summaries in one click.",
        {
          x: 50,
          y: 590,
          size: 10,
          font,
          lineHeight: 15,
          color: rgb(0.2, 0.25, 0.3),
        }
      );

      page.drawText("3. Key Action Items & Verification", {
        x: 50,
        y: 520,
        size: 13,
        font: fontBold,
        color: rgb(0.05, 0.08, 0.15),
      });

      page.drawText(
        "• Test 1-click download right from the Home tab.\n• Launch the Smart Summarizer to render interactive Mermaid.js visual mind maps.\n• Open the Hinglish Voice Studio to issue spoken editing commands.",
        {
          x: 50,
          y: 495,
          size: 10,
          font,
          lineHeight: 16,
          color: rgb(0.2, 0.25, 0.3),
        }
      );

      page.drawText("Status: Enterprise Verified • Harsh AI v2.0 • Generated: " + new Date().toLocaleDateString(), {
        x: 50,
        y: 80,
        size: 9,
        font,
        color: rgb(0.5, 0.55, 0.6),
      });

      const bytes = await doc.save();
      const sampleBlob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const sampleFile = new File([sampleBlob], "DocuMind_AI_Enterprise_Sample.pdf", { type: "application/pdf" });

      if (shouldDownloadOnly) {
        save(sampleBlob, "DocuMind_AI_Enterprise_Sample.pdf");
      } else {
        const added = await add(sampleFile);
        await refresh();
        nav("/editor?doc=" + added.id);
      }
    } catch (e: any) {
      setErr("Could not generate sample document: " + e?.message);
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();
  const dateLine = `${now.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${now.toLocaleDateString(undefined, { weekday: "short" })}`;
  const recent = useMemo(() => [...docs].sort((a, b) => b.added - a.added).slice(0, 6), [docs]);
  const recentCount = docs.filter(d => Date.now() - d.added < 30 * 864e5).length;
  const folderCount = new Set(docs.map(d => d.folder?.trim()).filter(Boolean)).size;
  const filed = docs.filter(d => d.folder?.trim()).length, favorites = docs.filter(d => d.favorite).length;

  const other = st.usage != null ? Math.max(0, st.usage - st.pdfBytes - st.versionBytes) : 0;
  const total = st.quota || st.pdfBytes + st.versionBytes + other || 1;
  const R = 52, C = 2 * Math.PI * R;
  const segs: [string, string, number][] = [["PDF documents", "#0284c7", st.pdfBytes], ["Saved versions", "#00f5d4", st.versionBytes], ["Other site data", "#94a3b8", other]];
  let offset = 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-8">
      {/* Harsh AI Greeting Banner with 1-Click Action Hub */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <HarshRobot size={54} mood="happy" showBadge />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#0b132b] md:text-3xl">
                Welcome to Harsh <span className="text-blue-600">AI</span>
              </h1>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-800">
                v2.0
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 md:text-base">
              Your Intelligent Document &amp; AI Companion. Edit PDFs, issue voice commands, and generate visual mind maps.
            </p>
          </div>
        </div>

        {/* Header Right Actions: Quick Sample & Direct Download */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void loadSamplePdf(false)}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-blue-50 px-3.5 text-xs font-bold text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
            title="1-Click Open Sample PDF in Editor"
          >
            <Icon n="open" size={15} />
            <span>Open Sample PDF</span>
          </button>
          <button
            onClick={() => void loadSamplePdf(true)}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-50 px-3.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
            title="1-Click Direct Download Sample PDF"
          >
            <Icon n="down" size={15} />
            <span>1-Click Download Sample</span>
          </button>
          <div className="hidden lg:flex items-center gap-2.5 rounded-2xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <Icon n="clock" size={15} />
            </span>
            <div className="leading-tight">
              <div className="text-[10px] text-slate-400">Today</div>
              <div className="font-semibold text-slate-700">{dateLine}</div>
            </div>
          </div>
        </div>
      </header>

      {/* PWA Install Banner & App Status */}
      <PWAInstallButton variant="banner" />

      {err && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {/* Document Library Stats */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Document statistics">
        <Stat
          title="Total Documents"
          value={loading ? "—" : String(docs.length)}
          icon="pages"
          tile="bg-blue-100 text-blue-600"
          wash="from-blue-50"
          note={recentCount ? `↑ ${recentCount} active in 30 days` : "No changes recently"}
        />
        <Stat
          title="Document Folders"
          value={loading ? "—" : String(folderCount)}
          icon="folder"
          tile="bg-cyan-100 text-cyan-700"
          wash="from-cyan-50"
          note={`${filed} document${filed === 1 ? "" : "s"} organized`}
        />
        <Stat
          title="Favorites"
          value={loading ? "—" : String(favorites)}
          icon="star"
          tile="bg-amber-100 text-amber-700"
          wash="from-amber-50"
          note={`Starred for quick access`}
        />
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-100 text-cyan-700">
              <Icon n="db" size={24} />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Storage Usage</div>
              <div className="mt-0.5 text-2xl font-bold tracking-tight text-[#0b132b]">
                {formatBytes(st.pdfBytes + st.versionBytes)}
              </div>
              <div className="text-xs text-slate-400">
                {st.quota ? `of ${formatBytes(st.quota)} (${st.percent}%)` : "Local cache"}
              </div>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
              style={{ width: `${st.percent ?? 0}%` }}
            />
          </div>
        </div>
      </section>

      {/* Main Upload Dropzone & App Hub */}
      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <section
          className={`relative flex min-h-[260px] flex-col items-center gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b132b] via-[#1c2541] to-[#1e3a8a] p-6 text-white transition md:flex-row md:p-9 shadow-lg ${
            drag ? "ring-4 ring-cyan-400" : ""
          }`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files); }}
        >
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-cyan-500/10" />

          <div className="relative shrink-0">
            <HarshRobot size={110} mood="happy" showBadge />
          </div>

          <div className="relative text-center md:text-start flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-[#00f5d4] mb-2">
              <Icon n="bolt" size={12} /> Instant Drop &amp; AI Analysis
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Upload Your PDFs
            </h2>
            <p className="mt-1.5 text-sm text-slate-300">
              Drag and drop files here, or click to browse (up to 50 MB each)
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <button
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 text-sm font-bold text-white shadow-lg hover:from-blue-500 hover:to-cyan-400 disabled:opacity-60 transition"
                disabled={busy}
                onClick={() => ref.current?.click()}
              >
                <Icon n="up" size={17} />
                {busy ? "Processing…" : "Select Local Files"}
              </button>
              <button
                onClick={() => setShowCloudPicker(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-950/50 px-4 text-sm font-semibold text-sky-200 hover:bg-sky-900/60 transition"
              >
                <Icon n="folder" size={16} />
                <span>Cloud Import</span>
              </button>
              <button
                onClick={() => {
                  setSummarizerDocId(null);
                  setShowSummarizer(true);
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-400/30 bg-white/10 px-4 text-sm font-semibold text-cyan-200 hover:bg-white/20 transition"
              >
                <Icon n="merge" size={16} />
                <span>Visual Mind Map</span>
              </button>
            </div>
            <input ref={ref} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => void pick(e.target.files)} />
          </div>
        </section>

        {/* Workstation App Hub in Home Tab */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-[#0b132b]">
                <span className="text-blue-600"><Icon n="layers" size={18} /></span>
                Harsh AI App Suite
              </h2>
              {isInstallable && !isInstalled && (
                <button
                  onClick={install}
                  className="rounded-lg bg-cyan-50 text-cyan-700 px-2.5 py-1 text-[11px] font-bold hover:bg-cyan-100 transition border border-cyan-200"
                  title="Install Harsh AI App on Desktop or Mobile"
                >
                  + Install App
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {WORKSPACE_APPS.map(([label, icon, to, tone, desc]) => {
                if (to === "#mindmap") {
                  return (
                    <button
                      key={label}
                      onClick={() => setShowSummarizer(true)}
                      className="flex min-h-[54px] flex-col justify-center text-start rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 transition hover:border-blue-400 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>
                          <Icon n={icon} size={15} />
                        </span>
                        <span className="truncate text-xs font-bold text-slate-800">{label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate mt-1">{desc}</span>
                    </button>
                  );
                }
                if (to === "#cloud") {
                  return (
                    <button
                      key={label}
                      onClick={() => setShowCloudPicker(true)}
                      className="flex min-h-[54px] flex-col justify-center text-start rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 transition hover:border-blue-400 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>
                          <Icon n={icon} size={15} />
                        </span>
                        <span className="truncate text-xs font-bold text-slate-800">{label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate mt-1">{desc}</span>
                    </button>
                  );
                }
                return (
                  <Link
                    key={label}
                    to={to}
                    className="flex min-h-[54px] flex-col justify-center text-start rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 transition hover:border-blue-400 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>
                        <Icon n={icon} size={15} />
                      </span>
                      <span className="truncate text-xs font-bold text-slate-800">{label}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 truncate mt-1">{desc}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Offline Cache Active</span>
            </span>
            <Link to="/tools" className="text-blue-600 font-semibold hover:underline">All Tools →</Link>
          </div>
        </section>
      </div>

      {/* Recent Documents Table with Direct 1-Click Download */}
      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 pb-3 pt-5 border-b border-slate-100">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-[#0b132b]">
                <span className="text-blue-600"><Icon n="clock" size={18} /></span>
                Recent Documents
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Instant 1-Click Download, Visual Mind Map, or Visual PDF Edit
              </p>
            </div>
            <Link to="/documents" className="text-xs font-semibold text-blue-600 hover:underline">
              View All ({docs.length})
            </Link>
          </div>

          {loading ? (
            <p className="px-6 py-12 text-center text-sm text-slate-400">Loading your document library…</p>
          ) : !recent.length ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400 space-y-3">
              <p>No documents yet. Drag and drop any PDF above or load a sample document.</p>
              <button
                onClick={() => void loadSamplePdf(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-4 py-2 text-xs font-semibold hover:bg-blue-700 transition"
              >
                <Icon n="plus" size={14} />
                Load Sample Document
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto p-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    {["Name", "Size", "Modified", "1-Click Actions"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-start font-semibold first:rounded-s-lg last:rounded-e-lg">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition text-slate-800">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <span className="grid h-8 w-7 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-600">
                            <Icon n="pages" size={16} />
                          </span>
                          <span className="max-w-[15rem] truncate font-medium">{d.name}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatBytes(d.size)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {new Date(d.added).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-4 py-3">
                        {/* Direct 1-Click Download and Action Suite */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => save(d.file, d.name)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition border border-emerald-200/80"
                            title={`1-Click Direct Download ${d.name}`}
                          >
                            <Icon n="down" size={13} />
                            <span>Download</span>
                          </button>
                          <Link
                            to={`/editor?doc=${d.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition border border-blue-200/60"
                            title="Open in Visual PDF Editor"
                          >
                            <Icon n="edit" size={13} />
                            <span>Edit</span>
                          </Link>
                          <button
                            onClick={() => {
                              setSummarizerDocId(d.id);
                              setShowSummarizer(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 transition border border-cyan-200/60"
                            title="Generate Visual Mind Map & Summary"
                          >
                            <Icon n="merge" size={13} />
                            <span className="hidden sm:inline">Mind Map</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Storage Distribution & Cloud Status */}
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-[#0b132b]">
              <span className="text-blue-600"><Icon n="db" size={18} /></span>
              Storage Distribution
            </h2>
            <div className="flex flex-wrap items-center gap-5">
              <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0">
                <circle cx="70" cy="70" r={R} fill="none" stroke="#e2e8f0" strokeWidth="14" />
                {segs.map(([name, color, bytes]) => {
                  const len = Math.min(C - offset, (bytes / total) * C);
                  const el = len > 0 ? (
                    <circle
                      key={name}
                      cx="70"
                      cy="70"
                      r={R}
                      fill="none"
                      stroke={color}
                      strokeWidth="14"
                      strokeDasharray={`${Math.max(len, 1.5)} ${C}`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 70 70)"
                    />
                  ) : null;
                  offset += len;
                  return el;
                })}
              </svg>

              <div className="space-y-2 text-xs">
                {segs.map(([name, color, bytes]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-slate-600">{name}:</span>
                    <span className="font-semibold text-slate-800">{formatBytes(bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Quick Cloud Storage Card */}
          <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-[#111c35] text-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">☁️</span>
              <div>
                <h3 className="text-sm font-bold text-white">Cloud Storage Hub</h3>
                <p className="text-xs text-slate-300">Google Drive • Dropbox • OneDrive</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Stream any remote PDF into your workstation without manual downloading.
            </p>
            <button
              onClick={() => setShowCloudPicker(true)}
              className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-bold text-white transition shadow-sm"
            >
              <Icon n="folder" size={14} />
              Open Cloud Storage Picker
            </button>
          </section>
        </div>
      </div>

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
        onFileLoaded={(file, docId) => {
          void refresh();
          if (docId) nav("/editor?doc=" + docId);
        }}
      />
    </div>
  );
}

function Stat({
  title,
  value,
  icon,
  tile,
  wash,
  note,
}: {
  title: string;
  value: string;
  icon: string;
  tile: string;
  wash: string;
  note: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br ${wash} to-white p-5 shadow-sm`}>
      <div className="flex items-start gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tile}`}>
          <Icon n={icon} size={24} />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</div>
          <div className="mt-0.5 text-2xl font-bold tracking-tight text-[#0b132b]">{value}</div>
          <div className="text-xs text-slate-400">{note}</div>
        </div>
      </div>
    </div>
  );
}
