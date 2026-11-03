import { useEffect, useRef, useState } from "react";
import { editorStore as store, useEditor } from "./store";
import { Icon } from "./icons";
import type { PageState } from "./types";

function Thumb({ page, n, active, onDragStart, onDrop, onOver, dragOver }: { page: PageState; n: number; active: boolean; onDragStart: () => void; onDrop: () => void; onOver: () => void; dragOver: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null), W = 96, S = useEditor();
  const swap = page.rot % 180 !== 0, dw = swap ? page.h : page.w, dh = swap ? page.w : page.h, sc = W / Math.max(page.w, page.h) * 1.15, bw = Math.min(W, dw * sc), bh = dh * sc;
  useEffect(() => {
    if (page.d < 0 || !cv.current) return; let dead = false, task: any;
    (async () => {
      try {
        const pg = await store.docs[page.d].pj.getPage(page.i + 1), vp = pg.getViewport({ scale: (W / Math.max(page.w, page.h)) * 2.2 });
        const off = document.createElement("canvas"); off.width = vp.width; off.height = vp.height; task = pg.render({ canvas: off, canvasContext: off.getContext("2d")!, viewport: vp }); await task.promise;
        if (dead || !cv.current) return; cv.current.width = off.width; cv.current.height = off.height; cv.current.getContext("2d")!.drawImage(off, 0, 0);
      } catch { /* thumbnail is cosmetic */ }
    })();
    return () => { dead = true; try { task?.cancel(); } catch { /* done */ } };
  }, [page.d, page.i, page.id]);
  const pw = page.w * sc, ph = page.h * sc;
  return (
    <div draggable onDragStart={onDragStart} onDragOver={e => { e.preventDefault(); onOver(); }} onDrop={e => { e.preventDefault(); onDrop(); }}
      className={`group relative flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 transition ${active ? "border-brand-400 bg-brand-500/15" : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/40"} ${dragOver ? "ring-2 ring-brand-400" : ""}`}
      onClick={() => store.goTo(n)} role="button" tabIndex={0} aria-label={`Page ${n + 1}`} aria-current={active} onKeyDown={e => (e.key === "Enter" || e.key === " ") && store.goTo(n)}>
      <div className="grid place-items-center" style={{ width: W, height: W * 1.2 }}>
        <div className="relative bg-white shadow" style={{ width: bw, height: bh }}>
          <div className="absolute" style={{ left: (bw - pw) / 2, top: (bh - ph) / 2, width: pw, height: ph, transform: `rotate(${page.rot}deg)` }}>
            <canvas ref={cv} style={{ width: "100%", height: "100%", display: page.d < 0 ? "none" : "block" }} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-300"><Icon n="grip" size={12} className="opacity-50" />{n + 1}{(page.a.length > 0 || S.opts.wm) && <span title="Has edits" className="h-1.5 w-1.5 rounded-full bg-brand-400" />}{page.d < 0 && <span className="text-slate-500">blank</span>}</div>
    </div>
  );
}

function Btn({ icon, label, onClick, disabled, danger }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button className={`tbtn ${danger ? "hover:!bg-red-500/20 hover:!text-red-300" : ""}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon n={icon} size={16} /></button>;
}

export default function PagesRail({ horizontal = false }: { horizontal?: boolean }) {
  const S = useEditor(), [from, setFrom] = useState<number | null>(null), [over, setOver] = useState<number | null>(null);
  const n = S.pages.length, cur = S.cur;
  const guard = (f: () => void) => { try { f(); } catch (e: any) { store.toast("err", e.message); } };
  return (
    <div className={`flex min-h-0 ${horizontal ? "flex-col" : "h-full flex-col"} gap-2`}>
      <div className="flex flex-wrap items-center justify-between gap-1 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pages · {n}</span>
        <div className="flex gap-0.5">
          <Btn icon="plus" label="Add blank page after this one" onClick={() => store.addBlank()} />
          <Btn icon="copy" label="Duplicate page" onClick={() => guard(() => store.duplicatePage(cur))} />
          <Btn icon="rotate" label="Rotate page 90° clockwise" onClick={() => store.rotatePage(cur, 90)} /><Btn icon="rotate" label="Rotate page 90° counter-clockwise" onClick={() => store.rotatePage(cur, -90)} />
          <Btn icon={horizontal ? "left" : "up"} label="Move page earlier" disabled={cur === 0} onClick={() => store.movePage(cur, cur - 1)} />
          <Btn icon={horizontal ? "right" : "down"} label="Move page later" disabled={cur === n - 1} onClick={() => store.movePage(cur, cur + 1)} />
          <Btn icon="download" label="Download this page only" onClick={() => store.extractPage(cur)} />
          <Btn icon="trash" label="Delete page" danger disabled={n < 2} onClick={() => guard(() => { store.deletePage(cur); store.toast("info", `Page ${cur + 1} deleted.`, { label: "Undo", run: () => store.undo() }); })} />
        </div>
      </div>
      <div className={`flex min-h-0 gap-2 ${horizontal ? "overflow-x-auto pb-1" : "flex-1 flex-col overflow-y-auto pe-1"}`}>
        {S.pages.map((p, i) => <Thumb key={p.id} page={p} n={i} active={i === cur} dragOver={over === i && from !== null && from !== i} onDragStart={() => setFrom(i)} onOver={() => setOver(i)} onDrop={() => { if (from !== null && from !== i) store.movePage(from, i); setFrom(null); setOver(null); }} />)}
      </div>
    </div>
  );
}
