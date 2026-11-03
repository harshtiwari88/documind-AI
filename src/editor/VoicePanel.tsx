import { useEffect, useRef, useState } from "react";
import { editorStore as store, useEditor } from "./store";
import type { VoiceEntry } from "./store";
import { Icon } from "./icons";
import { Spinner } from "./PageView";
import { LANGS } from "../lib/langs";
import { post, postJson } from "../lib/api";
import { audioExtension, preferredRecorderMimeType } from "./audioRecording";

const STATUS: Record<VoiceEntry["status"], { label: string; cls: string }> = {
  running: { label: "Processing…", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  done: { label: "Done ✓", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  error: { label: "Not done", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  confirm: { label: "Needs Confirmation", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  clarify: { label: "Clarification", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  cancelled: { label: "Cancelled", cls: "bg-white/10 text-slate-400 border-white/10" },
};

const SUGGESTIONS_CONVO = [
  "Is page ka summary batao",
  "Is document ke main points kya hain?",
  "Explain this paragraph in simple terms",
  "Check spelling and grammar of this text",
];

const SUGGESTIONS_EDIT = [
  "Heading ko bold aur blue kar do",
  "Is page ko 90 degree rotate karo",
  "Iske baad ek blank page add karo",
  "Add my signature here",
  "Zoom in thoda aur karo",
  "Find and replace: 'Draft' ko 'Final'",
];

function Entry({ e }: { e: VoiceEntry }) {
  const [taught, setTaught] = useState(false);
  const st = STATUS[e.status] || STATUS.done;
  const isConvo = e.interpreted === "AI Conversation";

  const teach = async () => {
    try {
      await postJson("/ai/feedback", { utterance: e.heard, command: e.cmd });
      setTaught(true);
      store.toast("ok", "Saved. Similar instructions will be recognized.");
    } catch (x: any) {
      store.toast("err", x.message);
    }
  };

  return (
    <li className={`rounded-xl border p-3 text-sm transition ${isConvo ? "border-brand-500/40 bg-brand-950/20" : "border-slate-700/50 bg-slate-800/30"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
            <span>{e.source === "voice" ? "🎙️ Voice" : e.source === "ai" ? "✨ AI Assistant" : "⌨️ Typed"}</span>
          </div>
          <div className="mt-0.5 break-words font-medium text-slate-100">“{e.heard}”</div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
          {e.status === "running" && <Spinner />}
          {st.label}
        </span>
      </div>

      <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
        {isConvo ? "Response" : "Action"}
      </div>
      <div className={`mt-0.5 text-xs ${isConvo ? "whitespace-pre-wrap leading-relaxed text-slate-200" : "text-slate-300"}`}>
        {e.message || e.interpreted}
      </div>

      {e.source === "ai" && e.status === "done" && e.cmd && (
        <div className="mt-2 flex items-center justify-between pt-1">
          {taught ? (
            <span className="text-xs text-emerald-400">Remembered ✓</span>
          ) : (
            <button className="text-xs text-brand-400 underline hover:text-brand-300" onClick={teach}>
              👍 Remember this phrase
            </button>
          )}
          <button className="text-xs text-slate-400 hover:text-white" onClick={() => store.undo()}>
            Undo action
          </button>
        </div>
      )}
    </li>
  );
}

/** Animated audio visualizer */
function AudioWaveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let t = 0;

    const render = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const width = cv.width;
      const height = cv.height;
      const centerY = height / 2;
      const bars = 28;
      const barWidth = 3;
      const gap = (width - bars * barWidth) / (bars - 1);

      for (let i = 0; i < bars; i++) {
        const x = i * (barWidth + gap);
        let h = 4;
        if (active) {
          const s1 = Math.sin(t * 0.15 + i * 0.4);
          const s2 = Math.cos(t * 0.08 + i * 0.6);
          const norm = (s1 + s2 + 2) / 4;
          h = Math.max(6, norm * (height - 8));
        } else {
          h = 4 + Math.sin(t * 0.03 + i * 0.2) * 2;
        }

        const grad = ctx.createLinearGradient(0, centerY - h / 2, 0, centerY + h / 2);
        if (active) {
          grad.addColorStop(0, "#38bdf8");
          grad.addColorStop(1, "#6366f1");
        } else {
          grad.addColorStop(0, "rgba(148, 163, 184, 0.3)");
          grad.addColorStop(1, "rgba(100, 116, 139, 0.2)");
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, centerY - h / 2, barWidth, h, 2);
        ctx.fill();
      }

      t++;
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [active]);

  return <canvas ref={canvasRef} width={280} height={36} className="w-full max-w-[280px]" />;
}

export default function VoicePanel() {
  const S = useEditor();
  const [lang, setLang] = useState(() => localStorage.getItem("dm_voice_lang") || "en-IN");
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(() => localStorage.getItem("dm_ai_consent") !== "0");
  const [rec, setRec] = useState(false);
  const [wbusy, setWbusy] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const cancelRecording = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRecording.current = true;
      store.stopMic();
      const recorder = mr.current;
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  const ai = consent ? { consent: true, lang } : null;
  const m = S.mic;
  const listening = m.state === "listening";
  const starting = m.state === "starting";

  useEffect(() => { localStorage.setItem("dm_voice_lang", lang); }, [lang]);
  useEffect(() => { localStorage.setItem("dm_ai_consent", consent ? "1" : "0"); }, [consent]);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [S.log.length, S.log[S.log.length - 1]?.status]);

  async function toggleMic() {
    if (listening || starting) return store.stopMic();
    if (!navigator.mediaDevices?.getUserMedia) {
      store.startMic({ lang, ai });
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch (e: any) {
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      store.set({
        mic: {
          ...store.get().mic,
          state: denied ? "denied" : "idle",
          interim: "",
          error: denied
            ? "Microphone access is blocked. Allow mic in browser settings, then tap again."
            : "Could not open the microphone: " + (e?.message || e?.name),
        },
      });
      return;
    }
    store.startMic({ lang, ai });
  }

  async function whisper() {
    if (mr.current) {
      try { if (mr.current.state !== "inactive") mr.current.stop(); } catch { store.toast("err", "Could not stop recording."); }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return store.toast("err", "Recording requires a secure context.");
    if (typeof MediaRecorder === "undefined") return store.toast("err", "MediaRecorder is not supported.");

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
        if (mounted.current) { setRec(false); setWbusy(false); store.toast("err", "Recording failed."); }
      };
      r.onstop = async () => {
        stream?.getTracks().forEach(t => t.stop());
        if (mr.current === r) mr.current = null;
        if (!mounted.current || cancelRecording.current) return;
        setRec(false);
        if (!parts.some(p => p.size > 0)) { store.toast("info", "No audio recorded."); return; }
        setWbusy(true);
        try {
          const fd = new FormData();
          const mime = r.mimeType || mimeType || "audio/webm";
          fd.append("audio", new Blob(parts, { type: mime }), `speech.${audioExtension(mime)}`);
          fd.append("language", lang === "auto" ? "" : lang.split("-")[0]);
          const out = await post("/ai/transcribe", fd);
          if (!mounted.current || cancelRecording.current) return;
          if (out.text?.trim()) {
            await store.runUtterance(out.text, { source: "voice", ai });
          } else {
            store.toast("info", "I didn't hear clear speech. Please try again.");
          }
        } catch (e: any) {
          if (mounted.current && !cancelRecording.current) store.toast("err", e?.message || "Transcription failed.");
        } finally {
          if (mounted.current) setWbusy(false);
        }
      };
      mr.current = r;
      setRec(true);
      r.start();
    } catch (e: any) {
      stream?.getTracks().forEach(t => t.stop());
      if (mounted.current) store.toast("err", `Microphone error: ${e?.message || e?.name}`);
    }
  }

  const send = (t = text) => {
    if (!t.trim()) return;
    setText("");
    store.runUtterance(t, { source: "text", ai });
  };

  const busy = S.log.some(e => e.status === "running");

  // Determine active context label
  let contextLabel = `Page ${S.cur + 1} of ${S.pages.length}`;
  if (S.sel != null) {
    const ann = store.findAnn(S.sel)?.a;
    if (ann) {
      contextLabel = `Selected ${ann.t === "text" ? `Text: "${(ann.text || '').slice(0, 20)}"` : ann.t === "img" ? "Image" : ann.t} (Page ${S.cur + 1})`;
    }
  } else if (S.selBlock) {
    contextLabel = `Selected Paragraph (Page ${S.selBlock.page + 1})`;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Mode Switcher */}
      <div className="flex rounded-xl border border-slate-700/60 bg-slate-900/60 p-1">
        <button
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition ${S.voiceMode === "auto" ? "bg-brand-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          onClick={() => store.setVoiceMode("auto")}
          title="Auto-detect whether to chat or edit"
        >
          <span>⚡ Auto</span>
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition ${S.voiceMode === "convo" ? "bg-brand-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          onClick={() => store.setVoiceMode("convo")}
          title="Ask questions, summarize, explain"
        >
          <span>💬 Conversation</span>
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition ${S.voiceMode === "edit" ? "bg-brand-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          onClick={() => store.setVoiceMode("edit")}
          title="Modify the document via voice"
        >
          <span>✏️ Edit PDF</span>
        </button>
      </div>

      {/* Mic & Waveform Card */}
      <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-b from-brand-900/20 to-slate-900/40 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Start voice command"}
            className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-white shadow-lg transition ${listening ? "bg-red-500" : "bg-brand-600 hover:brightness-110"}`}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />}
            <span className="relative">{starting ? <Spinner /> : <Icon n={listening ? "stop" : "mic"} size={24} />}</span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                {listening ? "Listening to your voice…" : starting ? "Starting mic…" : wbusy ? "Transcribing speech…" : rec ? "Whisper recording…" : "Tap mic to speak"}
              </span>
              <span className="inline-block rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-300 font-mono">
                Hinglish / EN
              </span>
            </div>
            <div className="mt-1">
              <AudioWaveform active={listening || rec} />
            </div>
          </div>
        </div>

        {m.interim && (
          <div className="mt-2.5 rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-1.5 text-xs text-brand-200">
            “{m.interim}”
          </div>
        )}

        {m.error && (
          <div role="alert" className="mt-2.5 flex gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-2.5 text-xs text-red-200">
            <Icon n="warn" size={15} className="mt-0.5 shrink-0" />
            <span>{m.error}</span>
          </div>
        )}

        {/* Controls bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/40 pt-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <label className="text-slate-400">Language:</label>
            <select
              className="rounded-lg border border-slate-700/60 bg-slate-800 px-2 py-1 text-xs text-slate-200"
              value={lang}
              onChange={e => setLang(e.target.value)}
            >
              {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              className={`btn !py-1 !px-2.5 text-xs ${rec ? "btn-p" : ""}`}
              disabled={wbusy}
              onClick={whisper}
              title="Record and transcribe speech"
            >
              {wbusy ? <Spinner /> : <Icon n="mic" size={13} />}
              {rec ? "Stop & Send" : "Whisper"}
            </button>

            <label className="flex cursor-pointer items-center gap-1.5 text-slate-400" title="Speak answers aloud using Text-to-Speech">
              <input
                type="checkbox"
                className="accent-brand-400"
                checked={S.ttsEnabled}
                onChange={e => store.setTtsEnabled(e.target.checked)}
              />
              <span>Voice TTS</span>
            </label>
          </div>
        </div>

        {/* Context indicator */}
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="font-medium text-slate-300">Target context:</span>
          <span className="truncate text-slate-400" title={contextLabel}>{contextLabel}</span>
        </div>
      </div>

      {/* Typed input */}
      <div>
        <label className="lbl" htmlFor="vc">Or type in Hinglish / English</label>
        <div className="flex gap-1.5">
          <input
            id="vc"
            className="input text-sm"
            placeholder={S.voiceMode === "convo" ? "e.g. Is page ka summary batao" : "e.g. Heading ko bold aur blue karo"}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            enterKeyHint="send"
          />
          <button className="btn btn-p !px-3.5" aria-label="Send" disabled={!text.trim() || busy} onClick={() => send()}>
            <Icon n="check" size={18} />
          </button>
        </div>

        {/* Suggestions */}
        <div className="mt-2 space-y-1.5">
          <div className="text-[11px] font-medium text-slate-400">Quick ideas:</div>
          <div className="flex flex-wrap gap-1.5">
            {(S.voiceMode === "convo" ? SUGGESTIONS_CONVO : SUGGESTIONS_EDIT).map(s => (
              <button key={s} className="chip text-xs hover:border-brand-400/50" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmation & Clarify dialogs */}
      {S.pending && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm" role="alertdialog">
          <p className="font-medium text-amber-200">Confirm this change?</p>
          <p className="mt-0.5 text-xs text-amber-100/80">This action modifies your document (undoable afterwards).</p>
          <div className="mt-2.5 flex gap-2">
            <button className="btn btn-p flex-1" onClick={() => store.confirmPending(true)}>Confirm</button>
            <button className="btn flex-1" onClick={() => store.confirmPending(false)}>Cancel</button>
          </div>
        </div>
      )}

      {S.clarify && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm" role="alertdialog">
          <p className="font-medium text-amber-200">{S.clarify.question}</p>
          <p className="mt-0.5 text-xs text-slate-400">Answer by voice or in the box above.</p>
          <button className="btn mt-2.5 w-full text-xs" onClick={() => store.cancelClarify()}>Cancel this command</button>
        </div>
      )}

      {/* Conversation & Command Log */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Studio Activity</h3>
          {S.log.length > 0 && (
            <button className="text-xs text-slate-400 hover:text-white" onClick={() => store.clearLog()}>
              Clear
            </button>
          )}
        </div>
        <ul className="min-h-[6rem] flex-1 space-y-2 overflow-y-auto pe-1">
          {S.log.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-700/50 p-4 text-center text-xs text-slate-500">
              Speak or type commands like <span className="text-slate-300">“Heading bold kar do”</span> or ask questions like <span className="text-slate-300">“Is page ka summary kya hai”</span>.
            </li>
          )}
          {S.log.map(e => <Entry key={e.id} e={e} />)}
          <div ref={logEnd} />
        </ul>
      </div>
    </div>
  );
}
