import { z } from "zod";
import { briefValueForColumn, SECTION_COLUMN } from "./brief";
import { BRIEF_SECTIONS, DAYS, LOCALES, MEMORY_KINDS, NETWORKS, type BriefSection, type Day } from "./types";

const s = (max: number) => z.string().trim().min(1).max(max);

export const PlanItemSchema = z.object({
  day: z.enum(DAYS), network: z.enum(NETWORKS), format: s(60), pillar: z.string().trim().max(80),
  idea: s(500), caption: z.string().trim().max(2200), language: z.enum(LOCALES),
});

/** Payload for each proposal target. Used when the agent proposes AND again when a person accepts (possibly after editing). */
export const PAYLOADS = {
  brief: z.object({ section: z.enum(BRIEF_SECTIONS), value: s(4000) }),
  memory: z.object({ kind: z.enum(MEMORY_KINDS), content: s(500) }),
  proof_item: z.object({ claim: s(500), source: s(300) }),
  rule: z.object({ rule: s(500), reason: z.string().trim().max(300) }),
  plan: z.object({ title: s(100), week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), items: z.array(PlanItemSchema).min(1).max(14) }),
} as const;
export type ProposalTarget = keyof typeof PAYLOADS;

/** A database change to make when a proposal is accepted. The web app executes these with the user's own session. */
export type Op =
  | { op: "brief_set"; section: BriefSection; column: string; value: unknown }
  | { op: "insert"; table: "brand_memories" | "proof_items" | "client_rules" | "posts"; row: Record<string, unknown> };

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
          scheduled_at: `${dayToDate(p.week_start, it.day)}T12:00:00Z`,
        },
      }));
    }
  }
}
