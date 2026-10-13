import { z } from "zod";
import { pillarTagSystem, pillarTagTool, runStructured, wrapUntrusted, type MapPillar } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional() });
const MAX = 80;

/**
 * Sort untagged posts (planned in Orbita, and published ones synced from the accounts) into the active strategy's
 * pillars. The person's access is checked first; the writes use the service role because synced posts are read-only
 * for API roles and client users cannot edit post fields. Every write is scoped to this client and these ids.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("pillar-tag", 6, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  const { data: strat } = await actor.sb.from("strategies").select("content").eq("client_id", actor.clientId).eq("active", true).maybeSingle();
  const pillars = ((strat?.content as { pillars?: MapPillar[] } | null)?.pillars ?? []).filter((p) => p.name);
  if (!pillars.length) return json({ error: "no_strategy" }, 409);

  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const [{ data: planned }, { data: live, error: liveError }] = await Promise.all([
    actor.sb.from("posts").select("id, idea, caption, type").eq("client_id", actor.clientId).is("pillar", null).gte("created_at", since).limit(MAX),
    actor.sb.from("account_posts").select("id, caption, media_type").eq("client_id", actor.clientId).is("pillar", null).gte("published_at", since).order("published_at", { ascending: false }).limit(MAX),
  ]);
  if (liveError && ["42703", "PGRST204"].includes(liveError.code ?? "")) return json({ error: "not_set_up" }, 503);
  const items = [
    ...(planned ?? []).map((p) => ({ id: `p:${p.id}`, text: `${p.type}: ${[p.idea, p.caption].filter(Boolean).join(" / ")}`.slice(0, 500) })),
    ...(live ?? []).map((p) => ({ id: `a:${p.id}`, text: `${p.media_type ?? "post"}: ${p.caption ?? ""}`.slice(0, 500) })),
  ].slice(0, MAX);
  if (!items.length) return json({ tagged: 0 });

  const ids = new Set(items.map((i) => i.id));
  const Result = z.object({ items: z.array(z.object({ id: z.string(), pillar: z.string() })) });
  try {
    const r = await runStructured({
      client: ai.client, model: ai.learnModel, system: pillarTagSystem(pillars), tool: pillarTagTool(pillars.map((p) => p.name)), schema: Result, serverTools: [], maxSteps: 2,
      user: wrapUntrusted("posts to sort", items.map((i) => `${i.id} | ${i.text}`).join("\n"), 40_000),
    });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: "no_result" }, 502);
    const names = new Set(pillars.map((p) => p.name));
    const admin = supabaseAdmin();
    let tagged = 0;
    for (const name of names) {
      const chosen = r.data.items.filter((x) => x.pillar === name && ids.has(x.id));
      const postIds = chosen.filter((x) => x.id.startsWith("p:")).map((x) => x.id.slice(2));
      const liveIds = chosen.filter((x) => x.id.startsWith("a:")).map((x) => x.id.slice(2));
      if (postIds.length) { const { data } = await admin.from("posts").update({ pillar: name }).eq("client_id", actor.clientId).in("id", postIds).is("pillar", null).select("id"); tagged += data?.length ?? 0; }
      if (liveIds.length) { const { data } = await admin.from("account_posts").update({ pillar: name }).eq("client_id", actor.clientId).in("id", liveIds).is("pillar", null).select("id"); tagged += data?.length ?? 0; }
    }
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "strategy.pillars_tagged", entity: "client", entityId: actor.clientId, meta: { tagged } });
    return json({ tagged, remaining: items.length === MAX });
  } catch (e) {
    console.error("pillar tagging failed:", describeModelError(e));
    return json({ error: "model_error" }, 502);
  }
}
