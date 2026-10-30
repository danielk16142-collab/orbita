"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NETWORK_LABEL } from "./shared";

type Data = { hasStrategy: boolean; title: string | null; planned: { id: string; idea: string; network: string; date: string | null; status: string }[]; series: { name: string; subject: string }[]; topics: string[] };

/** Ideas that come straight from the active strategy (no AI call): posts already planned, recurring series and the topic bank. */
export function StrategyIdeas({ clientId, format, networks, postsBase, onPick, picked }: {
  clientId?: string; format: string; networks: string[]; postsBase: string; onPick: (text: string) => void; picked: string;
}) {
  const t = useTranslations("posts");
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const key = `${clientId}|${format}|${networks.join(",")}`;
  useEffect(() => {
    let live = true;
    setData(null); setFailed(false);
    fetch("/api/posts/strategy-ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, format, networks }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (failed || !data || !data.hasStrategy) return null;
  if (!data.planned.length && !data.series.length && !data.topics.length) return null;
  return (
    <section className="post-ideas strategy-ideas" aria-labelledby="h-strategy-ideas">
      <h3 id="h-strategy-ideas">{t("strategyIdeas.title")}</h3>
      <p className="stat-vs">{t("strategyIdeas.hint", { title: data.title ?? "" })}</p>
      {data.planned.length > 0 && (
        <>
          <h4>{t("strategyIdeas.planned")}</h4>
          <ul className="plain idea-cards">
            {data.planned.map((p) => (
              <li key={p.id}>
                <Link className="idea-card" href={`${postsBase}/${p.id}`}>
                  <span className="badge">{NETWORK_LABEL[p.network] ?? p.network}{p.date ? ` · ${p.date}` : ""}</span>
                  <strong>{p.idea}</strong>
                  <span className="stat-vs">{t("strategyIdeas.openToWrite")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.series.length > 0 && (
        <>
          <h4>{t("strategyIdeas.series")}</h4>
          <ul className="plain idea-cards">
            {data.series.map((s) => { const text = `${s.name}: ${s.subject}`; return (
              <li key={s.name}><button type="button" className="idea-card" aria-pressed={picked === text} onClick={() => onPick(text)}><span className="badge">{t("strategyIdeas.seriesBadge")}</span><strong>{s.name}</strong><span className="stat-vs">{s.subject}</span></button></li>
            ); })}
          </ul>
        </>
      )}
      {data.topics.length > 0 && (
        <>
          <h4>{t("strategyIdeas.topics")}</h4>
          <ul className="plain idea-cards">
            {data.topics.map((x) => (
              <li key={x}><button type="button" className="idea-card" aria-pressed={picked === x} onClick={() => onPick(x)}><strong>{x}</strong></button></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
