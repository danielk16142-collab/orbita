import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireClientUser } from "@/lib/session";
import { competitorName } from "@/lib/competitors";
import { CompetitorDetailPanel } from "@/components/competitors/competitors-panel";

export default async function PortalCompetitor({ params }: { params: Promise<{ locale: string; cid: string }> }) {
  const { locale, cid } = await params;
  if (!z.string().uuid().safeParse(cid).success) notFound();
  const t = await getTranslations("competitors");
  const { sb, profile } = await requireClientUser(locale);
  const { data: comp } = await sb.from("competitors").select("name, url").eq("id", cid).eq("client_id", profile.client_id).maybeSingle();
  if (!comp) notFound();
  const list = `/${locale}/portal/competitors`;
  return (
    <>
      <p className="eyebrow"><Link href={list}>{t("title")}</Link></p>
      <h1 className="h1-client">{competitorName(comp)}</h1>
      <CompetitorDetailPanel locale={locale} competitorId={cid} listHref={list}
        chatHref={(name) => `/${locale}/portal/agent?${new URLSearchParams({ view: "chat", ask: "competitor", idea: name })}`}
        winChat={(idea) => `/${locale}/portal/agent?${new URLSearchParams({ view: "chat", ask: "winner", idea })}`}
        calendarHref={`/${locale}/portal/posts`} />
    </>
  );
}
