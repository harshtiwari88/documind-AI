import { useCallback, useEffect, useState } from "react";
import { list, versionStats } from "./docs";

export const formatBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export type StorageStats = {
  ready: boolean; docs: number; pdfBytes: number; versionBytes: number; versionCount: number;
  usage: number | null; quota: number | null; percent: number | null;   // usage/quota are the browser's own estimate
};
const EMPTY: StorageStats = { ready: false, docs: 0, pdfBytes: 0, versionBytes: 0, versionCount: 0, usage: null, quota: null, percent: null };

/** Real numbers only: PDFs and saved versions come from this browser's library; usage/quota from navigator.storage.estimate(). */
export function useStorage() {
  const [s, setS] = useState<StorageStats>(EMPTY);
  const refresh = useCallback(async () => {
    try {
      const [docs, v] = await Promise.all([list(), versionStats()]);
      let usage: number | null = null, quota: number | null = null;
      try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); usage = e.usage ?? null; quota = e.quota ?? null; } } catch { /* estimate is optional */ }
      const pdfBytes = docs.reduce((n, d) => n + (Number(d.size) || 0), 0);
      const used = usage ?? pdfBytes + v.bytes;
      setS({ ready: true, docs: docs.length, pdfBytes, versionBytes: v.bytes, versionCount: v.count, usage, quota,
        percent: quota ? Math.min(100, Math.max(used > 0 ? 1 : 0, Math.round((used / quota) * 100))) : null });
    } catch { setS(old => ({ ...old, ready: true })); }
  }, []);
  useEffect(() => { void refresh(); const f = () => void refresh(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, [refresh]);
  return { ...s, refresh };
}
