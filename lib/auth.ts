// Session auth for this single-tenant deployment. A session token is an
// HMAC-SHA256-signed expiry stamp whose signing key is derived from
// APP_PASSWORD, so rotating the password invalidates every existing session.
// Web Crypto only — this module runs in both the Edge runtime (middleware)
// and Node route handlers.

export const SESSION_COOKIE = "lumina_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string comparison (assumes equal-length hex digests).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signingKey(): Promise<CryptoKey | null> {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`lumina-session-v1:${password}`)
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(payload: string): Promise<string | null> {
  const key = await signingKey();
  if (!key) return null;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(sig);
}

export async function createSessionToken(): Promise<string | null> {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(8)).buffer);
  const payload = `${exp}.${nonce}`;
  const sig = await sign(payload);
  return sig ? `${payload}.${sig}` : null;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  const expected = await sign(`${exp}.${nonce}`);
  if (!expected || !timingSafeEqual(sig, expected)) return false;
  const expMs = Number(exp);
  return Number.isFinite(expMs) && expMs > Date.now();
}

// Compare a login attempt against APP_PASSWORD. Both sides are hashed first
// so the comparison is constant-time and leaks nothing about length.
export async function passwordMatches(candidate: string): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
  ]);
  return timingSafeEqual(toHex(a), toHex(b));
}
