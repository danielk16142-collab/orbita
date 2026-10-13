import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { loadMemories, MemoriesView } from "@/components/profile/memories";

export default async function PortalLearned({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("profile");
  const ta = await getTranslations("agent");
  await requireClientUser(locale);
  const { memories } = await loadMemories(); // client users never send an id: the server pins it
  return (
    <>
      <p className="eyebrow"><Link href={`/${locale}/portal/profile`}>{t("title")}</Link></p>
      <h1 className="h1-client">{ta("memories")}</h1>
      <p className="stat-vs page-intro">{t("learnedIntro")}</p>
      <MemoriesView locale={locale} memories={memories} />
    </>
  );
}
