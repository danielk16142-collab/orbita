import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring OAuth `state`. It binds the flow to the user, the client and the network, so a callback
 * can't be replayed by someone else, for another client, or after 10 minutes. A matching nonce cookie
 * (set at /start, checked at /callback) ties the callback to the same browser.
 */
export type OAuthState = { u: string; c: string; n: string; nonce: string; exp: number };

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function newNonce(): string { return randomBytes(16).toString("base64url"); }

export function signState(p: Omit<OAuthState, "exp">, secret: Buffer, ttlMs = 10 * 60_000, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...p, exp: now + ttlMs }));
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

export function verifyState(token: string, secret: Buffer, now = Date.now()): OAuthState | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = createHmac("sha256", secret).update(body).digest();
  let got: Buffer; try { got = Buffer.from(sig, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    return p && typeof p.exp === "number" && p.exp > now && p.u && p.c && p.n && p.nonce ? p : null;
  } catch { return null; }
}

/** Domain-separated key for state signing, derived from the master key (never used for anything else). */
export function deriveStateKey(masterKeyBase64: string): Buffer {
  return createHmac("sha256", Buffer.from(masterKeyBase64, "base64")).update("orbita:oauth-state:v1").digest();
}

/** Meta's signed_request (data-deletion and deauthorize callbacks): "<base64url sig>.<base64url payload>", HMAC-SHA256 with the app secret. */
export function parseMetaSignedRequest(signedRequest: string, appSecret: string): { user_id?: string; [k: string]: unknown } | null {
  const [sig, payload, extra] = signedRequest.split(".");
  if (!sig || !payload || extra !== undefined) return null;
  const want = createHmac("sha256", appSecret).update(payload).digest();
  let got: Buffer; try { got = Buffer.from(sig, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
}
