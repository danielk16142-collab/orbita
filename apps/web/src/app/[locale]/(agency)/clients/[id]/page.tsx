import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { BrandingPanel } from "@/components/branding-panel";
import { AgentPanel } from "@/components/agent/agent-panel";
import { ConnectionsPanel } from "@/components/connections/connections-panel";
import { deleteClientAction, inviteAction, revokeInvitationAction } from "../actions";

const TABS = ["overview", "agent", "branding", "users", "connections"] as const;

export default async function ClientDetail({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string; error?: string; invited?: string; connected?: string; connect?: string }>;
}) {
  const { locale, id } = await params;
  const q = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const t = await getTranslations("clients");
  const tc = await getTranslations("common");
  const s = await requireStaff(locale);
  const { data: client } = await s.sb.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound(); // also what staff of another agency see: RLS hides it
  const tab = (TABS as readonly string[]).includes(q.tab ?? "") ? (q.tab as (typeof TABS)[number]) : "overview";
  const isAdmin = s.profile.role === "admin";

  const sign = async (path: string | null) => path ? (await s.sb.storage.from("client-logos").createSignedUrl(path, 3600)).data?.signedUrl ?? null : null;
  const [{ data: people }, { data: pending }] = tab === "users" ? await Promise.all([
    s.sb.from("profiles").select("user_id, full_name, role").eq("client_id", id),
    s.sb.from("invitations").select("id, email, role, expires_at").eq("client_id", id).is("used_at", null).gt("expires_at", new Date().toISOString()),
  ]) : [{ data: null }, { data: null }];

  return (
    <>
      <p className="eyebrow"><Link href={`/${locale}/clients`}>{t("title")}</Link></p>
      <h1>{client.name}</h1>
      <nav className="legal-nav" aria-label="Tabs" style={{ marginBottom: "1.5rem" }}>
        {TABS.map((x) => <Link key={x} href={`/${locale}/clients/${id}?tab=${x}`} aria-current={x === tab ? "page" : undefined}>{t(`tabs.${x}`)}</Link>)}
      </nav>

      {tab === "overview" && (
        <>
          <div className="card">
            <p className="eyebrow">{t("languages")}</p><p>{client.languages.join(", ").toUpperCase()}</p>
            <p className="eyebrow">{t("markets")}</p><p>{client.markets.join(", ") || "—"}</p>
          </div>
          {isAdmin && (
            <form action={deleteClientAction} className="card" style={{ marginTop: "1.5rem" }}>
              <h2>{t("deleteClient")}</h2><p>{t("deleteWarn")}</p>
              {q.error === "confirm" && <p className="error" role="alert">{tc("error")}</p>}
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={id} />
              <label htmlFor="confirm">{client.name}</label>
              <input id="confirm" name="confirm" required autoComplete="off" />
              <button className="btn ghost" style={{ marginTop: "1rem" }}>{tc("delete")}</button>
            </form>
          )}
        </>
      )}

      {tab === "agent" && <AgentPanel locale={locale as "en" | "fr" | "es"} clientId={id} />}

      {tab === "branding" && (
        <BrandingPanel locale={locale} client={client} canEdit isAdmin={isAdmin}
          logos={{ light: await sign(client.logo_light_path), dark: await sign(client.logo_dark_path) }}
          saved={q.saved === "1"} error={q.error} />
      )}

      {tab === "users" && (
        <>
          {q.invited && <p role="status" className="card">{t("sent")}</p>}
          {q.error && <p className="error" role="alert">{q.error === "email" ? t("invalidEmail") : q.error === "forbidden" ? tc("forbidden") : q.error === "rate" ? tc("rate") : tc("error")}</p>}
          <h2>{t("users")}</h2>
          {people?.length ? (
            <ul>{people.map((p) => <li key={p.user_id}>{p.full_name ?? "—"} · {t(p.role as "client")}</li>)}</ul>
          ) : <p>{t("noUsers")}</p>}
          {!!pending?.length && (
            <>
              <h2>{t("pending")}</h2>
              {pending.map((i) => (
                <form key={i.id} action={revokeInvitationAction} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={id} /><input type="hidden" name="id" value={i.id} />
                  <span>{i.email} · {t("expires")} {new Date(i.expires_at).toLocaleDateString(locale)}</span>
                  <button className="btn ghost">{t("revoke")}</button>
                </form>
              ))}
            </>
          )}
          <form action={inviteAction} className="card" style={{ maxWidth: "32rem", marginTop: "1.5rem" }}>
            <h2>{t("inviteTitle")}</h2>
            <input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={id} />
            <input type="hidden" name="role" value="client" />
            <label htmlFor="email">{t("email")}</label>
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" />
            <div><button className="btn" style={{ marginTop: "1.25rem" }}>{t("send")}</button></div>
          </form>
        </>
      )}

      {tab === "connections" && <ConnectionsPanel locale={locale} clientId={id} flash={{ connected: q.connected, connect: q.connect, error: q.error }} />}
    </>
  );
}
