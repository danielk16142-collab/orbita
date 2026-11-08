import { z } from "zod";
import { briefFromRow, computeCompleteness, fetchPage, FIRST_AUDIT_TOOL, FirstAudit, firstAuditBriefOps, firstAuditRequest, firstAuditSystem, pagesToRead, runStructured, type SiteSnapshot } from "@orbita/agent";
import { checkBrandColor } from "@orbita/security";
import { resolveAgentActor } from "@/lib/agent/access";
import { researchTools, resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), locale: z.enum(["en", "fr", "es"]) });

/**
 * The first audit of a business: read its website (homepage and up to 3 key pages), take its brand colours, have the agent
 * write what it learned (only where the brand profile is still empty), the audit and the questions for the owner.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(body.data.clientId);
  if (!access.ok) return json({ error: "not_found" }, access.status);
  const actor = access.actor;
  const { sb, clientId } = actor;
  const { data: sources } = await sb.from("client_sources").select("kind, url, handle").eq("client_id", clientId);
  const website = (sources ?? []).find((s) => s.kind === "website" && s.url)?.url ?? null;
  const socials = (sources ?? []).filter((s) => s.kind !== "website");
  if (!website && !socials.length) return json({ error: "no_sources" }, 400);
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("first-audit", 6, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  // 1. The website: homepage, then about / services / pricing / contact.
  const pages: SiteSnapshot[] = []; const pageErrors: string[] = [];
  if (website) {
    try {
      const home = await fetchPage(website); pages.push(home);
      for (const u of pagesToRead(home)) { try { pages.push(await fetchPage(u)); } catch (e) { pageErrors.push(`${u}: ${e instanceof Error ? e.message : "error"}`); } }
    } catch (e) { pageErrors.push(`${website}: ${e instanceof Error ? e.message : "error"}`); }
    await sb.from("client_sources").update({ last_audited_at: new Date().toISOString() }).eq("client_id", clientId).eq("kind", "website");
  }

  // 2. Brand colours: the site's two most used readable colours, saved only if none are set yet.
  const colors = (pages[0]?.colors ?? []).filter((c) => checkBrandColor(c) === null);
  let colorsSaved = false;
  if (colors.length) {
    const { data: c } = await sb.from("clients").select("primary_color, accent_color").eq("id", clientId).maybeSingle();
    if (c && !c.primary_color && !c.accent_color) {
      const { data } = await sb.from("clients").update({ primary_color: colors[0], accent_color: colors[1] ?? colors[0] }).eq("id", clientId).select("id");
      colorsSaved = !!data?.length; // a client whose branding is locked updates nothing
    }
  }

  // 3. What the agent learns, the audit and its questions.
  try {
    const r = await runStructured({
      client: ai.client, model: ai.chatModel, system: firstAuditSystem(body.data.locale), serverTools: researchTools(ai.chatModel, { fetch: false }), maxSteps: 6,
      tool: FIRST_AUDIT_TOOL, schema: FirstAudit,
      user: firstAuditRequest({ name: actor.client.name, markets: actor.client.markets, languages: actor.client.languages, pages, socials, pageErrors }),
    });
    await recordUsage(actor, r.usage);
    if (!r.ok) return json({ error: r.error === "refused" ? "refused" : "no_result" }, 502);
    const a = r.data;

    // 4. Fill only the empty parts of the brand profile, then save the audit (its questions are what the agent asks first).
    const { data: row } = await sb.from("brand_briefs").select("*").eq("client_id", clientId).maybeSingle();
    const ops = firstAuditBriefOps(briefFromRow(row as Record<string, unknown> | null), a);
    if (ops.length) {
      const patch = Object.fromEntries(ops.map((o) => [o.column, o.value]));
      const merged = { ...(row ?? {}), ...patch };
      const { score } = computeCompleteness(briefFromRow(merged), { hasSources: true });
      const { error } = row
        ? await sb.from("brand_briefs").update({ ...patch, version: ((row.version as number) ?? 1) + 1, completeness: score, updated_at: new Date().toISOString() }).eq("client_id", clientId)
        : await sb.from("brand_briefs").insert({ client_id: clientId, ...patch, completeness: score });
      if (error) console.error(`first audit brief save failed: code=${error.code ?? "?"}`);
    }
    const report = { summary: a.summary, strengths: a.strengths, weaknesses: a.weaknesses, opportunities: a.opportunities, social_notes: a.social_notes, missing_info: a.questions };
    const { error: auditError } = await sb.from("audits").insert({ client_id: clientId, report, pages: pages.map((p) => ({ url: p.url, title: p.title })), created_by: actor.userId });
    if (auditError) { console.error(`first audit save failed: code=${auditError.code ?? "?"}`); return json({ error: "save_failed" }, 500); }
    await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "client.first_audit", entity: "client", entityId: clientId, meta: { pages: pages.length, filled: ops.length, colors: colorsSaved } });
    return json({ summary: a.summary, filled: ops.map((o) => o.section), colors: colorsSaved ? colors.slice(0, 2) : [], questions: a.questions, pages: pages.length, pageErrors: pageErrors.length });
  } catch (e) {
    const reason = describeModelError(e);
    console.error("first audit failed:", reason);
    return json({ error: "model_error", ...(actor.profile.role !== "client" ? { detail: reason.replace(/request=\S+/, "").slice(0, 240) } : {}) }, 502);
  }
}
