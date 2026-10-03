import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { requestContext } from "./request-context";

/** Append an entry to the audit log. Never throws: an audit failure must not break the user's action, but it is logged. */
export async function audit(entry: { agencyId: string | null; actor: string | null; action: string; entity?: string; entityId?: string; meta?: Record<string, unknown> }) {
  try {
    const { ip } = await requestContext();
    const { error } = await supabaseAdmin().from("audit_log").insert({
      agency_id: entry.agencyId, actor: entry.actor, action: entry.action,
      entity: entry.entity ?? null, entity_id: entry.entityId ?? null, meta: entry.meta ?? {}, ip,
    });
    if (error) console.error("audit write failed", error.message);
  } catch (e) {
    console.error("audit write failed", (e as Error).message);
  }
}
