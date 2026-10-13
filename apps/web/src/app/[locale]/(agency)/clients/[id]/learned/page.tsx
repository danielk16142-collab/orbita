import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { loadMemories, MemoriesView } from "@/components/profile/memories";

/** Everything the agent has learned about one client, organized into business preferences and facts. */
export default async function Learned({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const t = await getTranslations("profile");
  const ta = await getTranslations("agent");
  const { sb } = await requireStaff(locale);
  const { data: client } = await sb.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();
  const { memories, clientId } = await loadMemories(id);
  return (
    <>
      <p className="eyebrow"><Link href={`/${locale}/clients/${id}?tab=profile`}>{client.name} · {t("title")}</Link></p>
      <h1 className="h1-client">{ta("memories")}</h1>
      <p className="stat-vs page-intro">{t("learnedIntro")}</p>
      <MemoriesView locale={locale} memories={memories} clientId={clientId} />
    </>
  );
}
