import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { StrategyPanel } from "@/components/strategy/strategy-panel";

export default async function PortalStrategy({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ month?: string; layout?: string }> }) {
  const { locale } = await params;
  const q = await searchParams;
  const t = await getTranslations("strategyPage");
  await requireClientUser(locale);
  const base = `/${locale}/portal/strategy`;
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1>
      <StrategyPanel locale={locale} query={q} hrefFor={(extra) => `${base}?${new URLSearchParams(extra)}`}
        agentAskHref={`/${locale}/portal/agent?${new URLSearchParams({ view: "chat", ask: "strategy" })}`} profileHref={`/${locale}/portal/profile`} />
    </>
  );
}
