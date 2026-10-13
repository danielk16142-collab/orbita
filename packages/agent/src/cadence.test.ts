import { describe, expect, it } from "vitest";
import { addDays, nextPost, weekProgress, weekStartOf, type CadencePost } from "./cadence";

const base = { topics: [], research: [], usedIdeas: [], windows: null, cadence: [] };
const post = (o: Partial<CadencePost>): CadencePost => ({ id: "p", idea: "x", type: "reel", network: "instagram", status: "idea", planned_date: null, ...o });

describe("cadence", () => {
  it("finds the Monday of a week", () => {
    expect(weekStartOf("2026-10-13")).toBe("2026-10-12"); // Tuesday
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12"); // Sunday
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("counts this week and the streak of weeks that met the goal", () => {
    const days = ["2026-10-13", "2026-10-06", "2026-10-07", "2026-09-29", "2026-09-30", "2026-09-22"];
    const p = weekProgress(days, "2026-10-14", 2);
    expect(p).toMatchObject({ weekStart: "2026-10-12", done: 1, goal: 2, streak: 2, daysLeft: 5 });
    expect(weekProgress([...days, "2026-10-14"], "2026-10-14", 2).streak).toBe(3); // this week counts once met
    expect(weekProgress([], "2026-10-14", 3)).toMatchObject({ done: 0, streak: 0 });
  });

  it("returns the soonest planned post first, ignoring past and finished ones", () => {
    const planned = [post({ id: "a", planned_date: "2026-10-20" }), post({ id: "b", planned_date: "2026-10-15" }), post({ id: "c", planned_date: "2026-10-10" }), post({ id: "d", planned_date: "2026-10-14", status: "published" })];
    expect(nextPost({ ...base, today: "2026-10-13", planned })).toMatchObject({ kind: "planned", post: { id: "b" } });
  });

  it("suggests an unused strategy topic on the best day from results", () => {
    const r = nextPost({ ...base, today: "2026-10-13", planned: [], topics: ["Behind the scenes of a shoot", "Client results"], usedIdeas: ["Behind the scenes of a shoot, part 2"],
      windows: { windows: [{ weekday: 4, bucket: "evening", avgRate: 0.05, posts: 4 }], confidence: "low", sample: 14 } });
    expect(r).toMatchObject({ kind: "suggestion", title: "Client results", source: "strategy", day: "2026-10-15", bucket: "evening", time: null });
  });

  it("falls back to the strategy cadence, then research, then nothing", () => {
    const cadence = [{ network: "instagram", best_days: ["friday"], best_time: "18:30" }];
    expect(nextPost({ ...base, today: "2026-10-13", planned: [], topics: ["A topic"], cadence })).toMatchObject({ day: "2026-10-16", time: "18:30", network: "instagram" });
    expect(nextPost({ ...base, today: "2026-10-13", planned: [], research: [{ title: "Trend", summary: "Why" }] })).toMatchObject({ kind: "suggestion", source: "research", day: "2026-10-13" });
    expect(nextPost({ ...base, today: "2026-10-13", planned: [] })).toEqual({ kind: "empty", day: "2026-10-13" });
  });
});

import { lastWeekRecap, missedPosts, weekAhead } from "./cadence";
import { fillWeekTool, weekPostsSchema } from "./kickstart";

describe("week ahead, missed posts, recap", () => {
  const planned = [post({ id: "a", planned_date: "2026-10-14" }), post({ id: "b", planned_date: "2026-10-16", status: "published" }), post({ id: "c", planned_date: "2026-10-10", status: "draft" }),
    post({ id: "d", planned_date: "2026-08-01" }), post({ id: "e", planned_date: "2026-10-11", status: "scheduled" })];

  it("counts the next 7 days against the goal and lists open days", () => {
    const w = weekAhead(planned, "2026-10-13", 3);
    expect(w).toMatchObject({ planned: 1, short: 2 });
    expect(w.openDays).toEqual(["2026-10-13", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
  });

  it("lists missed posts from the last 30 days, newest first", () => {
    expect(missedPosts(planned, "2026-10-13").map((p) => p.id)).toEqual(["c"]);
  });

  it("recaps last week with the best post", () => {
    const posts = [
      { network: "instagram", publishedAt: "2026-10-07T18:00:00Z", mediaType: "reel", caption: "Best one", permalink: "https://x", metrics: { views: 100, likes: 10 } },
      { network: "instagram", publishedAt: "2026-10-09T18:00:00Z", mediaType: "image", caption: "Other", permalink: null, metrics: { views: 100, likes: 2 } },
      { network: "instagram", publishedAt: "2026-10-13T18:00:00Z", mediaType: "image", caption: "This week", permalink: null, metrics: { views: 100, likes: 50 } },
    ];
    const r = lastWeekRecap(posts, "2026-10-14", (iso) => iso.slice(0, 10));
    expect(r).toMatchObject({ weekStart: "2026-10-05", posts: 2, best: { caption: "Best one" } });
  });

  it("only accepts posts on the open days, one per day", () => {
    const days = ["2026-10-15", "2026-10-17"];
    expect(fillWeekTool(days).input_schema.properties.posts.items.properties.date.enum).toEqual(days);
    const r = weekPostsSchema(days, 2).safeParse({ posts: [
      { date: "2026-10-17", format: "reel", title: "B", hook: "", why: "" }, { date: "2026-10-15", format: "carousel", title: "A", hook: "", why: "" },
      { date: "2026-10-15", format: "reel", title: "dup day", hook: "", why: "" }, { date: "2026-10-14", format: "reel", title: "taken", hook: "", why: "" }] });
    expect(r.success && r.data.posts.map((p: { title: string }) => p.title)).toEqual(["A", "B"]);
  });
});
