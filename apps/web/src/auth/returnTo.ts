/** Only allow same-origin relative paths; anything else falls back to "/". */
export function safeReturnTo(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
