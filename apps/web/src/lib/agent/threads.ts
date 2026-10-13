import "server-only";
import { formatSummary, runStructured, summarySystem, SUMMARY_TOOL, ThreadSummary, wrapUntrusted } from "@orbita/agent";
import type { AgentActor } from "./access";
import type { ModelAccess } from "./model";
import { learnFromConversation, turnText } from "./learn";
import { recordUsage } from "./usage";
import { localDay } from "@/lib/cadence";

/**
 * Daily threads. Each person has one agent conversation per client per day (in the client's timezone). When a new day
 * starts (or the person asks for a new conversation) the old one is closed: a last learning pass, then a short handover
 * stored in conversations.summary. A non-null summary marks a thread as closed. The latest handovers go into the next
 * threads' system prompt.
 */
export type Thread = { id: string; createdAt: string; summary: string | null; lastAt: string };

export async function latestThread(actor: AgentActor): Promise<Thread | null> {
  const { data: conv } = await actor.sb.from("conversations").select("id, created_at, summary").eq("client_id", actor.clientId).eq("created_by", actor.userId)
    .neq("kind", "post").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv) return null;
  const { data: last } = await actor.sb.from("messages").select("created_at").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { id: conv.id, createdAt: conv.created_at, summary: conv.summary, lastAt: last?.created_at ?? conv.created_at };
}

/** A thread is continued only on the day it was last used, and only while it is open. */
export const isCurrent = (t: Thread, timezone: string, now = new Date()) => t.summary === null && localDay(timezone, new Date(t.lastAt)) === localDay(timezone, now);

/** The latest handovers of this person's earlier threads with this client, oldest first. */
export async function recentHandovers(actor: AgentActor, excludeId: string | null, n = 3): Promise<{ date: string; summary: string }[]> {
  let q = actor.sb.from("conversations").select("id, created_at, summary").eq("client_id", actor.clientId).eq("created_by", actor.userId)
    .neq("kind", "post").not("summary", "is", null).neq("summary", "").order("created_at", { ascending: false }).limit(n);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return (data ?? []).reverse().map((c) => ({ date: localDay(actor.client.timezone ?? "UTC", new Date(c.created_at)), summary: c.summary as string }));
}

/** Close a thread: learn from it one last time, write the handover. Without the model, it is closed with no handover. */
export async function closeThread(actor: AgentActor, ai: ModelAccess | null, conversationId: string, locale: "en" | "fr" | "es"): Promise<"closed" | "already" | "not_found"> {
  const { data: conv } = await actor.sb.from("conversations").select("id, summary").eq("id", conversationId).eq("client_id", actor.clientId).eq("created_by", actor.userId).neq("kind", "post").maybeSingle();
  if (!conv) return "not_found";
  if (conv.summary !== null) return "already";
  const { data: msgs } = await actor.sb.from("messages").select("role, content").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(80);
  const ordered = (msgs ?? []).reverse();
  let stored = "";
  if (ai && ordered.some((m) => m.role === "user")) {
    try { await learnFromConversation(actor, ai, conv.id, locale, ordered.slice(-40)); } catch (e) { console.error("closing learn failed:", e instanceof Error ? e.message : "unknown"); }
    try {
      const transcript = ordered.map((m) => `${m.role === "user" ? "PERSON" : "ASSISTANT"}: ${turnText(m).slice(0, 2000)}`).join("\n\n");
      const r = await runStructured({ client: ai.client, model: ai.learnModel, system: summarySystem(locale), user: wrapUntrusted("conversation", transcript, 40_000), tool: SUMMARY_TOOL, schema: ThreadSummary, serverTools: [], maxSteps: 2 });
      await recordUsage(actor, r.usage);
      if (r.ok) stored = formatSummary(r.data);
    } catch (e) { console.error("handover failed:", e instanceof Error ? e.message : "unknown"); }
  }
  // Only the first close writes (two tabs may race).
  await actor.sb.from("conversations").update({ summary: stored }).eq("id", conv.id).is("summary", null);
  return "closed";
}
