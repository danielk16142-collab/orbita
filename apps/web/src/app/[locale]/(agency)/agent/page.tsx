import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";

/** Agency view: pick a client to work with its agent. */
export default async function AgentIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("agent");
  const { sb } = await requireStaff(locale);
  const { data: clients } = await sb.from("clients").select("id, name").order("name");
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p>{t("pickClient")}</p>
      <div className="grid">
        {(clients ?? []).map((c) => <Link key={c.id} href={`/${locale}/clients/${c.id}?tab=agent`} className="card" style={{ textDecoration: "none" }}><h2>{c.name}</h2><span className="btn">{t("open")}</span></Link>)}
      </div>
    </>
  );
}
