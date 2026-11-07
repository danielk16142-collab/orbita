import { z } from "zod";
import { ANALYSIS_TOOL, CompetitorAnalysis, competitorRequest, competitorSystem, runStructured } from "@orbita/agent";
import { rankWins } from "@orbita/content";
import { resolveAgentActor } from "@/lib/agent/access";
import { researchTools, resolveModelAccess } from "@/lib/agent/model";
import { businessFor } from "@/lib/agent/research";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), competitorId: z.string().uuid(), locale: z.enum(["en", "fr", "es"]) });

/** Analyzes one competitor and stores the analysis (so it can be read later and used for the strategy). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "not_found" }, access.status);
  const actor = access.actor;
  // RLS plus the explicit client filter: the competitor must belong to the client this person is working on.
  const { data: c, error: readError } = await actor.sb.from("competitors").select("id, name, url, website, links, notes").eq("id", body.data.competitorId).eq("client_id", actor.clientId).maybeSingle();
  if (readError) { console.error(`competitor read failed: code=${readError.code}`); return json({ error: ["PGRST204", "42703", "42P01", "PGRST205"].includes(readError.code ?? "") ? "not_set_up" : "server_error" }, 500); }
  if (!c) return json({ error: "not_found" }, 404);
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  const tools = researchTools(ai.chatModel, { fetch: true });
  if (!tools.length) return json({ error: "no_web" }, 503);
  if (!(await limiter("competitor-run", 10, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  // What already works for this competitor: its recorded posts ranked by how far each beat its own median (best first, up to 8).
  const { data: rows } = await actor.sb.from("competitor_posts").select("id, competitor_id, hook, url, network, views, likes, comments, shares, followers, posted_at, formula_id, caption, transcript").eq("competitor_id", c.id).eq("client_id", actor.clientId).limit(200);
  const byId = new Map((rows ?? []).map((w) => [w.id, w]));
  const ranked = rankWins((rows ?? []).map((w) => ({ id: w.id, competitorId: w.competitor_id, hook: w.hook, url: w.url, views: w.views, likes: w.likes, comments: w.comments, shares: w.shares, followers: w.followers, postedAt: w.posted_at, formulaId: w.formula_id })))
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0) || b.value - a.value).slice(0, 8);
  const wins = ranked.map((w) => ({ hook: w.hook, caption: byId.get(w.id)?.caption ?? null, transcript: byId.get(w.id)?.transcript ?? null, network: byId.get(w.id)?.network ?? "instagram", multiple: w.multiple, metric: w.metric, value: w.value, formula: w.formula?.name ?? null }));

  try {
    const links = (Array.isArray(c.links) ? c.links : []) as { network: string; url: string }[];
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: competitorSystem(await businessFor(actor), body.data.locale),
      user: competitorRequest({ name: c.name ?? c.url ?? "Competitor", website: c.website ?? null, links: c.url ? [...links, { network: "profile", url: c.url }] : links, notes: c.notes, wins }),
      tool: ANALYSIS_TOOL, schema: CompetitorAnalysis, serverTools: tools,
    });
    await recordUsage(actor, r.usage);
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "competitor.analyzed", entity: "competitor", entityId: c.id, meta: { ok: r.ok, tokens: r.usage } });
    if (!r.ok) return json({ error: r.searchErrors.length ? "search_failed" : r.error === "refused" ? "refused" : "no_result" }, 502);
    // Each idea keeps the winning post it builds on, so the page can show it next to the idea.
    const content_ideas = r.data.content_ideas.map((i) => { const w = i.based_on > 0 ? ranked[i.based_on - 1] : undefined; return w ? { ...i, source_post: { hook: w.hook, multiple: w.multiple, metric: w.metric, value: w.value, url: w.url ?? null } } : { ...i, based_on: 0 }; });
    const { data: saved, error } = await actor.sb.from("competitor_analyses").insert({ client_id: actor.clientId, competitor_id: c.id, analysis: { ...r.data, content_ideas, winsUsed: wins.length, searchErrors: r.searchErrors.length }, created_by: actor.userId }).select("id").single();
    if (error || !saved) { console.error(`analysis save failed: code=${error?.code}`); return json({ error: ["PGRST204", "42703", "42P01", "PGRST205"].includes(error?.code ?? "") ? "not_set_up" : "forbidden" }, 403); }
    await actor.sb.from("competitors").update({ last_researched_at: new Date().toISOString() }).eq("id", c.id);
    return json({ id: saved.id });
  } catch (e) {
    console.error("competitor analysis failed:", describeModelError(e), `model=${ai.chatModel}`);
    return json({ error: "model_error" }, 502);
  }
}
