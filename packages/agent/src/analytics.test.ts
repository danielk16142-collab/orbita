import { describe, expect, it } from "vitest";
import { analyticsForPrompt, bestPostingWindows, dashboardSummary, engagementOf, engagementRate, type MetricRow, type PostRow } from "./index";

const NOW = new Date("2026-10-04T12:00:00Z");
const d = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
const day = (daysAgo: number) => d(daysAgo).slice(0, 10);
const post = (daysAgo: number, hour: number, m: Record<string, number>, network = "instagram", type = "reel"): PostRow => {
  const t = new Date(NOW.getTime() - daysAgo * 86_400_000); t.setUTCHours(hour, 0, 0, 0);
  return { network, publishedAt: t.toISOString(), mediaType: type, caption: "c", permalink: null, metrics: m };
};

describe("engagement", () => {
  it("sums likes, comments, shares and saves; falls back to interactions", () => {
    expect(engagementOf({ likes: 10, comments: 2, shares: 3, saves: 5 })).toBe(20); expect(engagementOf({ interactions: 7 })).toBe(7); expect(engagementOf({})).toBe(0);
  });
  it("divides by views, else reach, else is unknown", () => {
    expect(engagementRate({ likes: 10, views: 200 })).toBeCloseTo(0.05); expect(engagementRate({ likes: 10, reach: 100 })).toBeCloseTo(0.1); expect(engagementRate({ likes: 10 })).toBeNull();
  });
});

describe("dashboard summary", () => {
  const metrics: MetricRow[] = [
    ...[30, 20, 10, 0].map((a, i) => ({ network: "instagram", day: day(a), metric: "followers", value: 1000 + i * 20 })),
    ...[30, 0].map((a, i) => ({ network: "tiktok", day: day(a), metric: "followers", value: 500 + i * 10 })),
    ...Array.from({ length: 10 }, (_, i) => ({ network: "instagram", day: day(i + 1), metric: "reach", value: 100 })),
    ...Array.from({ length: 5 }, (_, i) => ({ network: "instagram", day: day(40 + i), metric: "reach", value: 100 })),
  ];
  const posts = [post(2, 18, { likes: 50, views: 1000 }), post(5, 9, { likes: 10, views: 1000 }), post(40, 9, { likes: 30, views: 1000 }), post(3, 18, { likes: 20, views: 400 }, "tiktok", "video")];
  const s = dashboardSummary(metrics, posts, NOW);
  it("totals followers across networks and measures growth over 30 days", () => {
    expect(s.tiles.followers.value).toBe(1060 + 510); expect(s.tiles.followers.delta).toBe((1060 + 510) - (1000 + 500));
    expect(s.followers.map((x) => x.network)).toEqual(["instagram", "tiktok"]); expect(s.followers[0].points).toHaveLength(4);
  });
  it("compares reach with the previous 30 days", () => { expect(s.tiles.reach.value).toBe(1000); expect(s.tiles.reach.delta).toBeCloseTo((1000 - 500) / 500); });
  it("counts posts and rates engagement for the last 30 days only", () => {
    expect(s.tiles.posts.value).toBe(3); expect(s.tiles.posts.delta).toBe(3 - 1);
    expect(s.tiles.engagement.value).toBeCloseTo((0.05 + 0.01 + 0.05) / 3);
    expect(s.tiles.engagement.delta).toBeCloseTo(((0.05 + 0.01 + 0.05) / 3 - 0.03) * 100);
  });
  it("ranks the top posts by engagement rate", () => { expect(s.topPosts[0].rate).toBeCloseTo(0.05); expect(s.topPosts.at(-1)!.rate).toBeCloseTo(0.01); expect(s.topPosts).toHaveLength(3); });
  it("reports per network", () => expect(s.perNetwork.find((n) => n.network === "tiktok")).toMatchObject({ followers: 510, posts30: 1 }));
  it("is empty and honest with no data", () => {
    const e = dashboardSummary([], [], NOW);
    expect(e.hasData).toBe(false); expect(e.tiles.followers.value).toBeNull(); expect(e.tiles.posts.value).toBeNull(); expect(e.tiles.followers.delta).toBeNull();
  });
  it("needs two snapshots before claiming a follower change", () => expect(dashboardSummary([{ network: "instagram", day: day(0), metric: "followers", value: 10 }], [], NOW).tiles.followers.delta).toBeNull());
});

describe("best posting windows", () => {
  const many = (): PostRow[] => Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? post(i + 1, 18, { likes: 80, views: 1000 }) : post(i + 1, 9, { likes: 20, views: 1000 })));
  it("needs enough posts", () => expect(bestPostingWindows(many().slice(0, 5))).toBeNull());
  it("finds the time-of-day that earns more, and says how sure it is", () => {
    const w = bestPostingWindows(many())!;
    expect(w.windows[0].bucket).toBe("afternoon"); expect(w.windows[0].avgRate).toBeCloseTo(0.08); expect(w.confidence).toBe("low"); expect(w.sample).toBe(24);
    expect(w.windows.every((x) => x.posts >= 2)).toBe(true);
  });
  it("ignores posts without an audience number", () => expect(bestPostingWindows(Array.from({ length: 20 }, (_, i) => post(i + 1, 9, { likes: 5 })))).toBeNull());
});

describe("prompt text", () => {
  it("states plainly when nothing is connected", () => expect(analyticsForPrompt(dashboardSummary([], [], NOW), null, [])).toMatch(/no account is connected/));
  it("contains only numbers derived from the data and marks UTC and confidence", () => {
    const posts = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? post(i + 1, 18, { likes: 80, views: 1000 }) : post(i + 1, 9, { likes: 20, views: 1000 })));
    const txt = analyticsForPrompt(dashboardSummary([{ network: "instagram", day: day(0), metric: "followers", value: 1234 }], posts, NOW), bestPostingWindows(posts), posts);
    expect(txt).toContain("1234 followers"); expect(txt).toContain("UTC"); expect(txt).toContain("low confidence"); expect(txt).toContain("Best recent posts"); expect(txt).toContain("instagram reel");
  });
  it("says to label times as assumptions when history is too thin", () => expect(analyticsForPrompt(dashboardSummary([{ network: "tiktok", day: day(0), metric: "followers", value: 5 }], [], NOW), null, [])).toContain("assumptions"));
});
