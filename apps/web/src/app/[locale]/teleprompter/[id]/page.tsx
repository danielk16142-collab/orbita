import { notFound } from "next/navigation";
import { buildScript, parseContent, ReelContent } from "@orbita/content";
import { loadPost } from "@/lib/posts/access";
import { getSession, requireStaff, requireUser } from "@/lib/session";
import { Teleprompter } from "@/components/posts/teleprompter";

/** Full-screen teleprompter for a reel (no navigation shell). Same access rules as the post itself. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ hook?: string }> }) {
  const { locale, id } = await params;
  const pre = await getSession(); // staff need MFA, clients just a session
  const s = pre && pre.profile.role !== "client" ? await requireStaff(locale) : await requireUser(locale);
  const r = await loadPost({ sb: s.sb, userId: s.user.id, profile: s.profile, isStaff: s.profile.role !== "client" }, id);
  if (!r.ok || r.value.type !== "reel") notFound();
  const parsed = parseContent("reel", r.value.content);
  const c = parsed.ok && parsed.value ? ReelContent.safeParse(parsed.value) : null;
  if (!c?.success) notFound();
  const q = Number((await searchParams).hook);
  const hookIndex = Number.isInteger(q) ? Math.min(Math.max(q, 0), c.data.hook_options.length - 1) : 0;
  const back = s.profile.role === "client" ? `/${locale}/portal/posts/${id}` : `/${locale}/posts/${id}`;
  return <Teleprompter lines={buildScript(c.data, hookIndex)} hooks={c.data.hook_options} hookIndex={hookIndex} back={back} />;
}
