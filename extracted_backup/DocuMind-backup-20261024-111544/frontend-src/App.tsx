import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "./editor/icons"; import { useAuth } from "./lib/auth"; import { useT } from "./lib/i18n"; import { purge } from "./lib/docs"; import { formatBytes, useStorage } from "./lib/useStorage";
import Login from "./pages/Login"; import Home from "./pages/Home"; import Editor from "./pages/Editor"; import Voice from "./pages/Voice";
import Assistant from "./pages/Assistant"; import Tools from "./pages/Tools"; import Documents from "./pages/Documents"; import Settings from "./pages/Settings"; import VoiceDock from "./components/VoiceDock"; import Compare from "./pages/Compare"; import Reset from "./pages/Reset"; import Admin from "./pages/Admin";

type Item = { to: string; label: string; icon: string; key?: string; match: (p: string, sp: URLSearchParams) => boolean };
const v = (sp: URLSearchParams) => sp.get("view") || "";
// Every entry opens a real page/filter that exists in the app (no placeholder links).
const ITEMS: Item[] = [
  { to: "/", label: "Dashboard", icon: "home", match: p => p === "/" },
  { to: "/documents", label: "My Documents", key: "documents", icon: "pages", match: (p, sp) => p === "/documents" && !v(sp) },
  { to: "/documents?view=folders", label: "Folders", icon: "folder", match: (p, sp) => p === "/documents" && v(sp) === "folders" },
  { to: "/documents?view=tags", label: "Tags", icon: "tag", match: (p, sp) => p === "/documents" && v(sp) === "tags" },
  { to: "/documents?view=favorites", label: "Favorites", icon: "star", match: (p, sp) => p === "/documents" && v(sp) === "favorites" },
  { to: "/assistant", label: "AI Assistant", key: "assistant", icon: "wand", match: p => p === "/assistant" },
  { to: "/editor", label: "PDF Editor", key: "editor", icon: "edit", match: p => p === "/editor" },
  { to: "/voice", label: "Voice Tools", key: "voice", icon: "mic", match: p => p === "/voice" },
  { to: "/documents?view=bulk", label: "Bulk Actions", icon: "layers", match: (p, sp) => p === "/documents" && v(sp) === "bulk" },
  { to: "/tools", label: "PDF Tools (incl. OCR)", key: "tools", icon: "sliders", match: p => p === "/tools" },
  { to: "/compare", label: "Compare & Search", key: "compare", icon: "merge", match: p => p === "/compare" },
  { to: "/settings", label: "Settings", key: "settings", icon: "gear", match: p => p === "/settings" },
];
const ADMIN_ITEM: Item = { to: "/admin", label: "Admin analytics", icon: "db", match: p => p === "/admin" };
const BOTTOM = ["/", "/documents", "/editor", "/assistant"];

function Shell() {
  const { user, loading, signOut } = useAuth(); const { t, lang } = useT();
  const loc = useLocation(), [sp] = useSearchParams(), nav = useNavigate(), st = useStorage();
  const [drawer, setDrawer] = useState(false), [menu, setMenu] = useState(false), [q, setQ] = useState("");
  useEffect(() => { purge(Number(localStorage.getItem("retention") || 0)); }, []);
  useEffect(() => { setDrawer(false); setMenu(false); void st.refresh(); }, [loc.pathname, loc.search]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <div className="grid h-full place-items-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const SUB = ["/documents?view=folders", "/documents?view=tags", "/documents?view=favorites", "/documents?view=bulk"];
  const inDocs = loc.pathname === "/documents";   // Folders/Tags/Favorites/Bulk are views of My Documents: show them only there
  const base = ITEMS.filter(i => inDocs || !SUB.includes(i.to));
  const items = user.admin ? [...base, ADMIN_ITEM] : base;
  const label = (i: Item) => (lang !== "en" && i.key ? t(i.key) : i.label);
  const dark = loc.pathname.startsWith("/editor") || loc.pathname.startsWith("/voice");   // the PDF workspace keeps its dark canvas
  const name = user.guest ? "Guest" : String(user.email).split("@")[0];
  function search(e: FormEvent) { e.preventDefault(); const s = q.trim(); if (s) nav("/documents?q=" + encodeURIComponent(s)); }
  const storageLine = st.quota ? `${formatBytes(st.usage ?? st.pdfBytes + st.versionBytes)} of ${formatBytes(st.quota)}` : `${formatBytes(st.pdfBytes + st.versionBytes)} used`;
  return (
    <div className="flex h-full">
      {drawer && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setDrawer(false)} aria-hidden />}
      <aside className={`fixed inset-y-0 start-0 z-40 flex w-64 shrink-0 flex-col bg-gradient-to-b from-[#0b4152] via-[#0a3246] to-[#082639] text-slate-200 transition-transform duration-200 md:static md:translate-x-0 ${drawer ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}`} aria-label="Main navigation">
        <Link to="/" className="flex items-center gap-3 px-5 pb-5 pt-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#103f52] text-[#34d1c6] ring-1 ring-white/10"><Icon n="brain" size={26} /></span>
          <span><span className="block text-xl font-semibold leading-tight tracking-tight text-white">DocuMind <span className="text-[#34d1c6]">AI</span></span><span className="block text-[11px] text-[#7fc6cf]">Your Smart PDF Companion</span></span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          {items.map(i => { const on = i.match(loc.pathname, sp); return (
            <Link key={i.to} to={i.to} aria-current={on ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${on ? "bg-[#14607a]/70 text-white shadow-inner ring-1 ring-white/10" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
              <Icon n={i.icon} size={19} className={on ? "text-[#34d1c6]" : "text-slate-400"} />{label(i)}</Link>); })}
        </nav>
        <div className="m-3 rounded-xl border border-white/10 bg-black/15 p-3 text-xs">
          <div className="mb-2 flex items-center gap-2 text-slate-200"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#34d1c6]/15 text-[#34d1c6]"><Icon n="db" size={16} /></span><b className="font-medium">Storage Usage</b></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Browser storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={st.percent ?? 0}><div className="h-full rounded-full bg-[#34d1c6]" style={{ width: `${st.percent ?? Math.min(100, st.docs ? 4 : 0)}%` }} /></div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>{storageLine}</span>{st.percent !== null && <span>{st.percent}%</span>}</div>
        </div>
      </aside>

      <div className={`${dark ? "app-dark" : "app-light"} flex min-w-0 flex-1 flex-col`}>
        {!dark && <header className="flex shrink-0 items-center gap-3 border-b border-[#e1ecef] bg-white px-4 py-3 md:px-8">
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d3e3e8] md:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Icon n="menu" size={20} /></button>
          <form onSubmit={search} role="search" className="relative min-w-0 max-w-2xl flex-1">
            <Icon n="search" size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search documents" placeholder="Search documents by name…" className="h-11 w-full rounded-xl border border-transparent bg-[#eef4f6] ps-10 pe-3 text-sm text-[#15323f] outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
          </form>
          <div className="relative ms-auto">
            <button className="flex items-center gap-2 rounded-xl py-1 ps-1 pe-2 hover:bg-[#eef4f6]" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-800 text-sm font-semibold text-[#fff]">{name[0]?.toUpperCase()}</span>
              <span className="hidden max-w-[8rem] truncate text-sm font-medium text-[#15323f] sm:block">{name}</span><span className="text-slate-500">▾</span>
            </button>
            {menu && <><div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
              <div role="menu" className="absolute end-0 z-40 mt-2 w-56 rounded-xl border border-[#e1ecef] bg-white p-1.5 shadow-soft">
                <div className="truncate px-3 py-2 text-xs text-slate-500">{user.guest ? "Browsing as guest" : user.email}</div>
                <Link role="menuitem" to="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#15323f] hover:bg-[#eef4f6]"><Icon n="gear" size={16} />Settings</Link>
                {user.admin && <Link role="menuitem" to="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#15323f] hover:bg-[#eef4f6]"><Icon n="db" size={16} />Admin analytics</Link>}
                {user.guest ? <Link role="menuitem" to="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-800 hover:bg-[#eef4f6]"><Icon n="logout" size={16} />Sign in</Link>
                  : <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-[#15323f] hover:bg-[#eef4f6]" onClick={signOut}><Icon n="logout" size={16} />{t("signOut")}</button>}
              </div></>}
          </div>
        </header>}
        <main className="flex-1 overflow-auto pb-20 md:pb-0"><Outlet /></main>
        <VoiceDock />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-white/10 bg-[#0a3246] px-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Quick navigation">
        {BOTTOM.map(to => { const i = ITEMS.find(x => x.to === to)!; const on = i.match(loc.pathname, sp); return (
          <Link key={to} to={to} aria-label={label(i)} aria-current={on ? "page" : undefined} className={`flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${on ? "text-[#34d1c6]" : "text-slate-300"}`}><Icon n={i.icon} size={21} />{label(i)}</Link>); })}
        <button className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-slate-300" aria-label="More" onClick={() => setDrawer(true)}><Icon n="menu" size={21} />More</button>
      </nav>
    </div>
  );
}
export default function App() {
  return <Routes><Route path="/login" element={<div className="app-dark h-full overflow-auto"><Login /></div>} /><Route path="/reset" element={<div className="app-dark h-full overflow-auto"><Reset /></div>} />
    <Route element={<Shell />}><Route index element={<Home />} /><Route path="editor" element={<Editor />} /><Route path="voice" element={<Voice />} />
      <Route path="assistant" element={<Assistant />} /><Route path="compare" element={<Compare />} /><Route path="tools" element={<Tools />} /><Route path="documents" element={<Documents />} /><Route path="settings" element={<Settings />} /><Route path="admin" element={<Admin />} /></Route>
    <Route path="*" element={<Navigate to="/" />} /></Routes>;
}
