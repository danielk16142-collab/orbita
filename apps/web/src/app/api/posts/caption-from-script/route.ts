import { z } from "zod";
import { buildSystemPrompt, CAPTION_FROM_SCRIPT_TOOL, captionFromScriptRequest, runStructured, ScriptCaptions } from "@orbita/agent";
import { cleanText } from "@orbita/content";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const NETWORKS = ["instagram", "tiktok", "youtube", "facebook", "linkedin"] as const;
const Body = z.object({
  clientId: z.string().uuid().optional(), locale: z.enum(["en", "fr", "es"]), language: z.enum(["en", "fr", "es"]),
  format: z.string().max(20), networks: z.array(z.enum(NETWORKS)).min(1).max(5), idea: z.string().max(2000).default(""),
  script: z.string().trim().min(20).max(8000),
});

/**
 * "I already have the video": captions written from the video's script, one per network, with the brand's voice and rules.
 * Nothing is saved here; the person edits the captions and creates the post.
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
  if (!(await limiter("caption-from-script", 20, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)), serverTools: [], maxSteps: 2,
      tool: CAPTION_FROM_SCRIPT_TOOL, schema: ScriptCaptions, user: captionFromScriptRequest(body.data),
    });
    await recordUsage(actor, r.usage);
    if (!r.ok || !r.data.captions.length) return json({ error: "no_result" }, 502);
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "post.caption_from_script", entity: "client", entityId: actor.clientId, meta: { networks: body.data.networks.length } });
    // Same cleanup as every caption the agent writes: no machine fingerprint (invisible characters, long dashes, stock words).
    const captions = r.data.captions.filter((c) => body.data.networks.includes(c.network as (typeof NETWORKS)[number]))
      .map((c) => ({ ...c, caption: cleanText(c.caption, { lang: body.data.language }).text || c.caption }));
    return json({ title: r.data.title, captions });
  } catch (e) {
    console.error("caption from script failed:", describeModelError(e));
    return json({ error: "model_error" }, 502);
  }
}
