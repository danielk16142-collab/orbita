import { describe, expect, it, vi } from "vitest";
import { ApifyError, fetchLatestPosts, mapItem, usernameFromLink } from "./apify";

const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("apify", () => {
  it("reads the account name from a saved profile link, and rejects other hosts and reserved paths", () => {
    expect(usernameFromLink("instagram", "https://www.instagram.com/rival.cafe/")).toBe("rival.cafe");
    expect(usernameFromLink("tiktok", "https://www.tiktok.com/@rival_cafe")).toBe("rival_cafe");
    expect(usernameFromLink("instagram", "https://www.tiktok.com/@x")).toBeNull();
    expect(usernameFromLink("instagram", "https://www.instagram.com/reel/abc/")).toBeNull();
    expect(usernameFromLink("instagram", "not a url")).toBeNull();
  });
  it("maps an instagram reel: plays over views, hidden likes become null, hook skips leading hashtags", () => {
    const r = mapItem("instagram", { url: "https://www.instagram.com/reel/AbC/?utm=1", caption: "#cafe #coffee $18,000 is what one clause cost me.\nmore text", videoPlayCount: 120000, videoViewCount: 90000, likesCount: -1, commentsCount: 300, timestamp: "2026-09-14T10:00:00.000Z" })!;
    expect(r.hook).toBe("$18,000 is what one clause cost me.");
    expect(r.views).toBe(120000); expect(r.likes).toBeNull(); expect(r.comments).toBe(300);
    expect(r.url).toBe("https://www.instagram.com/reel/AbC/"); expect(r.postedAt).toBe("2026-09-14");
  });
  it("maps a tiktok video with followers and unix or ISO dates", () => {
    const r = mapItem("tiktok", { text: "Nobody tells you this", webVideoUrl: "https://www.tiktok.com/@x/video/1", playCount: 5000, diggCount: 400, commentCount: 20, shareCount: 9, authorMeta: { fans: 12345 }, createTime: 1757800000 })!;
    expect(r).toMatchObject({ hook: "Nobody tells you this", views: 5000, likes: 400, shares: 9, followers: 12345 });
    expect(r.postedAt).toMatch(/^2025-09-1/);
  });
  it("drops error items, items without text, and unsafe links; clamps and cleans text", () => {
    expect(mapItem("tiktok", { error: "x", errorCode: "PROFILE_PRIVATE" })).toBeNull();
    expect(mapItem("instagram", { caption: "   " })).toBeNull();
    expect(mapItem("instagram", { caption: "ok", url: "http://insecure.example.com/x" })!.url).toBeNull();
    expect(mapItem("instagram", { caption: "a\u0000b‮", videoPlayCount: 1e15 })!.views).toBe(9_999_999_999);
    expect(mapItem("instagram", "nope")).toBeNull();
  });
  it("calls the right actor with the token in a header, never in the URL, and maps the dataset", async () => {
    const f = vi.fn(ok([{ caption: "Hook one", videoPlayCount: 10 }, { error: "bad" }]));
    const out = await fetchLatestPosts("instagram", "rival.cafe", { token: "secret-token", fetchImpl: f as unknown as typeof fetch });
    expect(out).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items");
    expect(url).not.toContain("secret-token");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(String(init.body))).toMatchObject({ username: ["rival.cafe"], resultsLimit: 30, includeTranscript: false });
    const t = vi.fn(ok([]));
    await fetchLatestPosts("tiktok", "rival_cafe", { token: "t", fetchImpl: t as unknown as typeof fetch });
    expect((t.mock.calls[0] as unknown as [string])[0]).toContain("/acts/clockworks~tiktok-scraper/");
  });
  it("turns provider failures into short codes", async () => {
    const code = async (status: number) => { try { await fetchLatestPosts("tiktok", "x", { token: "t", fetchImpl: ok({}, status) }); } catch (e) { return (e as ApifyError).code; } };
    expect(await code(401)).toBe("unauthorized"); expect(await code(402)).toBe("no_credit"); expect(await code(408)).toBe("timeout"); expect(await code(500)).toBe("provider_error");
    await expect(fetchLatestPosts("tiktok", "x", { token: "t", fetchImpl: ok({ not: "an array" }) })).rejects.toMatchObject({ code: "bad_response" });
    await expect(fetchLatestPosts("tiktok", "x", { token: "" })).rejects.toMatchObject({ code: "no_token" });
    await expect(fetchLatestPosts("tiktok", "bad name!", { token: "t" })).rejects.toMatchObject({ code: "bad_response" });
  });
});
