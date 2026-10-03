import { getTranslations } from "next-intl/server";

export default async function Dashboard() {
  const t = await getTranslations("dashboard");
  return (<main><h1>{t("title")}</h1><p>{t("welcome")}</p></main>);
}
