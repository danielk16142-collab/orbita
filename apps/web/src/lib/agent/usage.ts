import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentActor } from "./access";
import { dailyTokenCap } from "./model";

/** True if this client has used up today's token allowance (UTC day). Protects cost and runaway loops. */
export async function overDailyCap(actor: AgentActor): Promise<boolean> {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const { data } = await actor.sb.from("usage_events").select("quantity").eq("client_id", actor.clientId).eq("kind", "agent_tokens").gte("created_at", start.toISOString()).limit(2000);
  const used = (data ?? []).reduce((n, r) => n + Number(r.quantity), 0);
  return used >= dailyTokenCap();
}

/** usage_events is write-protected from the API: only the server records usage. */
export async function recordUsage(actor: AgentActor, tokens: number) {
  if (tokens <= 0) return;
  const { error } = await supabaseAdmin().from("usage_events").insert({ client_id: actor.clientId, kind: "agent_tokens", quantity: tokens });
  if (error) console.error("usage write failed", error.message);
}
