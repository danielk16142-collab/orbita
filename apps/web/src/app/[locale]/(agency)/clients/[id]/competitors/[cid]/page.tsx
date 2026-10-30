import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { competitorName } from "@/lib/competitors";
import { CompetitorDetailPanel } from "@/components/competitors/competitors-panel";

/** Fetching a competitor's latest posts (a server action on this page) can take up to two minutes. */
export const maxDuration = 300;

export default async function CompetitorPage({ params }: { params: Promise<{ locale: string; id: string; cid: string }> }) {
  const { locale, id, cid } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(cid).success) notFound();
  const t = await getTranslations("competitors");
  const { sb } = await requireStaff(locale);
  const [{ data: client }, { data: comp }] = await Promise.all([
    sb.from("clients").select("name").eq("id", id).maybeSingle(),
    sb.from("competitors").select("name, url").eq("id", cid).eq("client_id", id).maybeSingle(),
  ]);
  if (!client || !comp) notFound();
  const list = `/${locale}/clients/${id}?tab=competitors`;
  return (
    <>
      <p className="eyebrow"><Link href={list}>{client.name} · {t("title")}</Link></p>
      <h1 className="h1-client">{competitorName(comp)}</h1>
      <CompetitorDetailPanel locale={locale} clientId={id} competitorId={cid} listHref={list}
        chatHref={(name) => `/${locale}/agent?${new URLSearchParams({ client: id, view: "chat", ask: "competitor", idea: name })}`}
        winChat={(idea) => `/${locale}/agent?${new URLSearchParams({ client: id, view: "chat", ask: "winner", idea })}`}
        calendarHref={`/${locale}/posts?client=${id}`} />
    </>
  );
}
