import { describe, expect, it } from "vitest";
import { apiKeyMatches, hashApiKey, newApiKey, parseApiKey } from "./api-key";

const master = Buffer.alloc(32, 7).toString("base64");

describe("api keys", () => {
  it("creates well-formed, unique keys", () => {
    const a = newApiKey(), b = newApiKey();
    expect(a.key).toMatch(/^orb_[a-z0-9]{10}_[A-Za-z0-9_-]{43}$/);
    expect(a.key.startsWith(`orb_${a.prefix}_`)).toBe(true);
    expect(a.key).not.toBe(b.key);
  });

  it("parses raw keys and bearer headers, rejects anything else", () => {
    const { key, prefix } = newApiKey();
    expect(parseApiKey(key)).toEqual({ key, prefix });
    expect(parseApiKey(`Bearer ${key}`)).toEqual({ key, prefix });
    for (const bad of [null, "", "Bearer ", "orb_short_x", `${key}x`, key.replace("orb_", "sk_"), `Basic ${key}`]) expect(parseApiKey(bad)).toBeNull();
  });

  it("matches only the right key, with a pepper from the master key", () => {
    const { key } = newApiKey();
    const h = hashApiKey(key, master);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(apiKeyMatches(key, h, master)).toBe(true);
    expect(apiKeyMatches(newApiKey().key, h, master)).toBe(false);
    expect(apiKeyMatches(key, h, Buffer.alloc(32, 8).toString("base64"))).toBe(false);
    expect(apiKeyMatches(key, "abc", master)).toBe(false);
  });
});
