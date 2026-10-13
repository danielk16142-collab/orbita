"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buildStrategyGraph, chainOf, GRAPH_COLUMNS, matchPillar, type GraphNode, type MapPost } from "@orbita/agent/strategy-map";
import { NETWORK_COLOR, NETWORK_LABEL } from "@/components/posts/shared";
import type { StrategyMapData } from "@/lib/strategy-map";

const PILLAR_COLOR = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--brand)"];
type Path = { d: string; kind: string; loose: boolean; on: boolean };

/**
 * Strategy mind map: Business → Goals → Audience → Pillars → Series, with lines that mean something (a pillar serves a
 * goal, speaks to a persona, holds a series). Clicking a node lights up its chain and opens the details beside it.
 */
export function StrategyMindMap({ data, locale, clientId, postsBase, newPostHref }: {
  data: StrategyMapData; locale: string; clientId?: string; postsBase: string; newPostHref: string;
}) {
  const t = useTranslations("strategyMap");
  const tp = useTranslations("posts");
  const router = useRouter();
  const c = data.strategy?.content ?? {};
  const pillars = useMemo(() => (c.pillars ?? []).filter((p) => p.name), [c.pillars]);
  const graph = useMemo(() => buildStrategyGraph({
    businessName: data.business.name, business: data.business.business, offers: data.business.offers, objectives: c.objectives ?? [], personas: data.business.personas,
    pillars, series: c.series ?? [], links: c.links, posts: data.posts, month: data.month,
  }), [data, c, pillars]);
  const [sel, setSel] = useState<string | null>(null);
  const chain = useMemo(() => (sel ? chainOf(sel, graph.edges) : null), [sel, graph.edges]);
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const box = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const color = (name: string) => PILLAR_COLOR[Math.max(0, pillars.findIndex((p) => p.name === name)) % PILLAR_COLOR.length];
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const nf = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const dayF = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const fmt = (f: string) => (tp.has(`formatCards.${f}.title`) ? tp(`formatCards.${f}.title`) : f);
  const createHref = (q: Record<string, string>) => `${newPostHref}${newPostHref.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`;

  // Lines between node edges (right side of the source, left side of the target), redrawn on resize.
  const draw = useCallback(() => {
    const root = box.current; if (!root) return;
    const r = root.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    if (window.matchMedia("(max-width: 760px)").matches) { setPaths([]); return; }
    const out: Path[] = [];
    for (const e of graph.edges) {
      const a = els.current.get(e.from)?.getBoundingClientRect(), b = els.current.get(e.to)?.getBoundingClientRect();
      if (!a || !b) continue;
      const x1 = a.right - r.left, y1 = a.top + a.height / 2 - r.top, x2 = b.left - r.left, y2 = b.top + b.height / 2 - r.top;
      const mx = (x1 + x2) / 2;
      out.push({ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, kind: e.kind, loose: !!e.loose, on: !chain || (chain.has(e.from) && chain.has(e.to)) });
    }
    setPaths(out);
  }, [graph.edges, chain]);
  useLayoutEffect(() => { draw(); }, [draw]);
  useEffect(() => { const ro = new ResizeObserver(() => draw()); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, [draw]);

  function connect() {
    setNote(null);
    start(async () => {
      const res = await fetch("/api/strategy/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, locale }) }).catch(() => null);
      const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      if (res?.ok) { setNote(t("connected")); router.refresh(); } else setNote(body?.error && t.has(`errors.${body.error}`) ? t(`errors.${body.error}`) : t("errors.generic"));
    });
  }

  const node = (n: GraphNode) => {
    const dim = chain && !chain.has(n.id);
    const pillarColor = n.column === "pillar" ? color(n.label) : undefined;
    return (
      <button key={n.id} type="button" ref={(el) => { if (el) els.current.set(n.id, el); else els.current.delete(n.id); }}
        className={`mm-node mm-${n.column}${dim ? " dim" : ""}${sel === n.id ? " on" : ""}${n.warn ? ` warn-${n.warn}` : ""}`}
        style={pillarColor ? { ["--pillar" as string]: pillarColor } : undefined} onClick={() => setSel(sel === n.id ? null : n.id)} aria-pressed={sel === n.id}>
        {n.column === "pillar" && <span className="mm-share">{n.share}%</span>}
        <span className="mm-label">{n.label}</span>
        {n.column === "persona" && n.pains && n.pains.length > 0 && <span className="mm-pains">{n.pains.map((p, i) => <span key={i}>“{p}”</span>)}</span>}
        {n.column === "pillar" && n.stats && (
          <span className="mm-stats">{t("mm.planned", { count: n.stats.planned })} · {t("mm.published", { count: n.stats.published })}{n.stats.avgRate !== null ? ` · ${pf.format(n.stats.avgRate)}` : ""}</span>
        )}
        {n.warn && <span className="mm-warn">{t(`mm.warn.${n.warn}`)}</span>}
      </button>
    );
  };

  const selected = graph.nodes.find((n) => n.id === sel) ?? null;
  const postsOf = (pillar: string) => data.posts.filter((p) => matchPillar(p.pillar, pillars) === pillar && p.date.startsWith(data.month)).sort((a, b) => a.date.localeCompare(b.date));
  const linkedTo = (id: string, col: string) => graph.nodes.filter((n) => n.column === col && graph.edges.some((e) => (e.from === id && e.to === n.id) || (e.to === id && e.from === n.id)) && !graph.edges.find((e) => ((e.from === id && e.to === n.id) || (e.to === id && e.from === n.id)) && e.loose));
  const postRow = (p: MapPost) => (
    <li key={`${p.kind}${p.id}`} className="mm-post">
      <span className="kickstart-when">{dayF.format(new Date(`${p.date}T00:00:00Z`))}</span>
      <span className="kickstart-body">
        <span className="badge"><span className="net-dot small" style={{ background: NETWORK_COLOR[p.network] }} aria-hidden="true" />{fmt(p.format)}</span>{" "}
        {p.kind === "live" ? (p.permalink ? <a href={p.permalink} target="_blank" rel="noopener noreferrer nofollow">{p.title || fmt(p.format)}</a> : p.title) : <Link href={`${postsBase}/${p.id}`}>{p.title || fmt(p.format)}</Link>}
        {p.kind === "live" && <small>✓ {t("legendLive")}{p.views ? ` · ${nf.format(p.views)} ${t("m.views").toLowerCase()}` : ""}{typeof p.rate === "number" ? ` · ${pf.format(p.rate)}` : ""}</small>}
      </span>
    </li>
  );

  return (
    <div className="mind-map">
      <div className="section-head">
        <p className="stat-vs">{graph.linked ? t("mm.intro") : t("mm.introLoose")}</p>
        <button type="button" className={`btn small${graph.linked ? " ghost" : ""}`} onClick={connect} disabled={busy}>{busy ? t("mm.connecting") : graph.linked ? t("mm.reconnect") : t("mm.connect")}</button>
      </div>
      {note && <p className="stat-vs" role="status">{note}</p>}

      <div className="mm-board" ref={box}>
        <svg className="mm-lines" width={size.w} height={size.h} aria-hidden="true">
          {paths.map((p, i) => <path key={i} d={p.d} className={`mm-line ${p.kind}${p.loose ? " loose" : ""}${p.on ? "" : " off"}`} />)}
        </svg>
        {GRAPH_COLUMNS.map((col) => {
          const nodes = graph.nodes.filter((n) => n.column === col);
          return (
            <div key={col} className={`mm-col mm-col-${col}`}>
              <p className="eyebrow mm-colhead">{t(`mm.col.${col}`)}</p>
              {nodes.length ? nodes.map(node) : <p className="mm-empty">{t(`mm.empty.${col}`)}</p>}
            </div>
          );
        })}
      </div>
      <p className="map-legend" aria-hidden="true"><span className="mm-key serves" /> {t("mm.key.serves")} · <span className="mm-key speaks" /> {t("mm.key.speaks")} · <span className="mm-key contains" /> {t("mm.key.contains")}{!graph.linked && <> · <span className="mm-key loose" /> {t("mm.key.loose")}</>}</p>

      {selected && <div className="map-scrim" onClick={() => setSel(null)} aria-hidden="true" />}
      <aside className={`map-drawer${selected ? " open" : ""}`} aria-hidden={!selected} aria-label={t("details")}>
        {selected && (
          <div className="stack">
            <button type="button" className="btn ghost small map-close" onClick={() => setSel(null)}>✕ {t("close")}</button>
            <p className="eyebrow">{t(`mm.col.${selected.column}`)}</p>
            <h3>{selected.column === "pillar" && <span className="map-swatch" style={{ background: color(selected.label) }} aria-hidden="true" />} {selected.label}</h3>
            {selected.detail && <p className="mm-detail">{selected.detail}</p>}
            {selected.warn && <p className="error">{t(`mm.warnLong.${selected.warn}`)}</p>}

            {selected.column === "business" && (
              <dl className="map-metrics">
                <div><dt>{t("kpi.followers")}</dt><dd>{data.kpis.followers === null ? "—" : nf.format(data.kpis.followers)}</dd></div>
                <div><dt>{t("kpi.engagement")}</dt><dd>{data.kpis.engagement === null ? "—" : pf.format(data.kpis.engagement)}</dd></div>
                <div><dt>{t("mm.col.goal")}</dt><dd>{(c.objectives ?? []).length}</dd></div>
                <div><dt>{t("mm.col.pillar")}</dt><dd>{pillars.length}</dd></div>
              </dl>
            )}
            {selected.column === "goal" && (
              <>
                <h4>{t("mm.servedBy")}</h4>
                <div className="mm-related">{linkedTo(selected.id, "pillar").map((n) => <button key={n.id} type="button" className="badge" onClick={() => setSel(n.id)}>{n.label}</button>)}{!linkedTo(selected.id, "pillar").length && <span className="stat-vs">{t("mm.notLinked")}</span>}</div>
                {c.rationale && <><h4>{t("why")}</h4><p>{c.rationale}</p></>}
              </>
            )}
            {selected.column === "persona" && (
              <>
                {selected.pains && selected.pains.length > 0 && <><h4>{t("mm.solving")}</h4><ul>{selected.pains.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
                <h4>{t("mm.talkingToThem")}</h4>
                <div className="mm-related">{linkedTo(selected.id, "pillar").map((n) => <button key={n.id} type="button" className="badge" onClick={() => setSel(n.id)}>{n.label}</button>)}{!linkedTo(selected.id, "pillar").length && <span className="stat-vs">{t("mm.notLinked")}</span>}</div>
              </>
            )}
            {selected.column === "pillar" && (() => {
              const posts = postsOf(selected.label);
              const goals = linkedTo(selected.id, "goal"), personas = linkedTo(selected.id, "persona"), series = linkedTo(selected.id, "series");
              const unused = (c.topics ?? []).filter((tp) => !data.posts.some((p) => p.title.toLowerCase().includes(tp.toLowerCase().slice(0, 30)))).slice(0, 5);
              return (
                <>
                  <p className="stat-vs">{t("mm.shareLine", { share: selected.share ?? 0, planned: selected.stats?.planned ?? 0, published: selected.stats?.published ?? 0 })}{selected.stats?.avgRate != null ? ` · ${t("avgEngagement")} ${pf.format(selected.stats.avgRate)}` : ""}</p>
                  {goals.length > 0 && <><h4>{t("mm.serves")}</h4><div className="mm-related">{goals.map((n) => <button key={n.id} type="button" className="badge" onClick={() => setSel(n.id)}>{n.label}</button>)}</div></>}
                  {personas.length > 0 && <><h4>{t("mm.forWho")}</h4><div className="mm-related">{personas.map((n) => <button key={n.id} type="button" className="badge" onClick={() => setSel(n.id)}>{n.label}</button>)}</div></>}
                  {series.length > 0 && <><h4>{t("mm.col.series")}</h4><div className="mm-related">{series.map((n) => <button key={n.id} type="button" className="badge" onClick={() => setSel(n.id)}>{n.label}</button>)}</div></>}
                  <h4>{t("pillarPosts", { count: posts.length })}</h4>
                  {posts.length ? <ul className="plain mm-posts">{posts.map(postRow)}</ul> : <p className="stat-vs">{t("mm.noPostsYet")}</p>}
                  {unused.length > 0 && <><h4>{t("mm.ideasFromTopics")}</h4><div className="mm-related">{unused.map((tp) => <Link key={tp} className="badge" href={createHref({ idea: tp, date: data.today })}>+ {tp}</Link>)}</div></>}
                  <Link className="btn" href={createHref({ idea: `${selected.label}: `, date: data.today })}>{t("planForPillar")}</Link>
                </>
              );
            })()}
            {selected.column === "series" && (() => {
              const s = (c.series ?? []).find((x) => x.name === selected.label);
              const eps = data.posts.filter((p) => p.title.toLowerCase().includes(selected.label.toLowerCase())).sort((a, b) => a.date.localeCompare(b.date));
              return (
                <>
                  {s && <p className="stat-vs">{s.formats.map(fmt).join(", ")} · {s.networks.map((n) => NETWORK_LABEL[n] ?? n).join(", ")}</p>}
                  <h4>{t("episodes", { count: eps.length })}</h4>
                  {eps.length ? <ul className="plain mm-posts">{eps.map(postRow)}</ul> : <p className="stat-vs">{t("mm.noPostsYet")}</p>}
                  <Link className="btn" href={createHref({ idea: `${selected.label}: `, date: data.today })}>{t("nextEpisode")}</Link>
                </>
              );
            })()}
          </div>
        )}
      </aside>
    </div>
  );
}
