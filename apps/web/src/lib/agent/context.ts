import "server-only";
import { briefFromRow, computeCompleteness, focusFromRow, focusPrompt, planningWeekStart, weekFocus, type AuditReport, type Memory, type PromptInput, type Source } from "@orbita/agent";
import type { AgentActor } from "./access";
import { strategyLanguage } from "@/lib/languages";
import { analyticsText, loadAnalyticsData } from "@/lib/analytics/load";

type Sb = AgentActor["sb"];

export type ClientContext = {
  briefRow: Record<string, unknown> | null;
  memories: (Memory & { id: string })[];
  sources: (Source & { id: string })[];
  audit: (AuditReport & { createdAt: string }) | null;
  proofItems: string[];
  rules: string[];
  examples: string[];
  /** The active strategy in the language asked for (or the client's main language): one per language. */
  strategy: { title: string; period: string; createdAt: string; content: Record<string, unknown>; language: string } | null;
  research: { id: string; kind: string; title: string; summary: string; sources: { title: string; url: string }[]; createdAt: string }[];
  lastPlan: string | null;
  analytics: string | null;
  /** Posts tagged with a pillar in the coming weeks: which pillars (and so which topics) this week uses. */
  pillarPosts: { pillar: string | null; date: string }[];
};

/**
 * Everything the agent should know about one client, read through the user's own RLS-bound session. opts.language picks
 * which language's strategy is loaded (each language has its own); without it, the client's first language.
 */
export async function loadClientContext(sb: Sb, clientId: string, opts: { language?: string | null } = {}): Promise<ClientContext> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), soon = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  const [brief, mem, src, aud, proof, rules, posts, fb, strat, res, plan, tagged] = await Promise.all([
    sb.from("brand_briefs").select("*").eq("client_id", clientId).maybeSingle(),
    sb.from("brand_memories").select("id, kind, content, weight, created_at").eq("client_id", clientId).eq("status", "active").order("created_at", { ascending: false }).limit(200),
    sb.from("client_sources").select("id, kind, url, handle").eq("client_id", clientId).order("created_at"),
    sb.from("audits").select("report, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1),
    sb.from("proof_items").select("claim, source").eq("client_id", clientId).limit(100),
    sb.from("client_rules").select("rule").eq("client_id", clientId).limit(100),
    sb.from("posts").select("network, language, caption, idea").eq("client_id", clientId).in("status", ["approved", "scheduled", "published"]).not("caption", "is", null).order("created_at", { ascending: false }).limit(4),
    sb.from("generation_feedback").select("final").eq("client_id", clientId).in("outcome", ["accepted", "edited"]).order("created_at", { ascending: false }).limit(3),
    sb.from("strategies").select("title, period, content, created_at, language").eq("client_id", clientId).eq("active", true).limit(3),
    sb.from("research_notes").select("id, kind, title, summary, sources, created_at").eq("client_id", clientId).gte("created_at", since).order("created_at", { ascending: false }).limit(8),
    sb.from("proposals").select("payload").eq("client_id", clientId).eq("target", "plan").eq("status", "accepted").order("decided_at", { ascending: false }).limit(1),
    sb.from("posts").select("pillar, planned_date").eq("client_id", clientId).not("pillar", "is", null).gte("planned_date", weekAgo).lte("planned_date", soon).limit(200),
  ]);
  const analytics = analyticsText(await loadAnalyticsData(sb, clientId));
  const lang = opts.language ? strategyLanguage(opts.language, null) : strategyLanguage(null, (await sb.from("clients").select("languages").eq("id", clientId).maybeSingle()).data?.languages as string[] | undefined);
  const s = (strat.data ?? []).find((x) => x.language === lang) ?? null;
  const lp = plan.data?.[0]?.payload as { title?: string; strategy_note?: string; items?: { day: string; network: string; format: string; idea: string }[] } | undefined;
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
    strategy: s ? { title: s.title, period: s.period, createdAt: s.created_at, content: s.content as Record<string, unknown>, language: s.language as string } : null,
    research: (res.data ?? []).map((r) => ({ id: r.id, kind: r.kind, title: r.title, summary: r.summary, sources: (r.sources as { title: string; url: string }[]) ?? [], createdAt: r.created_at })),
    analytics,
    pillarPosts: (tagged.data ?? []).map((p) => ({ pillar: p.pillar as string | null, date: p.planned_date as string })),
    lastPlan: lp ? `${lp.title ?? "Plan"}: ${lp.strategy_note ?? ""} | ${(lp.items ?? []).map((i) => `${i.day} ${i.network} ${i.format}: ${i.idea}`).join("; ")}`.slice(0, 1500) : null,
    examples: [...(posts.data ?? []).map((p) => `${p.network} (${p.language}): ${[p.idea, p.caption].filter(Boolean).join(" / ")}`.slice(0, 300)), ...fromFeedback],
  };
}

export function completenessOf(ctx: ClientContext) {
  return computeCompleteness(briefFromRow(ctx.briefRow), { hasSources: ctx.sources.length > 0 });
}

/**
 * opts.scope "post": the agent works on one specific piece of content (a post being written or rewritten, a caption from a
 * script). The strategy, the weekly plan, research and this week's topics are left out so they cannot pull it off the post.
 */
export function promptInput(actor: AgentActor, ctx: ClientContext, locale: "en" | "fr" | "es", opts: { webSearch?: boolean; firstTurn?: boolean; now?: Date; scope?: "post" } = {}): PromptInput {
  const now = opts.now ?? new Date();
  return {
    locale, clientName: actor.client.name, clientLanguages: actor.client.languages, markets: actor.client.markets, timezone: actor.client.timezone,
    brief: briefFromRow(ctx.briefRow), memories: ctx.memories, sources: ctx.sources, proofItems: ctx.proofItems, rules: ctx.rules,
    recentExamples: ctx.examples, audit: ctx.audit, briefUpdatedAt: (ctx.briefRow?.updated_at as string | undefined) ?? null,
    today: now.toISOString().slice(0, 10), weekStart: planningWeekStart(now),
    focus: (() => { const f = focusFromRow(ctx.briefRow); return focusPrompt(f, opts.scope === "post" ? null : weekFocus(f, ctx.pillarPosts ?? [], planningWeekStart(now))); })(),
    scope: opts.scope,
    strategy: ctx.strategy, research: ctx.research, lastPlan: ctx.lastPlan, analytics: ctx.analytics, webSearch: !!opts.webSearch, firstTurn: !!opts.firstTurn,
  };
}
