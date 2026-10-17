"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createApiKeyAction, revokeApiKeyAction, rotateApiKeyAction, setApiKeyPublishAction } from "@/lib/api-keys-actions";

export type ApiKeyRow = { id: string; name: string; prefix: string; can_publish: boolean; created_at: string; rotated_at: string | null; last_used_at: string | null; revoked_at: string | null };

/** Settings → API access (admins): keys for agents such as an assistant that runs the app daily. The key is shown once. */
export function ApiKeysPanel({ keys, locale, specUrl, baseUrl }: { keys: ApiKeyRow[]; locale: string; specUrl: string; baseUrl: string }) {
  const t = useTranslations("apiKeys");
  const router = useRouter();
  const [name, setName] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const [shown, setShown] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const fail = (code?: string) => setError(code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.failed"));
  const run = (fn: () => Promise<{ ok: boolean; key?: string; error?: string }>, label: string) => start(async () => {
    setError(null); setCopied(false);
    const r = await fn();
    if (!r.ok) { fail(r.error); return; }
    if (r.key) setShown({ name: label, key: r.key });
    router.refresh();
  });

  return (
    <section className="card api-keys" aria-labelledby="api-h">
      <h2 id="api-h">{t("title")}</h2>
      <p className="stat-vs">{t("intro")}</p>

      {shown && (
        <div className="api-key-shown" role="status">
          <p><strong>{t("shownTitle", { name: shown.name })}</strong> {t("shownHint")}</p>
          <code>{shown.key}</code>
          <div className="btn-row">
            <button type="button" className="btn small" onClick={() => { void navigator.clipboard.writeText(shown.key).then(() => setCopied(true)); }}>{copied ? `✓ ${t("copied")}` : t("copy")}</button>
            <button type="button" className="btn small ghost" onClick={() => setShown(null)}>{t("done")}</button>
          </div>
        </div>
      )}

      <form className="api-key-new" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => createApiKeyAction({ name, canPublish }), name.trim()); setName(""); }}>
        <label className="focus-field">{t("name")}<input value={name} maxLength={80} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} /></label>
        <label className="check-line"><input type="checkbox" checked={canPublish} onChange={(e) => setCanPublish(e.target.checked)} /> {t("canPublish")}</label>
        <button type="submit" className="btn" disabled={pending || !name.trim()}>{t("create")}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {keys.length > 0 && (
        <ul className="plain api-key-list">
          {keys.map((k) => (
            <li key={k.id} className={k.revoked_at ? "revoked" : ""}>
              <div>
                <strong>{k.name}</strong> <code className="api-prefix">orb_{k.prefix}_…</code>
                <div className="stat-vs">
                  {k.revoked_at ? t("revokedOn", { date: fmt.format(new Date(k.revoked_at)) }) : <>
                    {t("createdOn", { date: fmt.format(new Date(k.created_at)) })} · {k.last_used_at ? t("lastUsed", { date: fmt.format(new Date(k.last_used_at)) }) : t("neverUsed")}
                    {k.rotated_at && <> · {t("rotatedOn", { date: fmt.format(new Date(k.rotated_at)) })}</>}
                  </>}
                </div>
              </div>
              {!k.revoked_at && (
                <div className="btn-row">
                  <label className="check-line"><input type="checkbox" checked={k.can_publish} disabled={pending} onChange={(e) => run(() => setApiKeyPublishAction({ id: k.id, canPublish: e.target.checked }), k.name)} /> {t("canPublishShort")}</label>
                  <button type="button" className="btn small ghost" disabled={pending} onClick={() => { if (window.confirm(t("rotateConfirm", { name: k.name }))) run(() => rotateApiKeyAction({ id: k.id }), k.name); }}>{t("rotate")}</button>
                  <button type="button" className="btn small ghost" disabled={pending} onClick={() => { if (window.confirm(t("revokeConfirm", { name: k.name }))) run(() => revokeApiKeyAction({ id: k.id }), k.name); }}>{t("revoke")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="api-docs">
        <summary><strong>{t("howTo")}</strong></summary>
        <ol>
          <li>{t("step1")}</li>
          <li>{t("step2")} <code>{specUrl}</code></li>
          <li>{t("step3")} <code>Authorization: Bearer orb_…</code></li>
          <li>{t("step4")} <code>{`${baseUrl}/api/v1/me`}</code></li>
        </ol>
        <p className="stat-vs">{t("rules")}</p>
      </details>
    </section>
  );
}
