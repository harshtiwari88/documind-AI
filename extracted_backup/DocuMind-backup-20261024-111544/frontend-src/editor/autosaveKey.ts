/** Stable content-derived key for local autosave records. Explicit saved-document IDs
 * should be used instead when available. This avoids restoring edits into a different PDF
 * merely because it has the same filename. */
export function autosaveDocumentKey(bytes: Uint8Array, fileName: string): string {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (bytes[i] + i), 0x85ebca6b) >>> 0;
  }
  const safeName = fileName.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "document";
  return `${safeName}_${bytes.length.toString(36)}_${h1.toString(36)}${h2.toString(36)}`;
}
