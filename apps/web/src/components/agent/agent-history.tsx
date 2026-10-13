import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import { parseStoredSummary } from "@orbita/agent";
import type { AgentActor } from "@/lib/agent/access";
import { localDay } from "@/lib/cadence";

/** Past conversations: one line per day's thread with its handover; open one to read it (read only). */
export async function AgentHistory({ actor, locale, thread, hrefFor }: {
  actor: AgentActor; locale: string; thread?: string; hrefFor: (thread?: string) => string;
}) {
  const t = await getTranslations("agent");
  const tz = actor.client.timezone ?? "UTC";
  const dayF = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const label = (iso: string) => dayF.format(new Date(`${localDay(tz, new Date(iso))}T00:00:00Z`));

  if (thread && /^[0-9a-f-]{36}$/i.test(thread)) {
    const { data: conv } = await actor.sb.from("conversations").select("id, created_at, summary").eq("id", thread).eq("client_id", actor.clientId).eq("created_by", actor.userId).neq("kind", "post").maybeSingle();
    if (conv) {
      const { data: msgs } = await actor.sb.from("messages").select("role, content").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at").limit(300);
      const s = parseStoredSummary(conv.summary);
      return (
        <section className="card agent-history">
          <p><Link href={hrefFor()}>← {t("threads.back")}</Link></p>
          <h2>{label(conv.created_at)}</h2>
          {s && <div className="handover"><p><strong>{s.title || t("threads.handover")}</strong> {s.summary}</p>{s.open.length > 0 && <><p className="eyebrow">{t("threads.open")}</p><ul>{s.open.map((o, i) => <li key={i}>{o}</li>)}</ul></>}</div>}
          <div className="agent-log readonly">
            {(msgs ?? []).map((m, i) => {
              const text = String((m.content as { text?: string }).text ?? "");
              return text ? <div key={i} className={`agent-msg ${m.role}`}><span className="eyebrow">{m.role === "user" ? t("you") : t("assistant")}</span>
                {m.role === "assistant" ? <ReactMarkdown disallowedElements={["img"]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}>{text}</ReactMarkdown> : <p>{text}</p>}</div> : null;
            })}
          </div>
        </section>
      );
    }
  }

  const { data: convs } = await actor.sb.from("conversations").select("id, created_at, summary").eq("client_id", actor.clientId).eq("created_by", actor.userId).neq("kind", "post").order("created_at", { ascending: false }).limit(60);
  return (
    <section className="card agent-history">
      <h2>{t("threads.pastTitle")}</h2>
      <p className="stat-vs">{t("threads.pastIntro")}</p>
      {!convs?.length && <p>{t("threads.none")}</p>}
      <ul className="plain thread-list">
        {(convs ?? []).map((c) => {
          const s = parseStoredSummary(c.summary);
          return (
            <li key={c.id} className="thread-item">
              <Link href={hrefFor(c.id)}><strong>{label(c.created_at)}</strong></Link>
              <span className="thread-text">{s ? <>{s.title && <strong>{s.title}. </strong>}{s.summary}{s.open.length > 0 && <span className="stat-vs"> · {t("threads.openCount", { count: s.open.length })}</span>}</>
                : <span className="stat-vs">{c.summary === null ? t("threads.inProgress") : t("threads.noHandover")}</span>}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
