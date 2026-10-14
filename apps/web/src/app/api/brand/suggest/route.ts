import { z } from "zod";
import { buildSystemPrompt, runStructured, SuggestedPillars, SuggestedTopics, SUGGEST_PILLARS_TOOL, SUGGEST_TOPICS_TOOL } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), kind: z.enum(["topics", "pillars"]), locale: z.enum(["en", "fr", "es"]), topics: z.array(z.string().max(60)).max(40).default([]) });

/** "Suggest": topics or pillars for this business, from its profile. Nothing is saved; the person keeps what they like. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("brand-suggest", 20, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const pillars = body.data.kind === "pillars";
  try {
    const common = { client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)), serverTools: [], maxSteps: 2 };
    const r = pillars
      ? await runStructured({ ...common, tool: SUGGEST_PILLARS_TOOL, schema: SuggestedPillars,
          user: `Suggest 3 to 5 content pillars for this business, with shares adding up to 100, a one-line angle each, and the topics each covers${body.data.topics.length ? ` (use these chosen topics: ${body.data.topics.join(", ")})` : ""}. Write in the conversation language. Call suggest_pillars once.` })
      : await runStructured({ ...common, tool: SUGGEST_TOPICS_TOOL, schema: SuggestedTopics,
          user: "Suggest 8 to 12 topics this business should talk about on social media (1 to 3 words each), marking the most important as focus. Be specific to this business. Write in the conversation language. Call suggest_topics once." });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: "no_result" }, 502);
    return json(r.data);
  } catch (e) {
    console.error("brand suggest failed:", describeModelError(e));
    return json({ error: "model_error" }, 502);
  }
}
