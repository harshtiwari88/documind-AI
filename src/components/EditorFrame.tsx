import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"; import { list } from "../lib/docs";
// The PDF canvas editor lives in /public/editor.html and talks to the app through postMessage (same origin only).
const EditorFrame = forwardRef<{ send: (m: any) => void }, { docId?: string | null; onState?: (s: any) => void }>(({ docId, onState }, ref) => {
  const f = useRef<HTMLIFrameElement>(null);
  useImperativeHandle(ref, () => ({ send: (m: any) => f.current?.contentWindow?.postMessage(m, location.origin) }));
  useEffect(() => { const h = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "state") onState?.(e.data); }; addEventListener("message", h); return () => removeEventListener("message", h); }, []);
  useEffect(() => { (window as any).__dmEditor = true; const h = (e: any) => f.current?.contentWindow?.postMessage({ type: "cmd", cmd: e.detail }, location.origin); addEventListener("dm-cmd", h); return () => { delete (window as any).__dmEditor; removeEventListener("dm-cmd", h); }; }, []);
  async function load() { if (!docId) return; const d = (await list()).find(x => x.id === docId); if (d) f.current?.contentWindow?.postMessage({ type: "open", name: d.name, buf: await d.file.arrayBuffer() }, location.origin); }
  return <iframe ref={f} src="/editor.html" onLoad={load} title="PDF editor" className="h-full min-h-[70vh] w-full rounded-2xl border border-slate-700/50 bg-white" />;
});
export default EditorFrame;
