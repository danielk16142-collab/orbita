import { z } from "zod";
import { resolveAgentActor } from "@/lib/agent/access";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap } from "@/lib/agent/usage";
import { json, sameOrigin } from "@/lib/agent/http";
import { closeThread } from "@/lib/agent/threads";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), conversationId: z.string().uuid(), locale: z.enum(["en", "fr", "es"]) });

/** Closes one of the person's own threads (new day, or "New conversation"): last learning pass and a handover. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  if (!(await limiter("agent-close", 20, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  const ai = (await overDailyCap(actor)) ? null : await resolveModelAccess(actor);
  const r = await closeThread(actor, ai, body.data.conversationId, body.data.locale);
  if (r === "not_found") return json({ error: "not_found" }, 404);
  if (r === "closed") await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "agent.thread_closed", entity: "client", entityId: actor.clientId });
  return json({ ok: true, result: r });
}
