import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { postJson } from "../lib/api";
import HarshRobot from "../components/HarshRobot";
import { Icon } from "../editor/icons";

export default function Login() {
  const { user, login, register } = useAuth();
  const go = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  if (user && !user.guest) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) return setErr("Password must be at least 8 characters long.");
    setBusy(true);
    try {
      await (mode === "in" ? login(email, pw) : register(email, pw, adminKey));
    } catch (x: any) {
      setErr(x.message || "Authentication failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotBusy(true);
    setForgotMsg("");
    try {
      await postJson("/auth/forgot", { email: forgotEmail });
      setForgotMsg("If this account exists, password reset instructions have been generated.");
    } catch (x: any) {
      setForgotMsg(x.message || "Failed to process reset request.");
    } finally {
      setForgotBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2 bg-[#0b132b]">
      {/* Left Brand Showcase Section */}
      <section className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex bg-gradient-to-br from-[#0b132b] via-[#111e3b] to-[#070d1e] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(0,245,212,0.15),transparent_40%)]" />

        <div className="flex items-center gap-3">
          <HarshRobot size={44} mood="happy" showBadge />
          <div>
            <span className="text-2xl font-extrabold tracking-tight text-white">
              Harsh <span className="text-[#00f5d4]">AI</span>
            </span>
            <span className="block text-xs font-medium text-cyan-300">
              Your Intelligent Document &amp; AI Companion
            </span>
          </div>
        </div>

        <div className="max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-[#00f5d4] mb-4">
            <span className="h-2 w-2 rounded-full bg-[#00f5d4] animate-pulse" />
            Next-Gen AI Document Studio
          </div>
          <h1 className="text-4xl font-extrabold leading-tight text-white tracking-tight sm:text-5xl">
            Edit, Analyze &amp; Speak to Your PDFs Effortlessly.
          </h1>
          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Harsh AI brings an advanced desktop-grade PDF editor, dual-mode Hinglish/English voice editing, and Gemini 3.8 Flash intelligence together.
          </p>

          <ul className="mt-8 space-y-3.5 text-sm text-slate-200">
            {[
              "Intelligent conversational Q&A in Hinglish, Hindi, and English",
              "Generate 5 MCQs, flashcards, study revision notes & viva questions",
              "Dual-mode Voice Studio: direct speech commands & audio conversation",
              "Advanced PDF Editor: edit text, images, shapes, signatures & pages",
              "Full PWA support: installable on Android, Windows, Mac, and iOS",
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-500/20 text-[#00f5d4] text-xs font-bold">
                  ✓
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-4">
          <span>© 2026 Harsh AI. All rights reserved.</span>
          <span>Version 2.0.0</span>
        </div>
      </section>

      {/* Right Login / Registration Form */}
      <section className="grid place-items-center p-6 bg-[#0b1220]">
        <div className="w-full max-w-md">
          {/* Mobile mascot display */}
          <div className="flex items-center justify-center gap-2 mb-6 lg:hidden">
            <HarshRobot size={40} showBadge />
            <span className="text-2xl font-extrabold text-white">
              Harsh <span className="text-[#00f5d4]">AI</span>
            </span>
          </div>

          <form
            onSubmit={submit}
            className="w-full space-y-5 rounded-3xl border border-slate-800 bg-[#141f38] p-8 shadow-2xl"
            aria-labelledby="form-heading"
          >
            <div>
              <h2 id="form-heading" className="text-2xl font-bold text-white tracking-tight">
                {mode === "in" ? "Sign in to Harsh AI" : "Create your account"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {mode === "in"
                  ? "Enter your credentials to access your document studio."
                  : "Get started with full document suite and AI capabilities."}
              </p>
            </div>

            <div>
              <label className="lbl text-slate-300" htmlFor="email-input">
                Email Address
              </label>
              <input
                id="email-input"
                className="input !bg-slate-900 !border-slate-700 !text-white focus:!border-cyan-400"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="lbl text-slate-300" htmlFor="pw-input">
                Password
              </label>
              <input
                id="pw-input"
                className="input !bg-slate-900 !border-slate-700 !text-white focus:!border-cyan-400"
                type="password"
                required
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>

            {mode === "up" && /reserved for an administrator/i.test(err) && (
              <div>
                <label className="lbl text-amber-300" htmlFor="admin-key-input">
                  Admin Setup Key
                </label>
                <input
                  id="admin-key-input"
                  className="input !bg-slate-900 !border-slate-700 !text-white"
                  type="password"
                  autoComplete="off"
                  placeholder="Enter administrator secret key"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                />
              </div>
            )}

            {err && (
              <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {err}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg hover:from-blue-500 hover:to-cyan-400 disabled:opacity-60 transition"
              disabled={busy}
            >
              {busy ? "Authenticating…" : mode === "in" ? "Sign In" : "Create Account"}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <button
                type="button"
                className="hover:text-cyan-300 transition"
                onClick={() => {
                  setMode(mode === "in" ? "up" : "in");
                  setErr("");
                }}
              >
                {mode === "in" ? "Need an account? Sign up" : "Already registered? Sign in"}
              </button>
              {mode === "in" && (
                <button
                  type="button"
                  className="hover:text-cyan-300 transition"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotMsg("");
                    setForgotOpen(true);
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-800" />
              <span>or</span>
              <span className="h-px flex-1 bg-slate-800" />
            </div>

            <button
              type="button"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition"
              onClick={() => go("/")}
            >
              Continue as Guest
            </button>

            <p className="text-center text-[11px] text-slate-500">
              Documents are processed securely with client-side isolation and Google Gemini API.
            </p>
          </form>
        </div>
      </section>

      {/* Forgot Password In-Page Modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setForgotOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#141f38] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white">Reset Password</h3>
            <p className="mt-1 text-xs text-slate-400">Enter your account email to receive a password reset code.</p>
            <form onSubmit={handleForgot} className="mt-4 space-y-4">
              <div>
                <label className="lbl text-slate-300" htmlFor="reset-email">Account Email</label>
                <input
                  id="reset-email"
                  className="input !bg-slate-900 !border-slate-700 !text-white"
                  type="email"
                  required
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              {forgotMsg && (
                <p className={`text-xs ${forgotMsg.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>{forgotMsg}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn !bg-slate-800 text-slate-300" onClick={() => setForgotOpen(false)}>Close</button>
                <button type="submit" className="btn btn-p" disabled={forgotBusy}>
                  {forgotBusy ? "Sending…" : "Generate Reset Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
