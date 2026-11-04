import { useState } from "react";
import { useAuth } from "../lib/auth";
import { UI_LANGS, useT } from "../lib/i18n";
import { purge } from "../lib/docs";
import { BASE_URL } from "../lib/api";
import { safeStorage } from "../lib/safeStorage";

export default function Settings() {
  const { user, signOut } = useAuth();
  const { lang, setLang } = useT();
  const [ret, setRet] = useState(() => safeStorage.getItem("retention") || "0");
  const [fs, setFs] = useState(() => safeStorage.getItem("fs") || "100");

  try {
    document.documentElement.style.fontSize = fs + "%";
  } catch {}

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-5 md:p-10">
      <h1 className="font-display text-3xl">Settings</h1>
      <section className="card space-y-3">
        <h2 className="font-medium">Language and accessibility</h2>
        <div>
          <label className="lbl" htmlFor="ul">Interface language (voice language is chosen in Voice Studio)</label>
          <select id="ul" className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            {UI_LANGS.map(([c, n]) => (
              <option key={c} value={c}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="fs">Text size</label>
          <select
            id="fs"
            className="input"
            value={fs}
            onChange={(e) => {
              setFs(e.target.value);
              safeStorage.setItem("fs", e.target.value);
            }}
          >
            <option value="90">Small</option>
            <option value="100">Normal</option>
            <option value="115">Large</option>
            <option value="130">Extra large</option>
          </select>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Privacy and retention</h2>
        <div>
          <label className="lbl" htmlFor="rt">Auto-delete saved documents after</label>
          <select
            id="rt"
            className="input"
            value={ret}
            onChange={(e) => {
              setRet(e.target.value);
              safeStorage.setItem("retention", e.target.value);
              purge(Number(e.target.value));
            }}
          >
            <option value="0">Never (manual delete)</option>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </div>
        <p className="text-sm text-slate-400">
          Saved documents live only in this browser. Server tools process files in memory and discard them. AI features send document text to Google Gemini only after you accept the disclosure each time. Document contents are never logged.
        </p>
      </section>

      <section className="card space-y-2 text-sm">
        <h2 className="font-medium">Account</h2>
        <p className="text-slate-400">{user?.email}</p>
        <p className="text-slate-500">API: {BASE_URL}</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </section>
    </div>
  );
}
