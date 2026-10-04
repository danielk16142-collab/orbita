import { describe, expect, it } from "vitest";
import { checkBrandColor, contrastRatio, readableOn } from "./color";
import { constantTimeEqual, generateInviteToken, hashInviteToken, isWellFormedToken } from "./invitation";
import { sniffImage, validateLogoUpload, MAX_LOGO_BYTES } from "./image";
import { upstashRateLimiter } from "./rate-limit";

describe("color", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(readableOn("#ff4e1b")).toBe("#0a0a0a"); // agency orange needs dark text
    expect(readableOn("#102a43")).toBe("#ffffff");
  });
  it("accepts good colors and rejects bad input or unreadable mid-tones", () => {
    expect(checkBrandColor("#ff4e1b")).toBeNull();
    expect(checkBrandColor("red")).toBe("invalid");
    expect(checkBrandColor("#ff4e1b; background:url(x)")).toBe("invalid");
    expect(checkBrandColor("#777777")).toBe("low-contrast"); // neither ink nor white reaches 4.5:1
  });
});

describe("invitation tokens", () => {
  it("are unique, well formed, and hashed one way", () => {
    const a = generateInviteToken(), b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(a + "!")).toBe(false);
    expect(hashInviteToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(a)).not.toContain(a);
    expect(hashInviteToken(a)).toBe(hashInviteToken(a));
    expect(constantTimeEqual(hashInviteToken(a), hashInviteToken(b))).toBe(false);
  });
});

describe("image sniffing", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0))));
  it("recognizes png, jpeg, webp by content", () => {
    expect(sniffImage(png)).toBe("png"); expect(sniffImage(jpg)).toBe("jpeg"); expect(sniffImage(webp)).toBe("webp");
  });
  it("rejects svg, html, gif and polyglots named like images", () => {
    for (const s of ['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "<html>", "GIF89a....."]) {
      expect(validateLogoUpload(new TextEncoder().encode(s))).toBe("unsupported");
    }
  });
  it("enforces size", () => {
    expect(validateLogoUpload(new Uint8Array(0))).toBe("empty");
    const big = new Uint8Array(MAX_LOGO_BYTES + 1); big.set(png);
    expect(validateLogoUpload(big)).toBe("too-large");
    expect(validateLogoUpload(png)).toBeNull();
  });
});

describe("upstash limiter", () => {
  const redis = (counts: number[]) => { let i = 0; return (async () => new Response(JSON.stringify([{ result: counts[i++] ?? 99 }, { result: 1 }, { result: 5000 }]))) as unknown as typeof fetch; };
  it("allows up to the limit then blocks, using the shared counter", async () => {
    const rl = upstashRateLimiter({ url: "https://r.example", token: "t" }, 2, 60_000, redis([1, 2, 3]));
    expect((await rl.hit("k")).allowed).toBe(true);
    expect((await rl.hit("k")).allowed).toBe(true);
    expect((await rl.hit("k")).allowed).toBe(false);
  });
  it("falls back to the local limiter when Redis fails (does not lock users out)", async () => {
    const down = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    const rl = upstashRateLimiter({ url: "https://r.example", token: "t" }, 1, 60_000, down);
    expect((await rl.hit("k")).allowed).toBe(true);
    expect((await rl.hit("k")).allowed).toBe(false);
  });
});

import { bearerMatches } from "./bearer";
describe("bearer secret check", () => {
  const secret = "a-long-random-cron-secret-123";
  it("accepts only the exact secret", () => {
    expect(bearerMatches(`Bearer ${secret}`, secret)).toBe(true);
    for (const h of [null, undefined, "", secret, `bearer ${secret}`, `Bearer ${secret}x`, `Bearer ${secret.slice(0, -1)}`, "Bearer wrong"]) expect(bearerMatches(h as string, secret)).toBe(false);
  });
  it("fails closed when no usable secret is configured", () => {
    for (const s of [undefined, null, "", "short"]) expect(bearerMatches(`Bearer ${s}`, s as string)).toBe(false);
  });
});
