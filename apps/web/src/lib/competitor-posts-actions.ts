"use server";
import { z } from "zod";
import { classifyHook, parseWinsText } from "@orbita/content";
import { ApifyError, fetchLatestPosts } from "@orbita/connectors";
import { scrapeTargets } from "@/lib/scrape-targets";
import { resolveAgentActor, type AgentActor } from "@/lib/agent/access";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { COMPETITOR_NETWORKS } from "@/lib/competitors";

export type WinResult = { ok: true; count?: number } | { ok: false; error: string };
const Uuid = z.string().uuid();

async function gate(clientId: string | undefined): Promise<{ actor: AgentActor } | { error: string }> {
  const a = await resolveAgentActor(clientId);
  if (!a.ok) return { error: a.status === 401 ? "unauthorized" : a.status === 403 ? "forbidden" : "not_found" };
  if (!(await limiter("competitor-posts", 60, 10 * 60_000).hit(a.actor.userId)).allowed) return { error: "rate_limited" };
  return { actor: a.actor };
}
function dbFailure(error: { code?: string; message?: string } | null, where: string): string {
  if (error) console.error(`${where} failed: code=${error.code ?? "?"} ${String(error.message ?? "").slice(0, 200)}`);
  return error && ["PGRST204", "PGRST205", "42703", "42P01"].includes(error.code ?? "") ? "not_set_up" : "forbidden";
}
/** A pasted post link: https only, tracking parameters and fragments dropped. Never fetched. */
const link = (v: string) => { try { const u = new URL(v.trim()); if (u.protocol !== "https:" || u.username || u.password) return null; u.search = ""; u.hash = ""; return u.toString().slice(0, 500); } catch { return null; } };
const count = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(9_999_999_999).nullable());

const One = z.object({
  clientId: Uuid.optional(), competitorId: Uuid, network: z.enum(COMPETITOR_NETWORKS).default("instagram"),
  hook: z.string().trim().min(1).max(300), url: z.string().trim().max(500).default(""), caption: z.string().trim().max(2200).default(""), transcript: z.string().trim().max(8000).default(""),
  views: count, likes: count, comments: count, shares: count, followers: count, postedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
});

/** Record one winning post of a competitor (the numbers as they were visible when you looked). */
export async function addCompetitorPostAction(input: unknown): Promise<WinResult> {
  const p = One.safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const url = p.data.url ? link(p.data.url) : null;
  if (p.data.url && !url) return { ok: false, error: "bad_url" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const { error } = await g.actor.sb.from("competitor_posts").insert({
    client_id: g.actor.clientId, competitor_id: p.data.competitorId, network: p.data.network, hook: p.data.hook, url, caption: p.data.caption || null, transcript: p.data.transcript || null,
    views: p.data.views, likes: p.data.likes, comments: p.data.comments, shares: p.data.shares, followers: p.data.followers, posted_at: p.data.postedAt || null,
    formula_id: classifyHook(p.data.hook)?.id ?? null, source: "manual", created_by: g.actor.userId,
  });
  if (error) return { ok: false, error: dbFailure(error, "competitor post save") };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "competitor.post_added", entity: "competitor", entityId: p.data.competitorId });
  return { ok: true, count: 1 };
}

/** Paste several posts at once: one per line as `views | likes | hook`. Returns how many were understood and saved. */
export async function addCompetitorPostsBulkAction(input: unknown): Promise<WinResult> {
  const p = z.object({ clientId: Uuid.optional(), competitorId: Uuid, network: z.enum(COMPETITOR_NETWORKS).default("instagram"), text: z.string().max(20000) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const rows = parseWinsText(p.data.text);
  if (!rows.length) return { ok: false, error: "nothing_found" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const { error } = await g.actor.sb.from("competitor_posts").insert(rows.map((r) => ({
    client_id: g.actor.clientId, competitor_id: p.data.competitorId, network: p.data.network, hook: r.hook, views: r.views, likes: r.likes,
    formula_id: classifyHook(r.hook)?.id ?? null, source: "manual", created_by: g.actor.userId,
  })));
  if (error) return { ok: false, error: dbFailure(error, "competitor posts bulk save") };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "competitor.posts_added", entity: "competitor", entityId: p.data.competitorId, meta: { count: rows.length } });
  return { ok: true, count: rows.length };
}

/** Staff only (enforced by the database). */
export async function removeCompetitorPostAction(input: unknown): Promise<WinResult> {
  const p = z.object({ clientId: Uuid.optional(), id: Uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  const { data } = await g.actor.sb.from("competitor_posts").delete().eq("id", p.data.id).eq("client_id", g.actor.clientId).select("id");
  if (!data?.length) return { ok: false, error: "forbidden" };
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "competitor.post_removed", entity: "competitor_post", entityId: p.data.id });
  return { ok: true };
}

/**
 * Fetch the latest public reels/videos of a competitor (Apify) and record them. Staff only (it costs money), rate limited, at most 30 per run.
 * The account comes from the competitor's saved profile link, never from the request. Posts already recorded (same link) are skipped.
 */
export async function fetchCompetitorPostsAction(input: unknown): Promise<WinResult & { added?: number }> {
  const p = z.object({ clientId: Uuid.optional(), competitorId: Uuid, network: z.enum(["instagram", "tiktok"]) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  if (!process.env.APIFY_TOKEN) return { ok: false, error: "no_token" };
  const g = await gate(p.data.clientId);
  if ("error" in g) return { ok: false, error: g.error };
  if (g.actor.profile.role === "client") return { ok: false, error: "forbidden" };
  if (!(await limiter("competitor-fetch", 5, 60 * 60_000).hit(g.actor.userId)).allowed) return { ok: false, error: "rate_limited" };
  const { data: c, error } = await g.actor.sb.from("competitors").select("id, url, links").eq("id", p.data.competitorId).eq("client_id", g.actor.clientId).maybeSingle();
  if (error) return { ok: false, error: dbFailure(error, "competitor read") };
  if (!c) return { ok: false, error: "not_found" };
  const username = (scrapeTargets(Array.isArray(c.links) ? (c.links as { network: string; url: string }[]) : [], c.url))[p.data.network];
  if (!username) return { ok: false, error: "no_link" };
  let posts;
  try { posts = await fetchLatestPosts(p.data.network, username); }
  catch (e) { return { ok: false, error: e instanceof ApifyError ? e.code : "provider_error" }; }
  const urls = posts.map((x) => x.url).filter((u): u is string => !!u);
  const { data: have } = urls.length ? await g.actor.sb.from("competitor_posts").select("url").eq("competitor_id", c.id).in("url", urls) : { data: [] as { url: string | null }[] };
  const known = new Set((have ?? []).map((r) => r.url));
  const fresh = posts.filter((x) => !x.url || !known.has(x.url));
  if (fresh.length) {
    const { error: insertError } = await g.actor.sb.from("competitor_posts").insert(fresh.map((x) => ({
      client_id: g.actor.clientId, competitor_id: c.id, network: p.data.network, hook: x.hook, url: x.url, caption: x.caption, views: x.views, likes: x.likes, comments: x.comments, shares: x.shares,
      followers: x.followers, posted_at: x.postedAt, formula_id: classifyHook(x.hook)?.id ?? null, source: "provider", created_by: g.actor.userId,
    })));
    if (insertError) return { ok: false, error: dbFailure(insertError, "competitor posts fetch save") };
  }
  await audit({ agencyId: g.actor.profile.agency_id, actor: g.actor.userId, action: "competitor.posts_fetched", entity: "competitor", entityId: c.id, meta: { network: p.data.network, found: posts.length, added: fresh.length } });
  return { ok: true, added: fresh.length, count: posts.length };
}
