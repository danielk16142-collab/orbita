import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { createClientAction } from "./actions";

export default async function ClientsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("clients");
  const tc = await getTranslations("common");
  const { sb } = await requireStaff(locale);
  const { data: clients } = await sb.from("clients").select("id, name, languages, created_at").order("created_at", { ascending: false });
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      {error && <p className="error" role="alert">{tc("error")}</p>}
      <div className="grid">
        {(clients ?? []).map((c) => (
          <Link key={c.id} href={`/${locale}/clients/${c.id}`} className="card" style={{ textDecoration: "none" }}>
            <h2>{c.name}</h2>
            <p className="eyebrow">{c.languages.join(" · ").toUpperCase()}</p>
            <span className="btn" style={{ marginTop: ".75rem" }}>{t("open")}</span>
          </Link>
        ))}
      </div>
      {!clients?.length && <p>{t("empty")}</p>}
      <form action={createClientAction} className="card" style={{ maxWidth: "32rem", marginTop: "2rem" }}>
        <h2>{t("newTitle")}</h2>
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="name">{t("name")}</label>
        <input id="name" name="name" required maxLength={120} />
        <fieldset style={{ border: 0, padding: 0, margin: "1rem 0 0" }}>
          <legend className="eyebrow">{t("languages")}</legend>
          {(["en", "fr", "es"] as const).map((l) => (
            <label key={l} style={{ display: "inline-flex", gap: ".4rem", marginRight: "1rem", textTransform: "none", letterSpacing: 0, fontFamily: "inherit", fontSize: "1rem" }}>
              <input type="checkbox" name="languages" value={l} defaultChecked={l === locale} style={{ width: "auto" }} /> {l.toUpperCase()}
            </label>
          ))}
        </fieldset>
        <label htmlFor="markets">{t("markets")}</label>
        <input id="markets" name="markets" maxLength={300} />
        <small>{t("marketsHint")}</small>
        <div><button className="btn" style={{ marginTop: "1.25rem" }}>{tc("create")}</button></div>
      </form>
    </>
  );
}
