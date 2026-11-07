import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { canDeletePost } from "@orbita/content";
import { NETWORK_LABEL, postTitle, type CalPost } from "./shared";
import { DeletePostButton } from "./delete-post-button";

/** "Not scheduled yet": posts with no date. Staff can delete the ones that may still go (not published); published posts are not listed. */
export async function UnscheduledList({ posts, base, portal, today }: { posts: CalPost[]; base: string; portal: boolean; today: string }) {
  const t = await getTranslations("posts");
  if (!posts.length) return null;
  return (
    <section className="card" style={{ marginTop: "1.25rem" }}>
      <h2>{t("unscheduled")}</h2>
      <ul className="plain unscheduled-list">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`${base}/${p.id}`}>{postTitle(p, 80)}</Link>
            <span className="stat-vs">{!portal && p.clients?.name ? `${p.clients.name} · ` : ""}{NETWORK_LABEL[p.network] ?? p.network} · {t(`statuses.${p.status}`)}</span>
            {!portal && canDeletePost(p, today) && <DeletePostButton postId={p.id} title={postTitle(p, 60)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
