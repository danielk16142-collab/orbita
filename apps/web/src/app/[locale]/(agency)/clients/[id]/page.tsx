import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { BrandingPanel } from "@/components/branding-panel";
import { loadReferences } from "@/lib/references";
import { AgentWorkspace, agentViewOf } from "@/components/agent/agent-workspace";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { ConnectionsPanel } from "@/components/connections/connections-panel";
import { Tabs } from "@/components/tabs";
import { deleteClientAction, inviteAction, revokeInvitationAction } from "../actions";

const TABS = ["profile", "agent", "insights", "branding", "connections", "users"] as const;
type Tab = (typeof TABS)[number];

export default async function ClientDetail({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string; view?: string; ask?: string; format?: string; network?: string; idea?: string; saved?: string; error?: string; invited?: string; connected?: string; connect?: string }>;
}) {
  const { locale, id } = await params;
  const q = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const t = await getTranslations("clients");
  const tc = await getTranslations("common");
  const tp = await getTranslations("posts");
  const s = await requireStaff(locale);
  const { data: client } = await s.sb.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound(); // also what staff of another agency see: RLS hides it
  // "overview" was the old name of the profile tab; keep old links working.
  const tab: Tab = q.tab === "overview" ? "profile" : (TABS as readonly string[]).includes(q.tab ?? "") ? (q.tab as Tab) : "profile";
  const isAdmin = s.profile.role === "admin";
  const base = `/${locale}/clients/${id}`;
  const href = (x: string, extra: Record<string, string> = {}) => `${base}?${new URLSearchParams({ tab: x, ...extra })}`;

  const sign = async (path: string | null) => path ? (await s.sb.storage.from("client-logos").createSignedUrl(path, 3600)).data?.signedUrl ?? null : null;
  const [{ data: people }, { data: pending }] = tab === "users" ? await Promise.all([
    s.sb.from("profiles").select("user_id, full_name, role").eq("client_id", id),
    s.sb.from("invitations").select("id, email, role, expires_at").eq("client_id", id).is("used_at", null).gt("expires_at", new Date().toISOString()),
  ]) : [{ data: null }, { data: null }];

  return (
    <>
      <p className="eyebrow"><Link href={`/${locale}/clients`}>{t("title")}</Link></p>
      <div className="page-head">
        <h1 className="h1-client">{client.name}</h1>
        <div className="btn-row">
          <Link className="btn ghost" href={`/${locale}/posts?client=${id}`}>{tp("calendar")}</Link>
          <Link className="btn" href={`/${locale}/posts/new?client=${id}`}>{tp("createPost")}</Link>
        </div>
      </div>
      <Tabs label={t("title")} current={tab} items={TABS.map((x) => ({ key: x, label: t(`tabs.${x}`), href: href(x) }))} />

      {tab === "profile" && (
        <ProfilePanel locale={locale} clientId={id} staff client={client} flash={{ saved: q.saved === "1", error: q.error }}
          danger={isAdmin && (
            <form action={deleteClientAction} className="card danger">
              <h2>{t("deleteClient")}</h2><p>{t("deleteWarn")}</p>
              {q.error === "confirm" && <p className="error" role="alert">{tc("error")}</p>}
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={id} />
              <label htmlFor="confirm">{t("typeName", { name: client.name })}</label>
              <input id="confirm" name="confirm" required autoComplete="off" />
              <button className="btn ghost" style={{ marginTop: "1rem" }}>{tc("delete")}</button>
            </form>
          )} />
      )}

      {tab === "agent" && (
        <AgentWorkspace locale={locale as "en" | "fr" | "es"} clientId={id} view={agentViewOf(q.view)} query={q}
          hrefFor={(v, extra) => href("agent", { view: v, ...extra })} profileHref={href("profile")} />
      )}

      {tab === "insights" && (
        <InsightsPanel locale={locale} clientId={id} links={{
          connect: href("connections"), audit: href("agent", { view: "chat", ask: "audit" }), recommend: href("agent", { view: "chat", ask: "recommend" }),
          strategy: href("agent", { view: "strategy" }), review: href("profile"),
        }} />
      )}

      {tab === "branding" && (
        <BrandingPanel locale={locale} client={client} canEdit isAdmin={isAdmin}
          logos={{ light: await sign(client.logo_light_path), dark: await sign(client.logo_dark_path) }}
          references={await loadReferences(s.sb, id)}
          saved={q.saved === "1"} error={q.error} />
      )}

      {tab === "users" && (
        <>
          {q.invited && <p role="status" className="card">{t("sent")}</p>}
          {q.error && <p className="error" role="alert">{q.error === "email" ? t("invalidEmail") : q.error === "forbidden" ? tc("forbidden") : q.error === "rate" ? tc("rate") : tc("error")}</p>}
          <div className="profile-grid">
            <section className="card">
              <h2>{t("users")}</h2>
              {people?.length ? (
                <ul className="plain">{people.map((p) => <li key={p.user_id}><span>{p.full_name ?? "—"}</span><span className="badge">{t(p.role as "client")}</span></li>)}</ul>
              ) : <p>{t("noUsers")}</p>}
              {!!pending?.length && (
                <>
                  <h2 style={{ marginTop: "1.25rem" }}>{t("pending")}</h2>
                  {pending.map((i) => (
                    <form key={i.id} action={revokeInvitationAction} className="source-form">
                      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={id} /><input type="hidden" name="id" value={i.id} />
                      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{i.email} · {t("expires")} {new Date(i.expires_at).toLocaleDateString(locale)}</span>
                      <button className="btn ghost small">{t("revoke")}</button>
                    </form>
                  ))}
                </>
              )}
            </section>
            <form action={inviteAction} className="card">
              <h2>{t("inviteTitle")}</h2>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={id} />
              <input type="hidden" name="role" value="client" />
              <label htmlFor="email">{t("email")}</label>
              <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" />
              <div><button className="btn" style={{ marginTop: "1.25rem" }}>{t("send")}</button></div>
            </form>
          </div>
        </>
      )}

      {tab === "connections" && <ConnectionsPanel locale={locale} clientId={id} flash={{ connected: q.connected, connect: q.connect, error: q.error }} />}
    </>
  );
}
