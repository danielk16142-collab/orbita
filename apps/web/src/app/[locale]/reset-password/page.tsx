import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { setPasswordAction } from "./actions";

export default async function ResetPasswordPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  await requireUser(locale, { skipTerms: true }); // the reset link signed the person in; two-step verification still applies
  const t = await getTranslations("reset");
  const { error } = await searchParams;
  return (
    <main className="auth-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="auth-logo" src="/brand/orbita-logo.svg" alt="Orbita" width={716} height={203} />
      <h1>{t("newTitle")}</h1>
      <form action={setPasswordAction} className="card">
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="password">{t("newPassword")}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
        <small>{t("rules")}</small>
        <label htmlFor="confirm">{t("confirm")}</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
        <button type="submit" className="btn" style={{ width: "100%", marginTop: "1.25rem" }}>{t("save")}</button>
        {error && <p className="error" role="alert">{t(`errors.${["mismatch", "short", "weak", "same"].includes(error) ? error : "failed"}`)}</p>}
      </form>
    </main>
  );
}
