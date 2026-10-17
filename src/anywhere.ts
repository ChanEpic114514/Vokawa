export const SHARE_PREFIX = "#vokawa-share=";
export const MAX_SHARED_TEXT = 3000;
export const MAX_SHARED_FRAGMENT = SHARE_PREFIX.length + MAX_SHARED_TEXT * 9;
export type ShareError = "length" | "encoding" | "empty" | "format" | "control" | "cleanup";
export type SharedContent = { kind: "ready"; text: string } | { kind: "error"; error: ShareError };
export type SharePacket = { raw: string; error?: never } | { error: "length" | "cleanup"; raw?: never };
declare global {
  interface Window {
    vokawaAnywhere?: { take(): SharePacket | undefined; subscribe(listener: () => void): () => void };
  }
}
export function parseSharedFragment(raw: string): SharedContent {
  if (raw.length > MAX_SHARED_FRAGMENT) return { kind: "error", error: "length" };
  if (!raw.startsWith(SHARE_PREFIX)) return { kind: "error", error: "format" };
  let text: string;
  try {
    // Decode once. Unlike query strings, a literal plus is never a space here.
    text = decodeURIComponent(raw.slice(SHARE_PREFIX.length));
    encodeURIComponent(text); // Reject unpaired UTF-16 surrogates from non-URL callers.
  } catch { return { kind: "error", error: "encoding" }; }
  if (text.length > MAX_SHARED_TEXT) return { kind: "error", error: "length" };
  if (!text.trim()) return { kind: "error", error: "empty" };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return { kind: "error", error: "control" };
  // Preserve spacing, line endings, punctuation and markup as literal text.
  return { kind: "ready", text };
}
export function receiveSharedContent(): SharedContent | undefined {
  const packet = window.vokawaAnywhere?.take();
  if (!packet) return;
  if (packet.error) return { kind: "error", error: packet.error };
  return parseSharedFragment(packet.raw!);
}
export function sharedFragment(text: string) {
  const result = parseSharedFragment(SHARE_PREFIX + encodeURIComponent(text));
  if (result.kind === "error") throw Error(result.error);
  return SHARE_PREFIX + encodeURIComponent(text);
}
