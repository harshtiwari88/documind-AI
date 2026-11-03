import React, { useState } from "react";
import { Icon } from "../editor/icons";
import { add as addDoc, Doc } from "../lib/docs";
import HarshRobot from "./HarshRobot";

interface CloudStoragePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onFileLoaded?: (file: File, docId?: string) => void;
}

export default function CloudStoragePicker({
  isOpen,
  onClose,
  onFileLoaded,
}: CloudStoragePickerProps) {
  const [activeProvider, setActiveProvider] = useState<"gdrive" | "dropbox" | "onedrive" | "url">("gdrive");
  const [urlInput, setUrlInput] = useState("");
  const [fileNameInput, setFileNameInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  // Stream remote file through our secure backend streaming endpoint
  const handleImportUrl = async (targetUrl: string, provider: string, customName?: string) => {
    if (!targetUrl.trim()) {
      setErrorMsg("Please enter a valid document link.");
      return;
    }

    setBusy(true);
    setErrorMsg("");
    setStatusMsg(`Connecting to ${provider} and streaming document…`);

    try {
      const res = await fetch("/api/cloud/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl.trim(),
          provider,
          name: customName || fileNameInput.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Failed to fetch file (HTTP ${res.status})`);
      }

      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = match?.[1] || customName || fileNameInput.trim() || `${provider}-document.pdf`;

      const blob = await res.blob();
      const file = new File([blob], filename, { type: "application/pdf" });

      // Add to local documents store
      const added: Doc = await addDoc(file);

      setStatusMsg("Document imported successfully!");
      if (onFileLoaded) {
        onFileLoaded(file, added.id);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error("Cloud import error:", err);
      setErrorMsg(err?.message || "Failed to import document from cloud storage.");
    } finally {
      setBusy(false);
    }
  };

  // Launch Dropbox Chooser SDK (if script loaded) or prompt for link
  const launchDropboxChooser = () => {
    if (typeof (window as any).Dropbox !== "undefined") {
      const options = {
        success: function (files: any[]) {
          if (files && files.length > 0) {
            const f = files[0];
            void handleImportUrl(f.link, "dropbox", f.name);
          }
        },
        cancel: function () {
          // user cancelled
        },
        linkType: "direct",
        multiselect: false,
        extensions: [".pdf"],
      };
      (window as any).Dropbox.choose(options);
    } else {
      // Direct link fallback
      setActiveProvider("dropbox");
    }
  };

  // Launch Google Drive Picker
  const launchGoogleDrivePicker = () => {
    setActiveProvider("gdrive");
  };

  // Launch OneDrive Picker
  const launchOneDrivePicker = () => {
    if (typeof (window as any).OneDrive !== "undefined") {
      const odOptions = {
        clientId: "documind-onedrive-client",
        action: "download",
        multiSelect: false,
        advanced: {
          filter: ".pdf",
        },
        success: function (files: any) {
          const file = files?.value?.[0];
          if (file?.["@microsoft.graph.downloadUrl"]) {
            void handleImportUrl(file["@microsoft.graph.downloadUrl"], "onedrive", file.name);
          }
        },
        cancel: function () {},
        error: function (e: any) {
          console.warn("OneDrive picker:", e);
          setActiveProvider("onedrive");
        },
      };
      (window as any).OneDrive.open(odOptions);
    } else {
      setActiveProvider("onedrive");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700/70 bg-[#0d162a] text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 bg-[#090f1d] px-6 py-4">
          <div className="flex items-center gap-3">
            <HarshRobot size={38} mood="happy" />
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Enterprise Cloud Storage Picker</span>
                <span className="rounded-full bg-cyan-900/60 px-2 py-0.5 text-[10px] font-semibold text-[#00f5d4] border border-cyan-500/30">
                  Direct Stream
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Import and export PDFs directly with Google Drive, Dropbox, and OneDrive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
            aria-label="Close"
          >
            <Icon n="x" size={16} />
          </button>
        </div>

        {/* Provider Switcher Tabs */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-[#080d1a] p-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => {
              setActiveProvider("gdrive");
              setErrorMsg("");
            }}
            className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 transition ${
              activeProvider === "gdrive"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
                : "text-slate-400 hover:bg-slate-800/60"
            }`}
          >
            <span className="text-base">📁</span>
            <span>Google Drive</span>
          </button>

          <button
            onClick={() => {
              setActiveProvider("dropbox");
              setErrorMsg("");
            }}
            className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 transition ${
              activeProvider === "dropbox"
                ? "bg-sky-600/20 text-sky-400 border border-sky-500/40"
                : "text-slate-400 hover:bg-slate-800/60"
            }`}
          >
            <span className="text-base">📦</span>
            <span>Dropbox</span>
          </button>

          <button
            onClick={() => {
              setActiveProvider("onedrive");
              setErrorMsg("");
            }}
            className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 transition ${
              activeProvider === "onedrive"
                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/40"
                : "text-slate-400 hover:bg-slate-800/60"
            }`}
          >
            <span className="text-base">☁️</span>
            <span>OneDrive</span>
          </button>

          <button
            onClick={() => {
              setActiveProvider("url");
              setErrorMsg("");
            }}
            className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 transition ${
              activeProvider === "url"
                ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/40"
                : "text-slate-400 hover:bg-slate-800/60"
            }`}
          >
            <span className="text-base">🔗</span>
            <span>Direct URL</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-red-500/50 bg-red-950/40 p-3.5 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {statusMsg && (
            <div className="rounded-xl border border-cyan-500/50 bg-cyan-950/40 p-3.5 text-xs text-cyan-300 flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Provider Panel: Google Drive */}
          {activeProvider === "gdrive" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-[#111c35] p-4 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Icon n="bolt" size={14} className="text-blue-400" />
                  Google Drive Direct Integration
                </p>
                <p>
                  Paste any Google Drive sharing link (e.g. <code>https://drive.google.com/file/d/ID/view</code>) or use the quick picker to stream directly into the PDF workspace.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Google Drive File or Share Link
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Document Title (Optional)
                </label>
                <input
                  type="text"
                  value={fileNameInput}
                  onChange={(e) => setFileNameInput(e.target.value)}
                  placeholder="e.g. Quarterly_Financial_Report.pdf"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Provider Panel: Dropbox */}
          {activeProvider === "dropbox" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-[#111c35] p-4 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Icon n="bolt" size={14} className="text-sky-400" />
                  Dropbox Chooser &amp; Direct Stream
                </p>
                <p>
                  Paste any Dropbox share link (e.g. <code>https://www.dropbox.com/s/.../document.pdf?dl=0</code>). Our streaming engine converts it directly to high-speed binary streams.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Dropbox Share Link
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.dropbox.com/s/.../file.pdf"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Document Title (Optional)
                </label>
                <input
                  type="text"
                  value={fileNameInput}
                  onChange={(e) => setFileNameInput(e.target.value)}
                  placeholder="e.g. Dropbox_Contract.pdf"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Provider Panel: OneDrive */}
          {activeProvider === "onedrive" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-[#111c35] p-4 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Icon n="bolt" size={14} className="text-indigo-400" />
                  Microsoft OneDrive File Picker
                </p>
                <p>
                  Paste any OneDrive or SharePoint shared link to securely stream and edit documents.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  OneDrive / SharePoint Link
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://1drv.ms/... or https://company.sharepoint.com/..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Document Title (Optional)
                </label>
                <input
                  type="text"
                  value={fileNameInput}
                  onChange={(e) => setFileNameInput(e.target.value)}
                  placeholder="e.g. OneDrive_Document.pdf"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Provider Panel: Direct URL */}
          {activeProvider === "url" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-[#111c35] p-4 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Icon n="link" size={14} className="text-cyan-400" />
                  Direct PDF URL Streamer (S3, GCS, Cloudflare)
                </p>
                <p>
                  Paste any public or signed HTTPS PDF URL to stream it into DocuMind AI without CORS restrictions.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  HTTPS PDF Document URL
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/files/specifications.pdf"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Document Title (Optional)
                </label>
                <input
                  type="text"
                  value={fileNameInput}
                  onChange={(e) => setFileNameInput(e.target.value)}
                  placeholder="e.g. Cloud_Specification.pdf"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-[#090f1d] px-6 py-4">
          <span className="text-[11px] text-slate-400">
            Protected with SSL stream encryption
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              disabled={busy || !urlInput.trim()}
              onClick={() => handleImportUrl(urlInput, activeProvider)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 text-xs font-bold text-white shadow-lg hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50 transition"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Streaming…</span>
                </>
              ) : (
                <>
                  <Icon n="down" size={14} />
                  <span>Stream &amp; Open Document</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
