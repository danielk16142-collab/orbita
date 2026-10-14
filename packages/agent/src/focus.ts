import { z } from "zod";

/**
 * What the brand chose to talk about: topics (focus, sometimes, avoid) and its own content pillars with their share.
 * Chosen by people in the Profile; the agent follows it (strategy pillars and shares, topics for every idea).
 * Stored on brand_briefs: topics (jsonb array) and pillars (jsonb array of objects; older rows hold plain strings).
 */
export const TOPIC_LEVELS = ["focus", "sometimes", "avoid"] as const;
export type TopicLevel = (typeof TOPIC_LEVELS)[number];
export const DEFAULT_TOPICS = ["ai", "social_media", "ads", "web_design", "ecommerce", "seo", "branding", "email", "video", "automation", "analytics", "customer_stories", "behind_scenes", "tips", "industry_news", "offers"] as const;

const name = (max: number) => z.string().trim().min(1).max(max);
export const BrandTopic = z.object({ name: name(60), level: z.enum(TOPIC_LEVELS) });
export const BrandPillar = z.object({ name: name(80), angle: z.string().trim().max(300).default(""), share: z.number().int().min(0).max(100), topics: z.array(name(60)).max(12).default([]) });
export const BrandFocus = z.object({
  topics: z.array(BrandTopic).max(40).refine((a) => new Set(a.map((t) => t.name.toLowerCase())).size === a.length, "duplicate topic"),
  pillars: z.array(BrandPillar).max(8).refine((a) => new Set(a.map((p) => p.name.toLowerCase())).size === a.length, "duplicate pillar"),
});
export type BrandTopic = z.infer<typeof BrandTopic>;
export type BrandPillar = z.infer<typeof BrandPillar>;
export type BrandFocus = z.infer<typeof BrandFocus>;

/** Read the focus from a brand_briefs row. Older pillar entries (plain strings) become pillars without a share. */
export function focusFromRow(row: Record<string, unknown> | null | undefined): BrandFocus {
  const topics = (Array.isArray(row?.topics) ? row!.topics : []).flatMap((x) => { const r = BrandTopic.safeParse(x); return r.success ? [r.data] : []; });
  const pillars = (Array.isArray(row?.pillars) ? row!.pillars : []).flatMap((x) => {
    if (typeof x === "string" && x.trim()) return [{ name: x.trim().slice(0, 80), angle: "", share: 0, topics: [] }];
    const r = BrandPillar.safeParse(x); return r.success ? [r.data] : [];
  });
  return { topics, pillars };
}
export const hasChosenPillars = (f: BrandFocus) => f.pillars.length > 0 && f.pillars.some((p) => p.share > 0);

/** The focus as the agent reads it (system prompt). */
export function focusPrompt(f: BrandFocus): string {
  if (!f.topics.length && !f.pillars.length) return "(not chosen yet: propose topics and pillars from the profile, and say the person can set them in the Profile)";
  const by = (l: TopicLevel) => f.topics.filter((t) => t.level === l).map((t) => t.name);
  const L: string[] = [];
  if (f.topics.length) L.push(`Focus topics (talk about these most): ${by("focus").join(", ") || "-"}`, `Sometimes: ${by("sometimes").join(", ") || "-"}`, `Avoid (never use): ${by("avoid").join(", ") || "-"}`);
  if (f.pillars.length) {
    L.push("Chosen content pillars (use exactly these, with these shares):");
    for (const p of f.pillars) L.push(`- ${p.name}${p.share ? ` (${p.share}%)` : ""}${p.angle ? `: ${p.angle}` : ""}${p.topics.length ? ` [topics: ${p.topics.join(", ")}]` : ""}`);
  }
  return L.join("\n");
}

/** "Suggest": the agent proposes topics or pillars for this business, which the person then keeps or edits. */
export const SUGGEST_TOPICS_TOOL = {
  name: "suggest_topics", strict: true, description: "Suggest topics this brand should talk about. Call it exactly once.",
  input_schema: { type: "object", properties: { topics: { type: "array", items: { type: "object", properties: { name: { type: "string", description: "1 to 3 words" }, level: { type: "string", enum: ["focus", "sometimes"] } }, required: ["name", "level"], additionalProperties: false } } }, required: ["topics"], additionalProperties: false },
} as const;
export const SUGGEST_PILLARS_TOOL = {
  name: "suggest_pillars", strict: true, description: "Suggest 3 to 5 content pillars with shares that add up to 100. Call it exactly once.",
  input_schema: { type: "object", properties: { pillars: { type: "array", items: { type: "object", properties: {
    name: { type: "string", description: "2 to 4 words" }, angle: { type: "string", description: "One line: what this pillar shows and why" }, share: { type: "integer" }, topics: { type: "array", items: { type: "string" } },
  }, required: ["name", "angle", "share", "topics"], additionalProperties: false } } }, required: ["pillars"], additionalProperties: false },
} as const;
export const SuggestedTopics = z.object({ topics: z.array(z.unknown()).transform((a) => a.flatMap((x) => { const r = BrandTopic.safeParse(x); return r.success && r.data.level !== "avoid" ? [r.data] : []; }).slice(0, 12)) });
export const SuggestedPillars = z.object({ pillars: z.array(z.unknown()).transform((a) => {
  const ps = a.flatMap((x) => { const r = BrandPillar.safeParse(x); return r.success ? [r.data] : []; }).slice(0, 6);
  const total = ps.reduce((s, p) => s + p.share, 0);
  if (ps.length && total !== 100) { // make the shares add up to 100
    const scaled = ps.map((p) => ({ ...p, share: total ? Math.round((p.share / total) * 100) : Math.round(100 / ps.length) }));
    scaled[0].share += 100 - scaled.reduce((s, p) => s + p.share, 0);
    return scaled;
  }
  return ps;
}) });
