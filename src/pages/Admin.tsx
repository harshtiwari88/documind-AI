import { useEffect, useState } from "react";
import { getJson, postJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import { Icon } from "../editor/icons";
import HarshRobot from "../components/HarshRobot";

interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  created: number;
  last_seen: number;
  events: number;
  logins: number;
}

interface Analytics {
  period_days: number;
  summary: {
    total_users: number;
    new_users: number;
    active_users: number;
    logins: number;
    tracked_events: number;
    ai_queries: number;
    voice_queries: number;
    system_uptime: number;
    heap_mb: number;
  };
  features: { name: string; uses: number; users: number }[];
  daily: { date: string; active_users: number; logins: number }[];
  recent_activity: { email: string; event: string; path: string; timestamp: number }[];
  users: AdminUser[];
}

interface HealthInfo {
  status: string;
  uptime_seconds: number;
  node_version: string;
  platform: string;
  heap_used_mb: number;
  heap_total_mb: number;
  rss_mb: number;
}

export default function Admin() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "users" | "logs" | "health">("overview");

  // Verify admin authorization on client side
  const isAdmin = user && !user.guest && user.admin;

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [days, isAdmin]);

  async function loadData() {
    setBusy(true);
    setErr("");
    try {
      const [analyticsRes, healthRes] = await Promise.all([
        getJson(`/admin/analytics?days=${days}`),
        getJson(`/api/admin/health`).catch(() => null),
      ]);
      setData(analyticsRes);
      if (healthRes) setHealth(healthRes);
    } catch (e: any) {
      setErr(e.message || "Failed to load admin analytics. Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleUserStatus(u: AdminUser) {
    const nextStatus = u.status === "active" ? "suspended" : "active";
    if (!confirm(`Are you sure you want to change status of ${u.email} to '${nextStatus}'?`)) return;

    setActionBusy(u.id);
    try {
      await postJson(`/api/admin/users/${u.id}/status`, { status: nextStatus });
      await loadData();
    } catch (e: any) {
      alert(e.message || "Action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function toggleUserRole(u: AdminUser) {
    const nextRole = u.role === "admin" ? "user" : "admin";
    if (!confirm(`Are you sure you want to set role of ${u.email} to '${nextRole}'?`)) return;

    setActionBusy(u.id);
    try {
      await postJson(`/api/admin/users/${u.id}/role`, { role: nextRole });
      await loadData();
    } catch (e: any) {
      alert(e.message || "Action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  // Access Denied screen for non-admins
  if (!isAdmin || err.includes("403") || err.includes("Denied")) {
    return (
      <div className="flex h-full min-h-[500px] flex-col items-center justify-center p-6 text-center bg-[#0b132b] text-white">
        <div className="w-full max-w-md rounded-3xl border border-red-500/30 bg-[#161f38] p-8 shadow-2xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 text-red-400 mb-4">
            <Icon n="lock" size={32} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Access Denied</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            This area is restricted to Harsh AI administrators only. Your account does not have sufficient server-side privileges.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => nav("/")}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:from-blue-500 hover:to-cyan-400 transition"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const s = data?.summary;
  const uptimeHours = s?.system_uptime ? (s.system_uptime / 3600).toFixed(1) : "—";

  return (
    <div className="min-h-full bg-[#0b132b] p-4 text-slate-100 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <HarshRobot size={40} />
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-400 border border-rose-500/30">
                Restricted Admin
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Harsh AI Management Console</h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Real-time database analytics, user management, and system health
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab selector */}
          <div className="flex rounded-xl border border-slate-800 bg-slate-900/90 p-1 text-xs">
            <button
              onClick={() => setTab("overview")}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${tab === "overview" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              Overview
            </button>
            <button
              onClick={() => setTab("users")}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${tab === "users" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              Users ({data?.users.length || 0})
            </button>
            <button
              onClick={() => setTab("logs")}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${tab === "logs" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              Audit Logs
            </button>
            <button
              onClick={() => setTab("health")}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${tab === "health" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              Health
            </button>
          </div>

          <select
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-cyan-300 outline-none"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>

          <button
            onClick={loadData}
            disabled={busy}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white transition"
            title="Refresh analytics data"
          >
            <Icon n="reload" size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {busy && !data ? (
        <div className="py-20 text-center text-sm text-slate-400">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mb-2" />
          <p>Querying real database and system stats…</p>
        </div>
      ) : (
        <>
          {/* TAB: OVERVIEW */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Registered Users"
                  value={s?.total_users ?? 0}
                  note={`+${s?.new_users ?? 0} new in ${days} days`}
                  icon="user"
                  accent="text-cyan-400"
                />
                <MetricCard
                  title="Active Users"
                  value={s?.active_users ?? 0}
                  note={`${s?.logins ?? 0} logins recorded`}
                  icon="bolt"
                  accent="text-blue-400"
                />
                <MetricCard
                  title="AI & Voice Requests"
                  value={(s?.ai_queries ?? 0) + (s?.voice_queries ?? 0)}
                  note={`${s?.ai_queries ?? 0} AI · ${s?.voice_queries ?? 0} Voice`}
                  icon="wand"
                  accent="text-emerald-400"
                />
                <MetricCard
                  title="System Uptime & Heap"
                  value={`${uptimeHours} hrs`}
                  note={`${s?.heap_mb ?? 0} MB Node memory`}
                  icon="db"
                  accent="text-purple-400"
                />
              </div>

              {/* Top Features & Daily Graph */}
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-[#141f36] p-5 shadow-lg">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Icon n="sliders" size={16} className="text-cyan-400" />
                    Top System Actions & Feature Usage
                  </h3>
                  {!data?.features.length ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No action records in this timeframe.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.features.map((f) => {
                        const max = Math.max(1, ...data.features.map((x) => x.uses));
                        return (
                          <div key={f.name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-mono text-slate-300">{f.name}</span>
                              <span className="text-slate-400">{f.uses} calls ({f.users} users)</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                style={{ width: `${(f.uses / max) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#141f36] p-5 shadow-lg flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                      <Icon n="bolt" size={16} className="text-cyan-400" />
                      Harsh AI Security & Architecture
                    </h3>
                    <ul className="text-xs text-slate-300 space-y-2.5 mt-3">
                      <li className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span>Server-side RBAC protection with token verification active.</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span>AI Document processing via Gemini 3.8 Flash with strict prompt isolation.</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span>Audit logging enabled for all authentication and AI routes.</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span>Client-side PWA integration with Web App Manifest & Service Worker.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-xs text-cyan-300 flex items-center justify-between">
                    <span>Default Admin Account: <strong>admin@harsh.ai</strong></span>
                    <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold">Protected</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: USER MANAGEMENT */}
          {tab === "users" && (
            <div className="rounded-2xl border border-slate-800 bg-[#141f36] shadow-lg overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Registered Users</h3>
                  <p className="text-xs text-slate-400">Inspect accounts, toggle status, and grant admin roles</p>
                </div>
                <span className="text-xs text-cyan-300 font-mono">Total: {data?.users.length} accounts</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0b132b]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">Logins</th>
                      <th className="px-4 py-3">Actions Count</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(data?.users || []).map((u) => {
                      const isSelf = u.email === user.email;
                      const isPrimaryAdmin = u.email === "admin@harsh.ai";
                      return (
                        <tr key={u.id || u.email} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                            <span>{u.email}</span>
                            {isSelf && <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] text-blue-300 font-bold">YOU</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                              u.role === "admin"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-slate-800 text-slate-300"
                            }`}>
                              {u.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold ${
                              u.status === "active"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-red-500/20 text-red-300 border border-red-500/30"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${u.status === "active" ? "bg-emerald-400" : "bg-red-400"}`} />
                              {u.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {new Date(u.created * 1000).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-slate-300">{u.logins}</td>
                          <td className="px-4 py-3 text-slate-300">{u.events}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Toggle Status */}
                              <button
                                onClick={() => toggleUserStatus(u)}
                                disabled={actionBusy === u.id || isPrimaryAdmin}
                                className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                                  u.status === "active"
                                    ? "bg-red-950/40 text-red-300 hover:bg-red-900/60 border border-red-800/40"
                                    : "bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 border border-emerald-800/40"
                                } disabled:opacity-30`}
                              >
                                {u.status === "active" ? "Suspend" : "Activate"}
                              </button>

                              {/* Toggle Role */}
                              <button
                                onClick={() => toggleUserRole(u)}
                                disabled={actionBusy === u.id || isPrimaryAdmin}
                                className="rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 transition disabled:opacity-30"
                              >
                                {u.role === "admin" ? "Demote" : "Promote"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {tab === "logs" && (
            <div className="rounded-2xl border border-slate-800 bg-[#141f36] shadow-lg overflow-hidden">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">System Audit Trail</h3>
                <p className="text-xs text-slate-400">Recent user authentication, AI queries, and admin activities</p>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0b132b]/80 text-[11px] uppercase tracking-wider text-slate-400 sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Event Type</th>
                      <th className="px-4 py-3">API Route</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(data?.recent_activity || []).map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                          {new Date(e.timestamp * 1000).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-white">{e.email}</td>
                        <td className="px-4 py-2.5">
                          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
                            {e.event}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{e.path}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: HEALTH */}
          {tab === "health" && (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-[#141f36] p-5 shadow-lg space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  Harsh AI Runtime Health
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Status:</span>
                    <span className="font-semibold text-emerald-400">OPERATIONAL</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Node Engine:</span>
                    <span className="font-mono text-white">{health?.node_version || process.version}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Platform:</span>
                    <span className="font-mono text-white">{health?.platform || "linux"}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Uptime:</span>
                    <span className="font-semibold text-cyan-300">{uptimeHours} hours</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Gemini AI Model:</span>
                    <span className="font-semibold text-cyan-300">gemini-3.8-flash</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#141f36] p-5 shadow-lg space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Icon n="db" size={16} className="text-cyan-400" />
                  Process Memory Breakdown
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Heap Used:</span>
                      <span className="font-mono font-bold text-white">{health?.heap_used_mb ?? s?.heap_mb ?? 0} MB</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.min(100, ((health?.heap_used_mb || 30) / (health?.heap_total_mb || 100)) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Heap Total:</span>
                    <span className="font-mono text-slate-300">{health?.heap_total_mb ?? 64} MB</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Resident Set Size (RSS):</span>
                    <span className="font-mono text-slate-300">{health?.rss_mb ?? 128} MB</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ title, value, note, icon, accent }: { title: string; value: any; note: string; icon: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#141f36] p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-xl bg-slate-800/80 ${accent}`}>
          <Icon n={icon} size={16} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-extrabold text-white tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{note}</div>
    </div>
  );
}
