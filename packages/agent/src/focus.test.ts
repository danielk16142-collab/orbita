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

import { syncTopics, weekFocus } from "./focus";
describe("topics follow the pillars", () => {
  const f = {
    topics: [{ name: "AI", level: "sometimes" as const }, { name: "Ads", level: "focus" as const }, { name: "Politics", level: "avoid" as const }],
    pillars: [
      { name: "Education", angle: "", share: 60, topics: ["AI", "SEO", "politics"] },
      { name: "Proof", angle: "", share: 40, topics: ["Case studies", "seo"] },
    ],
  };
  it("makes pillar topics focus, drops uncovered ones to sometimes, and lets avoid win", () => {
    const s = syncTopics(f);
    expect(s.topics).toEqual([
      { name: "AI", level: "focus" }, { name: "Ads", level: "sometimes" }, { name: "Politics", level: "avoid" },
      { name: "SEO", level: "focus" }, { name: "Case studies", level: "focus" },
    ]);
    expect(s.pillars[0].topics).toEqual(["AI", "SEO"]);
    expect(s.pillars[1].topics).toEqual(["Case studies", "seo"]);
  });
  it("takes this week's topics from the pillars this week's posts use", () => {
    const posts = [
      { pillar: "proof", date: "2026-11-02" }, { pillar: "Proof", date: "2026-11-04" }, { pillar: "Education", date: "2026-11-08" },
      { pillar: "Education", date: "2026-11-09" }, { pillar: null, date: "2026-11-03" }, { pillar: "Unknown", date: "2026-11-03" },
    ];
    const w = weekFocus(f, posts, "2026-11-02");
    expect(w.fromPlan).toBe(true);
    expect(w.pillars.map((p) => [p.name, p.posts])).toEqual([["Proof", 2], ["Education", 1]]);
    expect(w.topics).toEqual(["Case studies", "seo", "AI", "SEO"].filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i));
  });
  it("falls back to the chosen pillars by share when nothing is tagged this week", () => {
    const w = weekFocus(f, [], "2026-11-02");
    expect(w.fromPlan).toBe(false);
    expect(w.pillars.map((p) => p.name)).toEqual(["Education", "Proof"]);
    expect(w.topics).toEqual(["AI", "SEO", "Case studies"]);
  });
});
