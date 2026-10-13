import { z } from "zod";
import { Findings, FINDINGS_TOOL, researchSystem, runStructured, wrapUntrusted } from "@orbita/agent";
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

const Body = z.object({ clientId: z.string().uuid().optional(), question: z.string().trim().min(3).max(500), locale: z.enum(["en", "fr", "es"]) });

/** Runs one research question and returns findings. Nothing is saved here: the person picks what to save or remember. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  const tools = researchTools(ai.chatModel);
  if (!tools.length) return json({ error: "no_web" }, 503);
  if (!(await limiter("research-run", 10, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: researchSystem(await businessFor(actor), body.data.locale),
      // The question is the person's own words, but it may contain pasted text: treat it as data, the system prompt says what to do.
      user: `Research question:\n${wrapUntrusted("the person's research question", body.data.question, 600)}`,
      tool: FINDINGS_TOOL, schema: Findings, serverTools: tools,
    });
    await recordUsage(actor, r.usage);
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "research.run", entity: "client", entityId: actor.clientId, meta: { ok: r.ok, tokens: r.usage, searchErrors: r.searchErrors.length } });
    if (!r.ok) return json({ error: r.searchErrors.length ? "search_failed" : r.error === "refused" ? "refused" : "no_result" }, 502);
    return json({ findings: r.data.findings, note: r.data.note, searchFailed: r.searchErrors.length > 0 && r.data.findings.length === 0 });
  } catch (e) {
    console.error("research run failed:", describeModelError(e), `model=${ai.chatModel}`);
    return json({ error: "model_error" }, 502);
  }
}
