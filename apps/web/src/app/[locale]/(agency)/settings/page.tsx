import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { inviteAction } from "../clients/actions";

export default async function Settings({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ invited?: string; error?: string }> }) {
  const { locale } = await params;
  const q = await searchParams;
  const t = await getTranslations("settings");
  const c = await getTranslations("clients");
  const tc = await getTranslations("common");
  const { profile } = await requireStaff(locale);
  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <div className="grid">
        <section className="card"><h2>{t("security")}</h2><p>{t("securityText")}</p><Link className="btn" href={`/${locale}/security/mfa`}>{t("manageMfa")}</Link></section>
        <section className="card"><h2>{t("privacy")}</h2><p>{t("privacyText")}</p><Link className="btn" href={`/${locale}/settings/privacy`}>{t("open")}</Link></section>
      </div>
      {profile.role === "admin" && (
        <form action={inviteAction} className="card" style={{ maxWidth: "32rem", marginTop: "2rem" }}>
          <h2>{c("inviteTitle")}</h2>
          {q.invited && <p role="status">{c("sent")}</p>}
          {q.error && <p className="error" role="alert">{tc("error")}</p>}
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="email">{c("email")}</label>
          <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" />
          <label htmlFor="role">{c("role")}</label>
          <select id="role" name="role" defaultValue="team" style={{ width: "100%", padding: ".7rem", border: "2px solid var(--line)", borderRadius: 12 }}>
            <option value="team">{c("roleTeam")}</option><option value="admin">{c("roleAdmin")}</option>
          </select>
          <div><button className="btn" style={{ marginTop: "1.25rem" }}>{c("send")}</button></div>
        </form>
      )}
    </>
  );
}
