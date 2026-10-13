import "server-only";
import type { AgentActor } from "@/lib/agent/access";

export type IdeaItem = { date: string; format: string; title: string; hook?: string; why?: string };

/** Put agent-suggested posts on the calendar as ideas, with the person's own session (so the usual post rules apply). */
export async function insertIdeas(actor: AgentActor, network: string, language: string, items: IdeaItem[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await actor.sb.from("posts").insert(items.map((it) => ({
    client_id: actor.clientId, network, language, type: it.format, status: "idea", source: "manual", created_by: actor.userId, planned_date: it.date,
    idea: [it.title, it.hook && `Hook: ${it.hook}`, it.why && `Why: ${it.why}`].filter(Boolean).join("\n\n").slice(0, 2000),
  })));
  if (error) { console.error(`adding ideas failed: code=${error.code}`); return { ok: false, error: "forbidden" }; }
  return { ok: true };
}
