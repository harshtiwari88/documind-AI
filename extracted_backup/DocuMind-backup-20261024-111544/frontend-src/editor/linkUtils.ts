/** Validate and normalize destinations that are safe to embed as PDF URI actions. */
export function normalizeLinkUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Enter a link destination.");
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new Error("Enter a complete link, such as https://example.com."); }
  if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
    throw new Error("Links must use http, https or mailto.");
  }
  if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.hostname) {
    throw new Error("Enter a valid website address.");
  }
  return parsed.href;
}
