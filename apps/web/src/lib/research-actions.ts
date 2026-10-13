"use server";
import { z } from "zod";
import { CompetitorAnalysis, RESEARCH_KINDS } from "@orbita/agent";
import { resolveAgentActor, type AgentActor } from "@/lib/agent/access";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { competitorLink, COMPETITOR_NETWORKS } from "@/lib/competitors";

export type ResearchActionResult = { ok: true; id?: string } | { ok: false; error: string };
const Uuid = z.string().uuid();
const Base = { clientId: Uuid.optional() };

async function gate(clientId: string | undefined): Promise<{ actor: AgentActor } | { error: string }> {
  const a = await resolveAgentActor(clientId);
  if (!a.ok) return { error: a.status === 401 ? "unauthorized" : a.status === 403 ? "forbidden" : "not_found" };
  if (!(await limiter("research-action", 60, 10 * 60_000).hit(a.actor.userId)).allowed) return { error: "rate_limited" };
  return { actor: a.actor };
}
/**
 * Why the database refused a write. Missing columns or tables mean a migration has not been applied (Supabase reports
 * these as PGRST204/PGRST205 or Postgres 42703/42P01); everything else is a permission refusal. The real error is logged.
 */
function dbFailure(error: { code?: string; message?: string } | null, where: string): string {
  if (error) console.error(`${where} failed: code=${error.code ?? "?"} ${String(error.message ?? "").slice(0, 200)}`);
  return error && ["PGRST204", "PGRST205", "42703", "42P01"].includes(error.code ?? "") ? "not_set_up" : "forbidden";
}
/** Drops tracking parameters (utm_*, fbclid...) and fragments from a pasted link. */
const cleanUrl = (u: string) => { try { const x = new URL(u); x.search = ""; x.hash = ""; return x.toString(); } catch { return u; } };

const https = z.string().trim().max(500).refine((u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } });
const Note = z.object({
  kind: z.enum(RESEARCH_KINDS), title: z.string().trim().min(1).max(200), summary: z.string().trim().min(1).max(2000),
  sources: z.array(z.object({ title: z.string().trim().max(200), url: https })).max(6).default([]),
});

/** Save one research finding the person chose. It becomes a research note the agent reads when planning. */
export async function saveFindingAction(input: unknown): Promise<ResearchActionResult> {
  const p = z.object({ ...Base, note: Note }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const { data, error } = await g.actor.sb.from("research_notes").insert({ client_id: g.actor.clientId, ...p.data.note, created_by: g.actor.userId }).select("id").single();
  if (error || !data) return { ok: false, error: dbFailure(error, "research save") };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "research.saved", entity: "client", entityId: g.actor.clientId });
  return { ok: true, id: data.id };
}

/** Remember a finding as a fact about the business or its market. A person chose it, so it is stored as accepted. */
export async function rememberFindingAction(input: unknown): Promise<ResearchActionResult> {
  const p = z.object({ ...Base, content: z.string().trim().min(1).max(1000) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const { data, error } = await g.actor.sb.from("brand_memories").insert({ client_id: g.actor.clientId, kind: "fact", content: p.data.content, source: "manual" }).select("id").single();
  if (error || !data) return { ok: false, error: dbFailure(error, "memory save") };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "research.remembered", entity: "client", entityId: g.actor.clientId });
  return { ok: true, id: data.id };
}

const CompetitorInput = z.object({
  ...Base, id: Uuid.optional(),
  name: z.string().trim().min(1).max(120), website: z.string().trim().max(300).default(""), notes: z.string().trim().max(1000).default(""),
  links: z.record(z.enum(COMPETITOR_NETWORKS), z.string().trim().max(300)).default({}),
});

/** Add or edit a competitor profile. Links can be profile URLs or @handles; each must be on that network's domain. */
export async function saveCompetitorAction(input: unknown): Promise<ResearchActionResult> {
  const p = CompetitorInput.safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const website = p.data.website ? (https.safeParse(p.data.website).success ? cleanUrl(p.data.website) : null) : null;
  if (p.data.website && !website) return { ok: false, error: "website" };
  const links: { network: string; url: string }[] = [];
  for (const [network, value] of Object.entries(p.data.links)) {
    if (!value) continue;
    const url = competitorLink(network as (typeof COMPETITOR_NETWORKS)[number], value);
    if (!url) return { ok: false, error: `link_${network}` };
    links.push({ network, url });
  }
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const row = { name: p.data.name, website, links, notes: p.data.notes || null, updated_at: new Date().toISOString() };
  const q = p.data.id
    ? g.actor.sb.from("competitors").update(row).eq("id", p.data.id).eq("client_id", g.actor.clientId).select("id").single()
    : g.actor.sb.from("competitors").insert({ ...row, client_id: g.actor.clientId, source: "manual" }).select("id").single();
  const { data, error } = await q;
  if (error || !data) return { ok: false, error: dbFailure(error, "competitor save") };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: p.data.id ? "competitor.updated" : "competitor.added", entity: "competitor", entityId: data.id });
  return { ok: true, id: data.id };
}

/** Staff only (enforced by the database): removes the competitor and its analyses. */
export async function removeCompetitorAction(input: unknown): Promise<ResearchActionResult> {
  const p = z.object({ ...Base, id: Uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const { data } = await g.actor.sb.from("competitors").delete().eq("id", p.data.id).eq("client_id", g.actor.clientId).select("id");
  if (!data?.length) return { ok: false, error: "forbidden" };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "competitor.removed", entity: "competitor", entityId: p.data.id });
  return { ok: true };
}

/** Turn the latest analysis into a research note, so the agent uses it when it builds or updates the strategy. */
export async function analysisToResearchAction(input: unknown): Promise<ResearchActionResult> {
  const p = z.object({ ...Base, analysisId: Uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const { data: row, error: readError } = await g.actor.sb.from("competitor_analyses").select("analysis, competitors(name, url)").eq("id", p.data.analysisId).eq("client_id", g.actor.clientId).maybeSingle();
  if (readError) return { ok: false, error: dbFailure(readError, "analysis read") };
  const a = row ? CompetitorAnalysis.safeParse(row.analysis) : null;
  if (!row || !a?.success) return { ok: false, error: "not_found" };
  const comp = row.competitors as unknown as { name: string | null; url: string | null } | null;
  const name = comp?.name ?? comp?.url ?? "Competitor";
  const parts = [a.data.summary, a.data.what_works.length ? `Works: ${a.data.what_works.join("; ")}` : "", a.data.opportunities.length ? `Where we can stand out: ${a.data.opportunities.join("; ")}` : ""];
  const { data, error } = await g.actor.sb.from("research_notes").insert({
    client_id: g.actor.clientId, kind: "competitor", title: name.slice(0, 200), summary: parts.filter(Boolean).join("\n").slice(0, 2000),
    sources: a.data.sources.slice(0, 6), created_by: g.actor.userId,
  }).select("id").single();
  if (error || !data) return { ok: false, error: dbFailure(error, "analysis to research") };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "research.saved", entity: "client", entityId: g.actor.clientId, meta: { from: "competitor" } });
  return { ok: true, id: data.id };
}
