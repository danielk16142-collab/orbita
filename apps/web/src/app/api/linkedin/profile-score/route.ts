import { z } from "zod";
import { buildSystemPrompt, combineProfileScore, LinkedInProfileInput, PROFILE_SCORE_TOOL, profileScoreRequest, ProfileScoreResult, runStructured } from "@orbita/agent";
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

const Body = z.object({ clientId: z.string().uuid().optional(), locale: z.enum(["en", "fr", "es"]), language: z.enum(["en", "fr", "es"]), profile: LinkedInProfileInput });

/**
 * LinkedIn profile score (li-profile rubric): the person pastes the profile, the agent scores the written parts and rewrites
 * them; photo, activity, contact and recommendations are scored from the person's answers. Nothing is saved or sent to LinkedIn.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const p = body.data.profile;
  if (!p.headline && !p.about && !p.currentRole) return json({ error: "empty" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("li-profile-score", 15, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)), serverTools: [], maxSteps: 2,
      tool: PROFILE_SCORE_TOOL, schema: ProfileScoreResult, user: profileScoreRequest(p, body.data.language),
    });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: "no_result" }, 502);
    const clean = (s: string) => cleanText(s, { lang: body.data.language }).text || s;
    const w = r.data.rewrites;
    const rewrites = { ...w, headline_options: w.headline_options.map(clean), about_open: clean(w.about_open), about_body: clean(w.about_body), current_role: clean(w.current_role), featured: w.featured.map(clean), banner: clean(w.banner) };
    const score = combineProfileScore(p, r.data);
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "linkedin.profile_scored", entity: "client", entityId: actor.clientId, meta: { total: score.total } });
    return json({ score, rewrites, stillNeeds: r.data.still_needs });
  } catch (e) {
    console.error("linkedin profile score failed:", describeModelError(e));
    return json({ error: "model_error" }, 502);
  }
}
