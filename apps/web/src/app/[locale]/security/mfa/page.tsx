import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { MfaEnroll, MfaVerify } from "@/components/mfa-forms";

export default async function MfaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("mfa");
  const { sb } = await requireUser(locale, { skipMfa: true });
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(`/${locale}/dashboard`);
  const { data: factors } = await sb.auth.mfa.listFactors();
  const verified = factors?.totp?.[0]; // listFactors().totp contains only verified factors
  return (
    <main className="auth-wrap">
      <p className="eyebrow">Orbita</p>
      <h1>{verified ? t("verifyTitle") : t("title")}</h1>
      <p>{verified ? t("verifyIntro") : t("intro")}</p>
      {verified ? <MfaVerify locale={locale} factorId={verified.id} /> : <MfaEnroll locale={locale} />}
    </main>
  );
}
