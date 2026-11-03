import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth"; import { postJson } from "../lib/api";
export default function Login() {
  const { user, login, register } = useAuth(), go = useNavigate(); const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [adminKey, setAdminKey] = useState("");
  if (user && !user.guest) return <Navigate to="/" replace />;   // guests must still be able to open this page and sign in
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    setBusy(true);
    try { await (mode === "in" ? login(email, pw) : register(email, pw, adminKey)); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  async function forgot() {
    const e = prompt("Enter your account email"); if (!e) return;
    try { await postJson("/auth/forgot", { email: e }); setErr(""); alert("If this email is registered, a reset link has been sent."); } catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-900/70 to-transparent" />
        <div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 font-bold">D</span><span className="font-display text-xl font-semibold">DocuMind AI</span></div>
        <div><h1 className="font-display text-5xl leading-tight">Edit PDFs by<br />speaking your language.</h1>
          <p className="mt-4 max-w-md text-slate-300">Professional editing, OCR, conversion and an AI assistant that cites the exact page it read.</p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">{["Hindi, Hinglish, English and more voice commands", "Your files are processed privately, never stored", "Confirmation before anything destructive"].map(x => <li key={x} className="flex gap-3"><span className="text-brand-400">✓</span>{x}</li>)}</ul></div>
        <p className="text-xs text-slate-500">© DocuMind AI</p>
      </section>
      <section className="grid place-items-center p-6">
        <form onSubmit={submit} className="card w-full max-w-md space-y-4 !p-8" aria-labelledby="t">
          <h2 id="t" className="font-display text-2xl">{mode === "in" ? "Welcome back" : "Create your account"}</h2>
          <div><label className="lbl" htmlFor="e">Email</label><input id="e" className="input" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="p">Password</label><input id="p" className="input" type="password" required autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={e => setPw(e.target.value)} /></div>
          {mode === "up" && /reserved for an administrator/i.test(err) && <div><label className="lbl" htmlFor="ak">Admin setup key</label><input id="ak" className="input" type="password" autoComplete="off" value={adminKey} onChange={e => setAdminKey(e.target.value)} /></div>}
          {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
          <button className="btn btn-p w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
          <div className="flex justify-between text-sm text-slate-400">
            <button type="button" className="hover:text-white" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }}>{mode === "in" ? "New here? Create account" : "Have an account? Sign in"}</button>
            {mode === "in" && <button type="button" className="hover:text-white" onClick={forgot}>Forgot password?</button>}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-700/60" />or<span className="h-px flex-1 bg-slate-700/60" /></div>
          <button type="button" className="btn w-full" onClick={() => go("/")}>Continue as guest</button>
          <p className="text-xs text-slate-500">By continuing you agree that documents are processed only to fulfil your request and are not retained by the server.</p>
        </form>
      </section>
    </div>
  );
}
