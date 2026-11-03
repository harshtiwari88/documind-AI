import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Icon } from "../editor/icons";

export interface MindMapData {
  title: string;
  executiveSummary: string;
  keyTakeaways: string[];
  actionItems: string[];
  mindmapMermaid: string;
  topics?: { name: string; summary: string; subtopics: string[] }[];
}

interface MindMapViewerProps {
  data: MindMapData;
  onClose?: () => void;
}

export default function MindMapViewer({ data, onClose }: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"mindmap" | "summary" | "takeaways" | "actions" | "topics">("mindmap");
  const [svgContent, setSvgContent] = useState<string>("");
  const [renderError, setRenderError] = useState<string>("");
  const [zoom, setZoom] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Initialize mermaid configuration
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        darkMode: true,
        background: "#090f1d",
        primaryColor: "#0284c7",
        primaryTextColor: "#ffffff",
        primaryBorderColor: "#38bdf8",
        lineColor: "#38bdf8",
        secondaryColor: "#1e293b",
        tertiaryColor: "#0f172a",
        fontSize: "13px",
        fontFamily: "Inter, system-ui, sans-serif",
      },
      securityLevel: "loose",
      flowchart: {
        curve: "basis",
        padding: 18,
        useMaxWidth: false,
        htmlLabels: true,
      },
    });
  }, []);

  // Clean and render Mermaid syntax to SVG
  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      setRenderError("");
      let code = (data.mindmapMermaid || "").trim();

      // Normalize markdown code fence if present
      code = code.replace(/^```(mermaid)?/i, "").replace(/```$/, "").trim();

      if (!code) {
        // Fallback default diagram from title and key takeaways
        const safeTitle = (data.title || "Document Summary").replace(/["\n\r]/g, " ");
        code = `graph TD\n  Root["${safeTitle}"]\n`;
        (data.keyTakeaways || []).slice(0, 5).forEach((item, idx) => {
          const safeItem = item.replace(/["\n\r]/g, " ").slice(0, 50);
          code += `  Root --> Node${idx + 1}["${safeItem}"]\n`;
        });
      }

      try {
        const id = "mermaid-" + Math.random().toString(36).substring(2, 9);
        const { svg } = await mermaid.render(id, code);
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        console.warn("Mermaid render error:", err);
        // Fallback to a simplified graph TD
        try {
          const fallbackId = "mermaid-fb-" + Math.random().toString(36).substring(2, 9);
          const safeTitle = (data.title || "Overview").replace(/[^\w\s-]/g, "");
          let fallbackCode = `graph TD\n  Root["${safeTitle}"]\n`;
          (data.keyTakeaways || []).slice(0, 4).forEach((t, i) => {
            const clean = t.replace(/[^\w\s-]/g, "").slice(0, 45);
            fallbackCode += `  Root --> N${i + 1}["${clean}"]\n`;
          });
          const { svg } = await mermaid.render(fallbackId, fallbackCode);
          if (isMounted) {
            setSvgContent(svg);
          }
        } catch (innerErr: any) {
          if (isMounted) {
            setRenderError(err?.message || "Failed to render visual diagram");
          }
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [data.mindmapMermaid, data.title, data.keyTakeaways]);

  // Copy Mermaid code
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(data.mindmapMermaid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Download SVG
  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data.title || "mindmap").replace(/\s+/g, "_")}_mindmap.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Download PNG
  const handleDownloadPng = () => {
    if (!svgContent) return;
    const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * 2 || 1600;
      canvas.height = img.height * 2 || 1200;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0b132b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const pngUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = `${(data.title || "mindmap").replace(/\s+/g, "_")}_mindmap.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
          }
        });
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Pan controls
  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTab !== "mindmap") return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning) return;
    setPanPosition({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-[#0d162a] text-white shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 bg-[#090f1d] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/20 text-[#00f5d4]">
            <Icon n="merge" size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>{data.title || "Intelligent Document Mind Map"}</span>
              <span className="rounded-full bg-cyan-900/60 px-2 py-0.5 text-[10px] font-semibold text-[#00f5d4] border border-cyan-500/30">
                Gemini AI
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive visual hierarchy, key takeaways, and executive action plan
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {activeTab === "mindmap" && (
            <>
              <div className="flex items-center rounded-lg bg-slate-800/80 p-0.5 border border-slate-700 text-xs">
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                  className="rounded px-2 py-1 hover:bg-slate-700 text-slate-300"
                  title="Zoom Out"
                >
                  <Icon n="minus" size={13} />
                </button>
                <span className="px-2 font-mono text-[11px] text-slate-300">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
                  className="rounded px-2 py-1 hover:bg-slate-700 text-slate-300"
                  title="Zoom In"
                >
                  <Icon n="plus" size={13} />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPanPosition({ x: 0, y: 0 });
                  }}
                  className="rounded px-2 py-1 hover:bg-slate-700 text-slate-400 text-[11px]"
                  title="Reset Zoom"
                >
                  Reset
                </button>
              </div>

              <button
                onClick={handleDownloadSvg}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
                title="Download SVG Diagram"
              >
                <Icon n="down" size={13} />
                <span>SVG</span>
              </button>
              <button
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm"
                title="Download PNG Image"
              >
                <Icon n="image" size={13} />
                <span>PNG</span>
              </button>
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
                title="Copy Mermaid Syntax"
              >
                <Icon n="copy" size={13} />
                <span>{copied ? "Copied!" : "Mermaid"}</span>
              </button>
            </>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
              aria-label="Close Viewer"
            >
              <Icon n="x" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-700/60 bg-[#090e1a] px-4 text-xs font-medium">
        <button
          onClick={() => setActiveTab("mindmap")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
            activeTab === "mindmap"
              ? "border-[#00f5d4] text-[#00f5d4] font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Icon n="merge" size={14} />
          <span>Visual Mind Map</span>
        </button>
        <button
          onClick={() => setActiveTab("summary")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
            activeTab === "summary"
              ? "border-[#00f5d4] text-[#00f5d4] font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Icon n="pages" size={14} />
          <span>Executive Summary</span>
        </button>
        <button
          onClick={() => setActiveTab("takeaways")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
            activeTab === "takeaways"
              ? "border-[#00f5d4] text-[#00f5d4] font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Icon n="bolt" size={14} />
          <span>Key Takeaways ({data.keyTakeaways?.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab("actions")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
            activeTab === "actions"
              ? "border-[#00f5d4] text-[#00f5d4] font-semibold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Icon n="check" size={14} />
          <span>Action Items ({data.actionItems?.length || 0})</span>
        </button>
        {data.topics && data.topics.length > 0 && (
          <button
            onClick={() => setActiveTab("topics")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
              activeTab === "topics"
                ? "border-[#00f5d4] text-[#00f5d4] font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon n="layers" size={14} />
            <span>Topics ({data.topics.length})</span>
          </button>
        )}
      </div>

      {/* Main Tab Content */}
      <div className="relative flex-1 overflow-auto bg-[#0b1220]">
        {/* Tab 1: Interactive Visual Mind Map */}
        {activeTab === "mindmap" && (
          <div
            ref={containerRef}
            className="relative h-full w-full overflow-hidden select-none cursor-grab active:cursor-grabbing flex items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_40%,#15223e,#080d19_80%)]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {renderError ? (
              <div className="max-w-md rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-center">
                <p className="text-sm font-semibold text-red-300">Mermaid Render Notice</p>
                <p className="mt-1 text-xs text-red-200/80">{renderError}</p>
                <button
                  onClick={handleCopyCode}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-800/60 px-3 py-1.5 text-xs text-white"
                >
                  <Icon n="copy" size={12} /> Copy Raw Mermaid Code
                </button>
              </div>
            ) : !svgContent ? (
              <div className="flex flex-col items-center gap-2 text-slate-400 text-sm">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <span>Synthesizing visual flowchart with Mermaid.js…</span>
              </div>
            ) : (
              <div
                ref={svgWrapperRef}
                style={{
                  transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: isPanning ? "none" : "transform 0.15s ease-out",
                }}
                className="max-w-none transition-transform duration-100 ease-out"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            )}

            {/* Helper overlay hint */}
            <div className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-slate-900/80 border border-slate-700/60 px-3 py-1 text-[11px] text-slate-400">
              Drag to pan • Use + / - to zoom
            </div>
          </div>
        )}

        {/* Tab 2: Executive Summary */}
        {activeTab === "summary" && (
          <div className="mx-auto max-w-3xl space-y-6 p-6 sm:p-8">
            <div className="rounded-2xl border border-slate-700/60 bg-[#111c35] p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300 mb-3">
                <Icon n="pages" size={16} />
                <span>Executive Overview</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-line">
                {data.executiveSummary || "No summary provided."}
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Key Takeaways */}
        {activeTab === "takeaways" && (
          <div className="mx-auto max-w-3xl space-y-4 p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Critical Insights &amp; Findings
            </h3>
            {(data.keyTakeaways || []).map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3.5 rounded-xl border border-slate-700/60 bg-[#111c35] p-4 text-sm text-slate-200"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cyan-500/20 text-xs font-bold text-[#00f5d4]">
                  {index + 1}
                </span>
                <p className="flex-1 leading-snug">{item}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Action Items */}
        {activeTab === "actions" && (
          <div className="mx-auto max-w-3xl space-y-4 p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Recommended Next Steps &amp; Action Plan
            </h3>
            {(data.actionItems || []).map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3.5 rounded-xl border border-slate-700/60 bg-[#111c35] p-4 text-sm text-slate-200"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-400">
                  ✓
                </span>
                <p className="flex-1 leading-snug">{item}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Topics Explorer */}
        {activeTab === "topics" && (
          <div className="mx-auto max-w-4xl grid gap-4 p-6 sm:p-8 md:grid-cols-2">
            {(data.topics || []).map((top, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-700/60 bg-[#111c35] p-5 space-y-2">
                <h4 className="font-semibold text-white text-sm flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  {top.name}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">{top.summary}</p>
                {top.subtopics && top.subtopics.length > 0 && (
                  <div className="pt-2 flex flex-wrap gap-1.5">
                    {top.subtopics.map((sub, sidx) => (
                      <span
                        key={sidx}
                        className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400 border border-slate-700"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
