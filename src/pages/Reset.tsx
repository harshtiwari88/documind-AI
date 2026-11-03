import { FormEvent, useState } from "react"; import { Link, useSearchParams } from "react-router-dom"; import { postJson } from "../lib/api";
export default function Reset() {
  const [p] = useSearchParams(), [pw, setPw] = useState(""), [err, setErr] = useState(""), [done, setDone] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    try { await postJson("/auth/reset", { token: p.get("token") || "", password: pw }); setDone(true); } catch (x: any) { setErr(x.message); }
  }
  return <div className="grid min-h-full place-items-center p-6"><form onSubmit={go} className="card w-full max-w-md space-y-4 !p-8"><h1 className="font-display text-2xl">Choose a new password</h1>
    {done ? <><p className="text-emerald-400">Password updated.</p><Link className="btn btn-p w-full" to="/login">Go to sign in</Link></> : <>
      <div><label className="lbl" htmlFor="np">New password</label><input id="np" className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}<button className="btn btn-p w-full">Update password</button></>}</form></div>;
}
