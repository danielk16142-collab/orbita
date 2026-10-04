import { z } from "zod";
import { briefValueForColumn, SECTION_COLUMN } from "./brief";
import { BRIEF_SECTIONS, CONTENT_FORMATS, DAYS, LOCALES, MEMORY_KINDS, NETWORKS, type BriefSection, type Day } from "./types";

const s = (max: number) => z.string().trim().min(1).max(max);

const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/);

export const PlanItemSchema = z.object({
  day: z.enum(DAYS), network: z.enum(NETWORKS), format: s(60), pillar: z.string().trim().max(80),
  idea: s(500), caption: z.string().trim().max(2200), language: z.enum(LOCALES),
  time: hhmm, why: z.string().trim().max(300),
});

// ---- finished pieces of content ----
export const ReelContent = z.object({
  duration_seconds: z.number().int().min(5).max(180),
  hook_options: z.array(s(200)).min(1).max(3),
  scenes: z.array(z.object({ seconds: s(20), visual: s(300), voiceover: z.string().trim().max(600), on_screen_text: z.string().trim().max(200) })).min(1).max(15),
  cta: s(200), audio_note: z.string().trim().max(200),
});
export const CarouselContent = z.object({
  slides: z.array(z.object({ title: s(120), body: z.string().trim().max(500), visual: z.string().trim().max(300) })).min(2).max(12),
  cta: s(200),
});
export const StaticContent = z.object({ headline: s(160), visual_brief: s(500), cta: s(200) });

const PostBase = {
  day: z.enum(DAYS), week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), network: z.enum(NETWORKS), language: z.enum(LOCALES),
  pillar: z.string().trim().max(80), idea: s(500), caption: z.string().trim().max(2200),
  hashtags: z.array(s(60)).max(30), suggested_time: hhmm,
};
export const PostPayload = z.discriminatedUnion("format", [
  z.object({ format: z.literal("reel"), content: ReelContent, ...PostBase }),
  z.object({ format: z.literal("carousel"), content: CarouselContent, ...PostBase }),
  z.object({ format: z.literal("static"), content: StaticContent, ...PostBase }),
]);
export const PostInputBase = PostBase; // the model never sets week_start; see tools.ts

// ---- content strategy ----
export const StrategyContent = z.object({
  objectives: z.array(s(300)).min(1).max(5),
  pillars: z.array(z.object({ name: s(80), angle: s(300), share_percent: z.number().int().min(0).max(100) })).min(1).max(8),
  series: z.array(z.object({ name: s(80), subject: s(300), networks: z.array(z.enum(NETWORKS)).min(1).max(5), formats: z.array(z.enum(CONTENT_FORMATS)).min(1).max(3) })).max(8),
  cadence: z.array(z.object({ network: z.enum(NETWORKS), posts_per_week: z.number().int().min(0).max(21), best_days: z.array(z.enum(DAYS)).max(7), best_time: hhmm, why: z.string().trim().max(300) })).min(1).max(5),
  topics: z.array(s(200)).min(3).max(25),
  rationale: s(2000),
});

/** Payload for each proposal target. Used when the agent proposes AND again when a person accepts (possibly after editing). */
export const PAYLOADS = {
  brief: z.object({ section: z.enum(BRIEF_SECTIONS), value: s(4000) }),
  memory: z.object({ kind: z.enum(MEMORY_KINDS), content: s(500) }),
  proof_item: z.object({ claim: s(500), source: s(300) }),
  rule: z.object({ rule: s(500), reason: z.string().trim().max(300) }),
  plan: z.object({ title: s(100), week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), strategy_note: z.string().trim().max(1500), items: z.array(PlanItemSchema).min(1).max(14) }),
  post: PostPayload,
  strategy: z.object({ title: s(200), period: z.enum(["month", "quarter"]), content: StrategyContent }),
} as const;
export type ProposalTarget = keyof typeof PAYLOADS;

/** A database change to make when a proposal is accepted. The web app executes these with the user's own session. */
export type Op =
  | { op: "brief_set"; section: BriefSection; column: string; value: unknown }
  | { op: "insert"; table: "brand_memories" | "proof_items" | "client_rules" | "posts"; row: Record<string, unknown> }
  /** Make this the client's one active strategy (the previous one is kept but deactivated). */
  | { op: "activate_strategy"; row: Record<string, unknown> };

export function dayToDate(weekStart: string, day: Day): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DAYS.indexOf(day));
  return d.toISOString().slice(0, 10);
}

/** Pure: validates the payload and returns the operations. Throws ZodError on bad input. */
export function proposalToOps(target: ProposalTarget, payload: unknown): Op[] {
  switch (target) {
    case "brief": {
      const p = PAYLOADS.brief.parse(payload);
      return [{ op: "brief_set", section: p.section, column: SECTION_COLUMN[p.section], value: briefValueForColumn(p.section, p.value) }];
    }
    case "memory": {
      const p = PAYLOADS.memory.parse(payload);
      return [{ op: "insert", table: "brand_memories", row: { kind: p.kind, content: p.content, source: "chat", status: "active", weight: 1 } }];
    }
    case "proof_item": {
      const p = PAYLOADS.proof_item.parse(payload);
      return [{ op: "insert", table: "proof_items", row: { claim: p.claim, source: p.source } }];
    }
    case "rule": {
      const p = PAYLOADS.rule.parse(payload);
      return [{ op: "insert", table: "client_rules", row: { rule: p.rule, reason: p.reason || null } }];
    }
    case "plan": {
      const p = PAYLOADS.plan.parse(payload);
      return p.items.map((it) => ({
        op: "insert" as const, table: "posts" as const,
        row: {
          network: it.network, language: it.language, type: it.format.toLowerCase().slice(0, 60), pillar: it.pillar || null,
          status: "draft", caption: it.caption || null, idea: it.idea, source: "agent",
          scheduled_at: `${dayToDate(p.week_start, it.day)}T12:00:00Z`, suggested_time: it.time || null,
          content: it.why ? { rationale: it.why } : null,
        },
      }));
    }
    case "post": {
      const p = PAYLOADS.post.parse(payload);
      return [{
        op: "insert", table: "posts",
        row: {
          network: p.network, language: p.language, type: p.format, pillar: p.pillar || null, status: "draft", caption: p.caption || null,
          hashtags: p.hashtags, idea: p.idea, source: "agent", scheduled_at: `${dayToDate(p.week_start, p.day)}T12:00:00Z`,
          suggested_time: p.suggested_time || null, content: p.content,
        },
      }];
    }
    case "strategy": {
      const p = PAYLOADS.strategy.parse(payload);
      return [{ op: "activate_strategy", row: { title: p.title, period: p.period, content: p.content } }];
    }
  }
}
