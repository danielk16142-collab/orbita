import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Script from "next/script";
import { loginAction } from "./actions";
import { LegalLinks } from "@/components/legal-links";

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("login");
  const { error } = await searchParams;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="auth-wrap">
      <p className="eyebrow">Orbita</p>
      <h1>{t("title")}</h1>
      <form action={loginAction} className="card">
        <label htmlFor="email">{t("email")}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">{t("password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {/* Cloudflare Turnstile injects a hidden "cf-turnstile-response" field into this form. */}
        <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} data-action="login" />
        <button type="submit" className="btn" style={{ width: "100%", marginTop: "1.25rem" }}>{t("submit")}</button>
        {error && <p className="error" role="alert">{t(error === "captcha" ? "captcha" : error === "rate" ? "tooMany" : "invalid")}</p>}
      </form>
      <LegalLinks locale={locale} />
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} async defer />
    </main>
  );
}
