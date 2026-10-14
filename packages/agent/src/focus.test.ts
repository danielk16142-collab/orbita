import { describe, expect, it } from "vitest";
import { BrandFocus, focusFromRow, focusPrompt, SuggestedPillars, SuggestedTopics } from "./focus";
import { briefFromRow } from "./brief";
import { buildSystemPrompt } from "./prompt";

describe("brand focus", () => {
  it("reads topics and pillars, including older string pillars", () => {
    const f = focusFromRow({ topics: [{ name: "AI", level: "focus" }, { name: "x", level: "bad" }], pillars: ["Proof", { name: "Education", angle: "teach", share: 40, topics: ["AI"] }] });
    expect(f.topics).toEqual([{ name: "AI", level: "focus" }]);
    expect(f.pillars.map((p) => p.name)).toEqual(["Proof", "Education"]);
    expect(focusFromRow(null)).toEqual({ topics: [], pillars: [] });
  });

  it("rejects duplicate topics and pillars", () => {
    expect(BrandFocus.safeParse({ topics: [{ name: "AI", level: "focus" }, { name: "ai", level: "avoid" }], pillars: [] }).success).toBe(false);
  });

  it("tells the agent what to use and what to avoid", () => {
    const p = focusPrompt({ topics: [{ name: "AI", level: "focus" }, { name: "Politics", level: "avoid" }], pillars: [{ name: "Proof", angle: "results", share: 60, topics: [] }] });
    expect(p).toContain("Focus topics (talk about these most): AI");
    expect(p).toContain("Avoid (never use): Politics");
    expect(p).toContain("- Proof (60%): results");
    const base = { locale: "en" as const, clientName: "Acme", clientLanguages: ["en" as const], markets: [], brief: {}, memories: [], sources: [], proofItems: [], rules: [], recentExamples: [], audit: null, briefUpdatedAt: null, today: "2026-10-14", weekStart: "2026-10-13" };
    expect(buildSystemPrompt({ ...base, focus: p } as never)).toContain("Avoid (never use): Politics");
  });

  it("shows object pillars readably in the brief", () => {
    expect(briefFromRow({ pillars: [{ name: "Proof", share: 60, angle: "results" }] }).pillars).toEqual(["Proof (60%): results"]);
  });

  it("normalises suggested shares to 100 and drops avoid suggestions", () => {
    const r = SuggestedPillars.parse({ pillars: [{ name: "A", angle: "", share: 50, topics: [] }, { name: "B", angle: "", share: 30, topics: [] }] });
    expect(r.pillars.reduce((s, p) => s + p.share, 0)).toBe(100);
    expect(SuggestedTopics.parse({ topics: [{ name: "AI", level: "focus" }, { name: "X", level: "avoid" }] }).topics).toHaveLength(1);
  });
});
