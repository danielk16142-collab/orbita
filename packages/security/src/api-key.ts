import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API keys for agents (e.g. an assistant that runs the app daily).
 * Format: orb_<prefix>_<secret>. The prefix (10 chars) finds the key; only an HMAC of the whole key is stored,
 * keyed with a secret derived from the master key, so a database leak does not reveal usable keys.
 */
const PREFIX = /^[a-z0-9]{10}$/;
const KEY = /^orb_([a-z0-9]{10})_([A-Za-z0-9_-]{43})$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newApiKey(): { key: string; prefix: string } {
  const bytes = randomBytes(10);
  const prefix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return { key: `orb_${prefix}_${randomBytes(32).toString("base64url")}`, prefix };
}

/** The prefix of a well-formed key, or null. Accepts the raw key or an "Authorization: Bearer <key>" header value. */
export function parseApiKey(value: string | null | undefined): { key: string; prefix: string } | null {
  if (!value) return null;
  const key = value.startsWith("Bearer ") ? value.slice(7).trim() : value.trim();
  const m = KEY.exec(key);
  return m && PREFIX.test(m[1]) ? { key, prefix: m[1] } : null;
}

/** HMAC-SHA256 of the key, hex. masterKeyBase64 is ORBITA_MASTER_KEY (32 bytes). */
export function hashApiKey(key: string, masterKeyBase64: string): string {
  const pepper = createHmac("sha256", Buffer.from(masterKeyBase64, "base64")).update("orbita:api-keys:v1").digest();
  return createHmac("sha256", pepper).update(key).digest("hex");
}

/** Constant-time comparison of a presented key with a stored hash. */
export function apiKeyMatches(key: string, storedHash: string, masterKeyBase64: string): boolean {
  const got = Buffer.from(hashApiKey(key, masterKeyBase64), "hex"), want = Buffer.from(storedHash, "hex");
  return got.length === want.length && want.length === 32 && timingSafeEqual(got, want);
}
