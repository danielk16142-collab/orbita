import { getTranslations } from "next-intl/server";
import { connectorConfigured, CONNECTOR_NETWORKS } from "@orbita/connectors";
import { resolveAgentActor } from "@/lib/agent/access";
import { notFound } from "next/navigation";
import { AccountActions } from "./account-actions";

const SCOPE_KEYS: Record<string, string[]> = { instagram: ["profile", "media", "insights"], tiktok: ["profile", "stats", "videos"] };

/** Connected accounts and the Connect buttons. Read-only access: we never post, message or change anything on a connected account. */
export async function ConnectionsPanel({ locale, clientId, flash }: { locale: string; clientId?: string; flash?: { connected?: string; connect?: string; error?: string } }) {
  const t = await getTranslations("connections");
  const access = await resolveAgentActor(clientId);
  if (!access.ok) notFound();
  const { actor } = access;
  const cid = actor.profile.role === "client" ? undefined : actor.clientId;
  const { data: accounts } = await actor.sb.from("social_accounts").select("id, network, handle, display_name, status, last_synced_at, last_error, token_expires_at").eq("client_id", actor.clientId).order("created_at");
  const flashKey = flash?.connected ? "connected" : flash?.connect ?? flash?.error ?? null;

  return (
    <section>
      <h2>{t("title")}</h2>
      <p>{t("intro")}</p>
      <p className="card" role="note">{t("readOnly")}</p>
      {flashKey && t.has(`flash.${flashKey}`) && <p role="status" className={flashKey === "connected" ? "card" : "error"}>{t(`flash.${flashKey}`)}</p>}
      <div className="grid">
        {CONNECTOR_NETWORKS.map((n) => {
          const mine = (accounts ?? []).filter((a) => a.network === n);
          const configured = connectorConfigured(n);
          const href = `/api/connect/${n}/start?locale=${locale}${cid ? `&clientId=${cid}` : ""}`;
          return (
            <article key={n} className="card">
              <p className="eyebrow">{t(`networks.${n}`)}</p>
              <p><small>{t(`hints.${n}`)}</small></p>
              {mine.length === 0 && <p>{t("noAccounts")}</p>}
              {mine.map((a) => (
                <div key={a.id} className="conn-account">
                  <p><strong>{a.display_name ?? a.handle ?? "—"}</strong> {a.handle && a.handle !== a.display_name ? <span>@{a.handle}</span> : null}</p>
                  <p><span className={`badge ${a.status}`}>{t(`status.${a.status}`)}</span> · {a.last_synced_at ? t("lastSync", { when: new Date(a.last_synced_at).toLocaleString(locale) }) : t("neverSynced")}</p>
                  {a.last_error && <p className="error" role="alert">{t.has(`errors.${a.last_error}`) ? t(`errors.${a.last_error}`) : t("errors.failed")}</p>}
                  {a.status === "expired" && configured && <a className="btn small" href={href}>{t("reconnect")}</a>}
                  <AccountActions accountId={a.id} clientId={cid} />
                </div>
              ))}
              {configured ? <a className="btn" href={href}>{mine.length ? t("addAnother") : t("connect")}</a> : <p><em>{t("notConfigured")}</em></p>}
              <details><summary>{t("readsTitle")}</summary><ul>{SCOPE_KEYS[n].map((k) => <li key={k}>{t(`reads.${n}.${k}`)}</li>)}</ul></details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
