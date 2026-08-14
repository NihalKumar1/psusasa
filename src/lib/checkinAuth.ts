// Session signing for the door check-in tool. Deliberately uses only the
// Web Crypto API (crypto.subtle) — no Node "crypto" import — because this
// module is shared between middleware.ts (Next.js Edge runtime, which has
// no access to Node's crypto module) and the Node-runtime login route.

export const CHECKIN_COOKIE_NAME = "sasa_checkin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours — a door shift, not indefinite
export const CHECKIN_COOKIE_MAX_AGE_SECONDS = SESSION_TTL_SECONDS;

interface SessionPayload {
  events: string[];
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.CHECKIN_SESSION_SECRET;
  if (!secret) throw new Error("CHECKIN_SESSION_SECRET is not set.");
  return secret;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(data: string): Promise<string> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}

// Not cryptographically airtight (short-circuits on length mismatch), but a
// meaningful upgrade over `===` for comparing signatures/passwords here —
// this gates a low-stakes shared door password, not a high-value secret.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function createSessionToken(events: string[]): Promise<string> {
  const payload: SessionPayload = {
    events,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadStr = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const sig = await sign(payloadStr);
  return `${payloadStr}.${sig}`;
}

// Returns the list of event IDs this token is currently authorized for, or
// an empty list if the token is missing, malformed, tampered with, or expired.
export async function verifySessionToken(
  token: string | undefined | null
): Promise<string[]> {
  if (!token) return [];
  const parts = token.split(".");
  if (parts.length !== 2) return [];
  const [payloadStr, sig] = parts;

  const expectedSig = await sign(payloadStr);
  if (!timingSafeEqual(sig, expectedSig)) return [];

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadStr))
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return [];
    }
    if (!Array.isArray(payload.events)) return [];
    return payload.events.filter((e): e is string => typeof e === "string");
  } catch {
    return [];
  }
}
