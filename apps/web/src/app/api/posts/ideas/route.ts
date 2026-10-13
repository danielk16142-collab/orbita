import { z } from "zod";
import { buildSystemPrompt, IDEA_FORMATS, ideasRequest, IDEAS_TOOL, NETWORKS, PostIdeas, runStructured, type PostIdea } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput, type ClientContext } from "@/lib/agent/context";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({
  clientId: z.string().uuid().optional(), format: z.enum(IDEA_FORMATS),
  networks: z.array(z.enum(NETWORKS)).min(1).max(5), locale: z.enum(["en", "fr", "es"]),
});

/** Without the model (not configured, over the cap, or it failed): ideas straight from the strategy's topic bank and the saved research. */
function fallbackIdeas(ctx: ClientContext): PostIdea[] {
  const topics = ((ctx.strategy?.content as { topics?: string[] } | undefined)?.topics ?? []).map((t) => ({ title: t, hook: "", why: "", source: "strategy" as const }));
  const research = ctx.research.filter((r) => r.kind === "idea" || r.kind === "trend").map((r) => ({ title: r.title, hook: "", why: r.summary.slice(0, 200), source: "research" as const }));
  return [...topics, ...research].slice(0, 6);
}

/** Post ideas for the "Create post" page, grounded in this client's strategy, latest plan, research and results. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const ai = await resolveModelAccess(actor);
  const fallback = () => json({ ideas: fallbackIdeas(ctx), generated: false, hasStrategy: !!ctx.strategy });
  if (!ai || !(await limiter("post-ideas", 20, 10 * 60_000).hit(actor.userId)).allowed || (await overDailyCap(actor))) return fallback();
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)),
      user: ideasRequest(body.data.format, body.data.networks), tool: IDEAS_TOOL, schema: PostIdeas, serverTools: [], maxSteps: 2,
    });
    await recordUsage(actor, r.usage);
    if (!r.ok || r.data.ideas.length === 0) return fallback();
    return json({ ideas: r.data.ideas, generated: true, hasStrategy: !!ctx.strategy });
  } catch (e) {
    console.error("post ideas failed:", describeModelError(e));
    return fallback();
  }
}
