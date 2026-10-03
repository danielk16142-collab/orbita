import { getTranslations } from "next-intl/server";

export default async function PortalHome() {
  const t = await getTranslations("portal");
  const d = await getTranslations("dashboard");
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <div className="grid">
        {(["followers", "reach", "engagement", "nextPosts"] as const).map((k) => (
          <section key={k} className="card"><p className="eyebrow">{d(`cards.${k}`)}</p><div className="kpi">—</div></section>
        ))}
      </div>
    </>
  );
}
