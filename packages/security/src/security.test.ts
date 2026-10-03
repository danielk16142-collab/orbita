import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, assertSafeUrl, isPrivateAddress, verifyTurnstile, memoryRateLimiter, securityHeaders } from "./index";

beforeAll(() => { process.env.ORBITA_MASTER_KEY = randomBytes(32).toString("base64"); });

describe("crypto", () => {
  it("round-trips and uses a fresh key each time", () => {
    const a = encryptSecret("tok", "client:1:ig");
    expect(a).not.toContain("tok");
    expect(a).not.toBe(encryptSecret("tok", "client:1:ig"));
    expect(decryptSecret(a, "client:1:ig")).toBe("tok");
  });
  it("rejects a blob moved to another record or tampered with", () => {
    const a = encryptSecret("tok", "client:1:ig");
    expect(() => decryptSecret(a, "client:2:ig")).toThrow();
    const buf = Buffer.from(a, "base64url"); buf[buf.length - 1] ^= 1;
    expect(() => decryptSecret(buf.toString("base64url"), "client:1:ig")).toThrow();
  });
});

describe("ssrf", () => {
  it.each(["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"])("blocks %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(true));
  it("allows public addresses", () => expect(isPrivateAddress("8.8.8.8")).toBe(false));
  it("rejects http, credentials, odd ports, internal hosts", async () => {
    const r = async () => ["93.184.216.34"];
    await expect(assertSafeUrl("http://example.com", { resolver: r })).rejects.toThrow();
    await expect(assertSafeUrl("https://u:p@example.com", { resolver: r })).rejects.toThrow();
    await expect(assertSafeUrl("https://example.com:8443", { resolver: r })).rejects.toThrow();
    await expect(assertSafeUrl("https://evil.test", { resolver: async () => ["10.0.0.1"] })).rejects.toThrow();
    await expect(assertSafeUrl("https://169.254.169.254/latest")).rejects.toThrow();
  });
  it("accepts a public https URL and honors the host allowlist", async () => {
    const r = async () => ["93.184.216.34"];
    await expect(assertSafeUrl("https://www.instagram.com/x", { resolver: r, allowedHosts: ["instagram.com"] })).resolves.toBeInstanceOf(URL);
    await expect(assertSafeUrl("https://evil.com/x", { resolver: r, allowedHosts: ["instagram.com"] })).rejects.toThrow();
  });
});

describe("turnstile", () => {
  const ok = (body: object, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("fails closed without secret, token, or on network errors", async () => {
    expect((await verifyTurnstile("t", { secret: "" })).success).toBe(false);
    expect((await verifyTurnstile("", { secret: "s" })).success).toBe(false);
    expect((await verifyTurnstile("t", { secret: "s", fetchImpl: (async () => { throw new Error("x"); }) as unknown as typeof fetch })).success).toBe(false);
    expect((await verifyTurnstile("t", { secret: "s", fetchImpl: ok({}, 500) })).success).toBe(false);
  });
  it("accepts a valid token and enforces the action", async () => {
    expect((await verifyTurnstile("t", { secret: "s", fetchImpl: ok({ success: true, action: "login" }), expectedAction: "login" })).success).toBe(true);
    expect((await verifyTurnstile("t", { secret: "s", fetchImpl: ok({ success: true, action: "other" }), expectedAction: "login" })).success).toBe(false);
    expect((await verifyTurnstile("t", { secret: "s", fetchImpl: ok({ success: false, "error-codes": ["invalid-input-response"] }) })).errors).toEqual(["invalid-input-response"]);
  });
});

describe("rate limit and headers", () => {
  it("limits per key and resets after the window", async () => {
    let t = 0; const rl = memoryRateLimiter(2, 1000, () => t);
    expect((await rl.hit("a")).allowed).toBe(true);
    expect((await rl.hit("a")).allowed).toBe(true);
    expect((await rl.hit("a")).allowed).toBe(false);
    expect((await rl.hit("b")).allowed).toBe(true);
    t = 1001; expect((await rl.hit("a")).allowed).toBe(true);
  });
  it("CSP allows Turnstile and forbids framing", () => {
    const h = securityHeaders("abc", { supabaseUrl: "https://x.supabase.co" });
    expect(h["Content-Security-Policy"]).toContain("https://challenges.cloudflare.com");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("nonce-abc");
  });
});
