import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveAgentActor } from "@/lib/agent/access";
import { ArchiveMemoryButton } from "@/components/agent/small-actions";

export type MemoryItem = { id: string; kind: string; content: string; createdAt: string };

/** How memories are organized: what the business prefers (and refuses), and what is simply true about it. */
export const MEMORY_GROUPS = { preferences: ["preference", "avoid", "rule"], facts: ["fact", "example"] } as const;
const PREVIEW = 2;

/** Profile reminder: only the latest two things learned, with a link to the full page. */
export async function MemoriesPreview({ memories, total, clientId, allHref }: { memories: MemoryItem[]; total: number; clientId?: string; allHref: string }) {
  const ta = await getTranslations("agent");
  const t = await getTranslations("profile");
  return (
    <section className="card">
      <div className="section-head"><h2>{ta("memories")}</h2>{total > 0 && <span className="badge">{total}</span>}</div>
      {memories.length ? (
        <>
          <p className="stat-vs">{t("latest")}</p>
          <ul className="plain mem-preview">{memories.slice(0, PREVIEW).map((m) => (
            <li key={m.id}><span className="mem-text"><strong>{ta(`memoryKinds.${m.kind}`)}</strong> {m.content}</span><ArchiveMemoryButton id={m.id} clientId={clientId} /></li>
          ))}</ul>
          <Link className="btn small ghost" href={allHref}>{t("seeAll", { count: total })}</Link>
        </>
      ) : <p className="stat-vs">{ta("noMemories")}</p>}
    </section>
  );
}

/** Everything the agent has learned, grouped into business preferences and facts, one collapsible line per item. */
export async function MemoriesView({ locale, memories, clientId }: { locale: string; memories: MemoryItem[]; clientId?: string }) {
  const ta = await getTranslations("agent");
  const t = await getTranslations("profile");
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  if (!memories.length) return <p className="empty-note">{ta("noMemories")}</p>;
  return (
    <div className="stack">
      {(Object.keys(MEMORY_GROUPS) as (keyof typeof MEMORY_GROUPS)[]).map((g) => {
        const kinds = MEMORY_GROUPS[g] as readonly string[];
        const inGroup = memories.filter((m) => kinds.includes(m.kind));
        return (
          <section key={g} className="card">
            <div className="section-head"><h2>{t(`memoryGroups.${g}`)}</h2><span className="badge">{inGroup.length}</span></div>
            <p className="stat-vs">{t(`memoryGroupHints.${g}`)}</p>
            {inGroup.length === 0 && <p className="stat-vs">{t("groupEmpty")}</p>}
            {kinds.map((k) => {
              const items = inGroup.filter((m) => m.kind === k);
              if (!items.length) return null;
              return (
                <details key={k} className="mem-group" open>
                  <summary><strong>{t(`memoryKindsPlural.${k}`)}</strong> <span className="stat-vs inline">· {items.length}</span></summary>
                  <ul className="plain mem-list">
                    {items.map((m) => (
                      <li key={m.id}>
                        <details className="mem-line">
                          <summary><span className="mem-one">{m.content}</span></summary>
                          <p className="stat-vs">{t("learnedOn", { date: date.format(new Date(m.createdAt)) })}</p>
                        </details>
                        <ArchiveMemoryButton id={m.id} clientId={clientId} />
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/** Loads all active memories through the caller's own session (RLS applies). */
export async function loadMemories(clientId?: string): Promise<{ memories: MemoryItem[]; clientId: string; staff: boolean }> {
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { sb, clientId: id, profile } = access.actor;
  const { data } = await sb.from("brand_memories").select("id, kind, content, created_at").eq("client_id", id).eq("status", "active").order("created_at", { ascending: false }).limit(1000);
  return { memories: (data ?? []).map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.created_at })), clientId: id, staff: profile.role !== "client" };
}
