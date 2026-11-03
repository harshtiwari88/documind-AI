import { useEffect, useMemo, useState } from "react";
import { getJson } from "../lib/api";

 type Analytics = {
  period_days: number;
  summary: { total_users: number; new_users: number; active_users: number; logins: number; tracked_events: number };
  features: { name: string; uses: number; users: number }[];
  daily: { date: string; active_users: number; logins: number }[];
  recent_activity: { email: string; event: string; path: string; timestamp: number }[];
  users: { email: string; created: number; last_seen: number | null; events: number; logins: number }[];
};
const fmtDate = (v: number | null) => v ? new Date(v * 1000).toLocaleString() : "Never";
const fmtDay = (v: string) => new Date(v + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
export default function Admin() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true; setBusy(true); setError("");
    getJson(`/admin/analytics?days=${days}`).then(v => { if (live) setData(v); }).catch(e => { if (live) setError(e.message || "Could not load analytics"); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [days]);
  const maxDaily = useMemo(() => Math.max(1, ...((data?.daily || []).map(d => Math.max(d.active_users, d.logins)))), [data]);
  if (error) return <div className="p-6 md:p-10"><div className="mx-auto max-w-3xl card"><h1 className="text-2xl font-bold">Admin analytics</h1><p className="mt-3 text-rose-300">{error}</p><p className="mt-2 text-sm text-slate-400">Admin access must be enabled for your account with the backend ADMIN_EMAILS setting.</p></div></div>;
  const s = data?.summary;
  return <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-sm font-medium text-teal-300">DOCUMIND AI / ADMIN</div><h1 className="mt-1 text-3xl font-bold">Usage overview</h1><p className="mt-2 text-sm text-slate-400">Account activity and popular features. File contents are never tracked.</p></div><select className="input max-w-[180px]" value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option></select></div>
    {busy && !data ? <div className="card text-slate-400">Loading analytics…</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[
        ["Registered users", s?.total_users ?? 0, "All accounts"], ["New users", s?.new_users ?? 0, `In ${days} days`], ["Active users", s?.active_users ?? 0, `Unique users · ${days} days`], ["Successful logins", s?.logins ?? 0, `In ${days} days`], ["Tracked actions", s?.tracked_events ?? 0, `In ${days} days`],
      ].map(([label, value, note]) => <div className="card" key={String(label)}><div className="text-sm text-slate-400">{label}</div><div className="mt-3 text-3xl font-bold text-white">{value}</div><div className="mt-2 text-xs text-teal-300">{note}</div></div>)}</div>
      <div className="grid gap-5 xl:grid-cols-2"><section className="card"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Daily activity</h2><span className="text-xs text-slate-400">Active users / logins</span></div>{!data?.daily.length ? <p className="py-10 text-center text-sm text-slate-400">No activity recorded for this period yet.</p> : <div className="mt-6 space-y-3">{data.daily.slice(-14).map(d => <div key={d.date} className="grid grid-cols-[62px_1fr_48px] items-center gap-3 text-xs"><span className="text-slate-400">{fmtDay(d.date)}</span><div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-teal-400" style={{ width: `${d.active_users / maxDaily * 100}%` }} /></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-blue-400" style={{ width: `${d.logins / maxDaily * 100}%` }} /></div></div><span className="text-right text-slate-300">{d.active_users}/{d.logins}</span></div>)}</div>}<div className="mt-4 flex gap-4 text-xs text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-400"/>Active users</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400"/>Logins</span></div></section>
      <section className="card"><h2 className="text-lg font-semibold">Most-used features</h2><p className="mt-1 text-xs text-slate-400">Ranked by recorded requests, excluding login/register.</p>{!data?.features.length ? <p className="py-10 text-center text-sm text-slate-400">Feature usage will appear as users work in the app.</p> : <div className="mt-5 space-y-4">{data.features.map(f => { const max = Math.max(1, ...data.features.map(x => x.uses)); return <div key={f.name}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{f.name}</span><span className="text-slate-400">{f.uses} uses · {f.users} users</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-teal-400" style={{ width: `${f.uses / max * 100}%` }}/></div></div>})}</div>}</section></div>
      <section className="card overflow-hidden !p-0"><div className="border-b border-slate-700/60 p-5"><h2 className="text-lg font-semibold">User accounts</h2><p className="mt-1 text-xs text-slate-400">Latest seen activity and usage counts for the selected period.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-900/50 text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Email</th><th className="px-5 py-3">Joined</th><th className="px-5 py-3">Last active</th><th className="px-5 py-3">Logins</th><th className="px-5 py-3">Actions</th></tr></thead><tbody>{(data?.users || []).map(u => <tr className="border-t border-slate-700/40" key={u.email}><td className="px-5 py-3 font-medium">{u.email}</td><td className="px-5 py-3 text-slate-400">{fmtDate(u.created)}</td><td className="px-5 py-3 text-slate-400">{fmtDate(u.last_seen)}</td><td className="px-5 py-3">{u.logins}</td><td className="px-5 py-3">{u.events}</td></tr>)}</tbody></table></div></section>
      <section className="card overflow-hidden !p-0"><div className="border-b border-slate-700/60 p-5"><h2 className="text-lg font-semibold">Recent activity</h2><p className="mt-1 text-xs text-slate-400">Only email, event category, route and timestamp are stored.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-900/50 text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Activity</th><th className="px-5 py-3">Route</th></tr></thead><tbody>{(data?.recent_activity || []).map((e, i) => <tr className="border-t border-slate-700/40" key={`${e.timestamp}-${i}`}><td className="whitespace-nowrap px-5 py-3 text-slate-400">{fmtDate(e.timestamp)}</td><td className="px-5 py-3">{e.email}</td><td className="px-5 py-3"><span className="badge">{e.event}</span></td><td className="px-5 py-3 font-mono text-xs text-slate-400">{e.path}</td></tr>)}</tbody></table></div></section>
      <p className="text-xs text-slate-500">Privacy note: analytics records feature routes and timestamps, not uploaded PDF content, filenames, passwords, or request bodies. This is request-level usage analytics, not a guarantee that a user completed a task successfully.</p>
    </>}
  </div>;
}
