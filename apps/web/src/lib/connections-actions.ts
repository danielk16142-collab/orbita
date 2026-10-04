"use server";
import { z } from "zod";
import { createConnector, type ConnectorNetwork } from "@orbita/connectors";
import { resolveAgentActor } from "@/lib/agent/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { openTokens } from "@/lib/connectors/accounts";
import { runSync } from "@/lib/connectors/run";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export type ConnResult = { ok: true } | { ok: false; error: string };
const Input = z.object({ clientId: z.string().uuid().optional(), accountId: z.string().uuid() });

/** Same gate as the agent: signed in, MFA/terms cleared, a client the caller may access. The account must belong to that client. */
async function gate(input: unknown) {
  const p = Input.safeParse(input);
  if (!p.success) return { error: "bad_request" } as const;
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { error: a.status === 401 ? "unauthorized" : a.status === 403 ? "forbidden" : "not_found" } as const;
  const { data: acct } = await a.actor.sb.from("social_accounts").select("id, network").eq("id", p.data.accountId).eq("client_id", a.actor.clientId).maybeSingle();
  if (!acct) return { error: "not_found" } as const;
  return { actor: a.actor, accountId: acct.id as string, network: acct.network as ConnectorNetwork } as const;
}

export async function refreshAccountAction(input: unknown): Promise<ConnResult> {
  const g = await gate(input);
  if ("error" in g && g.error) return { ok: false, error: g.error };
  const ok = "actor" in g ? g : null; if (!ok) return { ok: false, error: "not_found" };
  if (!(await limiter("connector-refresh", 3, 10 * 60_000).hit(ok.accountId)).allowed) return { ok: false, error: "rate_limited" };
  const r = await runSync(ok.accountId);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "failed" };
}

/** Disconnect: ask the platform to revoke (best effort), delete our encrypted tokens and the account with its synced data. */
export async function disconnectAccountAction(input: unknown): Promise<ConnResult> {
  const g = await gate(input);
  if ("error" in g && g.error) return { ok: false, error: g.error };
  const ok = "actor" in g ? g : null; if (!ok) return { ok: false, error: "not_found" };
  const db = supabaseAdmin();
  const { data: a } = await db.from("social_accounts").select("id, client_id, network, external_id, encrypted_tokens").eq("id", ok.accountId).eq("client_id", ok.actor.clientId).maybeSingle();
  if (!a) return { ok: false, error: "not_found" };
  if (a.encrypted_tokens) {
    try { await createConnector(a.network as ConnectorNetwork)?.revoke(openTokens(a.encrypted_tokens, a.client_id, a.network, a.external_id)); } catch { /* revocation is best effort: we delete our copy regardless */ }
  }
  const { error } = await db.from("social_accounts").delete().eq("id", a.id).eq("client_id", ok.actor.clientId); // metrics, posts and runs cascade
  if (error) return { ok: false, error: "failed" };
  await audit({ agencyId: ok.actor.profile.agency_id, actor: ok.actor.userId, action: "connector.disconnected", entity: "client", entityId: ok.actor.clientId, meta: { network: a.network } });
  return { ok: true };
}
