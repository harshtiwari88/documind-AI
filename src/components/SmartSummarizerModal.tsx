import { useEffect, useState } from "react";
import { Doc, list as listDocs } from "../lib/docs";
import { Icon } from "../editor/icons";
import HarshRobot from "./HarshRobot";
import MindMapViewer, { MindMapData } from "./MindMapViewer";

interface SmartSummarizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDocId?: string | null;
  initialDocText?: string;
  initialDocName?: string;
}

export default function SmartSummarizerModal({
  isOpen,
  onClose,
  initialDocId,
  initialDocText,
  initialDocName,
}: SmartSummarizerModalProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId || "");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [focusArea, setFocusArea] = useState<string>("overview");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<MindMapData | null>(null);

  useEffect(() => {
    if (isOpen) {
      listDocs().then((list) => {
        setDocs(list);
        if (!selectedDocId && list.length > 0 && !initialDocId && !initialDocText) {
          setSelectedDocId(list[0].id);
        }
      });
      if (initialDocId) setSelectedDocId(initialDocId);
    }
  }, [isOpen, initialDocId]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setError("");
    setBusy(true);

    try {
      let docText = initialDocText || "";
      let docName = initialDocName || "";
      let fileToSend: File | null = uploadedFile;

      if (!fileToSend && selectedDocId) {
        const found = docs.find((d) => d.id === selectedDocId);
        if (found) {
          fileToSend = new File([found.file], found.name, { type: "application/pdf" });
          docName = found.name;
        }
      }

      // Prepare request payload
      let res: Response;
      if (fileToSend) {
        const formData = new FormData();
        formData.append("file", fileToSend);
        formData.append("doc_name", docName || fileToSend.name);
        formData.append("focus_area", focusArea);
        if (customPrompt) formData.append("prompt", customPrompt);

        res = await fetch("/ai/summarize-mindmap", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/ai/summarize-mindmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc_name: docName || "Document",
            doc_text: docText || "Executive business and technical document.",
            focus_area: focusArea,
            prompt: customPrompt,
          }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned ${res.status}`);
      }

      const data: MindMapData = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error("Summarizer error:", err);
      setError(err?.message || "Failed to generate mind map and summary. Please verify your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-700/70 bg-[#0d162a] shadow-2xl">
        {/* If result exists, show interactive MindMapViewer full-modal with return button */}
        {result ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#090f1d] px-5 py-2.5 text-xs">
              <button
                onClick={() => setResult(null)}
                className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                ← Back to Settings / Generate New
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-slate-800 px-3 py-1 text-slate-300 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <MindMapViewer data={result} onClose={onClose} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto p-6 sm:p-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-5">
              <div className="flex items-center gap-4">
                <HarshRobot size={50} mood="thinking" />
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <span>Smart Summarizer &amp; Visual Mind Maps</span>
                    <span className="rounded-full bg-cyan-900/60 px-2.5 py-0.5 text-xs font-semibold text-[#00f5d4] border border-cyan-500/30">
                      Gemini 3.8 Flash
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm text-slate-300">
                    Transform complex PDF reports, textbooks, contracts, and research papers into clear visual mind maps &amp; structured takeaways.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                aria-label="Close"
              >
                <Icon n="x" size={18} />
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/50 bg-red-950/40 p-4 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Config Form */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {/* Left Column: Document Source */}
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#111c35] p-5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Icon n="pages" size={16} className="text-cyan-400" />
                  Select Document Source
                </h3>

                {docs.length > 0 && !uploadedFile && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Choose from My Documents
                    </label>
                    <select
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    >
                      {docs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({(d.size / 1024).toFixed(0)} KB)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative">
                  <div className="my-2 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-800" />
                    <span className="text-[11px] text-slate-500 uppercase font-semibold">or upload PDF file</span>
                    <div className="h-px flex-1 bg-slate-800" />
                  </div>

                  <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 p-4 text-center cursor-pointer hover:border-cyan-400 transition">
                    <Icon n="up" size={24} className="text-cyan-400 mb-2" />
                    <span className="text-xs font-semibold text-slate-200">
                      {uploadedFile ? uploadedFile.name : "Choose a PDF file to analyze"}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      {uploadedFile ? `${(uploadedFile.size / 1024).toFixed(0)} KB` : "Supports research papers, contracts, notes up to 50MB"}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.[0]) setUploadedFile(e.target.files[0]);
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Right Column: Focus Area & Style */}
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#111c35] p-5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Icon n="sliders" size={16} className="text-cyan-400" />
                  Synthesis Focus Area
                </h3>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ["overview", "Executive Overview", "High level takeaways & vision"],
                    ["study", "Academic Study Notes", "Key concepts, definitions & MCQs"],
                    ["legal", "Legal & Contracts", "Obligations, clauses & risk factors"],
                    ["technical", "System & Architecture", "Flowcharts, specs & components"],
                  ].map(([val, label, desc]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFocusArea(val)}
                      className={`flex flex-col text-start rounded-xl p-3 border transition ${
                        focusArea === val
                          ? "border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-sm ring-1 ring-cyan-400"
                          : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <span className="font-semibold text-white">{label}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">{desc}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Specific Questions or Focus (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="e.g., Focus specifically on risk mitigation, timeline milestones, or Chapter 3 formulas..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Icon n="bolt" size={14} className="text-[#00f5d4]" />
                <span>Generates interactive Mermaid.js SVG flowchart + Executive Summary</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGenerate}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 text-xs font-bold text-white shadow-lg hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50 transition"
                >
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Synthesizing Mind Map…</span>
                    </>
                  ) : (
                    <>
                      <Icon n="merge" size={15} />
                      <span>Generate Visual Mind Map</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
