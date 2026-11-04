import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  ShieldCheck,
  Check,
  CheckCircle2,
  Sparkles,
  Download,
  Laptop,
  Smartphone,
  KeyRound,
  AlertCircle,
  ArrowRight,
  Shield,
  HelpCircle,
  X,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { postJson } from "../lib/api";
import HarshRobot from "../components/HarshRobot";
import { usePWAInstall } from "../lib/usePWAInstall";

const SAVED_EMAIL_KEY = "harsh_ai_saved_email";

export default function Login() {
  const { user, login, register, continueAsGuest } = useAuth();
  const navigate = useNavigate();
  const { isInstallable, isInstalled, install, isIOS } = usePWAInstall();

  // Mode: "in" = Sign In, "up" = Register / Create Account
  const [mode, setMode] = useState<"in" | "up">("in");

  // Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => localStorage.getItem(SAVED_EMAIL_KEY) || "");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // 2-Way Authentication (2WA / 2FA)
  const [enable2FA, setEnable2FA] = useState(false);
  const [showTwoFactorInput, setShowTwoFactorInput] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  // Admin Setup
  const [adminKey, setAdminKey] = useState("");

  // Terms agreement
  const [termsAccepted, setTermsAccepted] = useState(true);

  // States
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mascotMood, setMascotMood] = useState<"happy" | "thinking" | "listening" | "waving">("happy");

  // DWA Guide Modal State
  const [showDWAGuide, setShowDWAGuide] = useState(false);
  const [dwaTab, setDwaTab] = useState<"desktop" | "mac" | "android" | "ios">("desktop");
  const [installingDWA, setInstallingDWA] = useState(false);

  // Forgot Password Modal
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotToken, setForgotToken] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  // If already authenticated and not guest, redirect to dashboard
  if (user && !user.guest) {
    return <Navigate to="/" replace />;
  }

  // Password Strength Calculation
  function getPasswordStrength(p: string) {
    if (!p) return { score: 0, label: "None", color: "bg-slate-700" };
    let score = 0;
    if (p.length >= 8) score += 1;
    if (p.length >= 12) score += 1;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score += 1;
    if (/[0-9]/.test(p)) score += 1;
    if (/[^A-Za-z0-9]/.test(p)) score += 1;

    if (score <= 1) return { score: 1, label: "Weak", color: "bg-red-500", text: "text-red-400" };
    if (score === 2) return { score: 2, label: "Fair", color: "bg-amber-500", text: "text-amber-400" };
    if (score === 3 || score === 4) return { score: 3, label: "Good", color: "bg-cyan-500", text: "text-cyan-400" };
    return { score: 4, label: "Strong", color: "bg-emerald-400", text: "text-emerald-400" };
  }

  const strength = getPasswordStrength(pw);
  const isMatch = mode === "up" && confirmPw.length > 0 && pw === confirmPw;
  const isMismatch = mode === "up" && confirmPw.length > 0 && pw !== confirmPw;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setSuccessMsg("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErr("Please enter a valid email address.");
      return;
    }

    if (pw.length < 8) {
      setErr("Password must be at least 8 characters long.");
      return;
    }

    if (mode === "up") {
      if (pw !== confirmPw) {
        setErr("Passwords do not match. Please verify your password confirmation.");
        return;
      }
      if (!termsAccepted) {
        setErr("Please accept the Terms of Service to create an account.");
        return;
      }
    }

    setBusy(true);
    setMascotMood("thinking");

    try {
      if (mode === "in") {
        // Sign In
        const result = await login(cleanEmail, pw, showTwoFactorInput ? twoFactorCode : "");
        if (result?.twoFactorRequired) {
          setShowTwoFactorInput(true);
          setErr("Two-Factor (2WA) code required. Enter your 6-digit code or demo OTP 123456.");
          setBusy(false);
          setMascotMood("listening");
          return;
        }

        if (rememberMe) {
          localStorage.setItem(SAVED_EMAIL_KEY, cleanEmail);
        } else {
          localStorage.removeItem(SAVED_EMAIL_KEY);
        }

        setMascotMood("happy");
        navigate("/");
      } else {
        // Register (Create Account)
        const result = await register(cleanEmail, pw, name, adminKey, enable2FA);
        if (rememberMe) {
          localStorage.setItem(SAVED_EMAIL_KEY, cleanEmail);
        }
        setSuccessMsg(
          enable2FA && result?.twoFactorSecret
            ? `Account created successfully! Your Two-Way (2WA) code is: ${result.twoFactorSecret}. Redirecting…`
            : "Account created successfully! Welcome to Harsh AI. Redirecting…"
        );
        setMascotMood("happy");
        setTimeout(() => {
          navigate("/");
        }, 1200);
      }
    } catch (x: any) {
      setErr(x.message || "Authentication failed. Please verify your credentials.");
      setMascotMood("listening");
    } finally {
      setBusy(false);
    }
  }

  // 1-Click Demo Login
  async function fillDemo(demoEmail: string, demoPw: string) {
    setEmail(demoEmail);
    setPw(demoPw);
    setMode("in");
    setErr("");
    setSuccessMsg("");
    setBusy(true);
    setMascotMood("thinking");
    try {
      await login(demoEmail, demoPw);
      navigate("/");
    } catch (x: any) {
      setErr(x.message || "Failed to sign in with demo account.");
      setMascotMood("listening");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotBusy(true);
    setForgotMsg("");
    setForgotToken("");
    try {
      const res = await postJson("/auth/forgot", { email: forgotEmail.trim() });
      setForgotMsg(res.message || "Password reset token generated.");
      if (res.token) {
        setForgotToken(res.token);
      }
    } catch (x: any) {
      setForgotMsg(x.message || "Failed to process reset request.");
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleDWAInstall() {
    setInstallingDWA(true);
    try {
      if (isInstallable) {
        await install();
      } else {
        setShowDWAGuide(true);
      }
    } finally {
      setInstallingDWA(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-12 bg-[#080d1e] text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* ============================================================== */}
      {/* LEFT: Rich Branding, Value Proposition & DWA Showcase          */}
      {/* ============================================================== */}
      <section className="relative hidden flex-col justify-between overflow-hidden p-10 lg:col-span-5 lg:flex xl:p-14 bg-gradient-to-br from-[#0b132b] via-[#101b38] to-[#070b1a] border-e border-slate-800/80">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_25%_25%,rgba(0,245,212,0.14),transparent_50%)]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />

        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <HarshRobot size={46} mood={mascotMood} showBadge />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-white">
                Harsh <span className="text-[#00f5d4]">AI</span>
              </span>
              <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-[#00f5d4] uppercase tracking-wider">
                v2.0
              </span>
            </div>
            <span className="block text-xs font-medium text-cyan-300/90">
              Your Intelligent Document &amp; AI Companion
            </span>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="my-auto space-y-6 max-w-lg py-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-[#00f5d4] shadow-inner">
            <Sparkles className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "6s" }} />
            Next-Gen AI Document &amp; Voice Studio
          </div>

          <h1 className="text-3xl font-extrabold leading-tight text-white tracking-tight sm:text-4xl">
            Edit, Analyze &amp; Converse with PDFs with Native Desktop Power.
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed">
            Experience real desktop-speed PDF editing, dual-mode Hinglish/English voice commands, Gemini 3.8 Flash intelligence, and instant Visual Mind Maps.
          </p>

          <ul className="space-y-3 text-xs text-slate-200">
            {[
              {
                title: "Advanced PDF Canvas",
                desc: "Direct text editing, shape drawing, digital signatures & page restructuring.",
              },
              {
                title: "Dual-Mode Voice Assistant",
                desc: "Talk in Hinglish or English to issue live editing commands or ask questions.",
              },
              {
                title: "Mermaid Visual Mind Maps",
                desc: "Turn complex PDFs into interactive hierarchical flowcharts in seconds.",
              },
              {
                title: "DWA / PWA Native Desktop App",
                desc: "Install locally on Windows, macOS, Android, and iOS for instant offline access.",
              },
            ].map((item, idx) => (
              <li key={idx} className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 backdrop-blur-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cyan-500/20 text-[#00f5d4] font-bold">
                  ✓
                </span>
                <div>
                  <strong className="block text-white font-semibold">{item.title}</strong>
                  <span className="text-slate-400">{item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Left Footer DWA Quick CTA */}
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900/60 p-4 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/20 text-[#00f5d4]">
                <Laptop className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">Desktop Web App (DWA)</span>
                <span className="text-[11px] text-cyan-300/80">Offline ready &bull; Zero address bar</span>
              </div>
            </div>
            <button
              onClick={handleDWAInstall}
              disabled={installingDWA}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-cyan-400 transition active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isInstallable ? "Install App" : "Install DWA"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* RIGHT: Login & Register Form with DWA & 2WA                    */}
      {/* ============================================================== */}
      <section className="flex flex-col justify-center items-center p-4 sm:p-8 lg:col-span-7 bg-[#080d1e] overflow-y-auto">
        <div className="w-full max-w-xl py-6">
          {/* Mobile Header */}
          <div className="flex flex-col items-center gap-2 mb-6 text-center lg:hidden">
            <HarshRobot size={48} mood={mascotMood} showBadge />
            <h2 className="text-2xl font-black text-white">
              Harsh <span className="text-[#00f5d4]">AI</span>
            </h2>
            <p className="text-xs text-slate-400">Intelligent Document Suite &amp; Desktop App</p>
          </div>

          {/* Main Card Container */}
          <div className="rounded-3xl border border-slate-800/90 bg-[#0f172f]/90 p-6 sm:p-9 shadow-2xl backdrop-blur-xl">
            {/* Top Mode Segmented Switcher: Sign In vs Register */}
            <div className="grid grid-cols-2 rounded-2xl bg-slate-900/90 p-1.5 border border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode("in");
                  setErr("");
                  setSuccessMsg("");
                  setMascotMood("happy");
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all ${
                  mode === "in"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg ring-1 ring-cyan-400/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`}
                aria-pressed={mode === "in"}
              >
                <Lock className="h-4 w-4" />
                <span>Sign In</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("up");
                  setErr("");
                  setSuccessMsg("");
                  setMascotMood("happy");
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all ${
                  mode === "up"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg ring-1 ring-cyan-400/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`}
                aria-pressed={mode === "up"}
              >
                <UserIcon className="h-4 w-4" />
                <span>Create Account</span>
                <span className="hidden sm:inline-block rounded-full bg-cyan-400/20 px-1.5 py-0.2 text-[10px] text-cyan-300 font-semibold">
                  New
                </span>
              </button>
            </div>

            {/* Header copy */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                {mode === "in" ? "Welcome back!" : "Join Harsh AI"}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-cyan-300 font-normal">
                  {mode === "in" ? "Secure Login" : "Fast Registration"}
                </span>
              </h2>
              <p className="mt-1.5 text-xs text-slate-400">
                {mode === "in"
                  ? "Access your saved PDFs, AI workspace, and custom annotations."
                  : "Create an account to save documents, unlock AI features, and install as DWA."}
              </p>
            </div>

            {/* Alert / Feedback Messages */}
            {err && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 text-xs text-red-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">{err}</div>
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 text-xs text-emerald-200"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">{successMsg}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Full Name field (Register mode) */}
              {mode === "up" && (
                <div>
                  <label className="lbl text-slate-300" htmlFor="name-input">
                    Full Name <span className="text-slate-500 text-[11px]">(Optional)</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="name-input"
                      className="input !bg-slate-900/80 !border-slate-700 !text-white ps-10 focus:!border-cyan-400 focus:!ring-cyan-500/20"
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Harsh Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Email Address */}
              <div>
                <label className="lbl text-slate-300" htmlFor="email-input">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="email-input"
                    className="input !bg-slate-900/80 !border-slate-700 !text-white ps-10 focus:!border-cyan-400 focus:!ring-cyan-500/20"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="lbl text-slate-300 !mb-0" htmlFor="pw-input">
                    Password
                  </label>
                  {mode === "in" && (
                    <button
                      type="button"
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition"
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
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="pw-input"
                    className="input !bg-slate-900/80 !border-slate-700 !text-white ps-10 pe-10 focus:!border-cyan-400 focus:!ring-cyan-500/20"
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                    placeholder="Minimum 8 characters"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Real-time Password Strength meter for Registration */}
                {mode === "up" && pw.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Password Strength:</span>
                      <span className={`font-semibold ${strength.text}`}>{strength.label}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 h-1.5 rounded-full overflow-hidden bg-slate-800">
                      <div className={`h-full ${strength.score >= 1 ? strength.color : "bg-transparent"}`} />
                      <div className={`h-full ${strength.score >= 2 ? strength.color : "bg-transparent"}`} />
                      <div className={`h-full ${strength.score >= 3 ? strength.color : "bg-transparent"}`} />
                      <div className={`h-full ${strength.score >= 4 ? strength.color : "bg-transparent"}`} />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password (Register mode only) */}
              {mode === "up" && (
                <div>
                  <label className="lbl text-slate-300" htmlFor="confirm-pw-input">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="confirm-pw-input"
                      className={`input !bg-slate-900/80 !text-white ps-10 pe-10 focus:!ring-cyan-500/20 ${
                        isMatch
                          ? "!border-emerald-500/80 focus:!border-emerald-400"
                          : isMismatch
                          ? "!border-red-500/80 focus:!border-red-400"
                          : "!border-slate-700 focus:!border-cyan-400"
                      }`}
                      type={showConfirmPw ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      aria-label={showConfirmPw ? "Hide password" : "Show password"}
                    >
                      {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isMatch && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <Check className="h-3 w-3" /> Passwords match
                    </div>
                  )}
                  {isMismatch && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-red-400">
                      <AlertCircle className="h-3 w-3" /> Passwords do not match
                    </div>
                  )}
                </div>
              )}

              {/* Two-Factor Authentication (2WA / 2FA) Section */}
              {mode === "in" ? (
                <div>
                  {!showTwoFactorInput ? (
                    <button
                      type="button"
                      onClick={() => setShowTwoFactorInput(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Have a Two-Way (2WA / 2FA) verification code?</span>
                    </button>
                  ) : (
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="lbl !mb-0 text-cyan-300 flex items-center gap-1.5" htmlFor="two-factor-input">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Two-Way (2WA / 2FA) Code</span>
                        </label>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-slate-200"
                          onClick={() => {
                            setShowTwoFactorInput(false);
                            setTwoFactorCode("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <input
                        id="two-factor-input"
                        className="input !bg-slate-900 !border-cyan-500/40 !text-white focus:!border-cyan-400 font-mono tracking-widest text-center"
                        type="text"
                        maxLength={10}
                        placeholder="e.g. 123456"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value.toUpperCase())}
                      />
                      <p className="text-[10px] text-slate-400">
                        Enter your 2WA secret or standard demo OTP: <strong className="text-cyan-300">123456</strong>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {/* Register 2WA Toggle */}
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 select-none">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                      checked={enable2FA}
                      onChange={(e) => setEnable2FA(e.target.checked)}
                    />
                    <div>
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-cyan-400" />
                        Enable Two-Way Authentication (2WA / 2FA)
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        Generates a secure verification code required on every sign-in.
                      </span>
                    </div>
                  </label>

                  {/* Terms acceptance */}
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-400 select-none">
                    <input
                      type="checkbox"
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    <span>
                      I agree to the <span className="text-slate-300 underline">Terms of Service</span> and client-side privacy isolation.
                    </span>
                  </label>
                </div>
              )}

              {/* Admin Setup Key (Auto-revealed for administrator emails) */}
              {mode === "up" && (email.toLowerCase().includes("admin") || /reserved for an administrator/i.test(err)) && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 space-y-2">
                  <label className="lbl !mb-0 text-amber-300 flex items-center gap-1.5" htmlFor="admin-key-input">
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Administrator Setup Key</span>
                  </label>
                  <input
                    id="admin-key-input"
                    className="input !bg-slate-900 !border-amber-500/40 !text-white focus:!border-amber-400"
                    type="password"
                    placeholder="Enter admin secret key"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                  />
                  <p className="text-[10px] text-amber-200/80">
                    Required to register with an administrator email address.
                  </p>
                </div>
              )}

              {/* Remember Email Checkbox (Sign In mode) */}
              {mode === "in" && (
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Remember my email</span>
                  </label>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 py-3 text-sm font-bold text-slate-950 shadow-lg hover:from-blue-500 hover:via-cyan-400 hover:to-teal-300 disabled:opacity-60 transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <>
                    <span>{mode === "in" ? "Sign In to Studio" : "Create My Account"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Login Bar */}
            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  Instant 1-Click Test Drive:
                </span>
                <span className="text-[10px] text-slate-500">No typing needed</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fillDemo("admin@harsh.ai", "HarshAdmin2026!")}
                  disabled={busy}
                  className="flex flex-col items-start rounded-xl border border-blue-500/30 bg-blue-950/30 p-2.5 text-start hover:bg-blue-900/40 hover:border-blue-400/50 transition active:scale-95 disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin Demo
                  </span>
                  <span className="text-[10px] text-slate-400 truncate max-w-full">
                    admin@harsh.ai (Full Analytics)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo("user@harsh.ai", "UserDemo2026!")}
                  disabled={busy}
                  className="flex flex-col items-start rounded-xl border border-slate-700 bg-slate-900/60 p-2.5 text-start hover:bg-slate-800/80 hover:border-slate-600 transition active:scale-95 disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <UserIcon className="h-3.5 w-3.5" /> User Demo
                  </span>
                  <span className="text-[10px] text-slate-400 truncate max-w-full">
                    user@harsh.ai (Standard Suite)
                  </span>
                </button>
              </div>

              {/* Guest Access Alternative */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    continueAsGuest();
                    navigate("/");
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/40 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                >
                  <span>Continue Browsing as Guest</span>
                  <span className="text-slate-500">&bull;</span>
                  <span className="text-[11px] text-slate-400">Skip sign-in</span>
                </button>
              </div>
            </div>

            {/* DWA (Desktop Web App / PWA) Dedicated Install Card */}
            <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/30 via-slate-900/50 to-blue-950/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/20 text-[#00f5d4]">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Desktop Web App (DWA / PWA)</span>
                      <span className="rounded bg-cyan-500/20 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300">
                        Installable
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400 leading-normal">
                      Install Harsh AI on Windows, Mac, Linux, or Mobile for offline document tools &amp; fast launch.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDWAInstall}
                  disabled={installingDWA}
                  className="shrink-0 flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md hover:bg-cyan-400 transition active:scale-95"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isInstallable ? "Install Now" : "Install DWA"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Security & Isolation Footnote */}
          <div className="mt-6 text-center text-[11px] text-slate-500 space-y-1">
            <p>
              🔒 PDF documents are isolated client-side. AI queries are processed through server-side Gemini 3.8 Flash.
            </p>
            <p>
              Harsh AI &copy; 2026. All rights reserved.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* MODAL 1: DWA (Desktop Web App) Installation Guide              */}
      {/* ============================================================== */}
      {showDWAGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowDWAGuide(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-slate-700 bg-[#0e162d] p-6 text-white shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500/20 text-[#00f5d4]">
                  <Laptop className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold">Install Harsh AI Desktop Web App (DWA)</h3>
                  <p className="text-xs text-slate-400">Run Harsh AI natively outside the browser tabs</p>
                </div>
              </div>
              <button
                onClick={() => setShowDWAGuide(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* DWA OS Tabs */}
            <div className="grid grid-cols-4 rounded-xl bg-slate-900 p-1 text-xs">
              {[
                { id: "desktop", label: "Windows / PC", icon: Laptop },
                { id: "mac", label: "macOS", icon: Laptop },
                { id: "android", label: "Android", icon: Smartphone },
                { id: "ios", label: "iOS / iPad", icon: Smartphone },
              ].map((tab) => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDwaTab(tab.id as any)}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-medium transition ${
                      dwaTab === tab.id
                        ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <IconComponent className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Step-by-Step Instructions by OS */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-300 space-y-3">
              {dwaTab === "desktop" && (
                <>
                  <div className="font-bold text-cyan-300">Google Chrome or Microsoft Edge (Windows / Linux):</div>
                  <ol className="space-y-2 list-decimal list-inside text-slate-300">
                    <li>Look for the <strong>Install App icon (computer with down arrow)</strong> on the right side of your browser address bar.</li>
                    <li>Click <strong>Install</strong> when prompted.</li>
                    <li>Alternatively, click the <strong>3 dots menu (&vellip;)</strong> &rarr; <strong>Save and share</strong> &rarr; <strong>Install Harsh AI</strong>.</li>
                    <li>Harsh AI will open in its own clean desktop window and pin to your taskbar!</li>
                  </ol>
                </>
              )}

              {dwaTab === "mac" && (
                <>
                  <div className="font-bold text-cyan-300">macOS (Safari or Chrome):</div>
                  <ol className="space-y-2 list-decimal list-inside text-slate-300">
                    <li><strong>In Safari (macOS Sonoma+):</strong> Click <strong>File</strong> in the top menu bar &rarr; select <strong>Add to Dock</strong>.</li>
                    <li><strong>In Chrome:</strong> Click the <strong>Install icon</strong> in the URL bar, or 3 dots &rarr; <strong>Install Harsh AI</strong>.</li>
                    <li>Launch directly from your Mac Dock or Launchpad anytime!</li>
                  </ol>
                </>
              )}

              {dwaTab === "android" && (
                <>
                  <div className="font-bold text-cyan-300">Android (Chrome or Brave):</div>
                  <ol className="space-y-2 list-decimal list-inside text-slate-300">
                    <li>Tap the <strong>3 vertical dots (&vellip;)</strong> in the upper right corner of Chrome.</li>
                    <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                    <li>Confirm by tapping <strong>Install</strong>.</li>
                    <li>The Harsh AI icon will appear on your home screen and app drawer.</li>
                  </ol>
                </>
              )}

              {dwaTab === "ios" && (
                <>
                  <div className="font-bold text-cyan-300">iPhone &amp; iPad (Safari):</div>
                  <ol className="space-y-2 list-decimal list-inside text-slate-300">
                    <li>Open this page in <strong>Safari</strong> on your iPhone or iPad.</li>
                    <li>Tap the <strong>Share</strong> button (square with upward arrow) at the bottom toolbar.</li>
                    <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                    <li>Tap <strong>Add</strong> in the top-right corner to finish.</li>
                  </ol>
                </>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">
                PWA / DWA features work offline with cached assets.
              </span>
              <button
                onClick={() => setShowDWAGuide(false)}
                className="rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: Forgot Password Modal                                 */}
      {/* ============================================================== */}
      {forgotOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setForgotOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-700 bg-[#0e162d] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-lg font-bold">Reset Your Password</h3>
              <button
                onClick={() => setForgotOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Enter your account email. If the account exists, a secure password reset token will be created.
            </p>

            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="lbl text-slate-300" htmlFor="reset-email-input">
                  Account Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="reset-email-input"
                    className="input !bg-slate-900 !border-slate-700 !text-white ps-10 focus:!border-cyan-400"
                    type="email"
                    required
                    autoFocus
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              {forgotMsg && (
                <div
                  className={`rounded-xl p-3 text-xs leading-relaxed ${
                    forgotMsg.includes("Failed") || forgotMsg.includes("error")
                      ? "border border-red-500/30 bg-red-950/30 text-red-300"
                      : "border border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                  }`}
                >
                  {forgotMsg}
                </div>
              )}

              {forgotToken && (
                <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/30 p-3 space-y-2">
                  <span className="text-[11px] font-bold text-cyan-300 block">Generated Reset Token:</span>
                  <code className="block bg-slate-900 p-2 rounded text-xs font-mono text-cyan-200 select-all">
                    {forgotToken}
                  </code>
                  <Link
                    to={`/reset?token=${encodeURIComponent(forgotToken)}`}
                    className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:underline font-semibold"
                  >
                    Click here to set your new password &rarr;
                  </Link>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  onClick={() => setForgotOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
                  disabled={forgotBusy}
                >
                  {forgotBusy ? "Generating…" : "Generate Reset Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
