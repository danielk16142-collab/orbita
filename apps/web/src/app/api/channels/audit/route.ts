import { z } from "zod";
import { buildSystemPrompt, CHANNEL_AUDIT_TOOL, ChannelAudit, channelAuditRequest, runStructured } from "@orbita/agent";
import { cleanText } from "@orbita/content";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), id: z.string().uuid(), locale: z.enum(["en", "fr", "es"]) });

/** Audit a TikTok or LinkedIn snapshot: what works, what holds it back, and recommendations. Saved on the snapshot. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const { data: row } = await actor.sb.from("channel_stats").select("id, network, summary").eq("id", body.data.id).eq("client_id", actor.clientId).maybeSingle();
  if (!row) return json({ error: "not_found" }, 404);
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("channel-audit", 10, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)), serverTools: [], maxSteps: 2,
      tool: CHANNEL_AUDIT_TOOL, schema: ChannelAudit, user: channelAuditRequest(row.network as "tiktok" | "linkedin", row.summary, body.data.locale),
    });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: "no_result" }, 502);
    const c = (s: string) => cleanText(s, { lang: body.data.locale }).text || s;
    const result = { ...r.data, verdict: c(r.data.verdict), working: r.data.working.map(c), not_working: r.data.not_working.map(c), this_week: r.data.this_week.map(c),
      recommendations: r.data.recommendations.map((x) => ({ title: c(x.title), why: c(x.why), how: c(x.how) })) };
    const { error } = await actor.sb.from("channel_stats").update({ audit: result, audited_at: new Date().toISOString() }).eq("id", row.id).eq("client_id", actor.clientId);
    if (error) console.error(`channel audit save failed: code=${error.code ?? "?"}`);
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "channel.audited", entity: "client", entityId: actor.clientId, meta: { network: row.network } });
    return json({ audit: result, saved: !error });
  } catch (e) {
    const reason = describeModelError(e);
    console.error("channel audit failed:", reason);
    return json({ error: "model_error", ...(actor.profile.role !== "client" ? { detail: reason.replace(/request=\S+/, "").slice(0, 240) } : {}) }, 502);
  }
}
