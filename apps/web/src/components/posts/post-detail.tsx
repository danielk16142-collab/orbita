import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { allowedStatusChanges, parseContent, type Status } from "@orbita/content";
import { requireStaff, requireUser } from "@/lib/session";
import { loadPost } from "@/lib/posts/access";
import { CopyButton } from "./copy-button";
import { PostActions } from "./post-actions";
import { PostEditor } from "./post-editor";
import { NETWORK_LABEL } from "./shared";

/** One post in full: idea, script/slides/brief, caption, status actions, comments. Staff also get the editor. */
export async function PostDetail({ locale, id, portal }: { locale: string; id: string; portal: boolean }) {
  const t = await getTranslations("posts");
  const s = portal ? await requireUser(locale) : await requireStaff(locale);
  const r = await loadPost({ sb: s.sb, userId: s.user.id, profile: s.profile, isStaff: !portal }, id);
  if (!r.ok) notFound();
  const post = r.value;
  const base = portal ? `/${locale}/portal/posts` : `/${locale}/posts`;
  const [{ data: comments }, { data: client }] = await Promise.all([
    s.sb.from("post_comments").select("id, author, body, created_at").eq("post_id", post.id).order("created_at"),
    s.sb.from("clients").select("name, timezone").eq("id", post.client_id).maybeSingle(),
  ]);
  const parsed = parseContent(post.type, post.content);
  const content = parsed.ok ? (parsed.value as Record<string, unknown> | null) : null;
  const moves = allowedStatusChanges(s.profile.role, post.status as Status);
  const requireComment = s.profile.role === "client" ? moves.filter(() => post.status === "approved") : [];
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const hashtags = (post.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, string>[]) : []);

  return (
    <>
      <p className="eyebrow"><Link href={base}>{t("title")}</Link></p>
      <h1>{(post.idea || post.caption || t("untitled")).slice(0, 90)}</h1>
      <p className="post-meta">
        <span className={`badge status-${post.status}`}>{t(`statuses.${post.status}`)}</span>{" "}
        {NETWORK_LABEL[post.network] ?? post.network} · {t(`formats.${post.type}` as never, { default: post.type } as never)} · {post.language.toUpperCase()}
        {!portal && client?.name ? ` · ${client.name}` : ""}
        {post.planned_date ? ` · ${post.planned_date}${post.suggested_time ? ` ${post.suggested_time}` : ""}${client?.timezone ? ` (${client.timezone})` : ""}` : ` · ${t("unscheduledShort")}`}
      </p>

      {post.idea && <section className="card"><h2>{t("idea")}</h2><p>{post.idea}</p></section>}

      {post.type === "reel" && content && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <div className="section-head"><h2>{t("script")}</h2><Link className="btn small" href={`/${locale}/teleprompter/${post.id}`}>{t("teleprompter")}</Link></div>
          <p className="stat-vs">{String(content.duration_seconds)}s</p>
          <h3>{t("hooks")}</h3>
          <ol>{(content.hook_options as string[]).map((h, i) => <li key={i}>{h}</li>)}</ol>
          <div className="table-scroll"><table className="prose-table">
            <thead><tr><th>{t("seconds")}</th><th>{t("visual")}</th><th>{t("voiceover")}</th><th>{t("onScreen")}</th></tr></thead>
            <tbody>{arr(content.scenes).map((sc, i) => <tr key={i}><td>{sc.seconds}</td><td>{sc.visual}</td><td>{sc.voiceover}</td><td>{sc.on_screen_text}</td></tr>)}</tbody>
          </table></div>
          <p><strong>{t("cta")}:</strong> {String(content.cta)}</p>
          {content.audio_note ? <p><strong>{t("audio")}:</strong> {String(content.audio_note)}</p> : null}
        </section>
      )}
      {post.type === "carousel" && content && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <h2>{t("carouselContent")}</h2>
          <ol className="slides">{arr(content.slides).map((sl, i) => <li key={i} className="plan-item"><strong>{sl.title}</strong><span>{sl.body}</span><span className="stat-vs">{sl.visual}</span></li>)}</ol>
          <p><strong>{t("cta")}:</strong> {String(content.cta)}</p>
        </section>
      )}
      {post.type === "static" && content && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <h2>{t("staticContent")}</h2>
          <p><strong>{String(content.headline)}</strong></p><p>{String(content.visual_brief)}</p><p><strong>{t("cta")}:</strong> {String(content.cta)}</p>
        </section>
      )}

      {(post.caption || hashtags) && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <div className="section-head"><h2>{t("caption")}</h2><CopyButton text={[post.caption, hashtags].filter(Boolean).join("\n\n")} label={t("copy")} done={t("copied")} /></div>
          {post.caption && <p className="pre">{post.caption}</p>}
          {hashtags && <p className="stat-vs">{hashtags}</p>}
        </section>
      )}

      <section className="card" style={{ marginTop: "1.25rem" }}>
        <h2>{t("review")}</h2>
        <PostActions postId={post.id} moves={moves} requireComment={requireComment} staff={!portal} listHref={base} />
        <h3>{t("comments")}</h3>
        {(comments ?? []).length === 0 ? <p className="stat-vs">{t("noComments")}</p> : (
          <ul className="plain comments">{comments!.map((c) => <li key={c.id}><span><strong>{c.author === s.user.id ? t("you") : t("other")}</strong> <span className="stat-vs">{when.format(new Date(c.created_at))}</span><br />{c.body}</span></li>)}</ul>
        )}
      </section>

      {!portal && <div style={{ marginTop: "1.25rem" }}><PostEditor key={post.updated_at} post={post} /></div>}
    </>
  );
}
