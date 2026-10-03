import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** True for loopback, private, link-local, CGNAT, multicast and metadata addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true; // link-local
    if (l.startsWith("fc") || l.startsWith("fd")) return true; // unique local
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateAddress(m[1]) : false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export class UnsafeUrlError extends Error {}

/**
 * Validates a user-supplied URL before the server fetches it (competitor links etc.).
 * https only, no credentials, standard port, and every resolved address must be public.
 * Callers must still fetch with redirect: "manual" and re-validate each hop.
 */
export async function assertSafeUrl(
  input: string,
  opts: { allowedHosts?: string[]; resolver?: (host: string) => Promise<string[]> } = {},
): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new UnsafeUrlError("Invalid URL"); }
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("Credentials in URL are not allowed");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("Non-standard port");
  const host = url.hostname.toLowerCase();
  if (opts.allowedHosts && !opts.allowedHosts.some((h) => host === h || host.endsWith("." + h))) {
    throw new UnsafeUrlError("Host not allowed");
  }
  const addrs = isIP(host)
    ? [host]
    : await (opts.resolver ?? (async (h) => (await lookup(h, { all: true })).map((r) => r.address)))(host);
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new UnsafeUrlError("Address not allowed");
  return url;
}
