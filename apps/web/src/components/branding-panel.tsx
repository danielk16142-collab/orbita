import { getTranslations } from "next-intl/server";
import { themeVars } from "@/lib/theme";
import { saveColorsAction, uploadLogoAction, setBrandingLockAction } from "@/lib/branding-actions";

type Client = { id: string; primary_color: string | null; accent_color: string | null; branding_locked: boolean };

/** Branding editor shared by the agency (staff) and the client portal. Server component: works without JS. */
export async function BrandingPanel(props: {
  locale: string; client: Client; canEdit: boolean; isAdmin?: boolean;
  logos: { light: string | null; dark: string | null }; saved?: boolean; error?: string;
}) {
  const { locale, client, canEdit, isAdmin, logos } = props;
  const t = await getTranslations("branding");
  const tc = await getTranslations("common");
  const known = ["invalid", "lowContrast", "unsupported", "tooLarge", "empty", "locked"] as const;
  const error = props.error && (known as readonly string[]).includes(props.error) ? (props.error as (typeof known)[number]) : props.error ? "empty" : null;
  const style = themeVars({ primary: client.primary_color, accent: client.accent_color }) as React.CSSProperties;
  const hidden = (<><input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={client.id} /></>);
  return (
    <section>
      <h2>{t("title")}</h2>
      <p>{t("intro")}</p>
      {props.saved && <p role="status" className="card">✓</p>}
      {error && <p className="error" role="alert">{error === "locked" ? t("locked") : t(error)}</p>}
      {client.branding_locked && !isAdmin && <p className="card" role="note">{t("locked")}</p>}

      <div className="card" style={{ ...style, marginBottom: "1.25rem" }} aria-label={t("preview")}>
        <p className="eyebrow">{t("preview")}</p>
        <span className="btn" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>{t("sample")}</span>
      </div>

      {canEdit && (
        <form action={saveColorsAction} className="card" style={{ marginBottom: "1.25rem" }}>
          {hidden}
          <label htmlFor="primary">{t("primary")}</label>
          <input id="primary" name="primary" type="color" defaultValue={client.primary_color ?? "#ff4e1b"} style={{ height: "3rem", padding: ".2rem" }} />
          <label htmlFor="accent">{t("accent")}</label>
          <input id="accent" name="accent" type="color" defaultValue={client.accent_color ?? "#ff8c6b"} style={{ height: "3rem", padding: ".2rem" }} />
          <div style={{ display: "flex", gap: ".75rem", marginTop: "1.25rem" }}>
            <button className="btn">{tc("save")}</button>
            <button className="btn ghost" name="reset" value="1" formNoValidate>{t("reset")}</button>
          </div>
        </form>
      )}

      {(["light", "dark"] as const).map((v) => (
        <div key={v} className="card" style={{ marginBottom: "1.25rem" }}>
          <p className="eyebrow">{t(v === "light" ? "logoLight" : "logoDark")}</p>
          {logos[v] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logos[v]!} alt="" style={{ maxWidth: 240, maxHeight: 100, background: v === "dark" ? "#0a0a0a" : "#fff", padding: 8, border: "2px solid var(--line)", borderRadius: 12 }} />
          )}
          {canEdit && (
            <form action={uploadLogoAction} encType="multipart/form-data">
              {hidden}<input type="hidden" name="variant" value={v} />
              <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required />
              <small>{t("logoHint")}</small>
              <div><button className="btn" style={{ marginTop: ".75rem" }}>{t("upload")}</button></div>
            </form>
          )}
        </div>
      ))}

      {isAdmin && (
        <form action={setBrandingLockAction} className="card">
          {hidden}
          <p className="eyebrow">{t("lock")}</p>
          <p>{t("lockHint")}</p>
          <button className="btn ghost" name="lock" value={client.branding_locked ? "0" : "1"}>{client.branding_locked ? "🔓" : "🔒"} {t("lock")}</button>
        </form>
      )}
    </section>
  );
}
