import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "./editor/icons";
import { useAuth } from "./lib/auth";
import { useT } from "./lib/i18n";
import { purge } from "./lib/docs";
import { formatBytes, useStorage } from "./lib/useStorage";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Editor from "./pages/Editor";
import Voice from "./pages/Voice";
import Assistant from "./pages/Assistant";
import Tools from "./pages/Tools";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";
import VoiceDock from "./components/VoiceDock";
import Compare from "./pages/Compare";
import Reset from "./pages/Reset";
import Admin from "./pages/Admin";
import HarshRobot from "./components/HarshRobot";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { safeStorage } from "./lib/safeStorage";

type Item = { to: string; label: string; icon: string; key?: string; match: (p: string, sp: URLSearchParams) => boolean };
const v = (sp: URLSearchParams) => sp.get("view") || "";

// Standard User Navigation Items (Admin is completely hidden from normal user navigation)
const ITEMS: Item[] = [
  { to: "/", label: "Dashboard", icon: "home", match: (p) => p === "/" },
  { to: "/documents", label: "My Documents", key: "documents", icon: "pages", match: (p, sp) => p === "/documents" && !v(sp) },
  { to: "/documents?view=folders", label: "Folders", icon: "folder", match: (p, sp) => p === "/documents" && v(sp) === "folders" },
  { to: "/documents?view=tags", label: "Tags", icon: "tag", match: (p, sp) => p === "/documents" && v(sp) === "tags" },
  { to: "/documents?view=favorites", label: "Favorites", icon: "star", match: (p, sp) => p === "/documents" && v(sp) === "favorites" },
  { to: "/assistant", label: "Harsh AI Assistant", key: "assistant", icon: "wand", match: (p) => p === "/assistant" },
  { to: "/editor", label: "PDF Editor", key: "editor", icon: "edit", match: (p) => p === "/editor" },
  { to: "/voice", label: "Voice Studio", key: "voice", icon: "mic", match: (p) => p === "/voice" },
  { to: "/documents?view=bulk", label: "Bulk Actions", icon: "layers", match: (p, sp) => p === "/documents" && v(sp) === "bulk" },
  { to: "/tools", label: "PDF Tools (incl. OCR)", key: "tools", icon: "sliders", match: (p) => p === "/tools" },
  { to: "/compare", label: "Compare & Search", key: "compare", icon: "merge", match: (p) => p === "/compare" },
  { to: "/settings", label: "Settings", key: "settings", icon: "gear", match: (p) => p === "/settings" },
];

const BOTTOM = ["/", "/documents", "/editor", "/assistant"];

// Protected Route Guard for Admin Panel
function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center text-slate-500">Checking credentials…</div>;
  if (!user || user.guest || !user.admin) {
    return <Admin />; // Renders the secure Access Denied screen
  }
  return <>{children}</>;
}

function Shell() {
  const { user, loading, signOut } = useAuth();
  const { t, lang } = useT();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const st = useStorage();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    purge(Number(safeStorage.getItem("retention") || 0));
  }, []);

  useEffect(() => {
    setDrawer(false);
    setMenu(false);
    void st.refresh();
  }, [loc.pathname, loc.search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-[#0b132b] text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <HarshRobot size={50} mood="thinking" />
          <span className="text-sm font-medium animate-pulse">Loading Harsh AI…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const SUB = ["/documents?view=folders", "/documents?view=tags", "/documents?view=favorites", "/documents?view=bulk"];
  const inDocs = loc.pathname === "/documents";
  const items = ITEMS.filter((i) => inDocs || !SUB.includes(i.to));

  const label = (i: Item) => (lang !== "en" && i.key ? t(i.key) : i.label);
  const dark = loc.pathname.startsWith("/editor") || loc.pathname.startsWith("/voice") || loc.pathname.startsWith("/assistant") || loc.pathname.startsWith("/admin");
  const name = user.guest ? "Guest" : (user.name || String(user.email).split("@")[0]);

  function search(e: FormEvent) {
    e.preventDefault();
    const s = q.trim();
    if (s) nav("/documents?q=" + encodeURIComponent(s));
  }

  const storageLine = st.quota
    ? `${formatBytes(st.usage ?? st.pdfBytes + st.versionBytes)} of ${formatBytes(st.quota)}`
    : `${formatBytes(st.pdfBytes + st.versionBytes)} used`;

  return (
    <div className="flex h-full bg-[#0b132b]">
      {drawer && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setDrawer(false)}
          aria-hidden
        />
      )}

      {/* Primary Sidebar with Harsh AI Navy & Electric Blue Palette */}
      <aside
        className={`fixed inset-y-0 start-0 z-40 flex w-64 shrink-0 flex-col bg-gradient-to-b from-[#0b132b] via-[#111d38] to-[#0b132b] border-e border-slate-800 text-slate-200 transition-transform duration-200 md:static md:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        <Link to="/" className="flex items-center gap-3 px-5 pb-5 pt-6 border-b border-slate-800/80">
          <HarshRobot size={38} mood="happy" showBadge />
          <div>
            <span className="block text-xl font-extrabold leading-tight tracking-tight text-white">
              Harsh <span className="text-[#00f5d4]">AI</span>
            </span>
            <span className="block text-[10px] font-medium text-cyan-300/80">
              Your Intelligent Companion
            </span>
          </div>
        </Link>

        {/* Navigation list */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {items.map((i) => {
            const on = i.match(loc.pathname, sp);
            return (
              <Link
                key={i.to}
                to={i.to}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  on
                    ? "bg-gradient-to-r from-blue-600/80 to-[#1e40af]/80 text-white shadow-inner ring-1 ring-cyan-500/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon
                  n={i.icon}
                  size={19}
                  className={on ? "text-[#00f5d4]" : "text-slate-400"}
                />
                {label(i)}
              </Link>
            );
          })}
        </nav>

        {/* PWA Install Button in Sidebar */}
        <div className="px-3 pb-2">
          <PWAInstallButton variant="compact" className="w-full justify-center !py-2" />
        </div>

        {/* Storage Widget */}
        <div className="m-3 rounded-2xl border border-slate-800 bg-[#090f22] p-3 text-xs">
          <div className="mb-2 flex items-center gap-2 text-slate-200">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-500/15 text-[#00f5d4]">
              <Icon n="db" size={15} />
            </span>
            <b className="font-medium text-slate-300">Local Storage</b>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label="Browser storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={st.percent ?? 0}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-[#00f5d4]"
              style={{ width: `${st.percent ?? Math.min(100, st.docs ? 4 : 0)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>{storageLine}</span>
            {st.percent !== null && <span>{st.percent}%</span>}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`${dark ? "app-dark bg-[#0b132b]" : "app-light bg-slate-50"} flex min-w-0 flex-1 flex-col`}>
        {!dark && (
          <header className="flex shrink-0 items-center gap-3 border-b border-[#e1ecef] bg-white px-4 py-3 md:px-8 shadow-sm">
            <button
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d3e3e8] md:hidden"
              aria-label="Open menu"
              onClick={() => setDrawer(true)}
            >
              <Icon n="menu" size={20} />
            </button>

            <form onSubmit={search} role="search" className="relative min-w-0 max-w-2xl flex-1">
              <Icon n="search" size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search documents"
                placeholder="Search documents by name…"
                className="h-11 w-full rounded-xl border border-transparent bg-[#eef4f6] ps-10 pe-3 text-sm text-[#15323f] outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />
            </form>

            <div className="hidden sm:flex items-center">
              <PWAInstallButton variant="compact" />
            </div>

            <div className="relative ms-auto">
              <button
                className="flex items-center gap-2 rounded-xl py-1 ps-1 pe-2 hover:bg-[#eef4f6]"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-700 to-[#0b132b] text-sm font-semibold text-white">
                  {name[0]?.toUpperCase()}
                </span>
                <span className="hidden max-w-[8rem] truncate text-sm font-medium text-[#15323f] sm:block">
                  {name}
                </span>
                <span className="text-slate-500">▾</span>
              </button>

              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
                  <div
                    role="menu"
                    className="absolute end-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                  >
                    <div className="truncate px-3 py-2 text-xs text-slate-500">
                      {user.guest ? "Browsing as guest" : user.email}
                    </div>
                    <Link
                      role="menuitem"
                      to="/settings"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#15323f] hover:bg-slate-100"
                    >
                      <Icon n="gear" size={16} />
                      Settings
                    </Link>

                    {/* Admin link rendered ONLY if user has verified admin status */}
                    {user.admin && (
                      <Link
                        role="menuitem"
                        to="/admin"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                      >
                        <Icon n="lock" size={16} />
                        Admin Console
                      </Link>
                    )}

                    <button
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-red-600 hover:bg-red-50"
                      onClick={signOut}
                    >
                      <Icon n="logout" size={16} />
                      {t("signOut")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>
        )}

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
        </main>
        <VoiceDock />
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-800 bg-[#0d1838] px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Quick navigation"
      >
        {BOTTOM.map((to) => {
          const i = ITEMS.find((x) => x.to === to)!;
          const on = i.match(loc.pathname, sp);
          return (
            <Link
              key={to}
              to={to}
              aria-label={label(i)}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
                on ? "text-[#00f5d4] font-bold" : "text-slate-400"
              }`}
            >
              <Icon n={i.icon} size={21} />
              {label(i)}
            </Link>
          );
        })}
        <button
          className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-slate-400"
          aria-label="More"
          onClick={() => setDrawer(true)}
        >
          <Icon n="menu" size={21} />
          More
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid h-screen place-items-center bg-[#0b132b] text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <HarshRobot size={50} mood="thinking" />
          <span className="text-sm font-medium animate-pulse">Loading Harsh AI…</span>
        </div>
      </div>
    );
  }

  // If unauthenticated: First show Login & Register options!
  // Dashboard and other options are only shown after logging in.
  if (!user) {
    return (
      <Routes>
        <Route
          path="/reset"
          element={
            <div className="app-dark h-screen overflow-auto bg-[#0b132b]">
              <Reset />
            </div>
          }
        />
        <Route
          path="*"
          element={
            <div className="app-dark h-screen overflow-auto bg-[#0b132b]">
              <Login />
            </div>
          }
        />
      </Routes>
    );
  }

  // Once authenticated, show all options and full application workspace
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route
        path="/reset"
        element={
          <div className="app-dark h-full overflow-auto bg-[#0b132b]">
            <Reset />
          </div>
        }
      />
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="editor" element={<Editor />} />
        <Route path="voice" element={<Voice />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="compare" element={<Compare />} />
        <Route path="tools" element={<Tools />} />
        <Route path="documents" element={<Documents />} />
        <Route path="settings" element={<Settings />} />
        {/* Hidden Admin Route strictly guarded */}
        <Route
          path="admin"
          element={
            <AdminRouteGuard>
              <Admin />
            </AdminRouteGuard>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
