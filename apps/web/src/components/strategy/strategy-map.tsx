"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buildStrategyMap, NO_PILLAR, type MapPost, type RowsBy } from "@orbita/agent/strategy-map";
import { NETWORK_COLOR, NETWORK_LABEL } from "@/components/posts/shared";
import type { StrategyMapData } from "@/lib/strategy-map";

const ICON: Record<string, string> = { reel: "▶", video: "▷", carousel: "▦", static: "■", story: "◉", text: "≡", article: "≡", post: "•" };
const PILLAR_COLOR = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--brand)", "var(--dim)", "var(--ink)"];
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

type Sel =
  | { type: "post"; post: MapPost }
  | { type: "pillar"; name: string }
  | { type: "objective"; index: number }
  | { type: "week"; start: string; end: string; index: number }
  | { type: "topic"; topic: string; used: boolean }
  | { type: "series"; index: number };

/**
 * The Strategy Map: the month as weeks × pillars (or formats, or networks), every post in its cell and every gap visible,
 * with the strategy's goals, mix, rhythm, series and topics around it. Everything is clickable and opens a side panel.
 */
export function StrategyMap({ data, locale, clientId, postsBase, newPostHref, monthHref, askStrategyHref }: {
  data: StrategyMapData; locale: string; clientId?: string;
  /** e.g. /en/posts */ postsBase: string; /** Create post with the client chosen */ newPostHref: string;
  monthHref: (month: string) => string; askStrategyHref: string;
}) {
  const t = useTranslations("strategyMap");
  const tp = useTranslations("posts");
  const router = useRouter();
  const [rowsBy, setRowsBy] = useState<RowsBy>("pillar");
  const [network, setNetwork] = useState<string>("");
  const [sel, setSel] = useState<Sel | null>(null);
  const [tagging, startTag] = useTransition();
  const [tagNote, setTagNote] = useState<string | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const c = data.strategy?.content ?? {};
  const pillars = useMemo(() => (c.pillars ?? []).filter((p) => p.name), [c.pillars]);
  const color = (name: string) => (name === NO_PILLAR ? "var(--mist)" : PILLAR_COLOR[Math.max(0, pillars.findIndex((p) => p.name === name)) % PILLAR_COLOR.length]);
  const map = useMemo(() => buildStrategyMap({ month: data.month, pillars, posts: data.posts, rowsBy, network: network || undefined, noPillarLabel: t("untagged") }), [data, pillars, rowsBy, network, t]);
  const networks = [...new Set(data.posts.map((p) => p.network))];
  const fmt = (f: string) => (tp.has(`formatCards.${f}.title`) ? tp(`formatCards.${f}.title`) : f);
  const rowLabel = (key: string, label: string) => (rowsBy === "format" ? fmt(key) : rowsBy === "network" ? NETWORK_LABEL[key] ?? key : label);
  const dayF = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const monthF = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const nf = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const day = (d: string) => dayF.format(new Date(`${d}T00:00:00Z`));
  const shiftMonth = (n: number) => { const d = new Date(Date.parse(`${data.month}-01T00:00:00Z`)); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  const createHref = (q: Record<string, string>) => `${newPostHref}${newPostHref.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`;
  const firstOpenDay = (w: { start: string; end: string }) => { for (let d = w.start; d <= w.end; d = addDays(d, 1)) if (d >= data.today) return d; return w.start; };
  const usedText = data.posts.map((p) => p.title.toLowerCase());
  const topics = (c.topics ?? []).map((tp) => ({ topic: tp, used: usedText.some((u) => u.includes(tp.toLowerCase().slice(0, 30))) }));
  const plannedThisMonth = data.posts.filter((p) => p.date.startsWith(data.month) && p.kind === "plan").length;

  async function tag() {
    setTagNote(null);
    startTag(async () => {
      const res = await fetch("/api/strategy/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) }).catch(() => null);
      const body = (await res?.json().catch(() => ({}))) as { tagged?: number; error?: string } | undefined;
      if (res?.ok) { setTagNote(t("tagged", { count: body?.tagged ?? 0 })); router.refresh(); }
      else setTagNote(body?.error && t.has(`errors.${body.error}`) ? t(`errors.${body.error}`) : t("errors.generic"));
    });
  }

  const pillarOf = (p: MapPost) => pillars.find((x) => x.name.toLowerCase() === (p.pillar ?? "").toLowerCase())?.name ?? NO_PILLAR;
  const chip = (p: MapPost) => (
    <button key={`${p.kind}${p.id}`} type="button" className={`map-chip ${p.kind} status-${p.status}`} onClick={() => setSel({ type: "post", post: p })}
      style={{ borderColor: NETWORK_COLOR[p.network] ?? "var(--line)", ["--pillar" as string]: color(pillarOf(p)) }}
      aria-label={`${fmt(p.format)} · ${NETWORK_LABEL[p.network] ?? p.network} · ${day(p.date)} · ${p.title}`}>
      <span className="map-chip-icon" aria-hidden="true">{ICON[p.format] ?? "•"}</span>
      <span className="map-chip-text">{p.title || fmt(p.format)}</span>
      {p.kind === "live" && <span className="map-chip-live" aria-hidden="true">✓</span>}
    </button>
  );

  if (!data.strategy) return (
    <section className="card map-empty">
      <h2>{t("emptyTitle")}</h2><p>{t("emptyText")}</p>
      <Link className="btn" href={askStrategyHref}>{t("buildStrategy")}</Link>
    </section>
  );

  return (
    <div className="strategy-map">
      {/* Header: what, when, how to slice it */}
      <div className="map-toolbar">
        <div className="cal-nav">
          <Link className="btn ghost small" href={monthHref(shiftMonth(-1))} aria-label={t("prevMonth")}>←</Link>
          <strong className="map-month">{monthF.format(new Date(`${data.month}-01T00:00:00Z`))}</strong>
          <Link className="btn ghost small" href={monthHref(shiftMonth(1))} aria-label={t("nextMonth")}>→</Link>
        </div>
        <div className="map-toggles" role="group" aria-label={t("rowsBy")}>
          {(["pillar", "format", "network"] as const).map((r) => <button key={r} type="button" className="btn small ghost" aria-pressed={rowsBy === r} onClick={() => setRowsBy(r)}>{t(`by.${r}`)}</button>)}
        </div>
        {networks.length > 1 && (
          <div className="map-toggles" role="group" aria-label={t("network")}>
            <button type="button" className="btn small ghost" aria-pressed={!network} onClick={() => setNetwork("")}>{t("allNetworks")}</button>
            {networks.map((n) => <button key={n} type="button" className="btn small ghost" aria-pressed={network === n} onClick={() => setNetwork(n)}>{NETWORK_LABEL[n] ?? n}</button>)}
          </div>
        )}
      </div>

      {/* North star: goals and the numbers that move them */}
      <section className="map-goals" aria-label={t("goals")}>
        {(c.objectives ?? []).map((o, i) => (
          <button key={i} type="button" className="map-goal" onClick={() => setSel({ type: "objective", index: i })}>
            <span className="eyebrow">{t("goal", { n: i + 1 })}</span><span>{o}</span>
          </button>
        ))}
        <div className="map-kpis">
          <div><span className="eyebrow">{t("kpi.followers")}</span><strong>{data.kpis.followers === null ? "—" : nf.format(data.kpis.followers)}</strong>{data.kpis.followersDelta !== null && <small className={data.kpis.followersDelta >= 0 ? "up" : "down"}>{data.kpis.followersDelta >= 0 ? "+" : ""}{nf.format(data.kpis.followersDelta)}</small>}</div>
          <div><span className="eyebrow">{t("kpi.reach")}</span><strong>{data.kpis.reach === null ? "—" : nf.format(data.kpis.reach)}</strong>{data.kpis.reachDelta !== null && <small className={data.kpis.reachDelta >= 0 ? "up" : "down"}>{pf.format(data.kpis.reachDelta)}</small>}</div>
          <div><span className="eyebrow">{t("kpi.engagement")}</span><strong>{data.kpis.engagement === null ? "—" : pf.format(data.kpis.engagement)}</strong></div>
          <div><span className="eyebrow">{t("kpi.month")}</span><strong>{map.totals.published}</strong><small>{t("kpi.planned", { count: map.totals.planned })}</small></div>
        </div>
      </section>

      {/* The map */}
      <section className="card map-card" aria-label={t("mapTitle")}>
        <div className="section-head">
          <h2>{t("mapTitle")}</h2>
          {map.untagged > 0 && rowsBy === "pillar" && <button type="button" className="btn small" onClick={tag} disabled={tagging}>{tagging ? t("tagging") : t("tag", { count: map.untagged })}</button>}
        </div>
        {tagNote && <p className="stat-vs" role="status">{tagNote}</p>}
        <div className="map-scroll">
          <div className="map-grid" style={{ gridTemplateColumns: `minmax(8.5rem, 11rem) repeat(${map.weeks.length}, minmax(9rem, 1fr))` }}>
            <div className="map-corner">{t(`by.${rowsBy}`)}</div>
            {map.weeks.map((w) => {
              const current = data.today >= w.start && data.today <= w.end;
              const count = map.rows.reduce((n, r) => n + r.cells[w.index].length, 0);
              return (
                <button key={w.start} type="button" className={`map-week${current ? " current" : ""}`} onClick={() => setSel({ type: "week", ...w })}>
                  <strong>{t("week", { n: w.index + 1 })}</strong><span>{day(w.start)}</span>
                  <span className="map-week-meter" aria-label={t("weekCount", { count, goal: data.goal })}><span style={{ width: `${Math.min(100, (count / data.goal) * 100)}%` }} /></span>
                </button>
              );
            })}
            {map.rows.map((r) => (
              <div key={r.key} className="map-row" style={{ display: "contents" }}>
                <button type="button" className="map-rowhead" style={{ ["--pillar" as string]: rowsBy === "pillar" ? color(r.key) : rowsBy === "network" ? NETWORK_COLOR[r.key] : "var(--ink)" }}
                  onClick={() => rowsBy === "pillar" && r.key !== NO_PILLAR ? setSel({ type: "pillar", name: r.key }) : undefined} disabled={!(rowsBy === "pillar" && r.key !== NO_PILLAR)}>
                  <span className="map-swatch" aria-hidden="true" />
                  <span>{rowLabel(r.key, r.label)}</span>
                  {r.share !== null && <small>{r.share}%</small>}
                </button>
                {r.cells.map((cell, i) => {
                  const w = map.weeks[i];
                  const past = w.end < data.today;
                  return (
                    <div key={i} className={`map-cell${cell.length ? "" : " gap"}${past ? " past" : ""}`}>
                      {cell.map(chip)}
                      {!cell.length && !past && rowsBy === "pillar" && r.key !== NO_PILLAR && (
                        <Link className="map-gap" href={createHref({ idea: `${r.key}: `, date: firstOpenDay(w) })} aria-label={t("planHere", { pillar: r.key, week: w.index + 1 })}>+ {t("gap")}</Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="map-legend" aria-hidden="true">▶ {fmt("reel")} · ▦ {fmt("carousel")} · ■ {fmt("static")} · ◉ {fmt("story")} · <span className="legend-live">✓ {t("legendLive")}</span> · <span className="legend-idea">{t("legendIdea")}</span></p>
      </section>

      <div className="map-columns">
        {/* Mix: target vs planned vs published */}
        <section className="card">
          <h2>{t("mixTitle")}</h2>
          <p className="stat-vs">{t("mixHint")}</p>
          <ul className="plain map-mix">
            {map.mix.map((m) => (
              <li key={m.pillar}>
                <button type="button" className="map-mix-row" onClick={() => setSel({ type: "pillar", name: m.pillar })}>
                  <span className="map-mix-name"><span className="map-swatch" style={{ background: color(m.pillar) }} aria-hidden="true" />{m.pillar}</span>
                  {(["target", "planned", "published"] as const).map((k) => (
                    <span key={k} className={`map-bar ${k}`}><span className="map-bar-label">{t(`mix.${k}`)}</span><span className="map-bar-track"><span style={{ width: `${m[k]}%`, background: k === "target" ? "var(--mist)" : color(m.pillar), opacity: k === "planned" ? 0.55 : 1 }} /></span><span className="map-bar-value">{m[k]}%</span></span>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Rhythm per network */}
        <section className="card">
          <h2>{t("rhythmTitle")}</h2>
          {(c.cadence ?? []).length === 0 && <p className="stat-vs">{t("noRhythm")}</p>}
          <ul className="plain map-rhythm">
            {(c.cadence ?? []).map((r) => {
              const counts = map.weeks.map((w) => data.posts.filter((p) => p.network === r.network && p.date >= w.start && p.date <= w.end).length);
              return (
                <li key={r.network}>
                  <div><span className="net-dot" style={{ background: NETWORK_COLOR[r.network] }} aria-hidden="true" /> <strong>{NETWORK_LABEL[r.network] ?? r.network}</strong> · {t("perWeek", { count: r.posts_per_week })}</div>
                  <div className="stat-vs">{r.best_days.map((d) => t(`days.${d}`)).join(", ")}{r.best_time ? ` · ${r.best_time}` : ""}</div>
                  <div className="map-rhythm-weeks" aria-label={t("rhythmWeeks")}>
                    {counts.map((n, i) => <span key={i} className={n >= r.posts_per_week ? "met" : n ? "part" : ""} title={t("weekCount", { count: n, goal: r.posts_per_week })}>{n}/{r.posts_per_week}</span>)}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="map-columns">
        {(c.series ?? []).length > 0 && (
          <section className="card">
            <h2>{t("seriesTitle")}</h2>
            <ul className="plain map-list">
              {(c.series ?? []).map((s, i) => <li key={i}><button type="button" className="map-link" onClick={() => setSel({ type: "series", index: i })}><strong>{s.name}</strong> <span className="stat-vs">{s.formats.map(fmt).join(", ")} · {s.networks.map((n) => NETWORK_LABEL[n] ?? n).join(", ")}</span></button></li>)}
            </ul>
          </section>
        )}
        {topics.length > 0 && (
          <section className="card">
            <h2>{t("topicsTitle")}</h2>
            <p className="stat-vs">{t("topicsHint", { used: topics.filter((x) => x.used).length, total: topics.length })}</p>
            <div className="map-topics">
              {topics.map((x) => <button key={x.topic} type="button" className={`map-topic${x.used ? " used" : ""}`} onClick={() => setSel({ type: "topic", ...x })}>{x.used ? "✓ " : ""}{x.topic}</button>)}
            </div>
          </section>
        )}
      </div>

      {/* Side panel with the details of whatever was clicked */}
      {sel && <div className="map-scrim" onClick={() => setSel(null)} aria-hidden="true" />}
      <aside className={`map-drawer${sel ? " open" : ""}`} aria-hidden={!sel} aria-label={t("details")}>
        {sel && (
          <>
            <button type="button" className="btn ghost small map-close" onClick={() => setSel(null)}>✕ {t("close")}</button>
            {sel.type === "post" && (() => {
              const p = sel.post; const m = p.metrics ?? {};
              return (
                <div className="stack">
                  <p className="eyebrow">{p.kind === "live" ? t("livePost") : t("plannedPost")}</p>
                  <h3>{p.title || fmt(p.format)}</h3>
                  <p className="flow-summary">
                    <span className="badge">{ICON[p.format]} {fmt(p.format)}</span>
                    <span className="badge"><span className="net-dot small" style={{ background: NETWORK_COLOR[p.network] }} aria-hidden="true" />{NETWORK_LABEL[p.network] ?? p.network}</span>
                    <span className="badge">{tp.has(`statuses.${p.status}`) ? tp(`statuses.${p.status}`) : p.status}</span>
                    {p.pillar && <span className="badge" style={{ borderColor: color(p.pillar) }}>{p.pillar}</span>}
                  </p>
                  <p className="stat-vs">{day(p.date)}</p>
                  {p.kind === "live" && (
                    <dl className="map-metrics">
                      {p.views !== null && p.views !== undefined && <div><dt>{t("m.views")}</dt><dd>{nf.format(p.views)}</dd></div>}
                      {["likes", "comments", "shares", "saves"].filter((k) => typeof m[k] === "number").map((k) => <div key={k}><dt>{t(`m.${k}`)}</dt><dd>{nf.format(m[k])}</dd></div>)}
                      {p.rate !== null && p.rate !== undefined && <div><dt>{t("m.rate")}</dt><dd>{pf.format(p.rate)}</dd></div>}
                    </dl>
                  )}
                  {p.caption && <p className="map-caption">{p.caption.slice(0, 700)}</p>}
                  <div className="btn-row">
                    {p.kind === "plan" && <Link className="btn" href={`${postsBase}/${p.id}`}>{t("openPost")}</Link>}
                    {p.kind === "live" && p.permalink && <a className="btn" href={p.permalink} target="_blank" rel="noopener noreferrer nofollow">{t("viewLive", { network: NETWORK_LABEL[p.network] ?? p.network })}</a>}
                  </div>
                </div>
              );
            })()}
            {sel.type === "pillar" && (() => {
              const pl = pillars.find((x) => x.name === sel.name); const mx = map.mix.find((x) => x.pillar === sel.name);
              const live = data.posts.filter((p) => p.kind === "live" && p.pillar?.toLowerCase() === sel.name.toLowerCase() && p.date.startsWith(data.month));
              const rated = live.filter((p) => typeof p.rate === "number").sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
              const avg = rated.length ? rated.reduce((s, p) => s + (p.rate ?? 0), 0) / rated.length : null;
              const all = data.posts.filter((p) => p.pillar?.toLowerCase() === sel.name.toLowerCase()).sort((a, b) => a.date.localeCompare(b.date));
              return (
                <div className="stack">
                  <p className="eyebrow">{t("pillar")}</p>
                  <h3><span className="map-swatch" style={{ background: color(sel.name) }} aria-hidden="true" /> {sel.name}</h3>
                  {pl?.angle && <p>{pl.angle}</p>}
                  {mx && <p className="stat-vs">{t("pillarMix", { target: mx.target, planned: mx.planned, published: mx.published })}</p>}
                  {avg !== null && <p><strong>{t("avgEngagement")}</strong> {pf.format(avg)}</p>}
                  {rated[0] && <p><strong>{t("bestPost")}</strong> <button type="button" className="map-link" onClick={() => setSel({ type: "post", post: rated[0] })}>{rated[0].title || fmt(rated[0].format)}</button></p>}
                  <h4>{t("pillarPosts", { count: all.length })}</h4>
                  <div className="map-drawer-chips">{all.map(chip)}</div>
                  <Link className="btn" href={createHref({ idea: `${sel.name}: `, date: data.today })}>{t("planForPillar")}</Link>
                </div>
              );
            })()}
            {sel.type === "objective" && (
              <div className="stack">
                <p className="eyebrow">{t("goal", { n: sel.index + 1 })}</p>
                <h3>{c.objectives?.[sel.index]}</h3>
                <p className="stat-vs">{t("goalHint")}</p>
                <dl className="map-metrics">
                  <div><dt>{t("kpi.followers")}</dt><dd>{data.kpis.followers === null ? "—" : nf.format(data.kpis.followers)}{data.kpis.followersDelta !== null ? ` (${data.kpis.followersDelta >= 0 ? "+" : ""}${nf.format(data.kpis.followersDelta)})` : ""}</dd></div>
                  <div><dt>{t("kpi.reach")}</dt><dd>{data.kpis.reach === null ? "—" : nf.format(data.kpis.reach)}</dd></div>
                  <div><dt>{t("kpi.engagement")}</dt><dd>{data.kpis.engagement === null ? "—" : pf.format(data.kpis.engagement)}</dd></div>
                  <div><dt>{t("kpi.month")}</dt><dd>{map.totals.published} · {t("kpi.planned", { count: map.totals.planned })}</dd></div>
                </dl>
                {c.rationale && <><h4>{t("why")}</h4><p>{c.rationale}</p></>}
              </div>
            )}
            {sel.type === "week" && (() => {
              const posts = data.posts.filter((p) => (!network || p.network === network) && p.date >= sel.start && p.date <= sel.end).sort((a, b) => a.date.localeCompare(b.date));
              const days = Array.from({ length: 7 }, (_, i) => addDays(sel.start, i));
              return (
                <div className="stack">
                  <p className="eyebrow">{t("week", { n: sel.index + 1 })}</p>
                  <h3>{day(sel.start)} – {day(sel.end)}</h3>
                  <p className="stat-vs">{t("weekCount", { count: posts.length, goal: data.goal })}</p>
                  <ul className="plain map-days">
                    {days.map((d) => {
                      const items = posts.filter((p) => p.date === d);
                      return <li key={d}><span className="kickstart-when">{day(d)}</span><span className="map-drawer-chips">{items.length ? items.map(chip) : d >= data.today ? <Link className="map-gap small" href={createHref({ date: d })}>+ {t("planDay")}</Link> : <span className="stat-vs">—</span>}</span></li>;
                    })}
                  </ul>
                </div>
              );
            })()}
            {sel.type === "topic" && (
              <div className="stack">
                <p className="eyebrow">{t("topic")}</p>
                <h3>{sel.topic}</h3>
                <p className="stat-vs">{sel.used ? t("topicUsed") : t("topicFree")}</p>
                <Link className="btn" href={createHref({ idea: sel.topic, date: data.today })}>{t("createFromTopic")}</Link>
              </div>
            )}
            {sel.type === "series" && (() => {
              const s = c.series?.[sel.index];
              if (!s) return null;
              const eps = data.posts.filter((p) => p.title.toLowerCase().includes(s.name.toLowerCase())).sort((a, b) => a.date.localeCompare(b.date));
              return (
                <div className="stack">
                  <p className="eyebrow">{t("series")}</p>
                  <h3>{s.name}</h3>
                  <p>{s.subject}</p>
                  <p className="stat-vs">{s.formats.map(fmt).join(", ")} · {s.networks.map((n) => NETWORK_LABEL[n] ?? n).join(", ")}</p>
                  <h4>{t("episodes", { count: eps.length })}</h4>
                  <div className="map-drawer-chips">{eps.map(chip)}</div>
                  <Link className="btn" href={createHref({ idea: `${s.name}: `, date: data.today })}>{t("nextEpisode")}</Link>
                </div>
              );
            })()}
          </>
        )}
      </aside>
      {plannedThisMonth === 0 && <p className="stat-vs">{t("nothingPlanned")}</p>}
    </div>
  );
}
