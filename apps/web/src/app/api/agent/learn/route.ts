import { z } from "zod";
import { resolveAgentActor } from "@/lib/agent/access";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap } from "@/lib/agent/usage";
import { learnFromConversation } from "@/lib/agent/learn";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), conversationId: z.string().uuid(), locale: z.enum(["en", "fr", "es"]) });

/**
 * Reads a conversation and turns what is worth remembering into PROPOSALS. Nothing is saved until a
 * person accepts it. Uses a small, cheap model. Triggered by the UI every few messages or on request.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(parsed.data.clientId);
  if (!access.ok) return json({ error: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("agent-learn", 10, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  const { data: conv } = await actor.sb.from("conversations").select("id").eq("id", parsed.data.conversationId).eq("client_id", actor.clientId).maybeSingle();
  if (!conv) return json({ error: "not_found" }, 404);
  const { data: msgs } = await actor.sb.from("messages").select("role, content").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(40);
  const ordered = (msgs ?? []).reverse();

  let proposals = 0;
  try {
    proposals = await learnFromConversation(actor, ai, conv.id, parsed.data.locale, ordered);
  } catch (e) {
    console.error("agent learn failed:", describeModelError(e));
    return json({ error: "model_error" }, 502);
  }
  await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "agent.learn", entity: "client", entityId: actor.clientId, meta: { proposals } });
  return json({ proposals });
}
