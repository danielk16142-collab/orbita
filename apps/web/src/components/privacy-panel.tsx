import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { createRequestAction, deleteAccountAction, updateRequestAction } from "@/lib/privacy-actions";

const KINDS = ["access", "export", "correct", "delete", "restrict", "withdraw_consent"] as const;
const STATUSES = ["received", "verifying", "in_progress", "completed", "rejected"] as const;

export async function PrivacyPanel({ locale, q }: { locale: string; q: { submitted?: string; saved?: string; error?: string } }) {
  const t = await getTranslations("privacy");
  const { sb, profile, user } = await requireUser(locale);
  const { data: mine } = await sb.from("data_requests").select("id, kind, status, due_at, created_at").eq("requester_id", user.id).order("created_at", { ascending: false });
  const queue = profile.role === "admin"
    ? (await sb.from("data_requests").select("id, kind, status, due_at, details, resolution_note").neq("status", "completed").neq("status", "rejected").order("due_at")).data
    : null;
  const errKey = q.error === "soleAdmin" ? "soleAdmin" : q.error === "badConfirm" ? "badConfirm" : null;
  return (
    <>
      <p className="eyebrow">Orbita</p>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      {q.submitted && <p role="status" className="card">{t("submitted")}</p>}
      {errKey && <p className="error" role="alert">{t(errKey)}</p>}
      {q.error && !errKey && <p className="error" role="alert">!</p>}

      <div className="grid">
        <form action={createRequestAction} className="card">
          <h2>{t("requestTitle")}</h2>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="kind">{t("kind")}</label>
          <select id="kind" name="kind" style={{ width: "100%", padding: ".7rem", border: "2px solid var(--line)", borderRadius: 12 }}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
          </select>
          <label htmlFor="details">{t("details")}</label>
          <textarea id="details" name="details" rows={3} maxLength={4000} style={{ width: "100%", padding: ".7rem", border: "2px solid var(--line)", borderRadius: 12, font: "inherit" }} />
          <div><button className="btn" style={{ marginTop: "1rem" }}>{t("submit")}</button></div>
        </form>

        <section className="card">
          <h2>{t("exportTitle")}</h2>
          {/* Plain link to an authenticated route handler that returns the file. */}
          <a className="btn" href="/api/privacy/export" download>{t("exportBtn")}</a>
        </section>

        <form action={deleteAccountAction} className="card">
          <h2>{t("deleteTitle")}</h2><p>{t("deleteWarn")}</p>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="confirm">{t("typeDelete")}</label>
          <input id="confirm" name="confirm" autoComplete="off" required />
          <button className="btn ghost" style={{ marginTop: "1rem" }}>{t("deleteBtn")}</button>
        </form>
      </div>

      <h2 style={{ marginTop: "2rem" }}>{t("yourRequests")}</h2>
      {mine?.length ? <ul>{mine.map((r) => <li key={r.id}>{t(`kinds.${r.kind as "access"}`)} · {t(`statuses.${r.status as "received"}`)} · {t("due")} {new Date(r.due_at).toLocaleDateString(locale)}</li>)}</ul> : <p>{t("none")}</p>}

      {queue && (
        <>
          <h2 style={{ marginTop: "2rem" }}>{t("adminTitle")}</h2>
          {queue.map((r) => (
            <form key={r.id} action={updateRequestAction} className="card" style={{ marginBottom: "1rem" }}>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="id" value={r.id} />
              <p><strong>{t(`kinds.${r.kind as "access"}`)}</strong> · {t("due")} {new Date(r.due_at).toLocaleDateString(locale)}</p>
              {r.details && <p>{r.details}</p>}
              <label htmlFor={`s-${r.id}`}>{t("status")}</label>
              <select id={`s-${r.id}`} name="status" defaultValue={r.status} style={{ width: "100%", padding: ".7rem", border: "2px solid var(--line)", borderRadius: 12 }}>
                {STATUSES.map((x) => <option key={x} value={x}>{t(`statuses.${x}`)}</option>)}
              </select>
              <label htmlFor={`n-${r.id}`}>{t("note")}</label>
              <input id={`n-${r.id}`} name="note" defaultValue={r.resolution_note ?? ""} maxLength={2000} />
              <button className="btn" style={{ marginTop: "1rem" }}>{t("update")}</button>
            </form>
          ))}
        </>
      )}
    </>
  );
}
