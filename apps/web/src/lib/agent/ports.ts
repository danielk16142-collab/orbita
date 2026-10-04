import "server-only";
import { briefFromRow, computeCompleteness, fetchPage, type ToolPorts } from "@orbita/agent";
import type { AgentActor } from "./access";

/**
 * Tool ports for ONE client. The client id is fixed here, on the server: no tool argument can change it.
 * All reads and writes use the signed-in user's own session, so database policies still apply to the agent.
 */
export function makePorts(actor: AgentActor, o: { conversationId: string | null; weekStart: string; userTexts?: string[] }): ToolPorts {
  const { sb, clientId, userId } = actor;
  return {
    weekStart: o.weekStart,
    userTexts: o.userTexts,
    async listSources() {
      const { data } = await sb.from("client_sources").select("kind, url, handle").eq("client_id", clientId);
      return (data ?? []) as never;
    },
    async addSource(s) {
      if (s.url) {
        const { data: existing } = await sb.from("client_sources").select("id").eq("client_id", clientId).eq("url", s.url).maybeSingle();
        if (existing) return { id: existing.id };
      } else {
        const { data: existing } = await sb.from("client_sources").select("id").eq("client_id", clientId).eq("kind", s.kind).eq("handle", s.handle!).maybeSingle();
        if (existing) return { id: existing.id };
      }
      const { data, error } = await sb.from("client_sources").insert({ client_id: clientId, kind: s.kind, url: s.url ?? null, handle: s.handle ?? null, added_by: userId }).select("id").single();
      if (error || !data) throw new Error("Could not save the source");
      return { id: data.id };
    },
    async fetchSite(url) {
      const snap = await fetchPage(url);
      await sb.from("client_sources").update({ last_audited_at: new Date().toISOString() }).eq("client_id", clientId).eq("kind", "website");
      return snap;
    },
    async saveAudit(report, pages) {
      const { data, error } = await sb.from("audits").insert({ client_id: clientId, report, pages, created_by: userId }).select("id").single();
      if (error || !data) throw new Error("Could not save the audit");
      return { id: data.id };
    },
    async getBrief() {
      const [{ data: row }, { count }] = await Promise.all([
        sb.from("brand_briefs").select("*").eq("client_id", clientId).maybeSingle(),
        sb.from("client_sources").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      ]);
      const brief = briefFromRow(row as Record<string, unknown> | null);
      const { score, missing } = computeCompleteness(brief, { hasSources: (count ?? 0) > 0 });
      return { brief, score, missing };
    },
    async createProposal(p) {
      const { data, error } = await sb.from("proposals").insert({
        client_id: clientId, conversation_id: o.conversationId, target: p.target, payload: p.payload, reason: p.reason ?? null,
      }).select("id").single();
      if (error || !data) throw new Error("Could not save the suggestion");
      return { id: data.id };
    },
  };
}
