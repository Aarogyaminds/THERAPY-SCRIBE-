// Uses the Web Crypto API (globalThis.crypto), not Node's `crypto` module —
// this file is imported from middleware.js, which runs on Vercel's Edge runtime
// and does not support Node built-ins.

const COOKIE_NAME = "clinic_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function sign(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSessionCookieValue() {
  const payload = String(Date.now());
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionCookieValue(value) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  const expected = await sign(payload);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export { COOKIE_NAME, MAX_AGE_SECONDS };
