import { describe, expect, it } from "vitest";
import { buildStrategyMap, formatOfMedia, matchPillar, monthWeeks, NO_PILLAR, type MapPost } from "./strategy-map";

const pillars = [{ name: "Education", angle: "", share_percent: 50 }, { name: "Proof", angle: "", share_percent: 50 }];
const p = (o: Partial<MapPost>): MapPost => ({ id: Math.random().toString(), kind: "plan", title: "x", format: "reel", network: "instagram", status: "idea", date: "2026-10-14", pillar: "Education", ...o });

describe("strategy map", () => {
  it("lists the Monday-based weeks that touch the month", () => {
    const w = monthWeeks("2026-10");
    expect(w[0]).toMatchObject({ start: "2026-09-28", end: "2026-10-04" });
    expect(w.at(-1)).toMatchObject({ start: "2026-10-26", end: "2026-11-01" });
    expect(w).toHaveLength(5);
  });

  it("matches pillars loosely and maps media types", () => {
    expect(matchPillar(" éducation ", [{ name: "Education", angle: "", share_percent: 1 }])).toBe("Education");
    expect(matchPillar("Other", pillars)).toBe(NO_PILLAR);
    expect([formatOfMedia("REELS"), formatOfMedia("CAROUSEL_ALBUM"), formatOfMedia("image")]).toEqual(["reel", "carousel", "static"]);
  });

  it("places posts in week cells by pillar, with an untagged row when needed", () => {
    const m = buildStrategyMap({ month: "2026-10", pillars, rowsBy: "pillar", noPillarLabel: "Untagged", posts: [
      p({ date: "2026-10-14" }), p({ date: "2026-10-02", pillar: "Proof", kind: "live", status: "published" }), p({ date: "2026-10-20", pillar: null }), p({ date: "2026-12-01" }),
    ] });
    expect(m.rows.map((r) => r.key)).toEqual(["Education", "Proof", NO_PILLAR]);
    expect(m.rows[0].cells[2]).toHaveLength(1); // week of Oct 12
    expect(m.rows[1].cells[0]).toHaveLength(1); // week of Sep 28
    expect(m.untagged).toBe(1);
    expect(m.mix.find((x) => x.pillar === "Proof")).toMatchObject({ target: 50, published: 100, publishedCount: 1 });
    expect(m.mix.find((x) => x.pillar === "Education")).toMatchObject({ planned: 50, plannedCount: 1 });
  });

  it("can group by format and filter by network", () => {
    const m = buildStrategyMap({ month: "2026-10", pillars, rowsBy: "format", network: "instagram", noPillarLabel: "-", posts: [p({ format: "carousel" }), p({ format: "reel" }), p({ network: "tiktok" })] });
    expect(m.rows.map((r) => r.key)).toEqual(["reel", "carousel"]);
  });
});

import { buildStrategyGraph, chainOf, connectTool, linksFromConnect } from "./strategy-map";

describe("strategy mind map", () => {
  const base = { businessName: "Dany Designs", objectives: ["Leads", "Followers"], personas: ["Café owners", "Realtors"], month: "2026-10",
    pillars: [{ name: "Proof", angle: "results", share_percent: 60 }, { name: "Education", angle: "teach", share_percent: 40 }],
    series: [{ name: "Before & After", subject: "", formats: ["reel"], networks: ["instagram"] }],
    posts: [{ id: "1", kind: "live" as const, title: "x", format: "reel", network: "instagram", status: "published", date: "2026-10-03", pillar: "Proof", rate: 0.05 }] };

  it("joins goals and pillars loosely before the strategy is connected", () => {
    const g = buildStrategyGraph(base);
    expect(g.linked).toBe(false);
    expect(g.edges.filter((e) => e.kind === "serves" && e.loose)).toHaveLength(4);
    expect(g.nodes.find((n) => n.id === "pillar:Proof")?.stats).toMatchObject({ published: 1, avgRate: 0.05 });
    expect(g.nodes.find((n) => n.id === "pillar:Education")?.warn).toBe("no_posts");
  });

  it("uses the links, flags who nobody speaks to, and lights up a chain", () => {
    const links = linksFromConnect({ pillars: [{ pillar: "Proof", goals: [0], personas: [0] }, { pillar: "Education", goals: [0], personas: [0, 0] }],
      personas: [{ persona: 0, pains: ["Site brings no customers", ""] }], series: [{ series: "Before & After", pillar: "Proof" }] });
    const g = buildStrategyGraph({ ...base, links });
    expect(g.nodes.find((n) => n.id === "persona:1")?.warn).toBe("unserved");
    expect(g.nodes.find((n) => n.id === "goal:1")?.warn).toBe("no_pillar");
    expect(g.nodes.find((n) => n.id === "persona:0")?.pains).toEqual(["Site brings no customers"]);
    const chain = chainOf("series:0", g.edges);
    expect([...chain].sort()).toEqual(["business", "goal:0", "persona:0", "pillar:Proof", "series:0"].sort());
    expect(chainOf("goal:1", g.edges).has("pillar:Proof")).toBe(false);
  });

  it("builds a strict connect tool with index enums", () => {
    const t = connectTool(["Proof"], [], 2, 1);
    expect(t.strict).toBe(true);
    expect(t.input_schema.properties.pillars.items.properties.goals.items.enum).toEqual([0, 1]);
  });
});
