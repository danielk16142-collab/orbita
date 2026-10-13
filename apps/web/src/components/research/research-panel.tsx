import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveAgentActor } from "@/lib/agent/access";
import { DeleteResearchButton } from "@/components/agent/small-actions";
import { ResearchRunner } from "./research-runner";

export type SavedNote = { id: string; kind: string; title: string; summary: string; sources: { title: string; url: string }[]; created_at: string };

/** Research section: ask a question at the top; everything saved so far below, grouped by kind. */
export async function ResearchPanel({ locale, clientId }: { locale: string; clientId?: string }) {
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { sb, clientId: id, profile } = access.actor;
  const { data } = await sb.from("research_notes").select("id, kind, title, summary, sources, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(200);
  return <ResearchView locale={locale} clientId={profile.role === "client" ? undefined : id} notes={(data ?? []) as SavedNote[]} />;
}

export async function ResearchView({ locale, clientId, notes }: { locale: string; clientId?: string; notes: SavedNote[] }) {
  const t = await getTranslations("research");
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const kinds = ["trend", "audience", "competitor", "idea"].filter((k) => notes.some((n) => n.kind === k));
  return (
    <div className="stack">
      <ResearchRunner locale={locale} clientId={clientId} />
      <section className="card">
        <div className="section-head"><h2>{t("savedTitle")}</h2>{notes.length > 0 && <span className="badge">{notes.length}</span>}</div>
        <p className="stat-vs">{t("savedHint")}</p>
        {notes.length === 0 && <p className="empty-note">{t("noneSaved")}</p>}
        {kinds.map((k) => (
          <details key={k} className="mem-group" open>
            <summary><strong>{t(`kindsPlural.${k}`)}</strong> <span className="stat-vs inline">· {notes.filter((n) => n.kind === k).length}</span></summary>
            <ul className="plain mem-list">
              {notes.filter((n) => n.kind === k).map((n) => (
                <li key={n.id}>
                  <details className="mem-line">
                    <summary><span className="mem-one">{n.title}</span></summary>
                    <p className="pre note-body">{n.summary}</p>
                    {n.sources.length > 0 && <p className="sources">{n.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title || s.url}</a>)}</p>}
                    <p className="stat-vs">{t("savedOn", { date: date.format(new Date(n.created_at)) })}</p>
                  </details>
                  <DeleteResearchButton id={n.id} clientId={clientId} />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}
