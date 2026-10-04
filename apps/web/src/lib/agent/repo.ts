import "server-only";
import { briefFromRow, computeCompleteness, type Op, type ProposalRepo } from "@orbita/agent";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentActor } from "./access";

/** Proposal persistence using the signed-in user's own session. Every query is pinned to the actor's client. */
export function supabaseProposalRepo(actor: AgentActor): ProposalRepo {
  const { sb, clientId, userId } = actor;
  return {
    async get(id) {
      const { data } = await sb.from("proposals").select("id, client_id, target, payload, status").eq("id", id).eq("client_id", clientId).maybeSingle();
      return (data as never) ?? null;
    },
    async claim(id, status) {
      // Only a PENDING proposal can be claimed; the database trigger stamps decided_by/decided_at.
      const { data, error } = await sb.from("proposals").update({ status }).eq("id", id).eq("client_id", clientId).eq("status", "pending").select("id");
      return !error && (data?.length ?? 0) > 0;
    },
    async release(id) {
      // Decided proposals are immutable for users; only the server may put one back.
      await supabaseAdmin().from("proposals").update({ status: "pending", decided_by: null, decided_at: null }).eq("id", id).eq("client_id", clientId);
    },
    async apply(cid, _target, ops: Op[]) {
      if (cid !== clientId) throw new Error("client mismatch");
      const inserts = new Map<string, Record<string, unknown>[]>();
      for (const op of ops) {
        if (op.op === "brief_set") {
          const { data: row } = await sb.from("brand_briefs").select("*").eq("client_id", clientId).maybeSingle();
          const { count } = await sb.from("client_sources").select("id", { count: "exact", head: true }).eq("client_id", clientId);
          const merged = { ...(row ?? {}), [op.column]: op.value };
          const { score } = computeCompleteness(briefFromRow(merged), { hasSources: (count ?? 0) > 0 });
          const { error } = row
            ? await sb.from("brand_briefs").update({ [op.column]: op.value, version: ((row.version as number) ?? 1) + 1, completeness: score, updated_at: new Date().toISOString() }).eq("client_id", clientId)
            : await sb.from("brand_briefs").insert({ client_id: clientId, [op.column]: op.value, completeness: score });
          if (error) throw new Error("brief update failed");
        } else {
          const extra = op.table === "posts" ? { created_by: userId } : {};
          inserts.set(op.table, [...(inserts.get(op.table) ?? []), { ...op.row, ...extra, client_id: clientId }]);
        }
      }
      for (const [table, rows] of inserts) {
        const { error } = await sb.from(table).insert(rows as never);
        if (error) throw new Error(`${table} insert failed`);
      }
    },
    async feedback(f) {
      await sb.from("generation_feedback").insert({ ...f, created_by: userId } as never);
    },
  };
}
