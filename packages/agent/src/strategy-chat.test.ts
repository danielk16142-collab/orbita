import { describe, expect, it } from "vitest";
import { alignStrategyToFocus, focusBuildRequest } from "./strategy-chat";

const focus = {
  topics: [{ name: "SEO", level: "focus" as const }, { name: "AI", level: "sometimes" as const }, { name: "Politics", level: "avoid" as const }],
  pillars: [{ name: "Education", angle: "Teach", share: 60, topics: ["SEO"] }, { name: "Proof", angle: "", share: 40, topics: [] }, { name: " ", angle: "", share: 0, topics: [] }],
};

describe("strategy from pillars and topics", () => {
  it("writes the request from the chosen pillars, shares and topics", () => {
    const r = focusBuildRequest(focus, false);
    expect(r).toContain("Build the strategy around");
    expect(r).toContain("- Education (60%): Teach | topics: SEO");
    expect(r).toContain("- Proof (40%)");
    expect(r).toContain("now and then: AI.");
    expect(r).toContain("Never use: Politics.");
    expect(r.split("\n").filter((l) => l.startsWith("- ")).length).toBe(2);
    expect(focusBuildRequest(focus, true)).toContain("Rebuild");
  });
  it("keeps exactly the chosen pillars and shares in the strategy", () => {
    const out = alignStrategyToFocus({ title: "Q", content: { objectives: ["x"], pillars: [{ name: "proof", angle: "Results", share_percent: 10 }, { name: "Extra", angle: "", share_percent: 90 }] } }, focus) as { content: { pillars: unknown[]; objectives: string[] } };
    expect(out.content.pillars).toEqual([{ name: "Education", share_percent: 60, angle: "Teach" }, { name: "Proof", share_percent: 40, angle: "Results" }]);
    expect(out.content.objectives).toEqual(["x"]);
    expect(alignStrategyToFocus({ content: {} }, { topics: [], pillars: [] })).toEqual({ content: {} });
  });
});

import { channelsRule } from "./strategy-chat";
describe("strategy for the chosen channels", () => {
  it("asks for only those channels, the same videos on Instagram and TikTok, LinkedIn on its own", () => {
    const r = focusBuildRequest(focus, false, ["instagram", "tiktok", "linkedin"]);
    expect(r).toContain("plan only for Instagram, TikTok, LinkedIn");
    expect(r).toContain("same short videos");
    expect(r).toContain("LinkedIn gets its own content");
    expect(channelsRule(["linkedin"])).not.toContain("same short videos");
    expect(channelsRule([])).toBe("");
  });
  it("keeps only the chosen networks in the cadence and series", () => {
    const out = alignStrategyToFocus({ content: { pillars: [], cadence: [{ network: "instagram" }, { network: "youtube" }], series: [{ name: "A", networks: ["youtube"] }, { name: "B", networks: ["instagram", "youtube"] }] } }, focus, ["instagram", "tiktok"]) as { content: { cadence: unknown[]; series: { name: string; networks: string[] }[] } };
    expect(out.content.cadence).toEqual([{ network: "instagram" }]);
    expect(out.content.series).toEqual([{ name: "B", networks: ["instagram"] }]);
  });
});
