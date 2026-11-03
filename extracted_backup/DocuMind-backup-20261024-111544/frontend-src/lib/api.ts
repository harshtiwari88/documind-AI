const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const TOKEN_KEY = "dm_token";
function authHeader(): Record<string, string> {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function check(r: Response) {
  if (r.ok) return;
  let m: any = r.statusText; try { const d = await r.json(); m = d.detail || m; if (Array.isArray(m)) m = "Please check the values you entered."; } catch {}
  if (r.status === 401 && localStorage.getItem(TOKEN_KEY) && /Sign in required/.test(String(m))) { localStorage.removeItem(TOKEN_KEY); location.href = "/login"; }
  throw new Error(String(m));
}
export async function post(path: string, form: FormData, blob = false): Promise<any> {
  let r: Response;
  try { r = await fetch(BASE + path, { method: "POST", body: form, headers: authHeader() }); }
  catch { throw new Error("Cannot reach the server. Is the backend running on " + BASE + "?"); }
  await check(r);
  if (!blob) return r.json();
  return { blob: await r.blob(), headers: r.headers, name: /filename="(.+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "result" };
}
export async function postJson(path: string, body: any) {
  let r: Response;
  try { r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify(body) }); }
  catch { throw new Error("Cannot reach the server. Is the backend running on " + BASE + "?"); }
  await check(r); return r.json();
}
export async function getJson(path: string) {
  let r: Response;
  try { r = await fetch(BASE + path, { headers: authHeader() }); } catch { throw new Error("Cannot reach the server."); }
  await check(r); return r.json();
}
export function save(blob: Blob, name: string) {
  try { const h = JSON.parse(localStorage.getItem("dm_hist") || "[]"); h.unshift({ name, t: Date.now() }); localStorage.setItem("dm_hist", JSON.stringify(h.slice(0, 50))); } catch {}
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const kb = (n: number) => (n / 1024).toFixed(0) + " KB";
export const BASE_URL = BASE;
