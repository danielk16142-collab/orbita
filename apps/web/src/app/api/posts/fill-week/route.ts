import { z } from "zod";
import { buildSystemPrompt, fillWeekRequest, fillWeekTool, NETWORKS, runStructured, weekAhead, weekPostsSchema, type CadencePost } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { localDay } from "@/lib/cadence";
import { limiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), network: z.enum(NETWORKS), locale: z.enum(["en", "fr", "es"]) });

/** "Fill the week": the agent proposes posts for the open days of the next 7 days. Nothing is saved; the person picks. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("fill-week", 10, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  let client = (await actor.sb.from("clients").select("timezone, posting_goal").eq("id", actor.clientId).maybeSingle()).data as { timezone: string; posting_goal?: number } | null;
  if (!client) client = (await actor.sb.from("clients").select("timezone").eq("id", actor.clientId).maybeSingle()).data as { timezone: string } | null;
  const today = localDay(client?.timezone ?? "UTC");
  const { data: rows } = await actor.sb.from("posts").select("id, idea, type, network, status, planned_date").eq("client_id", actor.clientId).gte("planned_date", today).order("planned_date").limit(100);
  const planned = (rows ?? []) as CadencePost[];
  const ahead = weekAhead(planned, today, client?.posting_goal ?? 3);
  const count = Math.min(Math.max(ahead.short, 1), ahead.openDays.length);
  if (!count) return json({ error: "week_full" }, 409);

  const ctx = await loadClientContext(actor.sb, actor.clientId);
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)),
      user: fillWeekRequest(body.data.network, count, ahead.openDays, planned.map((p) => `${p.planned_date} ${p.type}: ${(p.idea ?? "").split("\n")[0].slice(0, 120)}`)),
      tool: fillWeekTool(ahead.openDays), schema: weekPostsSchema(ahead.openDays, count), serverTools: [], maxSteps: 2,
    });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: r.error === "refused" ? "refused" : "no_result" }, 502);
    return json({ posts: r.data.posts, network: body.data.network });
  } catch (e) {
    console.error("fill week failed:", describeModelError(e), `model=${ai.chatModel}`);
    return json({ error: "model_error" }, 502);
  }
}
