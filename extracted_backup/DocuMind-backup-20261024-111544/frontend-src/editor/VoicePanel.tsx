import { useEffect, useRef, useState } from "react";
import { editorStore as store, useEditor } from "./store";
import type { VoiceEntry } from "./store";
import { SUGGESTIONS } from "./commands";
import { Icon } from "./icons";
import { Spinner } from "./PageView";
import { LANGS } from "../lib/langs";
import { post, postJson } from "../lib/api";
import { audioExtension, preferredRecorderMimeType } from "./audioRecording";

const STATUS: Record<VoiceEntry["status"], { label: string; cls: string }> = {
  running: { label: "Working", cls: "bg-sky-500/15 text-sky-300" }, done: { label: "Done", cls: "bg-emerald-500/15 text-emerald-300" },
  error: { label: "Not done", cls: "bg-red-500/15 text-red-300" }, confirm: { label: "Needs confirmation", cls: "bg-amber-500/15 text-amber-300" },
  clarify: { label: "Needs your answer", cls: "bg-amber-500/15 text-amber-300" }, cancelled: { label: "Cancelled", cls: "bg-white/10 text-slate-400" },
};

function Entry({ e }: { e: VoiceEntry }) {
  const [taught, setTaught] = useState(false), st = STATUS[e.status];
  const teach = async () => { try { await postJson("/ai/feedback", { utterance: e.heard, command: e.cmd }); setTaught(true); store.toast("ok", "Saved. Similar phrases will be understood next time."); } catch (x: any) { store.toast("err", x.message); } };
  return (
    <li className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 text-sm">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[11px] uppercase tracking-wide text-slate-500">Heard {e.source === "voice" ? "(voice)" : e.source === "ai" ? "(AI)" : "(typed)"}</div><div className="break-words text-slate-100">“{e.heard}”</div></div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{e.status === "running" && <Spinner />}{st.label}</span></div>
      <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">Understood as</div><div className="text-slate-200">{e.interpreted}</div>
      {e.message && <p className={`mt-2 break-words text-xs ${e.status === "error" ? "text-red-300" : e.status === "done" ? "text-emerald-300" : "text-slate-400"}`}>{e.message}</p>}
      {e.source === "ai" && e.status === "done" && e.cmd && (taught ? <p className="mt-2 text-xs text-emerald-400">Remembered ✓</p> : <button className="mt-2 text-xs text-brand-400 underline" onClick={teach}>👍 That was right, remember it</button>)}
    </li>
  );
}

export default function VoicePanel() {
  const S = useEditor(), [lang, setLang] = useState(() => localStorage.getItem("dm_voice_lang") || "en-IN"), [text, setText] = useState(""), [consent, setConsent] = useState(() => localStorage.getItem("dm_ai_consent") === "1");
  const [rec, setRec] = useState(false), [wbusy, setWbusy] = useState(false), mr = useRef<MediaRecorder | null>(null), logEnd = useRef<HTMLDivElement>(null);
  const mounted = useRef(true), cancelRecording = useRef(false);
  const [lst, setLst] = useState<any>({});
  useEffect(() => { fetch("/lang_status.json").then(r => r.json()).then(setLst).catch(() => {}); }, []);
  // Stop browser capture when the voice panel unmounts (for example, route changes).
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRecording.current = true;
      store.stopMic();
      const recorder = mr.current;
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* recorder may already be stopping */ }
      }
    };
  }, []);
  const badge = (c: string) => { const x = lst[c] || {}; return (x.text === "verified" ? " ✓" : x.text === "partial" ? " ~" : x.text === "failing" ? " ✗" : "") + (x.speech === "verified" ? " 🎙" : ""); };
  const ai = consent ? { consent: true, lang } : null, m = S.mic, listening = m.state === "listening", starting = m.state === "starting";
  useEffect(() => { localStorage.setItem("dm_voice_lang", lang); }, [lang]);
  useEffect(() => { localStorage.setItem("dm_ai_consent", consent ? "1" : "0"); }, [consent]);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [S.log.length, S.log[S.log.length - 1]?.status]);

  async function toggleMic() {
    if (listening || starting) return store.stopMic();
    if (!navigator.mediaDevices?.getUserMedia) { store.startMic({ lang, ai }); return; }   // reports "unsupported / insecure page" itself
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); }   // asks for permission explicitly so denial is explained clearly
    catch (e: any) {
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      store.set({ mic: { ...store.get().mic, state: denied ? "denied" : "idle", interim: "", error: denied ? "Microphone access is blocked. Click the lock icon in the address bar, allow the microphone for this site, then tap the mic again." : e?.name === "NotFoundError" ? "No microphone was found. Connect one, or type the command below." : "Could not open the microphone: " + (e?.message || e?.name) } });
      return;
    }
    store.startMic({ lang, ai });
  }
  async function whisper() {
    if (mr.current) {
      try { if (mr.current.state !== "inactive") mr.current.stop(); }
      catch { store.toast("err", "Could not stop the recording. Please try again."); }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return store.toast("err", "Recording isn't available on this page (needs https or localhost).");
    if (typeof MediaRecorder === "undefined") return store.toast("err", "This browser does not support audio recording. Use Chrome, Edge or Safari, or type the command.");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const mimeType = preferredRecorderMimeType(MediaRecorder);
      const r = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const parts: Blob[] = [];
      cancelRecording.current = false;
      r.ondataavailable = e => { if (e.data && e.data.size > 0) parts.push(e.data); };
      r.onerror = () => {
        cancelRecording.current = true;
        stream?.getTracks().forEach(t => t.stop());
        if (mr.current === r) mr.current = null;
        if (mounted.current) { setRec(false); setWbusy(false); store.toast("err", "Audio recording failed. Please try again or type your command."); }
      };
      r.onstop = async () => {
        stream?.getTracks().forEach(t => t.stop());
        if (mr.current === r) mr.current = null;
        if (!mounted.current || cancelRecording.current) return;
        setRec(false);
        if (!parts.some(part => part.size > 0)) { store.toast("info", "No audio was recorded. Tap Whisper and speak, then stop the recording."); return; }
        setWbusy(true);
        try {
          const fd = new FormData();
          const mime = r.mimeType || mimeType || "audio/webm";
          fd.append("audio", new Blob(parts, { type: mime }), `speech.${audioExtension(mime)}`);
          fd.append("language", lang === "auto" ? "" : lang.split("-")[0]);
          const out = await post("/ai/transcribe", fd);
          if (!mounted.current || cancelRecording.current) return;
          if (out.text?.trim()) await store.runUtterance(out.text, { source: "voice", ai });
          else store.toast("info", "I didn't hear any speech. Try again.");
        } catch (e: any) {
          if (mounted.current && !cancelRecording.current) store.toast("err", e?.message || "Audio transcription failed.");
        } finally { if (mounted.current) setWbusy(false); }
      };
      mr.current = r;
      setRec(true);
      r.start();
    } catch (e: any) {
      stream?.getTracks().forEach(t => t.stop());
      if (mounted.current) store.toast("err", e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "Microphone permission denied. Allow it in your browser's site settings." : e?.name === "NotFoundError" ? "No microphone was found. Connect one, or type the command." : `Microphone recording failed: ${e?.message || e?.name || "unknown error"}`);
    }
  }
  const send = (t = text) => { if (!t.trim()) return; setText(""); store.runUtterance(t, { source: "text", ai }); };
  const busy = S.log.some(e => e.status === "running");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-slate-700/50 bg-brand-600/10 p-4">
        <div className="flex items-center gap-4">
          <button onClick={toggleMic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start voice command"}
            className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full text-white shadow-lg transition ${listening ? "bg-red-500" : "bg-brand-600 hover:brightness-110"}`}>
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />}
            <span className="relative">{starting ? <Spinner /> : <Icon n={listening ? "stop" : "mic"} size={26} />}</span>
          </button>
          <div className="min-w-0 flex-1" aria-live="polite">
            <div className="text-sm font-medium">{listening ? "Listening… speak now" : starting ? "Starting microphone…" : wbusy ? "Transcribing…" : rec ? "Recording (Whisper)…" : "Tap the mic and speak"}</div>
            <div className="mt-1 min-h-[2.5rem] break-words text-sm text-slate-300">{m.interim ? <>“{m.interim}”</> : <span className="text-slate-500">Your words appear here as you speak.</span>}</div>
          </div>
        </div>
        {m.error && <div role="alert" className="mt-3 flex gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200"><Icon n="warn" size={16} className="mt-0.5 shrink-0" /><span>{m.error}</span></div>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="col-span-2"><label className="lbl" htmlFor="vl">Spoken language</label><select id="vl" className="input" value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}{badge(c)}</option>)}</select><p className="mt-1 text-[11px] text-slate-500">✓ commands verified · ~ partly · ✗ failing · 🎙 speech verified. English commands work offline; other languages use Whisper + AI.</p></div>
          <button className={`btn ${rec ? "btn-p" : ""}`} disabled={wbusy} onClick={whisper} title="Records audio and transcribes it on your DocuMind server. Best for Indian languages.">{wbusy ? <Spinner /> : <Icon n="mic" size={15} />}{rec ? "Stop & send" : "Whisper"}</button>
          <label className="btn cursor-pointer select-none"><input type="checkbox" className="accent-brand-400" checked={m.handsFree} onChange={e => store.setHandsFree(e.target.checked)} />Hands-free</label>
        </div>
      </div>

      <div>
        <label className="lbl" htmlFor="vc">Or type a command</label>
        <div className="flex gap-1.5"><input id="vc" className="input" placeholder="e.g. add a heading saying Report at the top" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} enterKeyHint="send" />
          <button className="btn btn-p !px-3.5" aria-label="Run command" disabled={!text.trim() || busy} onClick={() => send()}><Icon n="check" size={18} /></button></div>
        <div className="mt-2 flex flex-wrap gap-1.5">{SUGGESTIONS.map(s => <button key={s} className="chip" onClick={() => send(s)} disabled={!S.hasDoc}>{s}</button>)}</div>
      </div>

      {S.pending && <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm" role="alertdialog" aria-label="Confirm change">
        <p className="text-amber-100">This change needs your confirmation. You can undo it afterwards.</p>
        <div className="mt-2 flex gap-2"><button className="btn btn-p flex-1" onClick={() => store.confirmPending(true)}>Confirm</button><button className="btn flex-1" onClick={() => store.confirmPending(false)}>Cancel</button></div></div>}
      {S.clarify && <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm" role="alertdialog" aria-label="Clarification needed">
        <p className="text-amber-100">{S.clarify.question}</p><p className="mt-1 text-xs text-slate-400">Answer by voice or in the box above. Nothing has been changed yet.</p>
        <button className="btn mt-2 w-full" onClick={() => store.cancelClarify()}>Cancel this command</button></div>}

      <label className="flex gap-2 text-xs text-slate-400"><input type="checkbox" className="mt-0.5 accent-brand-400" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Let the AI service interpret commands the built-in parser doesn't understand (sends the command text and a short page outline to your DocuMind server).</span></label>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Command log</h3>{S.log.length > 0 && <button className="text-xs text-slate-400 hover:text-white" onClick={() => store.clearLog()}>Clear</button>}</div>
        <ul className="min-h-[6rem] flex-1 space-y-2 overflow-y-auto pe-1">
          {S.log.length === 0 && <li className="rounded-xl border border-dashed border-slate-700/50 p-4 text-center text-xs text-slate-500">Commands you speak or type appear here with what was heard, how it was understood, and whether it worked.</li>}
          {S.log.map(e => <Entry key={e.id} e={e} />)}<div ref={logEnd} />
        </ul>
      </div>
    </div>
  );
}
