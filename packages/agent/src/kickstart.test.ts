import { describe, expect, it } from "vitest";
import { Kickstart, KICKSTART_TOOL, kickstartRequest } from "./kickstart";

describe("kickstart", () => {
  it("keeps valid plan items, drops broken ones, sorts and clamps", () => {
    const r = Kickstart.safeParse({
      summary: "Early account with strong reels.", working: ["Reels get 2x reach", 5, ""], gaps: [], best_formats: ["Reels"], best_times: "Thursday evening",
      posts_per_week: 12,
      plan: [{ day_offset: 5, format: "carousel", title: "B", hook: "h", why: "w" }, { day_offset: 1, format: "reel", title: "A", hook: "h", why: "w" },
        { day_offset: 20, format: "reel", title: "too late", hook: "", why: "" }, { day_offset: 2, format: "podcast", title: "bad format", hook: "", why: "" }],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.working).toEqual(["Reels get 2x reach"]);
    expect(r.data.posts_per_week).toBe(7);
    expect(r.data.plan.map((p: { title: string }) => p.title)).toEqual(["A", "B"]);
  });

  it("rejects a plan with no usable posts", () => {
    expect(Kickstart.safeParse({ summary: "x", working: [], gaps: [], best_formats: [], best_times: "", posts_per_week: 3, plan: [] }).success).toBe(false);
  });

  it("is a strict tool and the request names the start date", () => {
    expect(KICKSTART_TOOL.strict).toBe(true);
    expect(kickstartRequest("instagram", "dany", "2026-10-14")).toContain("2026-10-14");
  });
});
