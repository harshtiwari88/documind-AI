import { useEffect, useRef, useState } from "react"; import { useLocation } from "react-router-dom";
import { post, postJson } from "../lib/api"; import { LANGS } from "../lib/langs"; import { localParse } from "../lib/localNav"; import { useAppCommands } from "../lib/useAppCommands"; import { audioExtension, preferredRecorderMimeType } from "../editor/audioRecording";
// Floating voice control available on every page. Editing commands are forwarded to the editor when it is open.
export default function VoiceDock() {
  const loc = useLocation(), { run, isApp } = useAppCommands(), st = useRef({ pages: 0, cur: 1 }), mr = useRef<MediaRecorder | null>(null);
  const [open, setOpen] = useState(false), [lang, setLang] = useState("en-IN"), [text, setText] = useState(""), [cmd, setCmd] = useState<any>(null);
  const [msg, setMsg] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [rec, setRec] = useState(false), [recW, setRecW] = useState(false), [consent, setConsent] = useState(false);
  useEffect(() => { const h = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "state") st.current = e.data; }; addEventListener("message", h); return () => removeEventListener("message", h); }, []);
  if (loc.pathname.startsWith("/voice") || loc.pathname.startsWith("/editor")) return null;
  async function exec(c: any) {
    setErr(""); setMsg("");
    if (isApp(c.op)) { setMsg(await run(c)); return; }
    if (!(window as any).__dmEditor) { setErr("Open the Editor first. Editing commands run there."); return; }
    window.dispatchEvent(new CustomEvent("dm-cmd", { detail: c })); setMsg("Sent to the editor.");
  }
  async function go(raw: string) {
    raw = raw.trim(); if (!raw) return; setErr(""); setMsg(""); setCmd(null);
    const l = localParse(raw); if (l) return exec(l);
    if (!consent) return setErr("Tick the box to allow sending this command text to the AI service.");
    setBusy(true);
    try {
      const r = await postJson("/ai/command", { utterance: raw, language: lang.split("-")[0], page_count: st.current.pages || 9999, current_page: st.current.cur });
      if (r.command.op === "clarify") setMsg(r.command.question || "Please say that again more specifically.");
      else if (r.needs_confirmation) setCmd(r.command); else await exec(r.command);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  function listen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setErr("Speech recognition is not supported in this browser. Type the command.");
    const r = new SR(); r.lang = lang === "auto" ? "en-IN" : lang; r.onstart = () => setRec(true); r.onend = () => setRec(false);
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; setText(t); go(t); };
    r.onerror = (e: any) => setErr(e.error === "not-allowed" ? "Microphone permission denied." : "Speech error: " + e.error); setErr(""); if (!window.isSecureContext) return setErr("Microphone needs https or localhost."); try { r.start(); } catch { setErr("Could not start the microphone. Tap again."); }
  }
  async function whisper() {
    if (mr.current) { mr.current.stop(); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true }), mt = preferredRecorderMimeType(MediaRecorder), m = mt ? new MediaRecorder(s, { mimeType: mt }) : new MediaRecorder(s), parts: Blob[] = [];
      m.ondataavailable = e => parts.push(e.data);
      m.onstop = async () => {
        s.getTracks().forEach(t => t.stop()); mr.current = null; setRecW(false);
        const fd = new FormData(); fd.append("audio", new Blob(parts, { type: m.mimeType }), `s.${audioExtension(m.mimeType || "audio/webm")}`); fd.append("language", lang === "auto" ? "" : lang.split("-")[0]);
        setBusy(true); try { const r = await post("/ai/transcribe", fd); setText(r.text); setBusy(false); await go(r.text); } catch (e: any) { setErr(e.message); setBusy(false); }
      };
      mr.current = m; setRecW(true); m.start();
    } catch { setErr("Microphone permission denied or unavailable."); }
  }
  return (
    <div className="fixed bottom-20 end-4 z-20 md:bottom-6">
      {open && <div className="card mb-3 w-[min(92vw,360px)] space-y-3 !p-4 shadow-2xl" role="dialog" aria-label="Voice control">
        <div className="flex items-center justify-between"><b>Voice control</b><button className="text-slate-400" aria-label="Close" onClick={() => setOpen(false)}>✕</button></div>
        <select className="input" aria-label="Spoken language" value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        <div className="flex gap-2"><button className={`btn flex-1 ${rec ? "btn-p" : ""}`} onClick={listen}>{rec ? "● Listening" : "🎤 Speak"}</button><button className={`btn flex-1 ${recW ? "btn-p" : ""}`} onClick={whisper}>{recW ? "■ Stop" : "🎙 Whisper"}</button></div>
        <div className="flex gap-2"><input className="input" placeholder='e.g. "open settings", "underline total"' value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && go(text)} /><button className="btn btn-p" disabled={busy} onClick={() => go(text)}>Go</button></div>
        <label className="flex gap-2 text-xs text-slate-400"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Allow sending this command text to the AI service (not needed for “open …” commands).</label>
        {cmd && <div className="rounded-xl border border-slate-700/50 bg-black/30 p-3 text-sm"><pre className="overflow-auto text-xs">{JSON.stringify(cmd, null, 1)}</pre>
          <div className="mt-2 flex gap-2"><button className="btn btn-p flex-1" onClick={() => { const c = cmd; setCmd(null); exec(c); }}>Confirm</button><button className="btn" onClick={() => setCmd(null)}>Cancel</button></div></div>}
        {busy && <p className="text-xs text-slate-400">Working…</p>}{err && <p role="alert" className="text-sm text-red-400">{err}</p>}{msg && <p role="status" className="text-sm text-emerald-400">{msg}</p>}
      </div>}
      <button className="btn btn-p !h-14 !w-14 !rounded-full text-xl shadow-xl" aria-label="Voice control" onClick={() => setOpen(!open)}>🎤</button>
    </div>
  );
}
