import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  ConnectorApiError, ConnectorAuthError, ConnectorRateLimitError, connectorConfigured, createConnector, deriveStateKey, fakeConnector,
  instagramConnector, newNonce, parseMetaSignedRequest, signState, tiktokConnector, verifyState,
} from "./index";

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
const j = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
function router(routes: Record<string, Route>, calls: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(input.toString()); calls.push({ url: u.toString(), init });
    const key = Object.keys(routes).find((k) => (u.origin + u.pathname).endsWith(k) || u.pathname.endsWith(k));
    if (!key) return j({ error: { code: 404 } }, 404);
    return routes[key](u, init);
  }) as unknown as typeof fetch;
}
const cfg = { clientId: "app-id", clientSecret: "app-secret" };

describe("instagram", () => {
  it("builds the authorize URL with read-only scopes and our state", () => {
    const u = new URL(instagramConnector(cfg).authUrl({ state: "S", redirectUri: "https://app.test/cb" }));
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_insights");
    expect(u.searchParams.get("state")).toBe("S"); expect(u.searchParams.get("response_type")).toBe("code"); expect(u.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
  });
  it("exchanges the code for a long-lived token (short-lived first, '#_' trimmed)", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = router({
      "/oauth/access_token": () => j({ access_token: "SHORT", user_id: 1 }),
      "/access_token": (u) => (u.searchParams.get("access_token") === "SHORT" && u.searchParams.get("grant_type") === "ig_exchange_token" ? j({ access_token: "LONG", token_type: "bearer", expires_in: 5184000 }) : j({}, 400)),
    }, calls);
    const t = await instagramConnector({ ...cfg, fetchImpl: f }).exchangeCode({ code: "CODE#_", redirectUri: "https://app.test/cb" });
    expect(t.accessToken).toBe("LONG"); expect(Date.parse(t.expiresAt!) - Date.now()).toBeGreaterThan(59 * 86_400_000);
    expect(String(calls[0].init?.body)).toContain("code=CODE"); expect(String(calls[0].init?.body)).not.toContain("%23");
  });
  it("refreshes when fewer than 10 days remain", async () => {
    const c = instagramConnector({ ...cfg, fetchImpl: router({ "/refresh_access_token": () => j({ access_token: "NEW", expires_in: 5184000 }) }) });
    const soon = { accessToken: "OLD", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString() };
    expect(c.needsRefresh(soon)).toBe(true); expect(c.needsRefresh({ accessToken: "x", expiresAt: new Date(Date.now() + 40 * 86_400_000).toISOString() })).toBe(false);
    expect((await c.refresh(soon)).accessToken).toBe("NEW");
  });
  it("reads the profile", async () => {
    const f = router({ "/me": () => j({ user_id: "178", username: "acme", name: "Acme", followers_count: 1200, follows_count: 80, media_count: 40 }) });
    expect(await instagramConnector({ ...cfg, fetchImpl: f }).fetchAccount({ accessToken: "T" })).toMatchObject({ externalId: "178", handle: "acme", followers: 1200, mediaCount: 40 });
  });
  it("reads daily reach (time series) plus per-day totals, and falls back to a smaller metric set", async () => {
    let n = 0;
    const f = router({ "/me/insights": (u) => {
      if (u.searchParams.get("metric_type") === "time_series") return j({ data: [{ name: "reach", period: "day", values: [{ value: 500, end_time: "2026-09-02T07:00:00+0000" }, { value: 600, end_time: "2026-09-03T07:00:00+0000" }] }] });
      n++;
      if (u.searchParams.get("metric")!.includes("accounts_engaged")) return j({ error: { code: 100, message: "unsupported metric" } }, 400); // forces the fallback set
      return j({ data: [{ name: "views", total_value: { value: 90 } }, { name: "total_interactions", total_value: { value: 12 } }] });
    } });
    const out = await instagramConnector({ ...cfg, fetchImpl: f }).fetchDailyMetrics({ accessToken: "T" }, { since: new Date("2026-09-02T00:00:00Z"), until: new Date("2026-09-04T00:00:00Z") });
    expect(out.filter((m) => m.metric === "reach")).toEqual([{ day: "2026-09-02", metric: "reach", value: 500 }, { day: "2026-09-03", metric: "reach", value: 600 }]);
    expect(out.filter((m) => m.metric === "interactions")).toEqual([{ day: "2026-09-02", metric: "interactions", value: 12 }, { day: "2026-09-03", metric: "interactions", value: 12 }]);
    expect(out.filter((m) => m.metric === "views")).toHaveLength(2); expect(n).toBe(4);
  });
  it("reads posts with insights, and keeps node counts when a media type rejects the insights call", async () => {
    const f = router({
      "/me/media": () => j({ data: [
        { id: "m1", caption: "Reel!", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-09-01T10:00:00+0000", permalink: "https://instagram.com/reel/1", like_count: 40, comments_count: 3 },
        { id: "m2", caption: "Photo", media_type: "IMAGE", timestamp: "2026-08-30T10:00:00+0000", permalink: "https://instagram.com/p/2", like_count: 10, comments_count: 1 }] }),
      "/m1/insights": () => j({ data: [{ name: "reach", values: [{ value: 900 }] }, { name: "views", values: [{ value: 1500 }] }, { name: "saved", values: [{ value: 7 }] }, { name: "total_interactions", values: [{ value: 55 }] }] }),
      "/m2/insights": () => j({ error: { code: 100 } }, 400),
    });
    const posts = await instagramConnector({ ...cfg, fetchImpl: f }).fetchPosts({ accessToken: "T" }, { limit: 10 });
    expect(posts[0]).toMatchObject({ externalId: "m1", mediaType: "reel", metrics: { likes: 40, comments: 3, reach: 900, views: 1500, saves: 7, interactions: 55 } });
    expect(posts[1]).toMatchObject({ externalId: "m2", mediaType: "image", metrics: { likes: 10, comments: 1 } });
  });
  it("maps platform failures to typed errors without leaking the token", async () => {
    const c = (status: number, body: unknown, h = {}) => instagramConnector({ ...cfg, fetchImpl: router({ "/me": () => j(body, status, h) }) }).fetchAccount({ accessToken: "SECRET-TOKEN" });
    await expect(c(401, { error: { code: 190 } })).rejects.toBeInstanceOf(ConnectorAuthError);
    await expect(c(400, { error: { code: 190 } })).rejects.toBeInstanceOf(ConnectorAuthError);
    await expect(c(429, {}, { "retry-after": "120" })).rejects.toMatchObject({ retryAfterSec: 120 });
    await expect(c(500, {})).rejects.toBeInstanceOf(ConnectorApiError);
    await c(500, {}).catch((e) => expect(String(e.message)).not.toContain("SECRET-TOKEN"));
  });
});

describe("tiktok", () => {
  it("builds the authorize URL (no PKCE for web) with read-only scopes", () => {
    const u = new URL(tiktokConnector(cfg).authUrl({ state: "S", redirectUri: "https://app.test/cb" }));
    expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(u.searchParams.get("client_key")).toBe("app-id"); expect(u.searchParams.get("scope")).toBe("user.info.basic,user.info.stats,video.list");
    expect(u.searchParams.has("code_challenge")).toBe(false);
  });
  it("exchanges and refreshes tokens, keeping the newest refresh token", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = router({ "/oauth/token/": (_u, init) => {
      const body = new URLSearchParams(String(init?.body));
      return body.get("grant_type") === "authorization_code"
        ? j({ open_id: "o1", access_token: "A1", refresh_token: "R1", scope: "user.info.basic,video.list", expires_in: 86400, refresh_expires_in: 31536000 })
        : j({ open_id: "o1", access_token: "A2", refresh_token: "R2", scope: "user.info.basic", expires_in: 86400 });
    } }, calls);
    const c = tiktokConnector({ ...cfg, fetchImpl: f });
    const t = await c.exchangeCode({ code: "C", redirectUri: "https://app.test/cb" });
    expect(t).toMatchObject({ accessToken: "A1", refreshToken: "R1" }); expect(t.scopes).toEqual(["user.info.basic", "video.list"]);
    expect(String(calls[0].init?.body)).toContain("client_secret=app-secret");
    expect(c.needsRefresh({ accessToken: "x", expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toBe(true);
    expect(await c.refresh(t)).toMatchObject({ accessToken: "A2", refreshToken: "R2" });
    await expect(c.refresh({ accessToken: "x" })).rejects.toBeInstanceOf(ConnectorAuthError);
  });
  it("reads the profile and pages through videos", async () => {
    let page = 0;
    const f = router({
      "/user/info/": (_u, init) => ((init?.headers as Record<string, string>).Authorization === "Bearer T" ? j({ data: { user: { open_id: "o1", display_name: "Acme", follower_count: 900, following_count: 10, likes_count: 5000, video_count: 33 } }, error: { code: "ok" } }) : j({}, 401)),
      "/video/list/": (_u, init) => { const b = JSON.parse(String(init?.body)); page++;
        return page === 1
          ? j({ data: { videos: [{ id: "v1", create_time: 1788000000, share_url: "https://tiktok.com/v1", title: "T1", view_count: 1000, like_count: 90, comment_count: 4, share_count: 7 }], cursor: 111, has_more: true }, error: { code: "ok" } })
          : (expect(b.cursor).toBe(111), j({ data: { videos: [{ id: "v2", create_time: 1787000000, video_description: "desc", view_count: 50 }], has_more: false }, error: { code: "ok" } })); },
    });
    const c = tiktokConnector({ ...cfg, fetchImpl: f });
    expect(await c.fetchAccount({ accessToken: "T" })).toMatchObject({ externalId: "o1", followers: 900, totalLikes: 5000, mediaCount: 33 });
    const posts = await c.fetchPosts({ accessToken: "T" }, { limit: 5 });
    expect(posts.map((p) => p.externalId)).toEqual(["v1", "v2"]);
    expect(posts[0]).toMatchObject({ mediaType: "video", caption: "T1", metrics: { views: 1000, likes: 90, comments: 4, shares: 7 } });
    expect(posts[1].caption).toBe("desc"); expect(await c.fetchDailyMetrics({ accessToken: "T" }, { since: new Date(), until: new Date() })).toEqual([]);
  });
  it("maps TikTok error codes (returned with HTTP 200) to typed errors", async () => {
    const f = (code: string) => tiktokConnector({ ...cfg, fetchImpl: router({ "/user/info/": () => j({ error: { code, message: "x" } }) }) }).fetchAccount({ accessToken: "T" });
    await expect(f("access_token_invalid")).rejects.toBeInstanceOf(ConnectorAuthError);
    await expect(f("rate_limit_exceeded")).rejects.toBeInstanceOf(ConnectorRateLimitError);
    await expect(f("internal_error")).rejects.toBeInstanceOf(ConnectorApiError);
  });
  it("revoke never throws", async () => { await tiktokConnector({ ...cfg, fetchImpl: (async () => { throw new Error("net"); }) as unknown as typeof fetch }).revoke({ accessToken: "T" }); });
});

describe("OAuth state", () => {
  const key = deriveStateKey(Buffer.alloc(32, 7).toString("base64"));
  const base = { u: "user1", c: "client1", n: "instagram", nonce: newNonce() };
  it("round-trips", () => expect(verifyState(signState(base, key), key)).toMatchObject(base));
  it("rejects tampering, another key, expiry and malformed input", () => {
    const s = signState(base, key);
    const [body, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, c: "client2", exp: Date.now() + 1e6 })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`, key)).toBeNull();
    expect(verifyState(s, deriveStateKey(Buffer.alloc(32, 8).toString("base64")))).toBeNull();
    expect(verifyState(signState(base, key, 1000, Date.now() - 5000), key)).toBeNull();
    for (const bad of ["", "x", `${body}.`, `${body}.${sig}.extra`, "a.b"]) expect(verifyState(bad, key)).toBeNull();
  });
  it("derived keys are domain-separated from the master key", () => expect(key.equals(Buffer.alloc(32, 7))).toBe(false));
});

describe("Meta signed_request", () => {
  const secret = "app-secret";
  const make = (payload: object, s = secret) => { const p = Buffer.from(JSON.stringify(payload)).toString("base64url"); return `${createHmac("sha256", s).update(p).digest("base64url")}.${p}`; };
  it("accepts a correctly signed request", () => expect(parseMetaSignedRequest(make({ user_id: "123", algorithm: "HMAC-SHA256" }), secret)).toMatchObject({ user_id: "123" }));
  it("rejects a wrong secret, a tampered payload and junk", () => {
    expect(parseMetaSignedRequest(make({ user_id: "123" }, "other"), secret)).toBeNull();
    const [sig] = make({ user_id: "123" }).split("."); expect(parseMetaSignedRequest(`${sig}.${Buffer.from('{"user_id":"999"}').toString("base64url")}`, secret)).toBeNull();
    for (const bad of ["", "abc", "a.b.c"]) expect(parseMetaSignedRequest(bad, secret)).toBeNull();
  });
});

describe("factory", () => {
  it("is not configured without credentials, configured with them", () => {
    expect(connectorConfigured("instagram", {})).toBe(false); expect(createConnector("tiktok", {})).toBeNull();
    expect(connectorConfigured("instagram", { META_APP_ID: "a", META_APP_SECRET: "b" })).toBe(true);
    expect(createConnector("tiktok", { TIKTOK_CLIENT_KEY: "a", TIKTOK_CLIENT_SECRET: "b" })?.network).toBe("tiktok");
  });
  it("fake data is development-only", () => {
    expect(createConnector("instagram", { CONNECTORS_FAKE: "1", NODE_ENV: "development" })?.scopes[0]).toContain("fake");
    expect(createConnector("instagram", { CONNECTORS_FAKE: "1", NODE_ENV: "production" })).toBeNull(); // ignored in production
  });
  it("the fake connector is deterministic", async () => {
    const a = await fakeConnector("instagram").fetchPosts({ accessToken: "x" }, { limit: 5 }); const b = await fakeConnector("instagram").fetchPosts({ accessToken: "x" }, { limit: 5 });
    expect(a.map((p) => p.metrics)).toEqual(b.map((p) => p.metrics)); expect(a).toHaveLength(5);
  });
});

// ---- sync engine ----
import { BACKFILL_DAYS, INCREMENTAL_DAYS, syncAccount, type SyncRepo } from "./index";
import type { Connector, TokenSet } from "./index";

function fakeRepo() {
  const log = { runs: [] as unknown[], tokens: [] as TokenSet[], metrics: [] as { metric: string; day: string; value: number }[], posts: [] as { externalId: string }[], accounts: [] as Record<string, unknown>[] };
  const repo: SyncRepo = {
    startRun: async () => 1, finishRun: async (_id, r) => { log.runs.push(r); },
    saveTokens: async (_a, t) => { log.tokens.push(t); },
    upsertMetrics: async (_a, _c, rows) => { log.metrics.push(...rows); }, upsertPosts: async (_a, _c, p) => { log.posts.push(...p); },
    markAccount: async (_a, patch) => { log.accounts.push(patch); },
  };
  return { repo, log };
}
const NOW = new Date("2026-10-04T15:30:00Z");
const acct = (over: Partial<{ tokens: TokenSet; firstSync: boolean }> = {}) => ({ id: "a1", clientId: "c1", tokens: { accessToken: "T", expiresAt: new Date(NOW.getTime() + 30 * 86_400_000).toISOString() }, firstSync: false, ...over });

describe("sync engine", () => {
  it("snapshots totals for today, pulls daily metrics and posts, and marks the account healthy", async () => {
    const { repo, log } = fakeRepo();
    const r = await syncAccount({ connector: fakeConnector("instagram"), repo, now: () => NOW }, acct());
    expect(r.ok).toBe(true);
    expect(log.metrics.filter((m) => m.metric === "followers")).toEqual([{ day: "2026-10-04", metric: "followers", value: expect.any(Number) }]);
    expect(log.metrics.some((m) => m.metric === "reach")).toBe(true); expect(log.posts).toHaveLength(30);
    expect(log.accounts.at(-1)).toMatchObject({ status: "active", last_error: null, last_synced_at: NOW.toISOString(), handle: "demo_instagram" });
    expect(log.runs.at(-1)).toMatchObject({ status: "ok" });
  });
  it("backfills 30 days on the first sync and 3 days afterwards", async () => {
    const days = async (firstSync: boolean) => { const { repo, log } = fakeRepo(); await syncAccount({ connector: fakeConnector("instagram"), repo, now: () => NOW }, acct({ firstSync })); return new Set(log.metrics.filter((m) => m.metric === "reach").map((m) => m.day)).size; };
    expect(await days(true)).toBe(BACKFILL_DAYS); expect(await days(false)).toBe(INCREMENTAL_DAYS);
  });
  it("refreshes a token that is about to expire and stores the new one", async () => {
    const { repo, log } = fakeRepo();
    const c: Connector = { ...fakeConnector("tiktok"), needsRefresh: () => true, refresh: async (t) => ({ ...t, accessToken: "NEW", expiresAt: "2026-10-05T00:00:00.000Z" }) };
    await syncAccount({ connector: c, repo, now: () => NOW }, acct());
    expect(log.tokens[0].accessToken).toBe("NEW"); expect(log.accounts[0]).toMatchObject({ token_expires_at: "2026-10-05T00:00:00.000Z" });
  });
  it("marks the account expired when the platform rejects the token, and records a generic error", async () => {
    const { repo, log } = fakeRepo();
    const c: Connector = { ...fakeConnector("instagram"), fetchAccount: async () => { throw new ConnectorAuthError("secret details SECRET-TOKEN"); } };
    const r = await syncAccount({ connector: c, repo, now: () => NOW }, acct());
    expect(r).toMatchObject({ ok: false, error: "reconnect" }); expect(log.accounts.at(-1)).toMatchObject({ status: "expired", last_error: "reconnect" });
    expect(JSON.stringify(log)).not.toContain("SECRET-TOKEN"); expect(log.runs.at(-1)).toMatchObject({ status: "error", error: "reconnect" });
  });
  it("rate limits and unknown errors keep the account active and are retried later", async () => {
    for (const [err, want] of [[new ConnectorRateLimitError("slow down"), "rate_limited"], [new Error("boom"), "failed"]] as const) {
      const { repo, log } = fakeRepo();
      const r = await syncAccount({ connector: { ...fakeConnector("tiktok"), fetchPosts: async () => { throw err; } }, repo, now: () => NOW }, acct());
      expect(r.error).toBe(want); expect(log.accounts.some((a) => a.status === "expired")).toBe(false); expect(log.accounts.at(-1)).toMatchObject({ last_error: want });
    }
  });
  it("keeps what it already saved when a later step fails", async () => {
    const { repo, log } = fakeRepo();
    await syncAccount({ connector: { ...fakeConnector("instagram"), fetchPosts: async () => { throw new Error("x"); } }, repo, now: () => NOW }, acct());
    expect(log.metrics.length).toBeGreaterThan(0); expect(log.posts).toHaveLength(0);
  });
});
