import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiKeyMatches, parseApiKey } from "@orbita/security/api-key";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import type { AgentActor } from "@/lib/agent/access";
import type { Profile } from "@/lib/session";
import { agentClient } from "./agent-session";

export type ApiKeyInfo = { id: string; name: string; canPublish: boolean; agencyId: string; agentUserId: string };
export type ApiCtx = { key: ApiKeyInfo; sb: SupabaseClient; profile: Profile };

const H = { "Content-Type": "application/json", "Cache-Control": "no-store" };
export const apiJson = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: H });
export const apiError = (code: string, status: number, message?: string) => apiJson({ error: { code, message: message ?? code } }, status);

/** Who is calling: a valid, unrevoked key whose agent user is still a team member of the key's agency. */
async function authenticate(req: Request): Promise<{ ctx: ApiCtx } | { res: Response }> {
  const master = process.env.ORBITA_MASTER_KEY;
  if (!master) return { res: apiError("not_configured", 503) };
  const parsed = parseApiKey(req.headers.get("authorization"));
  if (!parsed) return { res: apiError("unauthorized", 401, "Send Authorization: Bearer <api key>.") };
  const admin = supabaseAdmin();
  const { data: k } = await admin.from("api_keys").select("id, agency_id, agent_user_id, name, key_hash, can_publish, revoked_at, last_used_at").eq("prefix", parsed.prefix).maybeSingle();
  if (!k || k.revoked_at || !apiKeyMatches(parsed.key, k.key_hash, master)) return { res: apiError("unauthorized", 401, "Unknown or revoked key.") };
  if (!(await limiter(`api:${k.id}`, 600, 10 * 60_000).hit(k.id)).allowed) return { res: apiError("rate_limited", 429, "Too many requests: 600 per 10 minutes.") };
  let sb: SupabaseClient;
  try { sb = await agentClient(k.id, k.agent_user_id); }
  catch (e) { console.error(e instanceof Error ? e.message : "agent session failed"); return { res: apiError("unavailable", 503, "Could not open a session for this key. Try again.") }; }
  const { data: profile } = await sb.from("profiles").select("user_id, agency_id, client_id, role, full_name, locale").eq("user_id", k.agent_user_id).maybeSingle();
  if (!profile || profile.agency_id !== k.agency_id || profile.role !== "team") return { res: apiError("forbidden", 403, "This key's agent is no longer a team member.") };
  if (!k.last_used_at || Date.now() - Date.parse(k.last_used_at) > 5 * 60_000) await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);
  return { ctx: { key: { id: k.id, name: k.name, canPublish: k.can_publish, agencyId: k.agency_id, agentUserId: k.agent_user_id }, sb, profile: profile as Profile } };
}

/** Audit with the agent label: every API action is recorded as "via api" with the key's name. */
export const apiAudit = (ctx: ApiCtx, action: string, extra: { entity?: string; entityId?: string; meta?: Record<string, unknown> } = {}) =>
  audit({ agencyId: ctx.key.agencyId, actor: ctx.key.agentUserId, action, entity: extra.entity, entityId: extra.entityId, meta: { via: "api", key: ctx.key.name, keyId: ctx.key.id, ...extra.meta } });

/**
 * Wrap a route: authenticate, run, and log the request (method, path, status) with the agent label. Errors never leak
 * internals. Route params are passed through.
 */
export function withApi<P>(handler: (req: Request, ctx: ApiCtx, params: P) => Promise<Response>) {
  return async (req: Request, route: { params: Promise<P> }): Promise<Response> => {
    const a = await authenticate(req);
    if ("res" in a) return a.res;
    let res: Response;
    try { res = await handler(req, a.ctx, await route.params); }
    catch (e) { console.error("api error:", e instanceof Error ? e.message : "unknown"); res = apiError("server_error", 500); }
    await apiAudit(a.ctx, "api.request", { meta: { method: req.method, path: new URL(req.url).pathname, status: res.status } });
    return res;
  };
}

/** The client as this agent sees it (row-level security decides), shaped for the agent tools. */
export async function apiActor(ctx: ApiCtx, clientId: string): Promise<AgentActor | null> {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const { data: client } = await ctx.sb.from("clients").select("id, name, languages, markets, timezone").eq("id", clientId).maybeSingle();
  if (!client) return null;
  return { sb: ctx.sb as unknown as AgentActor["sb"], userId: ctx.key.agentUserId, profile: ctx.profile, clientId: client.id, client: client as AgentActor["client"] };
}

/** Read a JSON body, or null. */
export const body = async (req: Request) => req.json().catch(() => null);
