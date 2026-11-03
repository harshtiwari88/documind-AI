import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { editorStore as store, useEditor } from "./store";
import type { Ann, FontKey, Line, PageState, TextAnn } from "./types";

const FAMILY: Record<FontKey, string> = { helv: "Helvetica, Arial, sans-serif", times: "'Times New Roman', Times, serif", courier: "'Courier New', Courier, monospace" };
const MARK_HIT = 3;

/** bounding box (page points) for annotations that are not DOM boxes */
function bbox(a: any): { x: number; y: number; w: number; h: number } | null {
  if (a.t === "shape") return { x: Math.min(a.x1 ?? 0, a.x2 ?? 0) - 3, y: Math.min(a.y1 ?? 0, a.y2 ?? 0) - 3, w: Math.abs((a.x2 ?? 0) - (a.x1 ?? 0)) + 6, h: Math.abs((a.y2 ?? 0) - (a.y1 ?? 0)) + 6 };
  if (a.t === "draw") { const xs = (a.pts || []).map((p: any) => p[0]), ys = (a.pts || []).map((p: any) => p[1]); if (!xs.length || !ys.length) return null; const x = Math.min(...xs), y = Math.min(...ys); return { x: x - 3, y: y - 3, w: Math.max(...xs) - x + 6, h: Math.max(...ys) - y + 6 }; }
  if (a.t === "ul" || a.t === "st") return { x: a.x ?? 0, y: (a.y ?? 0) - 4, w: a.w ?? 0, h: 8 };
  if (a.t === "link") return { x: a.x ?? 0, y: a.y ?? 0, w: a.w ?? 0, h: a.h || 24 };
  return null;
}
/** the patch that moves an annotation by (dx, dy), computed from its state when the drag began */
function movePatch(o: any, dx: number, dy: number): Record<string, any> {
  if (o.t === "shape") return { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
  if (o.t === "draw") return { pts: o.pts.map((q: number[]) => [q[0] + dx, q[1] + dy]) };
  const p: Record<string, any> = { x: o.x + dx, y: o.y + dy };
  if (o.t === "text" && o.cover) p.cover = { ...o.cover, x: o.cover.x, y: o.cover.y };   // the original-text cover stays where the original was
  return p;
}

export default function PageView({ pageIdx }: { pageIdx: number }) {
  const S = useEditor(), page: PageState | undefined = S.pages[pageIdx];
  const z = S.zoom, canvas = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<any>(null), [hover, setHover] = useState<Line | null>(null), [rendering, setRendering] = useState(false);
  const dr = useRef<any>(null);
  const showExact = S.preview && !!store.previewDoc && !S.previewBusy;
  const analysis = store.peek(pageIdx);

  /* ------------------------------------------------------------ canvas rendering */
  useEffect(() => {
    if (!page) return;
    const cv = canvas.current; if (!cv) return;
    if (!showExact && page.d < 0) { const c = cv.getContext("2d"); c?.clearRect(0, 0, cv.width, cv.height); cv.width = 1; cv.height = 1; return; }
    let cancelled = false, task: any = null;
    (async () => {
      setRendering(true);
      try {
        const doc = showExact ? store.previewDoc! : store.docs[page.d], pg = await doc.pj.getPage((showExact ? pageIdx : page.i) + 1);
        const dpr = Math.min(window.devicePixelRatio || 1, 2), base = pg.getViewport({ scale: 1 });
        let scale = z * dpr; const maxPx = 14e6; if (base.width * base.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (base.width * base.height));
        const vp = pg.getViewport({ scale });
        // render into an offscreen canvas first so zooming never flashes a blank page
        const off = document.createElement("canvas"); off.width = Math.ceil(vp.width); off.height = Math.ceil(vp.height);
        task = pg.render({ canvas: off, canvasContext: off.getContext("2d")!, viewport: vp }); await task.promise;
        if (cancelled || !canvas.current) return;
        const t = canvas.current; t.width = off.width; t.height = off.height; t.getContext("2d")!.drawImage(off, 0, 0);
      } catch (e: any) { if (e?.name !== "RenderingCancelledException" && !cancelled) console.warn("Page render failed", e); }
      finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; try { task?.cancel(); } catch { /* already finished */ } };
  }, [page?.id, page?.d, page?.i, z, showExact, S.previewVer, pageIdx]);

  // make sure the text of this page is analysed so hover / click on original text works
  useEffect(() => { if (page && page.d >= 0) store.loadAnalysis(pageIdx); }, [page?.id, pageIdx]);

  if (!page) return null;
  const rot = page.rot, swap = rot % 180 !== 0, dw = swap ? page.h : page.w, dh = swap ? page.w : page.h;
  const W = page.w * z, H = page.h * z, outerW = dw * z, outerH = dh * z;
  const editable = !showExact;

  /* ------------------------------------------------------------ pointer → page coordinates */
  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), a = (-rot * Math.PI) / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
    return { x: (rx + W / 2) / z, y: (ry + H / 2) / z };
  };
  const hitLine = (p: { x: number; y: number }) => analysis?.lines.find(l => p.x >= l.x - MARK_HIT && p.x <= l.x + l.w + MARK_HIT && p.y >= l.y - MARK_HIT && p.y <= l.y + l.h + MARK_HIT) || null;
  const hitBlock = (p: { x: number; y: number }) => analysis?.blocks.find(b => p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2) || null;

  /* ------------------------------------------------------------ root pointer handlers (tools) */
  const down = (e: React.PointerEvent) => {
    if (!editable || e.button > 0) return;
    const p = toPage(e), tool = S.tool;
    if (S.editing != null) { (document.activeElement as HTMLElement | null)?.blur?.(); }
    if (tool === "text") { store.addTextAt(pageIdx, Math.max(0, Math.min(page.w - 40, p.x)), Math.max(0, Math.min(page.h - 20, p.y))); return; }
    if (tool === "note") { store.addNote(pageIdx, p.x, p.y); return; }
    if (tool === "edit") { const l = hitLine(p); if (l) store.editLine(pageIdx, l); else store.toast("info", page.d < 0 ? "Blank pages have no original text. Use the Text tool." : "No text here. Click directly on a line of the PDF's own text."); return; }
    if (tool === "erase") { const l = hitLine(p); if (l) store.eraseLines([{ page: pageIdx, line: l }]); else store.toast("info", "Click directly on a line of text to delete it."); return; }
    if (tool === "hl" || tool === "ul" || tool === "st") { dr.current = { mode: "mark", kind: tool, x0: p.x, y0: p.y, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return; }
    if (tool === "draw") { dr.current = { mode: "draw", pts: [[p.x, p.y]] }; setGhost({ pts: dr.current.pts }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return; }
    if (tool === "shape") { dr.current = { mode: "shape", x0: p.x, y0: p.y }; setGhost({ k: S.fmt.shape, x1: p.x, y1: p.y, x2: p.x, y2: p.y }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return; }
    // select tool, empty area: pick the original paragraph under the cursor or clear selection
    const b = hitBlock(p); if (b) store.selectBlock(pageIdx, b.id); else { store.select(null); store.selectBlock(pageIdx, null); }
  };
  const move = (e: React.PointerEvent) => {
    const d = dr.current;
    if (!d) { if (editable && ["edit", "erase", "hl", "ul", "st"].includes(S.tool)) { const l = hitLine(toPage(e)); if (l !== hover) setHover(l); } else if (hover) setHover(null); return; }
    const p = toPage(e);
    if (d.mode === "mark") { d.moved = d.moved || Math.hypot(p.x - d.x0, p.y - d.y0) > 3; setGhost({ rect: { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) }, kind: d.kind }); }
    else if (d.mode === "draw") { d.pts.push([p.x, p.y]); setGhost({ pts: d.pts.slice() }); }
    else if (d.mode === "shape") setGhost({ k: S.fmt.shape, x1: d.x0, y1: d.y0, x2: p.x, y2: p.y });
    else if (d.mode === "move") { const dx = p.x - d.sx, dy = p.y - d.sy; if (!d.started && Math.hypot(dx, dy) < 2) return; if (!d.started) { store.beginDrag("Move item"); d.started = true; } store.moveAnn(d.id, movePatch(d.orig, dx, dy)); }
    else if (d.mode === "rotate") {
      if (!d.started) { store.beginDrag("Rotate item"); d.started = true; }
      const o = d.orig, cx = o.x + (o.w || 40) / 2, cy = o.y + (o.h || 20) / 2;
      const angle = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      store.moveAnn(d.id, { rotation: Math.round(angle) });
    }
    else if (d.mode === "resize") {
      if (!d.started) { store.beginDrag("Resize item"); d.started = true; }
      const o = d.orig, hKind = d.which;
      if (o.t === "text") {
        if (hKind === "e") store.moveAnn(d.id, { w: Math.max(30, p.x - o.x) });
        else if (hKind === "se") {
          const nw = Math.max(30, p.x - o.x);
          const ratio = (o.size || 14) / Math.max(1, o.w || 100);
          store.moveAnn(d.id, { w: nw, size: Math.max(8, Math.min(120, Math.round(nw * ratio))) });
        } else store.moveAnn(d.id, { w: Math.max(30, p.x - o.x) });
      }
      else if (o.t === "img") {
        if (hKind === "s") store.moveAnn(d.id, { h: Math.max(16, p.y - o.y) });
        else if (hKind === "e") store.moveAnn(d.id, { w: Math.max(16, p.x - o.x) });
        else {
          const nw = Math.max(16, p.x - o.x);
          store.moveAnn(d.id, { w: nw, h: (nw * o.h) / o.w });
        }
      }
      else if (o.t === "link") store.moveAnn(d.id, { w: Math.max(60, p.x - o.x), h: Math.max(18, p.y - o.y) });
      else if (o.t === "shape") store.moveAnn(d.id, d.which === 1 ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y });
    }
  };
  const up = (e: React.PointerEvent) => {
    const d = dr.current; dr.current = null; if (!d) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const p = toPage(e); setGhost(null);
    if (d.mode === "mark") { if (d.moved) store.markRect(d.kind, pageIdx, { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) }); else { const l = hitLine(p); if (l) store.markLine(d.kind, pageIdx, l); else store.toast("info", "Drag across text, or click a line of text."); } }
    else if (d.mode === "draw") store.addDraw(pageIdx, d.pts);
    else if (d.mode === "shape") { if (!store.addShape(pageIdx, S.fmt.shape, d.x0, d.y0, p.x, p.y)) store.toast("info", "Drag a little further to draw the shape."); }
    else if (d.started) store.endDrag();
  };

  const startMove = (e: React.PointerEvent, a: Ann) => {
    if (!editable || S.tool !== "select" || S.editing === a.id) return;
    e.stopPropagation(); store.select(a.id);
    dr.current = { mode: "move", id: a.id, sx: toPage(e).x, sy: toPage(e).y, orig: JSON.parse(JSON.stringify(a)) };
    wrap.current!.querySelector<HTMLElement>("[data-root]")!.setPointerCapture(e.pointerId);
  };
  const startResize = (e: React.PointerEvent, a: Ann, which: any = "se") => {
    e.stopPropagation(); dr.current = { mode: "resize", id: a.id, which, orig: JSON.parse(JSON.stringify(a)) };
    wrap.current!.querySelector<HTMLElement>("[data-root]")!.setPointerCapture(e.pointerId);
  };
  const startRotate = (e: React.PointerEvent, a: Ann) => {
    e.stopPropagation(); dr.current = { mode: "rotate", id: a.id, orig: JSON.parse(JSON.stringify(a)) };
    wrap.current!.querySelector<HTMLElement>("[data-root]")!.setPointerCapture(e.pointerId);
  };

  /* ------------------------------------------------------------ annotation rendering */
  const sel = S.sel, tool = S.tool, interactive = editable && tool === "select";
  const outline = (id: number) => (sel === id ? { outline: "1.5px solid #4f7cff", outlineOffset: 2 } : {});
  const common = (a: any): React.CSSProperties => ({
    position: "absolute",
    touchAction: "none",
    cursor: interactive ? "move" : "default",
    pointerEvents: interactive ? "auto" : "none",
    opacity: a.opacity ?? 1,
    transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
    transformOrigin: "center center",
    ...outline(a.id),
  });
  const textStyle = (a: any): React.CSSProperties => ({
    fontFamily: FAMILY[a.font as FontKey] || FAMILY.helv,
    fontWeight: a.bold ? 700 : 400,
    fontStyle: a.italic ? "italic" : "normal",
    textDecoration: a.underline ? "underline" : "none",
    color: a.color,
    textAlign: a.align,
    fontSize: (a.size || 12) * z,
    lineHeight: a.lineHeight || 1.2,
    letterSpacing: a.letterSpacing ? `${a.letterSpacing * z}px` : undefined,
    whiteSpace: a.nowrap ? "pre" : "pre-wrap",
    overflowWrap: "normal",
    margin: 0,
    padding: 0,
    border: 0,
  });

  const renderAnn = (a: any) => {
    if (a.t === "erase") return <div key={a.id} onPointerDown={e => startMove(e, a)} style={{ ...common(a), left: (a.x - 1) * z, top: a.y * z, width: (a.w + 2) * z, height: a.h * z, background: a.color }} />;
    if (a.t === "hl") return <div key={a.id} onPointerDown={e => startMove(e, a)} style={{ ...common(a), left: a.x * z, top: a.y * z, width: a.w * z, height: a.h * z, background: a.color, opacity: 0.4 }} />;
    if (a.t === "text") {
      const editing = S.editing === a.id;
      return <div key={a.id}>
        {a.cover && <div style={{ position: "absolute", pointerEvents: "none", left: (a.cover.x - 1) * z, top: a.cover.y * z, width: (a.cover.w + 2) * z, height: a.cover.h * z, background: a.cover.color }} />}
        {editing
          ? <AutoArea a={a} z={z} style={textStyle(a)} />
          : <div onPointerDown={e => startMove(e, a)} onDoubleClick={() => interactive && store.startEdit(a.id)} style={{ ...common(a), ...textStyle(a), left: a.x * z, top: a.y * z, width: a.w * z, minHeight: (a.size || 12) * 1.2 * z, minWidth: 8 }}>{a.text}</div>}
      </div>;
    }
    if (a.t === "img") { const im = store.images.get(a.key); return <img key={a.id} alt={a.sig ? "Signature" : "Image"} src={im?.url} draggable={false} onPointerDown={e => startMove(e, a)} style={{ ...common(a), left: a.x * z, top: a.y * z, width: a.w * z, height: a.h * z, userSelect: "none" }} />; }
    if (a.t === "link") return <div key={a.id} onPointerDown={e => startMove(e, a)} title={a.url} style={{ ...common(a), left: a.x * z, top: a.y * z, width: a.w * z, height: (a.h || 24) * z, boxSizing: "border-box", display: "flex", alignItems: "center", overflow: "hidden", padding: `${2 * z}px ${5 * z}px`, border: `${Math.max(1, z)}px dashed #2563eb`, borderRadius: `${3 * z}px`, background: "rgba(59,130,246,.08)", color: a.color || "#1d4ed8", fontSize: 10 * z, textDecoration: "underline", whiteSpace: "nowrap" }}>{a.text || a.url}</div>;
    if (a.t === "note") return <div key={a.id} onPointerDown={e => startMove(e, a)} onDoubleClick={() => interactive && store.startEdit(a.id)} style={{ ...common(a), left: a.x * z, top: a.y * z, width: 150 * z, padding: `${4 * z}px`, boxSizing: "border-box", background: "#fff3a0", border: "0.5px solid #ccb333", fontSize: 9 * z, lineHeight: `${11 * z}px`, color: "#222", fontFamily: FAMILY.helv, whiteSpace: "pre-wrap" }}>
      {S.editing === a.id ? <AutoArea a={a as any} z={z} style={{ fontSize: 9 * z, lineHeight: `${11 * z}px`, fontFamily: FAMILY.helv, color: "#222", textAlign: "left", width: "100%" }} inline /> : a.text}</div>;
    // vector items share one svg per item so z-order with HTML items is preserved
    const hit = interactive ? "stroke" : "none";
    let inner: React.ReactNode = null;
    if (a.t === "ul" || a.t === "st") inner = <g><line x1={a.x} y1={a.y} x2={a.x + a.w} y2={a.y} stroke={a.color} strokeWidth={a.sw} /><line x1={a.x} y1={a.y} x2={a.x + a.w} y2={a.y} stroke="transparent" strokeWidth={10} pointerEvents={hit} /></g>;
    else if (a.t === "draw") inner = <polyline points={(a.pts || []).map((q: any) => q.join(",")).join(" ")} fill="none" stroke={a.color} strokeWidth={a.sw} strokeLinecap="round" strokeLinejoin="round" pointerEvents={interactive ? "visibleStroke" : "none"} style={{ strokeLinecap: "round" }} />;
    else if (a.t === "shape") inner = <ShapeSvg a={a} hit={interactive} />;
    return <svg key={a.id} onPointerDown={e => startMove(e, a)} width={W} height={H} viewBox={`0 0 ${page.w} ${page.h}`} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible", cursor: "move", touchAction: "none" }}><g onPointerDown={e => startMove(e as any, a)} style={{ pointerEvents: interactive ? "auto" : "none" }}>{inner}</g></svg>;
  };

  const selAnn = sel != null ? (page.a.find(a => a.id === sel) as any) : undefined, selBox = selAnn ? bbox(selAnn) : null;
  const selBlock = S.selBlock && S.selBlock.page === pageIdx ? analysis?.blocks.find(b => b.id === S.selBlock!.id) : null;
  const o = S.opts, small: React.CSSProperties = { position: "absolute", left: 0, width: W, textAlign: "center", fontSize: 9 * z, color: "#595959", fontFamily: FAMILY.helv, pointerEvents: "none" };
  const cursor = !editable ? "default" : tool === "select" ? "default" : tool === "text" || tool === "note" ? "text" : tool === "edit" ? "text" : "crosshair";

  return (
    <div ref={wrap} className="relative mx-auto select-none" style={{ width: outerW, height: outerH }} data-page={pageIdx}>
      <div className="absolute bg-white shadow-[0_8px_40px_rgba(0,0,0,.45)]" style={{ left: (outerW - (showExact ? outerW : W)) / 2, top: (outerH - (showExact ? outerH : H)) / 2, width: showExact ? outerW : W, height: showExact ? outerH : H, transform: showExact ? undefined : `rotate(${rot}deg)` }}>
        <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} aria-label={`Page ${pageIdx + 1}`} />
        {!showExact && (
          <div data-root onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)} style={{ position: "absolute", inset: 0, cursor, touchAction: tool === "select" ? "pan-x pan-y" : "none", overflow: "hidden" }}>
            {o.bg && <div style={{ position: "absolute", inset: 0, background: o.bg, mixBlendMode: "multiply", pointerEvents: "none" }} />}
            {(S.hits[pageIdx] || []).map((r, i) => <div key={"h" + i} style={{ position: "absolute", left: r.x * z, top: r.y * z, width: r.w * z, height: r.h * z, background: "rgba(255,170,0,.35)", outline: "1px solid #f59f00", pointerEvents: "none" }} />)}
            {selBlock && <div style={{ position: "absolute", left: selBlock.x * z - 3, top: selBlock.y * z - 3, width: selBlock.w * z + 6, height: selBlock.h * z + 6, border: "1.5px dashed #4f7cff", background: "rgba(79,124,255,.07)", pointerEvents: "none" }} />}
            {hover && <div style={{ position: "absolute", left: hover.x * z - 1, top: hover.y * z, width: hover.w * z + 2, height: hover.h * z, background: tool === "erase" ? "rgba(224,49,49,.18)" : "rgba(79,124,255,.18)", outline: `1px solid ${tool === "erase" ? "#e03131" : "#4f7cff"}`, pointerEvents: "none" }} />}
            {page.a.map(renderAnn)}
            {o.wm && <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "grid", placeItems: "center", pointerEvents: "none", overflow: "hidden" }}><span style={{ transform: "rotate(-45deg)", fontWeight: 700, color: "rgba(128,128,128,.22)", fontSize: Math.min(110, (0.78 * Math.hypot(page.w, page.h)) / Math.max(1, o.wm.length * 0.6)) * z, whiteSpace: "nowrap", fontFamily: FAMILY.helv }}>{o.wm}</span></div>}
            {o.hd && <div style={{ ...small, top: 15 * z }}>{o.hd}</div>}
            {o.ft && <div style={{ ...small, top: H - 26 * z }}>{o.ft}</div>}
            {o.pn && <div style={{ ...small, top: H - (o.ft ? 40 : 28) * z }}>{o.pn.replace(/\{n\}/g, String(pageIdx + 1)).replace(/\{N\}/g, String(S.pages.length))}</div>}
            {interactive && selAnn && selAnn.t === "text" && (
              <>
                <Handle x={(selAnn.x + selAnn.w) * z} y={(selAnn.y + ((selAnn.size || 14) * 0.6)) * z} onDown={e => startResize(e, selAnn, "e")} cursor="ew-resize" />
                <Handle x={(selAnn.x + selAnn.w) * z} y={(selAnn.y + (selAnn.h || (selAnn.size || 14) * 1.2)) * z} onDown={e => startResize(e, selAnn, "se")} cursor="nwse-resize" />
                <Handle x={(selAnn.x + selAnn.w / 2) * z} y={(selAnn.y - 14) * z} onDown={e => startRotate(e, selAnn)} cursor="grab" rotate />
              </>
            )}
            {interactive && selAnn && (selAnn.t === "img" || selAnn.t === "link") && (
              <>
                <Handle x={(selAnn.x + selAnn.w) * z} y={(selAnn.y + (selAnn.h || 24)) * z} onDown={e => startResize(e, selAnn, "se")} cursor="nwse-resize" />
                <Handle x={(selAnn.x + selAnn.w) * z} y={(selAnn.y + (selAnn.h || 24) / 2) * z} onDown={e => startResize(e, selAnn, "e")} cursor="ew-resize" />
                <Handle x={(selAnn.x + selAnn.w / 2) * z} y={(selAnn.y + (selAnn.h || 24)) * z} onDown={e => startResize(e, selAnn, "s")} cursor="ns-resize" />
                <Handle x={(selAnn.x + selAnn.w / 2) * z} y={(selAnn.y - 14) * z} onDown={e => startRotate(e, selAnn)} cursor="grab" rotate />
              </>
            )}
            {interactive && selAnn && selAnn.t === "shape" && (
              <>
                <Handle x={selAnn.x1 * z} y={selAnn.y1 * z} onDown={e => startResize(e, selAnn, 1)} cursor="move" />
                <Handle x={selAnn.x2 * z} y={selAnn.y2 * z} onDown={e => startResize(e, selAnn, 2)} cursor="move" />
              </>
            )}
            {selBox && interactive && <div style={{ position: "absolute", left: selBox.x * z, top: selBox.y * z, width: selBox.w * z, height: selBox.h * z, border: "1.5px dashed #4f7cff", pointerEvents: "none" }} />}
            {ghost?.rect && <div style={{ position: "absolute", left: ghost.rect.x * z, top: ghost.rect.y * z, width: ghost.rect.w * z, height: ghost.rect.h * z, background: ghost.kind === "hl" ? S.fmt.hl + "66" : "rgba(79,124,255,.15)", border: "1px dashed #4f7cff", pointerEvents: "none" }} />}
            {ghost?.pts && <svg width={W} height={H} viewBox={`0 0 ${page.w} ${page.h}`} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}><polyline points={ghost.pts.map((q: number[]) => q.join(",")).join(" ")} fill="none" stroke={S.fmt.stroke} strokeWidth={S.fmt.sw} strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {ghost?.k && <svg width={W} height={H} viewBox={`0 0 ${page.w} ${page.h}`} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}><ShapeSvg a={{ ...ghost, stroke: S.fmt.stroke, fill: S.fmt.fill, sw: S.fmt.sw }} /></svg>}
          </div>
        )}
        {showExact && <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-emerald-600/90 px-2 py-1 text-[11px] font-medium text-white shadow">Exact export preview</div>}
        {(rendering || (S.preview && S.previewBusy)) && <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white"><Spinner /> {S.previewBusy ? "Updating preview…" : "Rendering…"}</div>}
      </div>
    </div>
  );
}

function Handle({ x, y, onDown, cursor, rotate }: { x: number; y: number; onDown: (e: React.PointerEvent) => void; cursor: string; rotate?: boolean }) {
  return (
    <div
      onPointerDown={onDown}
      title={rotate ? "Drag to rotate" : "Drag to resize"}
      style={{
        position: "absolute",
        left: x - 7,
        top: y - 7,
        width: 14,
        height: 14,
        borderRadius: rotate ? "50%" : 3,
        background: rotate ? "#38bdf8" : "#ffffff",
        border: "2px solid #2563eb",
        cursor,
        touchAction: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,.4)",
        zIndex: 20,
      }}
    />
  );
}
export const Spinner = () => <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />;

function ShapeSvg({ a, hit }: { a: any; hit?: boolean }) {
  const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2), w = Math.abs(a.x2 - a.x1), h = Math.abs(a.y2 - a.y1), fill = a.fill || "none", pe = hit ? (a.fill ? "visiblePainted" : "visibleStroke") : "none";
  if (a.k === "rect") return <rect x={x} y={y} width={w} height={h} fill={fill} stroke={a.stroke} strokeWidth={a.sw} pointerEvents={pe} />;
  if (a.k === "ell") return <ellipse cx={x + w / 2} cy={y + h / 2} rx={Math.max(0.1, w / 2)} ry={Math.max(0.1, h / 2)} fill={fill} stroke={a.stroke} strokeWidth={a.sw} pointerEvents={pe} />;
  const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = Math.max(9, a.sw * 4);
  return <g stroke={a.stroke} strokeWidth={a.sw} strokeLinecap="round" fill="none" pointerEvents={hit ? "visibleStroke" : "none"}>
    <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />
    {a.k === "arrow" && [0.45, -0.45].map(d => <line key={d} x1={a.x2} y1={a.y2} x2={a.x2 - L * Math.cos(ang + d)} y2={a.y2 - L * Math.sin(ang + d)} />)}
  </g>;
}

/** textarea that grows with its content and writes every keystroke to the store (live, undoable as one step) */
function AutoArea({ a, z, style, inline }: { a: any; z: number; style: React.CSSProperties; inline?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const t = ref.current; if (!t) return; t.style.height = "0px"; t.style.height = t.scrollHeight + 2 + "px"; }, [a.text, z, a.size]);
  useEffect(() => { const t = ref.current; if (t) { t.focus(); t.select(); } }, []);
  const area = <textarea ref={ref} value={a.text} spellCheck={false} aria-label="Edit text" wrap={a.nowrap ? "off" : "soft"}
    onChange={e => store.liveText(a.id, e.target.value)} onBlur={() => store.stopEdit(a.id)} onKeyDown={e => { if (e.key === "Escape") (e.target as HTMLElement).blur(); e.stopPropagation(); }}
    onPointerDown={e => e.stopPropagation()}
    style={{ ...style, resize: "none", overflow: "hidden", background: "rgba(255,255,255,.92)", outline: "1.5px solid #4f7cff", outlineOffset: 2, ...(inline ? {} : { position: "absolute", left: a.x * z, top: a.y * z, width: Math.max(a.w * z, 60), minHeight: a.size * 1.2 * z }) }} />;
  return area;
}
