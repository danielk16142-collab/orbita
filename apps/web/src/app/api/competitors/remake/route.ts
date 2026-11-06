import { z } from "zod";
import { buildSystemPrompt, OurVersion, REMAKE_TOOL, remakeRequest, runStructured } from "@orbita/agent";
import { cleanText, HOOK_FORMULAS } from "@orbita/content";
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

const Body = z.object({
  clientId: z.string().uuid().optional(), postId: z.string().uuid(), locale: z.enum(["en", "fr", "es"]), language: z.enum(["en", "fr", "es"]),
  /** What is said in their video, when it was not recorded with the post. */ transcript: z.string().trim().max(8000).default(""),
  notes: z.string().trim().max(500).default(""),
});

/**
 * "Make our version" in the Competitors section: our version of ONE recorded competitor post, built from that post itself
 * (hook, caption, what is said in the video). Nothing is saved here; the person compares, edits and adds it to the calendar.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const { data: w } = await actor.sb.from("competitor_posts").select("hook, caption, transcript, network, formula_id, competitors(name, url)").eq("id", body.data.postId).eq("client_id", actor.clientId).maybeSingle();
  if (!w) return json({ error: "not_found" }, 404);
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("competitor-remake", 20, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);
  const c = w.competitors as unknown as { name: string | null; url: string | null } | null;
  const their = { hook: w.hook, caption: w.caption, transcript: w.transcript || body.data.transcript || null, network: w.network, competitor: c?.name || c?.url || null,
    formula: w.formula_id != null ? HOOK_FORMULAS.find((f) => f.id === w.formula_id)?.name ?? null : null };
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)), serverTools: [], maxSteps: 2,
      tool: REMAKE_TOOL, schema: OurVersion, user: remakeRequest(their, { language: body.data.language, notes: body.data.notes }),
    });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: "no_result" }, 502);
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "competitor.post_remade", entity: "competitor_post", entityId: body.data.postId });
    const clean = (s: string) => cleanText(s, { lang: body.data.language }).text || s;
    const reel = { ...r.data.reel, hook_options: r.data.reel.hook_options.map(clean), cta: clean(r.data.reel.cta),
      scenes: r.data.reel.scenes.map((s) => ({ ...s, voiceover: clean(s.voiceover), on_screen_text: clean(s.on_screen_text) })) };
    return json({ ours: { ...r.data, reel, caption: clean(r.data.caption) } });
  } catch (e) {
    console.error("competitor remake failed:", describeModelError(e));
    return json({ error: "model_error" }, 502);
  }
}
