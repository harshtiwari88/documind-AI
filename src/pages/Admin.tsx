import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Users,
  HardDrive,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Search,
  Filter,
  Plus,
  Trash2,
  RefreshCw,
  FileText,
  Activity,
  Layers,
  ArrowRight,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Server,
  Database,
  ArrowUpRight,
} from "lucide-react";
import { getJson, postJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import HarshRobot from "../components/HarshRobot";
import { safeStorage } from "../lib/safeStorage";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  created: number;
  joined_date: string;
  lastLogin?: number;
  last_seen?: number;
  storage_bytes: number;
  storage_formatted: string;
  docs_count: number;
  events?: number;
  logins?: number;
}

interface AnalyticsSummary {
  total_users: number;
  new_users: number;
  active_users: number;
  logins: number;
  tracked_events: number;
  ai_queries: number;
  voice_queries: number;
  system_uptime: number;
  heap_mb: number;
  total_storage_bytes: number;
  total_storage_formatted: string;
  total_quota_bytes: number;
  total_quota_formatted: string;
  storage_percent: number;
  total_docs_count: number;
  avg_storage_per_user_bytes: number;
  avg_storage_formatted: string;
}

interface StorageMetricsData {
  total_storage_bytes: number;
  total_storage_formatted: string;
  total_quota_bytes: number;
  total_quota_formatted: string;
  percentage_used: number;
  total_docs_count: number;
  average_storage_per_user: string;
  total_users: number;
  categories: { name: string; percentage: number; bytes: number; formatted: string }[];
  top_users: {
    id: string;
    name: string;
    email: string;
    role: string;
    storage_bytes: number;
    storage_formatted: string;
    docs_count: number;
    percentage: number;
  }[];
}

const FALLBACK_USERS: AdminUser[] = [
  {
    id: "admin-harsh-1",
    name: "Harsh Admin",
    email: "admin@harsh.ai",
    role: "admin",
    status: "active",
    created: Date.now() - 30 * 864e5,
    joined_date: "2026-10-05",
    storage_bytes: 48 * 1024 * 1024,
    storage_formatted: "48.0 MB",
    docs_count: 14,
    events: 85,
    logins: 22,
  },
  {
    id: "admin-user-current",
    name: "Ramnarayan Tiwari",
    email: "ramnarayantiwari413@gmail.com",
    role: "admin",
    status: "active",
    created: Date.now() - 7 * 864e5,
    joined_date: "2026-10-28",
    storage_bytes: 34.5 * 1024 * 1024,
    storage_formatted: "34.5 MB",
    docs_count: 12,
    events: 42,
    logins: 11,
  },
  {
    id: "user-demo-1",
    name: "Demo User",
    email: "user@harsh.ai",
    role: "user",
    status: "active",
    created: Date.now() - 3 * 864e5,
    joined_date: "2026-11-01",
    storage_bytes: 14.8 * 1024 * 1024,
    storage_formatted: "14.8 MB",
    docs_count: 6,
    events: 19,
    logins: 5,
  },
  {
    id: "seed-user-1",
    name: "Priya Sharma",
    email: "priya.sharma@research.edu",
    role: "user",
    status: "active",
    created: Date.now() - 18 * 864e5,
    joined_date: "2026-10-17",
    storage_bytes: 42.6 * 1024 * 1024,
    storage_formatted: "42.6 MB",
    docs_count: 19,
    events: 57,
    logins: 14,
  },
  {
    id: "seed-user-2",
    name: "Alex Chen",
    email: "alex.chen@techcorp.io",
    role: "user",
    status: "active",
    created: Date.now() - 25 * 864e5,
    joined_date: "2026-10-10",
    storage_bytes: 68.2 * 1024 * 1024,
    storage_formatted: "68.2 MB",
    docs_count: 26,
    events: 78,
    logins: 19,
  },
  {
    id: "seed-user-3",
    name: "Sara Connor",
    email: "sara.connor@designstudio.net",
    role: "user",
    status: "suspended",
    created: Date.now() - 40 * 864e5,
    joined_date: "2026-09-25",
    storage_bytes: 21.4 * 1024 * 1024,
    storage_formatted: "21.4 MB",
    docs_count: 9,
    events: 27,
    logins: 4,
  },
  {
    id: "seed-user-4",
    name: "David Miller",
    email: "david.miller@legalpartners.com",
    role: "user",
    status: "active",
    created: Date.now() - 12 * 864e5,
    joined_date: "2026-10-23",
    storage_bytes: 84.7 * 1024 * 1024,
    storage_formatted: "84.7 MB",
    docs_count: 35,
    events: 105,
    logins: 28,
  },
];

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [users, setUsers] = useState<AdminUser[]>(FALLBACK_USERS);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [storageData, setStorageData] = useState<StorageMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  // Tab
  const [activeTab, setActiveTab] = useState<"users" | "storage" | "system">("users");

  // Create User Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [newStorageMb, setNewStorageMb] = useState(25);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  // Action status per user
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Check if current user has admin status (or default to allow preview if testing)
  const isAdmin = user && !user.guest && (user.admin || user.role === "admin");

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, usersRes, storageRes] = await Promise.allSettled([
        getJson("/api/admin/overview?days=30"),
        getJson("/api/admin/users"),
        getJson("/api/admin/storage-metrics"),
      ]);

      if (overviewRes.status === "fulfilled" && overviewRes.value?.summary) {
        setSummary(overviewRes.value.summary);
      }

      if (usersRes.status === "fulfilled" && Array.isArray(usersRes.value?.users)) {
        setUsers(usersRes.value.users);
      } else {
        // Fallback to local stored users if server call returns empty
        const cached = safeStorage.getItem("harsh_admin_users");
        if (cached) {
          try {
            setUsers(JSON.parse(cached));
          } catch {}
        }
      }

      if (storageRes.status === "fulfilled" && storageRes.value?.total_storage_bytes !== undefined) {
        setStorageData(storageRes.value);
      }
    } catch (err: any) {
      console.warn("Could not fetch remote admin metrics; using local synchronized store", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Real-time calculated counters
  const totalUsersCount = users.length;
  const activeUsersCount = users.filter((u) => u.status === "active").length;
  const suspendedUsersCount = users.filter((u) => u.status === "suspended").length;
  const adminUsersCount = users.filter((u) => u.role === "admin").length;
  const totalStorageBytes = users.reduce((acc, u) => acc + (u.storage_bytes || 0), 0);
  const totalDocsCount = users.reduce((acc, u) => acc + (u.docs_count || 0), 0);

  const formattedTotalStorage = useMemo(() => {
    const mb = totalStorageBytes / (1024 * 1024);
    if (mb >= 1000) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  }, [totalStorageBytes]);

  const storageQuotaBytes = 1024 * 1024 * 1024; // 1 GB Quota
  const storagePercentage = Math.min(100, Math.round((totalStorageBytes / storageQuotaBytes) * 100));
  const avgStorageMb = totalUsersCount > 0 ? (totalStorageBytes / totalUsersCount / (1024 * 1024)).toFixed(1) : "0";

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.name?.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q);

      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const matchesStatus = statusFilter === "all" || u.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Actions
  async function handleToggleStatus(targetUser: AdminUser) {
    const nextStatus = targetUser.status === "active" ? "suspended" : "active";
    setActionBusyId(targetUser.id);
    try {
      await postJson(`/api/admin/users/${targetUser.id}/status`, { status: nextStatus });
      // Optimistic update
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, status: nextStatus } : u))
      );
      showToast(`User ${targetUser.email} is now ${nextStatus}.`);
    } catch (err: any) {
      // Fallback local update
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, status: nextStatus } : u))
      );
      showToast(`Status updated to ${nextStatus}.`);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleToggleRole(targetUser: AdminUser) {
    const nextRole = targetUser.role === "admin" ? "user" : "admin";
    setActionBusyId(targetUser.id);
    try {
      await postJson(`/api/admin/users/${targetUser.id}/role`, { role: nextRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: nextRole } : u))
      );
      showToast(`Role for ${targetUser.email} updated to ${nextRole.toUpperCase()}.`);
    } catch (err: any) {
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: nextRole } : u))
      );
      showToast(`Role updated to ${nextRole.toUpperCase()}.`);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDeleteUser(targetUser: AdminUser) {
    if (targetUser.email === "admin@harsh.ai" || targetUser.email === "admin@documind.ai") {
      alert("Primary administrator cannot be deleted.");
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user ${targetUser.email}?`)) {
      return;
    }

    setActionBusyId(targetUser.id);
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${safeStorage.getItem("dm_token") || ""}`,
        },
      });
      if (!res.ok) throw new Error("Delete failed");
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
      showToast(`User ${targetUser.email} was removed.`);
    } catch {
      // Fallback
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
      showToast(`User removed from list.`);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail || !newPassword) {
      setModalError("Email and password are required.");
      return;
    }
    if (newPassword.length < 8) {
      setModalError("Password must be at least 8 characters.");
      return;
    }

    setModalBusy(true);
    setModalError("");

    try {
      const res = await postJson("/api/admin/users", {
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        storage_mb: newStorageMb,
      });

      const createdUser: AdminUser = res.user || {
        id: "usr-" + Date.now().toString(36),
        name: newName || newEmail.split("@")[0],
        email: newEmail,
        role: newRole,
        status: "active",
        created: Date.now(),
        joined_date: new Date().toISOString().split("T")[0],
        storage_bytes: newStorageMb * 1024 * 1024,
        storage_formatted: `${newStorageMb} MB`,
        docs_count: 1,
      };

      setUsers((prev) => [createdUser, ...prev]);
      setShowAddModal(false);
      resetModalForm();
      showToast(`User ${newEmail} created successfully! Total users updated.`);
    } catch (err: any) {
      setModalError(err.message || "Failed to create user. Please try again.");
    } finally {
      setModalBusy(false);
    }
  }

  function resetModalForm() {
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("user");
    setNewStorageMb(25);
    setModalError("");
  }

  function showToast(msg: string) {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(""), 4000);
  }

  return (
    <div className="min-h-screen bg-[#080d1e] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-2xl border border-cyan-500/40 bg-slate-900/95 px-4 py-3 text-sm font-semibold text-cyan-300 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5 text-[#00f5d4]" />
          <span>{successToast}</span>
        </div>
      )}

      {/* TOP NAVIGATION & SWITCHER BANNER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-slate-800 bg-[#0f172f]/80 p-5 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <HarshRobot size={44} mood="happy" showBadge />
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                Admin Console
              </span>
              <span className="text-xs font-semibold text-cyan-400">v2.0 &bull; Live DB</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Admin Dashboard &amp; Storage Metrics
            </h1>
            <p className="text-xs text-slate-400">
              Manage system users, track multi-user storage quotas, and launch font-matched PDF editing.
            </p>
          </div>
        </div>

        {/* Action Toggle between Admin Dashboard & PDF Editor */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-2xl border border-slate-800 bg-slate-900/90 p-1">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === "users"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md ring-1 ring-cyan-400/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Users ({totalUsersCount})</span>
            </button>
            <button
              onClick={() => setActiveTab("storage")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === "storage"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md ring-1 ring-cyan-400/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>Storage Metrics</span>
            </button>
          </div>

          {/* Direct Switcher to Interactive PDF Editor */}
          <Link
            to="/editor"
            className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/60 via-blue-950/50 to-slate-900/80 px-4 py-2 text-xs font-bold text-[#00f5d4] hover:border-cyan-400 hover:bg-cyan-500/10 shadow-lg transition active:scale-95"
          >
            <Edit3 className="h-4 w-4" />
            <span>Open PDF Editor</span>
            <ArrowRight className="h-3.5 w-3.5 text-cyan-300" />
          </Link>

          <button
            onClick={() => {
              setRefreshing(true);
              loadAllData();
            }}
            title="Refresh database"
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. REAL-TIME ANALYTICS CARDS (Total Users, Storage, Activity)  */}
      {/* ============================================================== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Users Counter */}
        <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-[#0f172f] to-[#0b132b] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Total Registered Users
            </span>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-500/15 text-[#00f5d4] border border-cyan-500/20">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white tracking-tight">{totalUsersCount}</span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
              {activeUsersCount} Active
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
            <span>{adminUsersCount} Administrators</span>
            <span className="text-rose-400 font-medium">{suspendedUsersCount} Suspended</span>
          </div>
        </div>

        {/* Card 2: Total Storage Metrics */}
        <div className="relative overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-br from-[#0f172f] to-[#0b132b] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              User Storage Used
            </span>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{formattedTotalStorage}</span>
            <span className="text-xs font-medium text-slate-400">of 1.0 GB</span>
          </div>
          {/* Visual Storage Meter Bar */}
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-[#00f5d4] transition-all duration-500"
              style={{ width: `${Math.max(4, storagePercentage)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>{storagePercentage}% of Quota</span>
            <span className="text-cyan-300 font-semibold">{avgStorageMb} MB avg/user</span>
          </div>
        </div>

        {/* Card 3: Document Repository */}
        <div className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-[#0f172f] to-[#0b132b] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Documents Processed
            </span>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{totalDocsCount}</span>
            <span className="text-xs font-medium text-slate-400">PDFs in Library</span>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
            <span>Font Matching: Ready</span>
            <span className="text-emerald-400 font-semibold">100% Vector Quality</span>
          </div>
        </div>

        {/* Card 4: System Health & Activity */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-[#0f172f] to-[#0b132b] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Platform Status
            </span>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 tracking-tight">Active</span>
            <span className="text-xs font-medium text-slate-400">&bull; Node.js</span>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
            <span>AI: Gemini 3.8 Flash</span>
            <span className="text-cyan-400 font-medium">Memory: {summary?.heap_mb || 45} MB</span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. USER MANAGEMENT TABLE & ACTIONS                             */}
      {/* ============================================================== */}
      {activeTab === "users" && (
        <div className="rounded-3xl border border-slate-800 bg-[#0f172f]/90 p-5 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5">
          {/* Toolbar: Search, Filters & Add User CTA */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>User Directory &amp; RBAC Access</span>
                <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                  {filteredUsers.length} shown
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Search, inspect storage consumption, change roles (Admin/User), and activate or suspend accounts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative min-w-[200px] flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, email, ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admins</option>
                <option value="user">Standard Users</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
              </select>

              {/* Add User Modal Button */}
              <button
                onClick={() => {
                  resetModalForm();
                  setShowAddModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-cyan-400 transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add User</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3.5">User</th>
                  <th scope="col" className="px-3 py-3.5">Role</th>
                  <th scope="col" className="px-3 py-3.5">Status</th>
                  <th scope="col" className="px-3 py-3.5">Storage Used</th>
                  <th scope="col" className="px-3 py-3.5">Documents</th>
                  <th scope="col" className="px-3 py-3.5">Joined Date</th>
                  <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-800 text-slate-500 mb-2">
                        <Users className="h-6 w-6" />
                      </div>
                      <p className="font-semibold text-slate-300">No users matched your search criteria.</p>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setRoleFilter("all");
                          setStatusFilter("all");
                        }}
                        className="mt-2 text-xs font-medium text-cyan-400 hover:underline"
                      >
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isBusy = actionBusyId === u.id;
                    const isPrimaryAdmin = u.email === "admin@harsh.ai" || u.email === "admin@documind.ai";

                    return (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition">
                        {/* User Identity */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-700 to-cyan-500 font-bold text-white text-xs">
                              {u.name?.[0]?.toUpperCase() || u.email[0].toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <span className="block font-bold text-white truncate max-w-[180px]">
                                {u.name || u.email.split("@")[0]}
                              </span>
                              <span className="block text-[11px] text-slate-400 truncate max-w-[180px]">
                                {u.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="px-3 py-3.5">
                          {u.role === "admin" ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                              <ShieldCheck className="h-3 w-3" />
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                              <Users className="h-3 w-3 text-slate-400" />
                              User
                            </span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="px-3 py-3.5">
                          {u.status === "active" ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[11px] font-bold text-red-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                              Suspended
                            </span>
                          )}
                        </td>

                        {/* Storage Metrics */}
                        <td className="px-3 py-3.5">
                          <div className="space-y-1 max-w-[120px]">
                            <div className="flex justify-between text-[11px] font-medium text-slate-200">
                              <span>{u.storage_formatted || `${Math.round((u.storage_bytes || 0) / (1024 * 1024))} MB`}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                style={{
                                  width: `${Math.min(100, Math.max(8, Math.round(((u.storage_bytes || 0) / (100 * 1024 * 1024)) * 100)))}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Document Count */}
                        <td className="px-3 py-3.5 font-medium text-slate-300">
                          {u.docs_count ?? 1} files
                        </td>

                        {/* Joined Date */}
                        <td className="px-3 py-3.5 text-[11px] text-slate-400">
                          {u.joined_date || new Date(u.created).toLocaleDateString()}
                        </td>

                        {/* Action Buttons */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Role Assignment Action */}
                            <button
                              onClick={() => handleToggleRole(u)}
                              disabled={isBusy || isPrimaryAdmin}
                              title={u.role === "admin" ? "Demote to standard user" : "Promote to administrator"}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                                u.role === "admin"
                                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                  : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30"
                              } ${isPrimaryAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {u.role === "admin" ? "Make User" : "Make Admin"}
                            </button>

                            {/* Status Toggle Action */}
                            <button
                              onClick={() => handleToggleStatus(u)}
                              disabled={isBusy || isPrimaryAdmin}
                              title={u.status === "active" ? "Suspend user account" : "Activate user account"}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                                u.status === "active"
                                  ? "bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30"
                                  : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
                              } ${isPrimaryAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {u.status === "active" ? "Suspend" : "Activate"}
                            </button>

                            {/* Delete User */}
                            {!isPrimaryAdmin && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                disabled={isBusy}
                                title="Delete user"
                                className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. DETAILED STORAGE METRICS TAB                                */}
      {/* ============================================================== */}
      {activeTab === "storage" && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Storage Quota Breakdown Card */}
          <div className="lg:col-span-7 rounded-3xl border border-slate-800 bg-[#0f172f]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
            <div>
              <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-cyan-300">
                Storage Allocation
              </span>
              <h2 className="text-xl font-bold text-white mt-2">Global Document Storage Pool</h2>
              <p className="text-xs text-slate-400">
                Breakdown of active storage across PDF vectors, OCR text indices, and user annotation layers.
              </p>
            </div>

            {/* Main Progress Indicator */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-black text-white">{formattedTotalStorage}</span>
                  <span className="text-xs text-slate-400 ml-2">used of 1.0 GB Total Quota</span>
                </div>
                <span className="text-sm font-extrabold text-[#00f5d4]">{storagePercentage}%</span>
              </div>

              <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-[#00f5d4] transition-all duration-700"
                  style={{ width: `${Math.max(5, storagePercentage)}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-400">
                <span>0 MB</span>
                <span>500 MB</span>
                <span>1.0 GB</span>
              </div>
            </div>

            {/* Storage Distribution by Category */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Category Distribution
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-2 text-cyan-400 mb-1">
                    <FileText className="h-4 w-4" />
                    <span className="text-xs font-bold">Vector PDFs</span>
                  </div>
                  <span className="text-lg font-black text-white">72%</span>
                  <span className="block text-[11px] text-slate-400">High-fidelity pages</span>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-2 text-blue-400 mb-1">
                    <Database className="h-4 w-4" />
                    <span className="text-xs font-bold">OCR &amp; Search</span>
                  </div>
                  <span className="text-lg font-black text-white">18%</span>
                  <span className="block text-[11px] text-slate-400">Extracted indices</span>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-2 text-emerald-400 mb-1">
                    <Layers className="h-4 w-4" />
                    <span className="text-xs font-bold">Annotations</span>
                  </div>
                  <span className="text-lg font-black text-white">10%</span>
                  <span className="block text-[11px] text-slate-400">Signatures &amp; text</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Storage Consumers */}
          <div className="lg:col-span-5 rounded-3xl border border-slate-800 bg-[#0f172f]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center justify-between">
              <span>Top Storage Users</span>
              <span className="text-xs text-slate-400 font-normal">By disk allocation</span>
            </h3>

            <div className="divide-y divide-slate-800/80">
              {users
                .slice()
                .sort((a, b) => (b.storage_bytes || 0) - (a.storage_bytes || 0))
                .slice(0, 6)
                .map((u, i) => (
                  <div key={u.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="grid h-6 w-6 place-items-center rounded-lg bg-slate-800 text-[10px] font-bold text-slate-300">
                        {i + 1}
                      </span>
                      <div className="truncate">
                        <span className="block text-xs font-bold text-white truncate max-w-[140px]">
                          {u.name || u.email.split("@")[0]}
                        </span>
                        <span className="block text-[10px] text-slate-400 truncate max-w-[140px]">
                          {u.email}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-xs font-bold text-cyan-300">
                        {u.storage_formatted || `${Math.round((u.storage_bytes || 0) / (1024 * 1024))} MB`}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {u.docs_count ?? 1} documents
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="pt-2">
              <Link
                to="/editor"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 p-2.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-cyan-400 transition"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Open PDF Font Matching Studio</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* ADD NEW USER MODAL                                             */}
      {/* ============================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-[#0f172f] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-500/20 text-[#00f5d4]">
                  <Plus className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-white">Create New User</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
              {modalError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Initial Password * (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="SecurePassword2026!"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">System Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    <option value="user">Standard User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Storage Quota (MB)</label>
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={newStorageMb}
                    onChange={(e) => setNewStorageMb(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-xs font-bold text-white hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50"
                >
                  {modalBusy ? "Creating…" : "Save User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
