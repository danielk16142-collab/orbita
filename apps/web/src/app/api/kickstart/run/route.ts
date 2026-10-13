import { z } from "zod";
import { addDays, buildSystemPrompt, Kickstart, kickstartRequest, KICKSTART_TOOL, runStructured } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { localDay } from "@/lib/cadence";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), accountId: z.string().uuid(), locale: z.enum(["en", "fr", "es"]) });
const MISSING = ["PGRST204", "PGRST205", "42703", "42P01"];

/** Builds (or rebuilds) the kickstart plan for one connected account and saves it as "ready" for the person to accept. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const { data: account } = await actor.sb.from("social_accounts").select("id, network, handle").eq("id", body.data.accountId).eq("client_id", actor.clientId).maybeSingle();
  if (!account) return json({ error: "not_found" }, 404);
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("kickstart-run", 5, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const { data: client } = await actor.sb.from("clients").select("timezone").eq("id", actor.clientId).maybeSingle();
  const startDate = addDays(localDay(client?.timezone ?? "UTC"), 1);
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: buildSystemPrompt(promptInput(actor, ctx, body.data.locale)),
      user: kickstartRequest(account.network, account.handle, startDate), tool: KICKSTART_TOOL, schema: Kickstart, serverTools: [], maxSteps: 2,
    });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: r.error === "refused" ? "refused" : "no_result" }, 502);
    const { error } = await actor.sb.from("kickstarts").upsert({
      client_id: actor.clientId, account_id: account.id, network: account.network, plan: r.data, start_date: startDate, status: "ready", decided_at: null,
    }, { onConflict: "account_id" });
    if (error) { console.error(`kickstart save failed: code=${error.code}`); return json({ error: MISSING.includes(error.code ?? "") ? "not_set_up" : "forbidden" }, MISSING.includes(error.code ?? "") ? 503 : 403); }
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "kickstart.built", entity: "client", entityId: actor.clientId, meta: { network: account.network, tokens: r.usage } });
    return json({ ok: true });
  } catch (e) {
    console.error("kickstart failed:", describeModelError(e), `model=${ai.chatModel}`);
    return json({ error: "model_error" }, 502);
  }
}
