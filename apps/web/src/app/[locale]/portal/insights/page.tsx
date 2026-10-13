import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { InsightsPanel } from "@/components/insights/insights-panel";

export default async function PortalInsights({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("insights");
  await requireClientUser(locale);
  const p = `/${locale}/portal`;
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1>
      <InsightsPanel locale={locale} links={{ connect: `${p}/settings`, audit: `${p}/agent?view=chat&ask=audit`, recommend: `${p}/agent?view=chat&ask=recommend`, strategy: `${p}/agent?view=strategy`, review: `${p}/profile` }} />
    </>
  );
}
