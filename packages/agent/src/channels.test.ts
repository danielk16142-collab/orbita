import { describe, expect, it } from "vitest";
import { CHANNEL_AUDIT_TOOL, ChannelAudit, channelAuditRequest, summarizeTikTok } from "./channels";

const v = (d: string, views: number, hook = "h", followers: number | null = 1200) => ({ url: `https://www.tiktok.com/@a/video/${d.replace(/-/g, "")}`, hook, views, likes: Math.round(views / 10), comments: 5, shares: 2, followers, postedAt: d });
describe("TikTok summary and channel audits", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const vids = [v("2026-11-07", 900), v("2026-11-01", 12000, "best"), v("2026-10-25", 300, "weak"), v("2026-10-20", 2000), v("2026-09-01", 50000, "old hit")];
  it("summarizes the last 30 days, best and weakest videos, and the follower change", () => {
    const s = summarizeTikTok(vids, now, 1150);
    expect(s.period).toEqual({ from: "2026-10-09", to: "2026-11-08" });
    expect(s.videos30).toBe(4);
    expect(s.views30).toBe(15200);
    expect(s.avgViews30).toBe(3800);
    expect(s.postsPerWeek).toBe(0.9);
    expect(s.followers).toBe(1200);
    expect(s.followersDelta).toBe(50);
    expect(s.top.map((x) => x.hook)).toEqual(["old hit", "best", "h"]);
    expect(s.low[0].hook).toBe("weak"); // the 900-view video is under a week old: not judged yet
    expect(s.low.some((x) => x.postedAt === "2026-11-07")).toBe(false);
    expect(s.medianViews).toBe(2000);
  });
  it("asks for an audit tied to the numbers, with the posts as data", () => {
    const q = channelAuditRequest("tiktok", summarizeTikTok(vids, now), "es");
    expect(q).toContain("Spanish");
    expect(q).toContain("4 videos in 30 days");
    expect(q).toMatch(/untrusted/);
    expect(channelAuditRequest("linkedin", { period: { from: "2026-10-09", to: "2026-11-07" }, impressions: 12400, membersReached: 5100, engagements: 110, engagementRate: 0.0089, followers: 812, newFollowers: 8, weeks: [], topPosts: [], demographics: [] }, "en")).toContain("impressions 12400");
  });
  it("keeps a clean audit", () => {
    const a = ChannelAudit.parse({ verdict: " Growing ", working: ["a"], not_working: [], recommendations: [{ title: "Post 3x", why: "w", how: "h" }, { title: "", why: "", how: "" }], this_week: ["x", "y", "z", "extra"] });
    expect(a.verdict).toBe("Growing");
    expect(a.recommendations).toHaveLength(1);
    expect(a.this_week).toHaveLength(3);
    expect(CHANNEL_AUDIT_TOOL.strict).toBe(true);
  });
});
