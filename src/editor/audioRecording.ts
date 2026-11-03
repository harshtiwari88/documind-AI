/** Browser-independent helpers for choosing an uploadable audio container. */
export interface RecorderSupport {
  isTypeSupported?: (mimeType: string) => boolean;
}

const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
];

export function preferredRecorderMimeType(recorder?: RecorderSupport): string | undefined {
  if (!recorder?.isTypeSupported) return undefined;
  return RECORDER_MIME_CANDIDATES.find((mime) => {
    try { return recorder.isTypeSupported!(mime); } catch { return false; }
  });
}

export function audioExtension(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(";")[0].trim();
  if (mime === "audio/mp4" || mime === "audio/m4a" || mime === "audio/x-m4a") return "mp4";
  if (mime === "audio/ogg" || mime === "application/ogg") return "ogg";
  if (mime === "audio/wav" || mime === "audio/wave" || mime === "audio/x-wav") return "wav";
  if (mime === "audio/mpeg" || mime === "audio/mp3") return "mp3";
  return "webm";
}
