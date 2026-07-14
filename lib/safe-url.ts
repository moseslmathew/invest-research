/**
 * Return `raw` only if it is a safe absolute http(s) URL, otherwise "".
 *
 * Values parsed from external RSS feeds or produced by the LLM are later
 * rendered as anchor `href`s on the client. Without this guard a feed or model
 * response could smuggle a `javascript:` / `data:` / `vbscript:` URL and turn a
 * link click into script execution. Only http and https are allowed through.
 */
export function safeUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.trim());
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.toString();
    }
  } catch {
    // Not a valid absolute URL — reject it.
  }
  return "";
}
