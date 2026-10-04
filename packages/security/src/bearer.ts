import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header. Fails closed: no configured secret, no header,
 * or a different length means "no". Used for scheduled-job endpoints.
 */
export function bearerMatches(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false; // refuse weak or missing secrets outright
  const got = Buffer.from(header), want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
