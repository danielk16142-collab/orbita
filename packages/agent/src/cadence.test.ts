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
