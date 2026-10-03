import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Script from "next/script";
import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getTranslations("login");
  const { error } = await searchParams;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main>
      <h1>{t("title")}</h1>
      <form action={loginAction}>
        <label htmlFor="email">{t("email")}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">{t("password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {/* Cloudflare Turnstile injects a hidden "cf-turnstile-response" field into this form. */}
        <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} data-action="login" />
        <button type="submit">{t("submit")}</button>
        {error && <p className="error" role="alert">{t(error === "captcha" ? "captcha" : error === "rate" ? "tooMany" : "invalid")}</p>}
      </form>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} async defer />
    </main>
  );
}
