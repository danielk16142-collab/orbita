import "server-only";
import { briefFromRow, computeCompleteness, planningWeekStart, type AuditReport, type Memory, type PromptInput, type Source } from "@orbita/agent";
import type { AgentActor } from "./access";

type Sb = AgentActor["sb"];

export type ClientContext = {
  briefRow: Record<string, unknown> | null;
  memories: (Memory & { id: string })[];
  sources: (Source & { id: string })[];
  audit: (AuditReport & { createdAt: string }) | null;
  proofItems: string[];
  rules: string[];
  examples: string[];
};

/** Everything the agent should know about one client, read through the user's own RLS-bound session. */
export async function loadClientContext(sb: Sb, clientId: string): Promise<ClientContext> {
  const [brief, mem, src, aud, proof, rules, posts, fb] = await Promise.all([
    sb.from("brand_briefs").select("*").eq("client_id", clientId).maybeSingle(),
    sb.from("brand_memories").select("id, kind, content, weight, created_at").eq("client_id", clientId).eq("status", "active").order("created_at", { ascending: false }).limit(200),
    sb.from("client_sources").select("id, kind, url, handle").eq("client_id", clientId).order("created_at"),
    sb.from("audits").select("report, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1),
    sb.from("proof_items").select("claim, source").eq("client_id", clientId).limit(100),
    sb.from("client_rules").select("rule").eq("client_id", clientId).limit(100),
    sb.from("posts").select("network, language, caption, idea").eq("client_id", clientId).in("status", ["approved", "scheduled", "published"]).not("caption", "is", null).order("created_at", { ascending: false }).limit(4),
    sb.from("generation_feedback").select("final").eq("client_id", clientId).in("outcome", ["accepted", "edited"]).order("created_at", { ascending: false }).limit(3),
  ]);
  const fromFeedback = (fb.data ?? []).flatMap((r) => {
    const items = (r.final as { items?: { network?: string; idea?: string; caption?: string }[] } | null)?.items ?? [];
    return items.slice(0, 2).map((it) => `${it.network ?? "post"}: ${[it.idea, it.caption].filter(Boolean).join(" / ")}`.slice(0, 300));
  });
  return {
    briefRow: (brief.data as Record<string, unknown> | null) ?? null,
    memories: (mem.data ?? []).map((m) => ({ id: m.id, kind: m.kind, content: m.content, weight: m.weight, createdAt: m.created_at })),
    sources: (src.data ?? []) as ClientContext["sources"],
    audit: aud.data?.[0] ? { ...(aud.data[0].report as AuditReport), createdAt: aud.data[0].created_at } : null,
    proofItems: (proof.data ?? []).map((p) => `${p.claim} (source: ${p.source})`),
    rules: (rules.data ?? []).map((r) => r.rule),
    examples: [...(posts.data ?? []).map((p) => `${p.network} (${p.language}): ${[p.idea, p.caption].filter(Boolean).join(" / ")}`.slice(0, 300)), ...fromFeedback],
  };
}

export function completenessOf(ctx: ClientContext) {
  return computeCompleteness(briefFromRow(ctx.briefRow), { hasSources: ctx.sources.length > 0 });
}

export function promptInput(actor: AgentActor, ctx: ClientContext, locale: "en" | "fr" | "es", now = new Date()): PromptInput {
  return {
    locale, clientName: actor.client.name, clientLanguages: actor.client.languages, markets: actor.client.markets,
    brief: briefFromRow(ctx.briefRow), memories: ctx.memories, sources: ctx.sources, proofItems: ctx.proofItems, rules: ctx.rules,
    recentExamples: ctx.examples, audit: ctx.audit, briefUpdatedAt: (ctx.briefRow?.updated_at as string | undefined) ?? null,
    today: now.toISOString().slice(0, 10), weekStart: planningWeekStart(now),
  };
}
