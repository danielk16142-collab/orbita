import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Script from "next/script";
import { requestResetAction } from "./actions";

export default async function ForgotPasswordPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("reset");
  const { error, sent } = await searchParams;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="auth-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="auth-logo" src="/brand/orbita-logo.svg" alt="Orbita" width={716} height={203} />
      <h1>{t("forgotTitle")}</h1>
      {sent ? (
        <p role="status" className="card">{t("sent")}</p>
      ) : (
        <form action={requestResetAction} className="card">
          <p>{t("forgotIntro")}</p>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="email">{t("email")}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} data-action="reset" />
          <button type="submit" className="btn" style={{ width: "100%", marginTop: "1.25rem" }}>{t("send")}</button>
          {error && <p className="error" role="alert">{t(`errors.${["captcha", "rate", "expired"].includes(error) ? error : "invalid"}`)}</p>}
        </form>
      )}
      <p style={{ marginTop: "1rem" }}><Link href={`/${locale}/login`}>{t("backToLogin")}</Link></p>
      {!sent && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} async defer />}
    </main>
  );
}
