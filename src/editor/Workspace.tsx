import { useEffect, useRef, useState } from "react";
import { editorStore as store, useEditor } from "./store";
import { Icon } from "./icons";
import PageView, { Spinner } from "./PageView";
import PagesRail from "./PagesRail";
import { DocumentPanel, FormatPanel } from "./Panels";
import VoicePanel from "./VoicePanel";
import type { Tool } from "./types";
import { list as listDocs } from "../lib/docs";
import type { Doc } from "../lib/docs";
import { useAppCommands } from "../lib/useAppCommands";
import { localParse } from "../lib/localNav";
import HarshRobot from "../components/HarshRobot";
import SmartSummarizerModal from "../components/SmartSummarizerModal";
import CloudStoragePicker from "../components/CloudStoragePicker";
import { safeStorage } from "../lib/safeStorage";

const TOOLS: [Tool, string, string][] = [
  ["select", "cursor", "Select"],
  ["text", "text", "Add Text"],
  ["edit", "edit", "Edit PDF Text"],
  ["erase", "erase", "Delete Text"],
  ["hl", "hl", "Highlight"],
  ["ul", "ul", "Underline"],
  ["st", "st", "Strike"],
  ["draw", "draw", "Draw Pen"],
  ["shape", "shape", "Shapes"],
  ["note", "note", "Comment"],
];

type Tab = "pages" | "format" | "document" | "voice";

function TB({
  icon,
  label,
  onClick,
  on,
  disabled,
  primary,
  showLabel = true,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  on?: boolean;
  disabled?: boolean;
  primary?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      className={`tbtn ${on ? "tbtn-on" : ""} ${primary ? "tbtn-primary" : ""}`}
      aria-pressed={on === undefined ? undefined : on}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon n={icon} />
      {showLabel && <span className="hidden text-xs xl:inline">{label}</span>}
    </button>
  );
}

/* ------------------------------------------------------------ Signature Pad */
function SignaturePad() {
  const cv = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [name, setName] = useState("");
  const [font, setFont] = useState("'Brush Script MT', 'Segoe Script', cursive");
  const [dirty, setDirty] = useState(false);
  const [keep, setKeep] = useState(true);
  const drawing = useRef(false);

  const ctx = () => cv.current!.getContext("2d")!;
  useEffect(() => {
    const c = ctx();
    c.lineWidth = 3;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#111";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * cv.current!.width,
      ((e.clientY - r.top) / r.height) * cv.current!.height,
    ];
  };

  const clear = () => {
    ctx().clearRect(0, 0, cv.current!.width, cv.current!.height);
    setDirty(false);
  };

  const typed = () => {
    clear();
    if (!name.trim()) return;
    const c = ctx();
    c.fillStyle = "#111";
    c.font = `64px ${font}`;
    c.textBaseline = "middle";
    c.fillText(name, 20, 100, 560);
    setDirty(true);
  };

  useEffect(() => {
    if (mode === "type") typed();
  }, [name, font, mode]);

  function use() {
    const c = cv.current!,
      d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width,
      y0 = c.height,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 8) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    }
    if (x1 <= x0) return store.toast("err", "Draw or type your signature first.");
    const pad = 6,
      out = document.createElement("canvas");
    out.width = x1 - x0 + 2 * pad;
    out.height = y1 - y0 + 2 * pad;
    out
      .getContext("2d")!
      .drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    const url = out.toDataURL("image/png");
    if (keep) {
      try {
        safeStorage.setItem("dm_signature", url);
      } catch {
        /* storage full */
      }
    }
    store.addSignature(url);
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Signature"
      onClick={() => store.openSignature(false)}
    >
      <div
        className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-700/50 bg-[#111a2e] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Add Signature</h2>
          <button className="tbtn" aria-label="Close" onClick={() => store.openSignature(false)}>
            <Icon n="x" />
          </button>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {(["draw", "type"] as const).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={`btn flex-1 ${mode === m ? "btn-p" : ""}`}
              onClick={() => {
                clear();
                setMode(m);
              }}
            >
              {m === "draw" ? "Draw" : "Type"}
            </button>
          ))}
        </div>
        {mode === "type" && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              className="input"
              autoFocus
              placeholder="Type your name"
              value={name}
              onChange={e => setName(e.target.value)}
              aria-label="Signature text"
            />
            <select
              className="input !w-auto"
              value={font}
              onChange={e => setFont(e.target.value)}
              aria-label="Signature style"
            >
              <option value="'Brush Script MT', 'Segoe Script', cursive">Script</option>
              <option value="'Snell Roundhand', 'Lucida Handwriting', cursive">Formal</option>
              <option value="'Comic Sans MS', 'Marker Felt', cursive">Casual</option>
            </select>
          </div>
        )}
        <canvas
          ref={cv}
          width={600}
          height={200}
          className="w-full touch-none rounded-xl bg-white shadow-inner"
          style={{ cursor: mode === "draw" ? "crosshair" : "default" }}
          aria-label="Signature area"
          onPointerDown={e => {
            if (mode !== "draw") return;
            drawing.current = true;
            cv.current!.setPointerCapture(e.pointerId);
            const [x, y] = pos(e);
            ctx().beginPath();
            ctx().moveTo(x, y);
            ctx().lineTo(x + 0.1, y + 0.1);
            ctx().stroke();
            setDirty(true);
          }}
          onPointerMove={e => {
            if (!drawing.current) return;
            const [x, y] = pos(e);
            ctx().lineTo(x, y);
            ctx().stroke();
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
        />
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            className="accent-brand-400"
            checked={keep}
            onChange={e => setKeep(e.target.checked)}
          />
          Remember signature on this device (enables "add signature" voice command)
        </label>
        <div className="flex gap-2">
          <button className="btn" onClick={clear} disabled={!dirty}>
            Clear
          </button>
          <button className="btn btn-p flex-1" onClick={use}>
            <Icon n="check" size={16} />
            Insert Signature
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Link Dialog */
function LinkDialog({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState("Open link");
  const [url, setUrl] = useState("https://");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      store.addLink(label, url);
      store.toast("ok", "Hyperlink added. Drag to position or resize, then export.");
      onClose();
    } catch (x: any) {
      setError(x?.message || "Could not add the link.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add hyperlink"
      onClick={onClose}
    >
      <form
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700/60 bg-[#111a2e] p-5 shadow-2xl"
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Add Hyperlink</h2>
            <p className="mt-1 text-xs text-slate-400">Creates a clickable URL link area on the current page.</p>
          </div>
          <button type="button" className="tbtn" aria-label="Close" onClick={onClose}>
            <Icon n="x" />
          </button>
        </div>
        <div>
          <label className="lbl" htmlFor="link-label">
            Display text
          </label>
          <input
            id="link-label"
            className="input"
            value={label}
            onChange={e => setLabel(e.target.value)}
            maxLength={160}
            placeholder="Visit website"
          />
        </div>
        <div>
          <label className="lbl" htmlFor="link-url">
            Destination URL
          </label>
          <input
            id="link-url"
            className="input"
            type="url"
            required
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </div>
        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p">
            <Icon n="link" size={16} />
            Insert Link
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------ Find & Replace Dialog */
function FindReplaceModal({ onClose }: { onClose: () => void }) {
  const [findText, setFindText] = useState("");
  const [repText, setRepText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleFind = async () => {
    if (!findText.trim()) return store.toast("err", "Enter search query.");
    const hits = await store.search(findText);
    if (hits.length) {
      setResult(`Found on page${hits.length > 1 ? "s" : ""} ${hits.map(p => p + 1).join(", ")}.`);
    } else {
      setResult("No occurrences found.");
    }
  };

  const handleReplaceAll = async () => {
    if (!findText.trim()) return store.toast("err", "Enter text to find.");
    const res = await store.findAndReplaceAll(findText, repText, matchCase);
    setResult(`Replaced ${res.count} occurrence${res.count === 1 ? "" : "s"} across ${res.pages.length} page(s).`);
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700/60 bg-[#111a2e] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Find & Replace</h2>
          <button className="tbtn" onClick={onClose} aria-label="Close">
            <Icon n="x" />
          </button>
        </div>

        <div>
          <label className="lbl" htmlFor="fr-find">
            Find
          </label>
          <input
            id="fr-find"
            className="input"
            autoFocus
            placeholder="Text to search…"
            value={findText}
            onChange={e => setFindText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleFind()}
          />
        </div>

        <div>
          <label className="lbl" htmlFor="fr-rep">
            Replace with
          </label>
          <input
            id="fr-rep"
            className="input"
            placeholder="New replacement text…"
            value={repText}
            onChange={e => setRepText(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            className="accent-brand-400"
            checked={matchCase}
            onChange={e => setMatchCase(e.target.checked)}
          />
          Match case
        </label>

        {result && (
          <div className="rounded-lg bg-slate-800/80 px-3 py-2 text-xs font-medium text-emerald-300">
            {result}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn" onClick={handleFind} disabled={!findText.trim()}>
            <Icon n="search" size={15} />
            Find
          </button>
          <button className="btn btn-p" onClick={handleReplaceAll} disabled={!findText.trim()}>
            <Icon n="edit" size={15} />
            Replace All
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Document Properties Modal */
function DocumentPropertiesModal({ onClose }: { onClose: () => void }) {
  const S = useEditor();
  const curPage = S.pages[S.cur];

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700/60 bg-[#111a2e] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Document Properties</h2>
          <button className="tbtn" onClick={onClose} aria-label="Close">
            <Icon n="x" />
          </button>
        </div>

        <div className="space-y-2.5 text-sm text-slate-300">
          <div className="flex justify-between border-b border-slate-700/40 pb-2">
            <span className="text-slate-400">File Name:</span>
            <span className="font-medium text-white">{S.name}.pdf</span>
          </div>
          <div className="flex justify-between border-b border-slate-700/40 pb-2">
            <span className="text-slate-400">Total Pages:</span>
            <span className="font-medium text-white">{S.pages.length}</span>
          </div>
          <div className="flex justify-between border-b border-slate-700/40 pb-2">
            <span className="text-slate-400">Current Page Dimensions:</span>
            <span className="font-medium text-white">
              {curPage ? `${Math.round(curPage.w)} × ${Math.round(curPage.h)} pt` : "N/A"}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-700/40 pb-2">
            <span className="text-slate-400">Page Orientation:</span>
            <span className="font-medium text-white">
              {curPage && curPage.rot % 180 !== 0 ? "Landscape" : "Portrait"} ({curPage?.rot || 0}°)
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-700/40 pb-2">
            <span className="text-slate-400">Active Annotations:</span>
            <span className="font-medium text-white">{curPage ? curPage.a.length : 0} items</span>
          </div>
          <div className="flex justify-between border-b border-slate-700/40 pb-2">
            <span className="text-slate-400">Security & Permissions:</span>
            <span className="font-medium text-emerald-400">Fully Editable (Browser Sandbox)</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button className="btn btn-p" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Shortcuts Modal */
function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    ["Ctrl / ⌘ + Z", "Undo last edit"],
    ["Ctrl / ⌘ + Shift + Z", "Redo edit"],
    ["Ctrl / ⌘ + S", "Download final PDF"],
    ["Ctrl / ⌘ + F", "Find & Replace in document"],
    ["V", "Select tool"],
    ["T", "Add text tool"],
    ["E", "Edit original PDF text"],
    ["H", "Highlight text"],
    ["U", "Underline text"],
    ["D", "Draw freehand pen"],
    ["Delete / Backspace", "Remove selected element"],
    ["Ctrl + Shift + →", "Rotate page 90° clockwise"],
    ["Ctrl + Shift + ←", "Rotate page 90° counter-clockwise"],
    ["PageUp / PageDown", "Navigate pages"],
  ];

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700/60 bg-[#111a2e] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Keyboard Shortcuts</h2>
          <button className="tbtn" onClick={onClose} aria-label="Close">
            <Icon n="x" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {shortcuts.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-xs">
              <span className="text-slate-300">{desc}</span>
              <kbd className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-brand-300">
                {key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button className="btn btn-p" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Welcome / Empty State */
function Welcome({ onOpen }: { onOpen: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  useEffect(() => {
    listDocs().then(setDocs).catch(() => {});
  }, []);

  const features: [string, string, string][] = [
    ["edit", "Edit Anything", "Native cover-and-redraw text, fonts, images, signatures"],
    ["mic", "Hinglish Voice Studio", "Dual-mode conversational Q&A & direct PDF canvas editing"],
    ["pages", "Page Management", "Reorder, duplicate, rotate, split and extract pages"],
  ];

  return (
    <div className="mx-auto flex h-full max-w-3xl animate-rise flex-col items-center justify-center gap-7 p-6 text-center">
      <div className="animate-floaty">
        <HarshRobot size={72} mood="happy" showBadge />
      </div>
      <div>
        <span className="badge">Harsh AI Document Studio · Private & Secure</span>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Open a PDF to start editing
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Drop a document anywhere on the screen, or open one below. Edit visually with desktop tools or speak in
          Hinglish/English.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
        <button className="btn btn-p flex-1" onClick={onOpen}>
          <Icon n="open" size={16} />
          Open PDF
        </button>
        <button className="btn flex-1" onClick={() => store.newBlank()}>
          <Icon n="plus" size={16} />
          New Blank PDF
        </button>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-3">
        {features.map(([ic, t, d]) => (
          <div key={t} className="card !p-4 text-start">
            <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
              <Icon n={ic} size={18} />
            </span>
            <div className="text-sm font-medium">{t}</div>
            <div className="mt-0.5 text-xs text-slate-400">{d}</div>
          </div>
        ))}
      </div>

      {docs.length > 0 && (
        <div className="w-full max-w-md text-start">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent Documents</h2>
          <ul className="space-y-1.5">
            {docs.slice(0, 4).map(d => (
              <li key={d.id}>
                <button
                  className="card-hover flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 px-3.5 py-2.5 text-start text-sm"
                  onClick={() => store.openFile(new File([d.file], d.name, { type: "application/pdf" }), true, d.id)}
                >
                  <Icon n="pages" size={16} className="shrink-0 text-brand-400" />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{(d.size / 1024).toFixed(0)} KB</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Main Workspace Component */
export default function Workspace({ docId, initialTab }: { docId?: string | null; initialTab?: Tab }) {
  const S = useEditor();
  const openRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab | null>(null);
  const [drag, setDrag] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [summarizerOpen, setSummarizerOpen] = useState(false);
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false);

  const { run: runApp, isApp } = useAppCommands();
  const desk: Exclude<Tab, "pages"> = S.panel;

  const pickTab = (t: Tab) => {
    if (t !== "pages") store.setPanel(t);
    setTab(cur => (cur === t ? null : t));
  };

  useEffect(() => {
    if (initialTab && initialTab !== "pages") {
      store.setPanel(initialTab);
      setTab(initialTab === "voice" ? "voice" : null);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!docId) return;
    const s = store.get();
    if (s.hasDoc && s.docKey === docId) return;
    (async () => {
      const d = (await listDocs()).find(x => x.id === docId);
      if (!d) return store.toast("err", "Document not found in My Documents.");
      await store.openFile(new File([d.file], d.name, { type: "application/pdf" }), true, docId);
    })();
  }, [docId]);

  useEffect(() => {
    store.pre = async raw => {
      const l = localParse(raw);
      if (l && isApp(l.op)) return (await runApp(l)) || "Done.";
      return null;
    };
    return () => {
      store.pre = null;
      store.stopMic();
    };
  }, []);

  useEffect(() => {
    store.initFont();
  }, []);

  useEffect(() => {
    (window as any).__dmEditor = true;
    const h = (e: any) => {
      store.execute(e.detail).catch((x: any) => store.toast("err", x.message));
    };
    addEventListener("dm-cmd", h);
    return () => {
      delete (window as any).__dmEditor;
      removeEventListener("dm-cmd", h);
    };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => store.setStage(el.clientWidth));
    ro.observe(el);
    store.setStage(el.clientWidth);
    return () => ro.disconnect();
  }, [S.hasDoc]);

  // Keyboard Shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const s = store.get();

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const r = e.shiftKey ? store.redo() : store.undo();
        if (!r.ok) store.toast("info", r.message);
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        store.download();
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.sel != null && s.editing == null) {
        e.preventDefault();
        store.deleteAnn(s.sel);
      } else if (e.key === "Escape") {
        setLinkOpen(false);
        setFindOpen(false);
        setPropsOpen(false);
        setShortcutsOpen(false);
        setMenuOpen(null);
        store.setTool("select");
        store.select(null);
        store.selectBlock(0, null);
      } else if (!mod && !e.altKey && s.hasDoc) {
        const shortcuts: Record<string, Tool> = {
          v: "select",
          t: "text",
          e: "edit",
          h: "hl",
          u: "ul",
          d: "draw",
          g: "shape",
          n: "note",
        };
        const tool = shortcuts[e.key.toLowerCase()];
        if (tool) store.setTool(tool);
        else if (e.key === "PageDown") store.goTo(s.cur + 1);
        else if (e.key === "PageUp") store.goTo(s.cur - 1);
      } else if (mod && e.shiftKey && e.key === "ArrowRight" && s.hasDoc) {
        e.preventDefault();
        store.rotatePage(s.cur, 90);
      } else if (mod && e.shiftKey && e.key === "ArrowLeft" && s.hasDoc) {
        e.preventDefault();
        store.rotatePage(s.cur, -90);
      }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClose = () => setMenuOpen(null);
    if (menuOpen) {
      window.addEventListener("click", handleClose);
      return () => window.removeEventListener("click", handleClose);
    }
  }, [menuOpen]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.type.startsWith("image/")) store.addImageFile(f);
    else store.openFile(f);
  };

  const panel = (which: Exclude<Tab, "pages">) =>
    which === "format" ? <FormatPanel /> : which === "document" ? <DocumentPanel /> : <VoicePanel />;

  const tabBtn = (t: Tab, icon: string, label: string, desktop = false) => {
    const on = desktop ? desk === t : tab === t;
    return (
      <button
        key={t}
        role="tab"
        aria-selected={on}
        onClick={() => (desktop ? store.setPanel(t as any) : pickTab(t))}
        className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition ${on ? "border-b-2 border-brand-400 text-white" : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"}`}
      >
        <Icon n={icon} size={16} />
        {label}
        {t === "voice" && S.mic.state === "listening" && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        )}
      </button>
    );
  };

  const curPage = S.pages[S.cur];

  return (
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0b1220]"
      onDragOver={e => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={openRef}
        hidden
        type="file"
        accept="application/pdf"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) store.openFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={imgRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) store.addImageFile(f);
          e.target.value = "";
        }}
      />

      {/* ---------------- Desktop Top Menu Bar ---------------- */}
      <nav className="flex shrink-0 items-center justify-between border-b border-slate-700/50 bg-[#090e1a] px-3 py-1 text-xs text-slate-300">
        <div className="flex items-center gap-1">
          {/* File Menu */}
          <div className="relative">
            <button
              className={`rounded px-2.5 py-1 font-medium transition hover:bg-white/10 ${menuOpen === "file" ? "bg-white/10 text-white" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(menuOpen === "file" ? null : "file");
              }}
            >
              File
            </button>
            {menuOpen === "file" && (
              <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-700/70 bg-[#111a2e] p-1.5 shadow-2xl">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  onClick={() => openRef.current?.click()}
                >
                  <Icon n="open" size={14} /> Open PDF…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  onClick={() => setCloudPickerOpen(true)}
                >
                  <Icon n="folder" size={14} /> Cloud Storage (Drive/Dropbox/OneDrive)…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  onClick={() => store.newBlank()}
                >
                  <Icon n="plus" size={14} /> New Blank Document
                </button>
                <div className="my-1 border-t border-slate-700/50" />
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.saveToDocuments()}
                >
                  <Icon n="save" size={14} /> Save to My Documents
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start font-medium text-brand-300 hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.download()}
                >
                  <Icon n="download" size={14} /> Download Final PDF
                </button>
                <div className="my-1 border-t border-slate-700/50" />
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => setPropsOpen(true)}
                >
                  <Icon n="info" size={14} /> Document Properties…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => window.print()}
                >
                  <Icon n="layers" size={14} /> Print Document
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              className={`rounded px-2.5 py-1 font-medium transition hover:bg-white/10 ${menuOpen === "edit" ? "bg-white/10 text-white" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(menuOpen === "edit" ? null : "edit");
              }}
            >
              Edit
            </button>
            {menuOpen === "edit" && (
              <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-700/70 bg-[#111a2e] p-1.5 shadow-2xl">
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.canUndo}
                  onClick={() => store.undo()}
                >
                  <span className="flex items-center gap-2"><Icon n="undo" size={14} /> Undo</span>
                  <span className="text-[10px] text-slate-500 font-mono">Ctrl+Z</span>
                </button>
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.canRedo}
                  onClick={() => store.redo()}
                >
                  <span className="flex items-center gap-2"><Icon n="redo" size={14} /> Redo</span>
                  <span className="text-[10px] text-slate-500 font-mono">Ctrl+Y</span>
                </button>
                <div className="my-1 border-t border-slate-700/50" />
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => setFindOpen(true)}
                >
                  <span className="flex items-center gap-2"><Icon n="search" size={14} /> Find & Replace…</span>
                  <span className="text-[10px] text-slate-500 font-mono">Ctrl+F</span>
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-red-500/20 hover:text-red-300"
                  disabled={S.sel == null}
                  onClick={() => {
                    if (S.sel != null) store.deleteAnn(S.sel);
                  }}
                >
                  <Icon n="trash" size={14} /> Delete Selected
                </button>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div className="relative">
            <button
              className={`rounded px-2.5 py-1 font-medium transition hover:bg-white/10 ${menuOpen === "view" ? "bg-white/10 text-white" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(menuOpen === "view" ? null : "view");
              }}
            >
              View
            </button>
            {menuOpen === "view" && (
              <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-700/70 bg-[#111a2e] p-1.5 shadow-2xl">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.zoomBy(0.15)}
                >
                  <Icon n="plus" size={14} /> Zoom In (+15%)
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.zoomBy(-0.15)}
                >
                  <Icon n="minus" size={14} /> Zoom Out (-15%)
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.fitWidth()}
                >
                  <Icon n="fit" size={14} /> Fit to Width
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.setZoom(1.0)}
                >
                  <Icon n="cursor" size={14} /> Actual Size (100%)
                </button>
                <div className="my-1 border-t border-slate-700/50" />
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.setPreview(!S.preview)}
                >
                  <span className="flex items-center gap-2"><Icon n="eye" size={14} /> Exact Render Preview</span>
                  {S.preview && <span className="text-emerald-400">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Insert Menu */}
          <div className="relative">
            <button
              className={`rounded px-2.5 py-1 font-medium transition hover:bg-white/10 ${menuOpen === "insert" ? "bg-white/10 text-white" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(menuOpen === "insert" ? null : "insert");
              }}
            >
              Insert
            </button>
            {menuOpen === "insert" && (
              <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-700/70 bg-[#111a2e] p-1.5 shadow-2xl">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.setTool("text")}
                >
                  <Icon n="text" size={14} /> Add Text Box
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => imgRef.current?.click()}
                >
                  <Icon n="image" size={14} /> Insert Image…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.openSignature(true)}
                >
                  <Icon n="sign" size={14} /> Signature…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => setLinkOpen(true)}
                >
                  <Icon n="link" size={14} /> Hyperlink…
                </button>
                <div className="my-1 border-t border-slate-700/50" />
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => {
                    store.setTool("shape");
                    store.setFmt({ shape: "rect" });
                  }}
                >
                  <Icon n="shape" size={14} /> Rectangle Shape
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => {
                    store.setTool("shape");
                    store.setFmt({ shape: "ell" });
                  }}
                >
                  <Icon n="shape" size={14} /> Ellipse / Circle
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.setTool("note")}
                >
                  <Icon n="note" size={14} /> Sticky Note / Comment
                </button>
              </div>
            )}
          </div>

          {/* Organize Menu */}
          <div className="relative">
            <button
              className={`rounded px-2.5 py-1 font-medium transition hover:bg-white/10 ${menuOpen === "organize" ? "bg-white/10 text-white" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(menuOpen === "organize" ? null : "organize");
              }}
            >
              Organize
            </button>
            {menuOpen === "organize" && (
              <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-slate-700/70 bg-[#111a2e] p-1.5 shadow-2xl">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.addBlank()}
                >
                  <Icon n="plus" size={14} /> Add Blank Page
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.duplicatePage(S.cur)}
                >
                  <Icon n="copy" size={14} /> Duplicate Current Page
                </button>
                <div className="my-1 border-t border-slate-700/50" />
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.rotatePage(S.cur, 90)}
                >
                  <Icon n="rotate" size={14} /> Rotate Page 90° CW
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc}
                  onClick={() => store.rotatePage(S.cur, -90)}
                >
                  <Icon n="rotate" size={14} /> Rotate Page 90° CCW
                </button>
                <div className="my-1 border-t border-slate-700/50" />
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc || S.cur === 0}
                  onClick={() => store.movePage(S.cur, S.cur - 1)}
                >
                  <Icon n="up" size={14} /> Move Page Earlier
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  disabled={!S.hasDoc || S.cur >= S.pages.length - 1}
                  onClick={() => store.movePage(S.cur, S.cur + 1)}
                >
                  <Icon n="down" size={14} /> Move Page Later
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-red-500/20 hover:text-red-300"
                  disabled={!S.hasDoc || S.pages.length < 2}
                  onClick={() => store.deletePage(S.cur)}
                >
                  <Icon n="trash" size={14} /> Delete Current Page
                </button>
              </div>
            )}
          </div>

          {/* Tools Menu */}
          <div className="relative">
            <button
              className={`rounded px-2.5 py-1 font-medium transition hover:bg-white/10 ${menuOpen === "tools" ? "bg-white/10 text-white" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(menuOpen === "tools" ? null : "tools");
              }}
            >
              Tools
            </button>
            {menuOpen === "tools" && (
              <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-700/70 bg-[#111a2e] p-1.5 shadow-2xl">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  onClick={() => store.setPanel("voice")}
                >
                  <Icon n="mic" size={14} /> Hinglish Voice Studio
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  onClick={() => store.setPanel("document")}
                >
                  <Icon n="layers" size={14} /> Watermark & Page Numbers
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start hover:bg-brand-600/20 hover:text-white"
                  onClick={() => setShortcutsOpen(true)}
                >
                  <Icon n="sliders" size={14} /> Keyboard Shortcuts Guide
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          {S.hasDoc && (
            <span className="truncate max-w-[200px] text-[11px] font-medium text-slate-300">
              📄 {S.name}.pdf
            </span>
          )}
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Autosaved
          </span>
        </div>
      </nav>

      {/* ---------------- Quick-Access Toolbar ---------------- */}
      <header
        className="glass-bar flex shrink-0 items-center gap-1.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]"
        role="toolbar"
        aria-label="Editor toolbar"
      >
        <div className="seg">
          <TB icon="open" label="Open PDF" onClick={() => openRef.current?.click()} />
          <TB icon="plus" label="New Blank" onClick={() => store.newBlank()} />
        </div>

        <div className="seg">
          <TB
            icon="undo"
            label="Undo"
            onClick={() => {
              const r = store.undo();
              if (!r.ok) store.toast("info", r.message);
            }}
            disabled={!S.canUndo}
          />
          <TB
            icon="redo"
            label="Redo"
            onClick={() => {
              const r = store.redo();
              if (!r.ok) store.toast("info", r.message);
            }}
            disabled={!S.canRedo}
          />
        </div>

        <div className="seg" role="group" aria-label="Tools">
          {TOOLS.map(([t, i, l]) => (
            <TB
              key={t}
              icon={i}
              label={l}
              on={S.tool === t}
              disabled={!S.hasDoc}
              onClick={() => store.setTool(t)}
            />
          ))}
        </div>

        <div className="seg">
          <TB icon="image" label="Add Image" disabled={!S.hasDoc} onClick={() => imgRef.current?.click()} />
          <TB icon="sign" label="Signature" disabled={!S.hasDoc} onClick={() => store.openSignature(true)} />
          <TB icon="link" label="Hyperlink" disabled={!S.hasDoc} onClick={() => setLinkOpen(true)} />
          <TB icon="search" label="Find & Replace" disabled={!S.hasDoc} onClick={() => setFindOpen(true)} />
        </div>

        <div className="seg">
          <TB icon="minus" label="Zoom Out" disabled={!S.hasDoc} onClick={() => store.zoomBy(-0.15)} showLabel={false} />
          <button
            className="min-w-[3.25rem] shrink-0 rounded-lg px-1 text-center text-xs tabular-nums text-slate-300 hover:bg-white/10 disabled:opacity-40"
            onClick={() => store.fitWidth()}
            title="Fit to width"
            disabled={!S.hasDoc}
          >
            {Math.round(S.zoom * 100)}%
          </button>
          <TB icon="plus" label="Zoom In" disabled={!S.hasDoc} onClick={() => store.zoomBy(0.15)} showLabel={false} />
          <TB icon="fit" label="Fit Width" disabled={!S.hasDoc} onClick={() => store.fitWidth()} showLabel={false} />
        </div>

        <TB icon="eye" label="Exact Preview" on={S.preview} disabled={!S.hasDoc} onClick={() => store.setPreview(!S.preview)} />

        <div className="ms-auto flex shrink-0 items-center gap-1.5 ps-2">
          <button
            className="btn !min-h-[38px] !px-3 text-xs !bg-cyan-950/70 !text-[#00f5d4] !border-cyan-500/40 hover:!bg-cyan-900/70 transition"
            disabled={!S.hasDoc}
            onClick={() => setSummarizerOpen(true)}
            title="Generate Visual Mind Map & Summary with Gemini AI"
          >
            <Icon n="merge" size={15} />
            <span className="hidden sm:inline">Mind Map</span>
          </button>

          <button
            className="btn !min-h-[38px] !px-3 text-xs"
            onClick={() => store.setPanel("voice")}
            title="Open Hinglish Voice Studio"
          >
            <Icon n="mic" size={15} />
            <span className="hidden sm:inline">Voice Studio</span>
          </button>

          <TB icon="save" label="Save to Documents" disabled={!S.hasDoc} onClick={() => store.saveToDocuments()} showLabel={false} />
          <button
            className="btn btn-p !min-h-[38px] !px-3.5 text-xs font-semibold"
            disabled={!S.hasDoc}
            onClick={() => store.download()}
            title="1-Click Direct Download Verified PDF"
          >
            <Icon n="download" size={15} />
            <span className="hidden sm:inline">Download PDF</span>
          </button>
        </div>
      </header>

      {/* ---------------- Main Body ---------------- */}
      <div className="flex min-h-0 flex-1">
        {S.hasDoc && (
          <aside className="hidden w-48 shrink-0 border-e border-slate-700/50 bg-[#0e1628] p-2 lg:block" aria-label="Pages">
            <PagesRail />
          </aside>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div
            ref={stage}
            className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,#141d33,#0b1220_70%)] p-4 pb-16"
            onPointerDown={() => {
              /* gray background click */
            }}
          >
            {S.hasDoc ? (
              <div className="mx-auto w-fit min-w-0">
                <PageView pageIdx={S.cur} />
              </div>
            ) : (
              <Welcome onOpen={() => openRef.current?.click()} />
            )}
          </div>

          {/* Bottom Navigation & Zoom Status Bar */}
          {S.hasDoc && (
            <div className="flex shrink-0 items-center justify-between border-t border-slate-700/50 bg-[#0e1628]/95 px-4 py-1.5 text-xs text-slate-300">
              {/* Page Controls */}
              <div className="flex items-center gap-1">
                <button
                  className="tbtn !h-7 !w-7"
                  title="First page"
                  disabled={S.cur === 0}
                  onClick={() => store.goTo(0)}
                >
                  ⏮
                </button>
                <button
                  className="tbtn !h-7 !w-7"
                  title="Previous page"
                  disabled={S.cur === 0}
                  onClick={() => store.goTo(S.cur - 1)}
                >
                  <Icon n="left" size={13} className="rotate-180" />
                </button>
                <div className="flex items-center gap-1 px-1">
                  <span>Page</span>
                  <input
                    type="number"
                    min={1}
                    max={S.pages.length}
                    value={S.cur + 1}
                    onChange={e => {
                      const p = +e.target.value;
                      if (p >= 1 && p <= S.pages.length) store.goTo(p - 1);
                    }}
                    className="h-6 w-12 rounded border border-slate-700/70 bg-slate-800 px-1 text-center font-mono text-xs text-white"
                  />
                  <span>of {S.pages.length}</span>
                </div>
                <button
                  className="tbtn !h-7 !w-7"
                  title="Next page"
                  disabled={S.cur >= S.pages.length - 1}
                  onClick={() => store.goTo(S.cur + 1)}
                >
                  <Icon n="left" size={13} />
                </button>
                <button
                  className="tbtn !h-7 !w-7"
                  title="Last page"
                  disabled={S.cur >= S.pages.length - 1}
                  onClick={() => store.goTo(S.pages.length - 1)}
                >
                  ⏭
                </button>
              </div>

              {/* Page dimensions info */}
              <div className="hidden md:flex items-center gap-3 text-slate-400">
                <span>{curPage ? `${Math.round(curPage.w)} × ${Math.round(curPage.h)} pt` : ""}</span>
                <span>•</span>
                <span>{curPage?.rot ? `${curPage.rot}° rotated` : "0°"}</span>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <button
                  className="tbtn !h-7 !w-7 text-xs"
                  title="Zoom Out"
                  onClick={() => store.zoomBy(-0.1)}
                >
                  -
                </button>
                <input
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.05}
                  value={S.zoom}
                  onChange={e => store.setZoom(+e.target.value)}
                  className="h-1.5 w-20 md:w-28 accent-brand-400 cursor-pointer"
                  title={`Zoom: ${Math.round(S.zoom * 100)}%`}
                />
                <button
                  className="tbtn !h-7 !w-7 text-xs"
                  title="Zoom In"
                  onClick={() => store.zoomBy(0.1)}
                >
                  +
                </button>
                <span className="w-10 text-right font-mono text-[11px] tabular-nums">
                  {Math.round(S.zoom * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Mobile Bottom Bar */}
          <div className="shrink-0 border-t border-slate-700/50 bg-[#111a2e] lg:hidden">
            {tab && (
              <div className="max-h-[46dvh] overflow-y-auto p-3">
                {tab === "pages" ? <PagesRail horizontal /> : panel(tab)}
              </div>
            )}
            <div className="flex border-t border-white/5" role="tablist" aria-label="Editor panels">
              {tabBtn("pages", "pages", "Pages")}
              {tabBtn("format", "sliders", "Format")}
              {tabBtn("document", "layers", "Document")}
              {tabBtn("voice", "mic", "Voice")}
            </div>
          </div>
        </main>

        {/* Right Sidebar Inspector */}
        <aside
          className="hidden w-[350px] shrink-0 flex-col border-s border-slate-700/50 bg-[#0e1628] lg:flex"
          aria-label="Editing panel"
        >
          <div className="flex shrink-0 border-b border-slate-700/50" role="tablist">
            {tabBtn("format", "sliders", "Format", true)}
            {tabBtn("document", "layers", "Document", true)}
            {tabBtn("voice", "mic", "Voice Studio", true)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{panel(desk)}</div>
        </aside>
      </div>

      {/* ---------------- Interactive Dialogs ---------------- */}
      {S.sigOpen && <SignaturePad />}
      {linkOpen && S.hasDoc && <LinkDialog onClose={() => setLinkOpen(false)} />}
      {findOpen && S.hasDoc && <FindReplaceModal onClose={() => setFindOpen(false)} />}
      {propsOpen && S.hasDoc && <DocumentPropertiesModal onClose={() => setPropsOpen(false)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {drag && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center border-4 border-dashed border-brand-400 bg-brand-500/10 text-lg font-medium">
          Drop a PDF to open it (or an image to insert it)
        </div>
      )}

      {S.busy && (
        <div
          className="absolute inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-[2px]"
          role="alert"
          aria-busy
        >
          <div className="flex items-center gap-3 rounded-2xl border border-slate-700/50 bg-[#111a2e] px-5 py-3 text-sm shadow-2xl">
            <Spinner />
            {S.busy}
          </div>
        </div>
      )}

      {S.toast && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-3 md:bottom-12"
          role="status"
          aria-live="polite"
        >
          <div
            className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-2xl ${S.toast.kind === "err" ? "border-red-400/40 bg-[#2a1216] text-red-100" : S.toast.kind === "ok" ? "border-emerald-400/40 bg-[#10231b] text-emerald-100" : "border-white/15 bg-[#16213a] text-slate-100"}`}
          >
            <Icon
              n={S.toast.kind === "err" ? "warn" : S.toast.kind === "ok" ? "check" : "info"}
              size={17}
              className="mt-0.5 shrink-0"
            />
            <span className="min-w-0 break-words">{S.toast.text}</span>
            {S.toast.action && (
              <button
                className="shrink-0 font-semibold underline"
                onClick={() => {
                  S.toast!.action!.run();
                  store.dismissToast();
                }}
              >
                {S.toast.action.label}
              </button>
            )}
            <button
              className="shrink-0 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
              onClick={() => store.dismissToast()}
            >
              <Icon n="x" size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Smart Summarizer & Mind Map Modal */}
      <SmartSummarizerModal
        isOpen={summarizerOpen}
        onClose={() => setSummarizerOpen(false)}
        initialDocId={S.docKey}
        initialDocName={S.name}
      />

      {/* Cloud Storage Picker Modal */}
      <CloudStoragePicker
        isOpen={cloudPickerOpen}
        onClose={() => setCloudPickerOpen(false)}
        onFileLoaded={(file, docId) => {
          store.openFile(file, true, docId);
        }}
      />
    </div>
  );
}
