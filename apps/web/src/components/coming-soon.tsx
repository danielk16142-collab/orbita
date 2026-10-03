import { getTranslations } from "next-intl/server";

export async function ComingSoon({ kind }: { kind: "posts" | "agent" }) {
  const t = await getTranslations("placeholder");
  const c = await getTranslations("common");
  return (<><p className="eyebrow">{c("soon")}</p><h1>{kind === "posts" ? "Posts" : "Agent"}</h1><p className="card">{t(kind)}</p></>);
}
