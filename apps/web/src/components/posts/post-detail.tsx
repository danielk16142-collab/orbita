import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { allowedStatusChanges, formatKey, parseContent, type Status } from "@orbita/content";
import { requireStaff, requireUser } from "@/lib/session";
import { loadPost } from "@/lib/posts/access";
import { CopyButton } from "./copy-button";
import { PostActions } from "./post-actions";
import { PostEditor } from "./post-editor";
import { FillWithAgent } from "./fill-with-agent";
import { PostReview } from "./post-review";
import { NETWORK_LABEL } from "./shared";
import { VisualPanel, type VisualJob } from "@/components/visuals/visual-panel";
import { readModule, usedThisMonth } from "@/lib/visuals/service";
import { PostKit, type KitRef } from "@/components/visuals/post-kit";
import { MediaPanel, type MediaItem } from "@/components/visuals/media-panel";
import { loadReferences } from "@/lib/references";
import type { BrandInfo } from "@orbita/visuals";

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
  // Visual creation (Moda): only for carousels and static posts, only when the module is on for this client.
  const visualFormat = post.type === "carousel" || post.type === "static";
  const mod = visualFormat ? await readModule(s.sb, post.client_id) : null;
  let visualJob: VisualJob | null = null;
  if (mod?.enabled) {
    const { data: j } = await s.sb.from("visual_jobs").select("id, status, pages, error_code").eq("post_id", post.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (j) {
      const { data: media } = await s.sb.from("post_media").select("path, page, width, height").eq("job_id", j.id).order("page");
      const images = (await Promise.all((media ?? []).map(async (m) => ({ page: m.page, width: m.width, height: m.height, url: (await s.sb.storage.from("post-media").createSignedUrl(m.path, 3600)).data?.signedUrl ?? "" })))).filter((i) => i.url);
      visualJob = { id: j.id, status: j.status, pages: j.pages, errorCode: j.error_code, images };
    }
  }
  // "Create outside": prompts for making images and videos in other tools, built in the browser from the post and the brand (staff only).
  const kitFormat = !portal && ["carousel", "static", "reel"].includes(post.type);
  let kitBrand: BrandInfo | null = null; let kitRefs: KitRef[] = [];
  if (kitFormat) {
    const { data: c } = await s.sb.from("clients").select("name, primary_color, accent_color, palette, font, body_font").eq("id", post.client_id).maybeSingle();
    if (c) kitBrand = { name: c.name, language: (["en", "fr", "es"].includes(post.language) ? post.language : "en") as "en" | "fr" | "es", primary: c.primary_color, accent: c.accent_color, palette: Array.isArray(c.palette) ? c.palette : [], headingFont: c.font, bodyFont: c.body_font };
    kitRefs = (await loadReferences(s.sb, post.client_id)).map((r) => ({ kind: r.kind, caption: r.caption, url: r.url }));
  }
  // Files uploaded onto the post (made outside Orbita), visible to staff and to the client.
  const { data: uploaded } = await s.sb.from("post_media").select("id, path, kind, name, width, height").eq("post_id", post.id).eq("source", "uploaded").order("created_at");
  const mediaItems: MediaItem[] = (await Promise.all((uploaded ?? []).map(async (m) => ({ id: m.id, kind: m.kind as "image" | "video", name: m.name, width: m.width, height: m.height, url: (await s.sb.storage.from("post-media").createSignedUrl(m.path, 3600)).data?.signedUrl ?? "" })))).filter((m) => m.url);
  const visualsUsed = mod?.enabled && !portal ? await usedThisMonth(post.client_id) : 0;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, string>[]) : []);

  return (
    <>
      <p className="eyebrow"><Link href={base}>{t("title")}</Link></p>
      <h1>{(post.idea || post.caption || t("untitled")).slice(0, 90)}</h1>
      <p className="post-meta">
        <span className={`badge status-${post.status}`}>{t(`statuses.${post.status}`)}</span>{" "}
        {NETWORK_LABEL[post.network] ?? post.network} · {t(`formats.${formatKey(post.type)}` as never)} · {post.language.toUpperCase()}
        {!portal && client?.name ? ` · ${client.name}` : ""}
        {post.planned_date ? ` · ${post.planned_date}${post.suggested_time ? ` ${post.suggested_time}` : ""}${client?.timezone ? ` (${client.timezone})` : ""}` : ` · ${t("unscheduledShort")}`}
      </p>

      {post.idea && <section className="card"><h2>{t("idea")}</h2><p>{post.idea}</p></section>}

      {!portal && ["idea", "draft", "approved"].includes(post.status) && ["reel", "video", "carousel", "static", "story", "text", "article"].includes(formatKey(post.type)) && (
        <FillWithAgent postId={post.id} clientId={post.client_id} locale={locale} format={formatKey(post.type)} approved={post.status === "approved"} network={post.network} language={post.language} idea={post.idea || post.caption || ""}
          day={post.planned_date} time={post.suggested_time} pillar={post.pillar} hasContent={!!content}
          why={post.content && typeof post.content === "object" && "rationale" in post.content ? String((post.content as { rationale?: unknown }).rationale ?? "") || null : null}
          calendarHref={`/${locale}/posts?client=${post.client_id}`} />
      )}

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

      {kitBrand && <PostKit postId={post.id} post={{ type: post.type, content: post.content }} brand={kitBrand} refs={kitRefs} />}

      {mod?.enabled && (!portal || (visualJob && visualJob.images.length > 0)) && (
        <VisualPanel postId={post.id} canCreate={!portal} initial={visualJob} used={visualsUsed} cap={mod.monthlyCap} />
      )}

      {(!portal || mediaItems.length > 0) && <MediaPanel postId={post.id} canEdit={!portal} items={mediaItems} />}

      {(post.caption || hashtags) && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <div className="section-head"><h2>{t("caption")}</h2><CopyButton text={[post.caption, hashtags].filter(Boolean).join("\n\n")} label={t("copy")} done={t("copied")} /></div>
          {post.caption && <p className="pre">{post.caption}</p>}
          {hashtags && <p className="stat-vs">{hashtags}</p>}
        </section>
      )}

      {!portal && <PostReview postId={post.id} post={{ type: post.type, language: post.language, caption: post.caption, hashtags: post.hashtags, content: post.content }} />}

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
