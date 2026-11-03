import { get, set } from "idb-keyval";   // documents stay in this browser (IndexedDB); nothing is uploaded until you run a tool
export type Doc = { id: string; name: string; size: number; added: number; file: Blob; folder?: string; tags?: string[]; favorite?: boolean };
export const MAX_MB = 50;
export async function list(): Promise<Doc[]> { return (await get("docs")) || []; }
export function validate(f: File) {
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return "Please choose a PDF file.";
  if (f.size > MAX_MB * 1048576) return `File is larger than ${MAX_MB} MB.`;
  return "";
}
export async function add(f: File) {
  const d: Doc = { id: crypto.randomUUID(), name: f.name, size: f.size, added: Date.now(), file: f };
  await set("docs", [d, ...(await list())]); return d;
}
export async function rename(id: string, name: string) { await set("docs", (await list()).map(d => d.id === id ? { ...d, name } : d)); }
export async function updateMetadata(id: string, patch: Partial<Pick<Doc, "folder" | "tags" | "favorite">>) {
  await set("docs", (await list()).map(d => d.id === id ? { ...d, ...patch } : d));
}
export async function updateMany(ids: string[], patch: Partial<Pick<Doc, "folder" | "tags" | "favorite">>) {
  const selected = new Set(ids);
  await set("docs", (await list()).map(d => selected.has(d.id) ? { ...d, ...patch } : d));
}
export async function removeMany(ids: string[]) {
  const selected = new Set(ids);
  const docs = await list();
  await set("docs", docs.filter(d => !selected.has(d.id)));
  for (const id of selected) await removeVersions(id);
}
export async function remove(id: string) { await set("docs", (await list()).filter(d => d.id !== id)); await removeVersions(id); }
export async function purge(days: number) { if (days > 0) await set("docs", (await list()).filter(d => Date.now() - d.added < days * 864e5)); }


export type DocVersion = { id: string; docId: string; name: string; size: number; added: number; file: Blob };
const VERSIONS_KEY = "doc_versions";
export async function versions(id: string): Promise<DocVersion[]> {
  const all: DocVersion[] = (await get(VERSIONS_KEY)) || [];
  return all.filter(v => v.docId === id).sort((a, b) => b.added - a.added);
}
export async function addVersion(id: string, f: File): Promise<DocVersion> {
  const docs = await list();
  const doc = docs.find(d => d.id === id);
  if (!doc) throw new Error("This document no longer exists.");
  const error = validate(f);
  if (error) throw new Error(error);
  const all: DocVersion[] = (await get(VERSIONS_KEY)) || [];
  // Preserve the current file as a version before replacing it.
  const snapshot: DocVersion = { id: crypto.randomUUID(), docId: id, name: doc.name, size: doc.size, added: Date.now(), file: doc.file };
  const nextDoc: Doc = { ...doc, size: f.size, added: Date.now(), file: f };
  await set(VERSIONS_KEY, [snapshot, ...all].slice(0, 500));
  await set("docs", docs.map(d => d.id === id ? nextDoc : d));
  return snapshot;
}
export async function restoreVersion(id: string, versionId: string): Promise<void> {
  const docs = await list();
  const doc = docs.find(d => d.id === id);
  const all: DocVersion[] = (await get(VERSIONS_KEY)) || [];
  const version = all.find(v => v.id === versionId && v.docId === id);
  if (!doc || !version) throw new Error("Version not found. Refresh and try again.");
  const snapshot: DocVersion = { id: crypto.randomUUID(), docId: id, name: doc.name, size: doc.size, added: Date.now(), file: doc.file };
  await set(VERSIONS_KEY, [snapshot, ...all].slice(0, 500));
  await set("docs", docs.map(d => d.id === id ? { ...d, size: version.size, added: Date.now(), file: version.file } : d));
}
export async function removeVersions(id: string): Promise<void> {
  const all: DocVersion[] = (await get(VERSIONS_KEY)) || [];
  await set(VERSIONS_KEY, all.filter(v => v.docId !== id));
}

export async function versionStats(): Promise<{ count: number; bytes: number }> {
  const all: DocVersion[] = (await get(VERSIONS_KEY)) || [];
  return { count: all.length, bytes: all.reduce((n, v) => n + (Number(v.size) || 0), 0) };
}
