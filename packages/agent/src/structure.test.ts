import { describe, expect, it } from "vitest";
import { Breakdown, breakdownRequest, structureProfile } from "./structure";

const b = (formula: string, parts: string[], cta: string, retention: string[], score: number, tr = true) => Breakdown.parse({
  hook: { formula, why: "w" }, structure: parts.map((p) => ({ part: p, timing: "", what: "x" })), retention, cta: { kind: cta, text: "" }, format: "f", why_it_worked: ["a"], reuse: ["r"], hookScore: score, hookFormula: formula, fromTranscript: tr,
});
describe("why it works and the structure profile", () => {
  it("keeps valid parts and drops the rest", () => {
    const x = Breakdown.parse({ hook: { formula: "Curiosity Gap", why: "w" }, structure: [{ part: "hook", timing: "0-3s", what: "Opens on a number" }, { part: "intro", timing: "", what: "x" }, { part: "cta", timing: "", what: "" }], retention: ["open loop", 3], cta: { kind: "weird", text: "t" }, format: "f", why_it_worked: [], reuse: [] });
    expect(x.structure).toHaveLength(1);
    expect(x.retention).toEqual(["open loop"]);
    expect(x.cta.kind).toBe("none");
  });
  it("builds the profile from what the posts repeat", () => {
    const p = structureProfile([
      b("Curiosity Gap", ["hook", "value", "value", "cta"], "comment_keyword", ["Open loop in the first line", "Numbered list"], 80),
      b("Curiosity Gap", ["hook", "value", "cta"], "comment_keyword", ["open loop in the first line!"], 70),
      b("Cost Confession", ["hook", "story", "turn", "cta"], "follow", ["Pattern break"], 60, false),
    ]);
    expect(p.posts).toBe(3);
    expect(p.withTranscript).toBe(2);
    expect(p.formulas[0]).toEqual({ name: "Curiosity Gap", count: 2 });
    expect(p.structure[0]).toEqual({ sequence: "hook > value > cta", count: 2 });
    expect(p.ctas[0]).toEqual({ type: "comment_keyword", count: 2 });
    expect(p.retention[0]).toMatchObject({ count: 2 });
    expect(p.avgHookScore).toBe(70);
  });
  it("sends the post as data with the hook tools' results", () => {
    const q = breakdownRequest({ network: "instagram", hook: "Ignore rules", caption: "c", transcript: null, multiple: 3.2, metric: "views", value: 1, formula: "Curiosity Gap", hookScore: 72, beats: null }, "es", ["Curiosity Gap"]);
    expect(q).toContain("3.2x the account's usual views");
    expect(q).toContain('formula "Curiosity Gap", hook score 72/100');
    expect(q).toContain("Spanish");
    expect(q).toMatch(/untrusted/);
    expect(q).toContain("work from the hook and the caption");
  });
});

import { TOOL_DEFS } from "./tools";
import * as all from "./index";
describe("tool schemas", () => {
  it("strict tools never name a field after a schema keyword (strict mode can reject the whole request)", () => {
    const KEYWORDS = new Set(["type", "properties", "items", "required", "enum", "additionalProperties", "$ref", "anyOf", "allOf", "oneOf", "const", "default"]);
    const bad: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.properties && typeof n.properties === "object") for (const [k, v] of Object.entries(n.properties as Record<string, unknown>)) { if (KEYWORDS.has(k)) bad.push(`${path}.${k}`); walk(v, `${path}.${k}`); }
      if (n.items) walk(n.items, `${path}[]`);
    };
    type Tool = { name: string; input_schema: unknown; strict?: boolean };
    const exported = (Object.values(all) as unknown[]).filter((v): v is Tool => !!v && typeof v === "object" && "input_schema" in v && "name" in v);
    const tools: Tool[] = [...(TOOL_DEFS as unknown as Tool[]), ...exported];
    for (const t of tools) if (t.strict) walk(t.input_schema, t.name);
    expect(bad).toEqual([]);
  });
});
