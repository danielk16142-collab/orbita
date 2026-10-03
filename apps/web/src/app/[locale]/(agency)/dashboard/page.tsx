import { getTranslations } from "next-intl/server";

export default async function Dashboard() {
  const t = await getTranslations("dashboard");
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p>{t("welcome")}</p>
      <div className="grid">
        {(["followers", "reach", "engagement", "nextPosts"] as const).map((k) => (
          <section key={k} className="card">
            <p className="eyebrow">{t(`cards.${k}`)}</p>
            <div className="kpi">—</div>
            <p style={{ color: "var(--dim)", margin: 0 }}>{t("connectHint")}</p>
          </section>
        ))}
      </div>
    </>
  );
}
