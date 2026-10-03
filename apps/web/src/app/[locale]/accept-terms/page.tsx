import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { acceptTermsAction } from "./actions";

export default async function AcceptTerms({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("acceptTerms");
  await requireUser(locale, { skipTerms: true });
  return (
    <main className="auth-wrap">
      <p className="eyebrow">Orbita</p>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <form action={acceptTermsAction} className="card">
        <input type="hidden" name="locale" value={locale} />
        <p><Link href={`/${locale}/legal/terms-of-service`} target="_blank">{t("terms")}</Link> · <Link href={`/${locale}/legal/privacy-policy`} target="_blank">{t("privacy")}</Link></p>
        <label style={{ textTransform: "none", letterSpacing: 0, fontFamily: "inherit", fontSize: "1rem", display: "flex", gap: ".6rem", alignItems: "flex-start" }}>
          <input type="checkbox" name="accept" required style={{ width: "auto", marginTop: ".25rem" }} />
          <span>{t("checkbox")}</span>
        </label>
        <button className="btn" style={{ width: "100%", marginTop: "1.25rem" }}>{t("continue")}</button>
        {error && <p className="error" role="alert">{t("required")}</p>}
      </form>
    </main>
  );
}
