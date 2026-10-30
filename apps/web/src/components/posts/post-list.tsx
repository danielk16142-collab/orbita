import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { groupByDate, parseContent } from "@orbita/content";
import { NETWORK_COLOR, NETWORK_LABEL, postTitle, type CalPost } from "./shared";

export type ListPost = CalPost & { content?: unknown; hashtags?: string[] | null; thumb?: string | null; hasVideo?: boolean };
type Content = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The line that sells the post, and a short note on what it contains (scenes, slides). */
function headline(p: ListPost): { title: string; facts: { key: "slides" | "scenes" | "seconds"; n: number }[] } {
  const parsed = parseContent(p.type, p.content);
  const c = parsed.ok ? (parsed.value as Content | null) : null;
  if (c && p.type === "reel") return { title: str((c.hook_options as string[])[0]) || postTitle(p, 120), facts: [{ key: "scenes", n: (c.scenes as unknown[]).length }, { key: "seconds", n: Number(c.duration_seconds) || 0 }] };
  if (c && p.type === "carousel") return { title: str((c.slides as Content[])[0]?.title) || postTitle(p, 120), facts: [{ key: "slides", n: (c.slides as unknown[]).length }] };
  if (c && p.type === "static") return { title: str(c.headline) || postTitle(p, 120), facts: [] };
  return { title: postTitle(p, 120), facts: [] };
}

/** One post as a card: cover image (or the headline on the network's colour when there is none), what it is, when, and the start of the caption. */
async function Card({ p, href, showClient, t }: { p: ListPost; href: string; showClient: boolean; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const h = headline(p);
  const tag = (p.hashtags ?? []).length;
  const caption = (p.caption ?? "").replace(/\s+/g, " ").trim();
  return (
    <Link href={href} className={`post-card status-${p.status}`}>
      <span className="post-cover" style={{ ["--net" as string]: NETWORK_COLOR[p.network] }} aria-hidden={p.thumb ? undefined : true}>
        {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <span className="post-cover-text">{h.title.slice(0, 70)}</span>}
        {p.hasVideo && <span className="post-cover-badge">▶ {t("list.video")}</span>}
      </span>
      <span className="post-body">
        <span className="post-top">
          {p.suggested_time && <span className="chip-time">{p.suggested_time}</span>}
          <span className="badge"><span className="swatch" style={{ background: NETWORK_COLOR[p.network] }} aria-hidden="true" /> {NETWORK_LABEL[p.network] ?? p.network}</span>
          <span className="badge">{t(`formats.${p.type}` as never, { default: p.type } as never)}</span>
          <span className={`badge status-${p.status}`}>{t(`statuses.${p.status}`)}</span>
          {showClient && p.clients?.name && <span className="stat-vs">{p.clients.name}</span>}
        </span>
        <strong className="post-title">{h.title}</strong>
        {caption && <span className="post-caption">{caption}</span>}
        <span className="stat-vs post-facts">
          {[...h.facts.filter((f) => f.n > 0).map((f) => t(`list.${f.key}`, { n: f.n })), tag > 0 ? t("list.hashtags", { n: tag }) : "", !caption ? t("list.noCaption") : ""].filter(Boolean).join(" · ")}
        </span>
      </span>
    </Link>
  );
}

/** List view: the month's posts day by day, as cards with a cover. */
export async function PostList({ locale, posts, postHref, showClient, today }: { locale: string; posts: ListPost[]; postHref: (id: string) => string; showClient: boolean; today: string }) {
  const t = await getTranslations("posts");
  const by = groupByDate(posts);
  const days = [...by.keys()].sort();
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  if (!days.length) return <section className="card"><p>{t("list.empty")}</p></section>;
  return (
    <section className="post-list" aria-label={t("views.list")}>
      {days.map((d) => (
        <div key={d} className="post-day">
          <h2 className={`post-day-title${d === today ? " today" : ""}`}>{fmt.format(new Date(`${d}T12:00:00Z`))}{d === today ? ` · ${t("today")}` : ""} <span className="stat-vs">{t("list.count", { n: by.get(d)!.length })}</span></h2>
          <div className="post-cards">{by.get(d)!.map((p) => <Card key={p.id} p={p as ListPost} href={postHref(p.id)} showClient={showClient} t={t} />)}</div>
        </div>
      ))}
    </section>
  );
}
