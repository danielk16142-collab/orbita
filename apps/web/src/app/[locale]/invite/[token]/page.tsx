import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import Script from "next/script";
import { hashInviteToken, isWellFormedToken } from "@orbita/security/invitation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acceptInviteAction } from "./actions";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale, token } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("invite");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // Same response for unknown, used and expired tokens: no oracle for guessing.
  let email: string | null = null;
  if (isWellFormedToken(token)) {
    const { data } = await supabaseAdmin().from("invitations").select("email")
      .eq("token_hash", hashInviteToken(token)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    email = data?.email ?? null;
  }
  if (!email) return <main className="auth-wrap"><p className="eyebrow">Orbita</p><h1>{t("title")}</h1><p className="card" role="alert">{t("invalid")}</p></main>;

  return (
    <main className="auth-wrap">
      <p className="eyebrow">Orbita</p>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <form action={acceptInviteAction} className="card">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="token" value={token} />
        <label htmlFor="email">{t("email")}</label>
        <input id="email" value={email} readOnly />
        <label htmlFor="name">{t("name")}</label>
        <input id="name" name="name" autoComplete="name" required maxLength={120} />
        <label htmlFor="password">{t("password")}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required />
        <small>{t("passwordHint")}</small>
        <label style={{ textTransform: "none", letterSpacing: 0, fontFamily: "inherit", fontSize: ".95rem", display: "flex", gap: ".6rem", alignItems: "flex-start" }}>
          <input type="checkbox" name="accept" required style={{ width: "auto", marginTop: ".25rem" }} />
          <span>{t("accept")} (<Link href={`/${locale}/legal/terms-of-service`} target="_blank">T</Link>, <Link href={`/${locale}/legal/privacy-policy`} target="_blank">P</Link>)</span>
        </label>
        <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} data-action="invite" />
        <button className="btn" style={{ width: "100%", marginTop: "1.25rem" }}>{t("submit")}</button>
        {error && <p className="error" role="alert">{t(error === "captcha" ? "captcha" : error === "weak" ? "weak" : error === "accept" ? "mustAccept" : error === "rate" ? "failed" : "failed")}</p>}
      </form>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} async defer />
    </main>
  );
}
