import { getTranslations } from "next-intl/server";
import { themeVars } from "@/lib/theme";
import { REFERENCE_KINDS } from "@/lib/brand";
import type { ReferenceView } from "@/lib/references";
import { deleteReferenceAction, saveColorsAction, savePaletteAction, setBrandingLockAction, uploadLogoAction, uploadReferenceAction } from "@/lib/branding-actions";
import { PaletteEditor, type PaletteColor } from "./palette-editor";

type Client = {
  id: string; primary_color: string | null; accent_color: string | null; branding_locked: boolean;
  palette?: unknown; font?: string | null; body_font?: string | null;
};

const paletteOf = (v: unknown): PaletteColor[] => (Array.isArray(v) ? v.filter((x): x is PaletteColor => !!x && typeof x === "object" && typeof x.hex === "string" && typeof x.name === "string").map((x) => ({ name: x.name, hex: x.hex, role: typeof x.role === "string" ? x.role : "other" })) : []);

/** Branding editor shared by the agency (staff) and the client portal. Server component; only the palette rows need JS. */
export async function BrandingPanel(props: {
  locale: string; client: Client; canEdit: boolean; isAdmin?: boolean;
  logos: { light: string | null; dark: string | null }; references: ReferenceView[]; saved?: boolean; error?: string;
}) {
  const { locale, client, canEdit, isAdmin, logos, references } = props;
  const t = await getTranslations("branding");
  const tc = await getTranslations("common");
  const known = ["invalid", "lowContrast", "unsupported", "tooLarge", "refTooLarge", "tooMany", "empty", "locked", "rate"] as const;
  const error = props.error && (known as readonly string[]).includes(props.error) ? (props.error as (typeof known)[number]) : props.error ? "empty" : null;
  const style = themeVars({ primary: client.primary_color, accent: client.accent_color }) as React.CSSProperties;
  const palette = paletteOf(client.palette);
  const hidden = (<><input type="hidden" name="locale" value={locale} /><input type="hidden" name="clientId" value={client.id} /></>);
  return (
    <section className="stack">
      <div>
        <h2>{t("title")}</h2>
        <p className="stat-vs">{t("intro")}</p>
        {props.saved && <p role="status" className="ok">{tc("saved")}</p>}
        {error && <p className="error" role="alert">{error === "rate" ? tc("rate") : t(error)}</p>}
        {client.branding_locked && !isAdmin && <p className="card" role="note">{t("locked")}</p>}
      </div>

      <div className="card brand-preview" style={style} aria-label={t("preview")}>
        <p className="eyebrow">{t("preview")}</p>
        <div className="swatches">
          {[{ name: t("primary"), hex: client.primary_color ?? "#ff4e1b" }, { name: t("accent"), hex: client.accent_color ?? "#ff8c6b" }, ...palette].map((c, i) => (
            <figure key={i} className="swatch-tile"><span style={{ background: c.hex }} /><figcaption><strong>{c.name}</strong><code>{c.hex.toUpperCase()}</code></figcaption></figure>
          ))}
        </div>
        <div className="font-sample">
          <p className="stat-vs">{t("headingFont")}: <strong>{client.font || "—"}</strong> · {t("bodyFont")}: <strong>{client.body_font || "—"}</strong></p>
        </div>
        <span className="btn" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>{t("sample")}</span>
      </div>

      <div className="profile-grid even">
        {canEdit && (
          <form action={saveColorsAction} className="card">
            {hidden}
            <h3>{t("themeTitle")}</h3>
            <p className="stat-vs">{t("themeHint")}</p>
            <div className="color-pair">
              <div><label htmlFor="primary">{t("primary")}</label><input id="primary" name="primary" type="color" defaultValue={client.primary_color ?? "#ff4e1b"} className="color-input" /></div>
              <div><label htmlFor="accent">{t("accent")}</label><input id="accent" name="accent" type="color" defaultValue={client.accent_color ?? "#ff8c6b"} className="color-input" /></div>
            </div>
            <div className="btn-row" style={{ marginTop: "1.25rem" }}>
              <button className="btn">{tc("save")}</button>
              <button className="btn ghost" name="reset" value="1" formNoValidate>{t("reset")}</button>
            </div>
          </form>
        )}

        <div className="card">
          <h3>{t("logos")}</h3>
          <div className="logo-pair">
            {(["light", "dark"] as const).map((v) => (
              <div key={v}>
                <p className="eyebrow">{t(v === "light" ? "logoLight" : "logoDark")}</p>
                <div className={`logo-box ${v}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logos[v] ? <img src={logos[v]!} alt="" /> : <span className="stat-vs">{t("noLogo")}</span>}
                </div>
                {canEdit && (
                  <form action={uploadLogoAction} encType="multipart/form-data" className="upload-row">
                    {hidden}<input type="hidden" name="variant" value={v} />
                    <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required aria-label={t(v === "light" ? "logoLight" : "logoDark")} />
                    <button className="btn small">{t("upload")}</button>
                  </form>
                )}
              </div>
            ))}
          </div>
          <small>{t("logoHint")}</small>
        </div>
      </div>

      <form action={savePaletteAction} className="card">
        {hidden}
        <h3>{t("paletteTitle")}</h3>
        <p className="stat-vs">{t("paletteIntro")}</p>
        <PaletteEditor initial={palette} disabled={!canEdit} />
        <div className="color-pair" style={{ marginTop: ".5rem" }}>
          <div><label htmlFor="font">{t("headingFont")}</label><input id="font" name="font" maxLength={80} defaultValue={client.font ?? ""} placeholder="Bricolage Grotesque" disabled={!canEdit} /></div>
          <div><label htmlFor="body_font">{t("bodyFont")}</label><input id="body_font" name="body_font" maxLength={80} defaultValue={client.body_font ?? ""} placeholder="Inter" disabled={!canEdit} /></div>
        </div>
        {canEdit && <div><button className="btn" style={{ marginTop: "1.25rem" }}>{tc("save")}</button></div>}
      </form>

      <section className="card">
        <h3>{t("refsTitle")}</h3>
        <p className="stat-vs">{t("refsIntro")}</p>
        {canEdit && (
          <form action={uploadReferenceAction} encType="multipart/form-data" className="ref-upload">
            {hidden}
            <label>{t("refFile")}<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required /></label>
            <label>{t("refKind")}<select name="kind" defaultValue="style">{REFERENCE_KINDS.map((k) => <option key={k} value={k}>{t(`refKinds.${k}`)}</option>)}</select></label>
            <label className="grow">{t("refCaption")}<input name="caption" maxLength={300} placeholder={t("refCaptionPlaceholder")} /></label>
            <button className="btn">{t("upload")}</button>
          </form>
        )}
        <small>{t("refHint")}</small>
        {references.length ? (
          <ul className="plain ref-grid">
            {references.map((r) => (
              <li key={r.id} className="ref-item">
                {/* Shown whole (contain), never cropped. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="ref-img">{r.url ? <img src={r.url} alt={r.caption ?? t(`refKinds.${r.kind}`)} width={r.width ?? undefined} height={r.height ?? undefined} loading="lazy" /> : null}</div>
                <div className="ref-meta">
                  <span className={`badge ref-${r.kind}`}>{t(`refKinds.${r.kind}`)}</span>
                  {r.caption && <p>{r.caption}</p>}
                  {canEdit && (
                    <form action={deleteReferenceAction}>
                      {hidden}<input type="hidden" name="id" value={r.id} />
                      <button className="btn ghost small">{tc("delete")}</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="empty-note">{t("noRefs")}</p>}
      </section>

      {isAdmin && (
        <form action={setBrandingLockAction} className="card">
          {hidden}
          <h3>{t("lock")}</h3>
          <p>{t("lockHint")}</p>
          <button className="btn ghost" name="lock" value={client.branding_locked ? "0" : "1"}>{client.branding_locked ? "🔓 " + t("unlock") : "🔒 " + t("lock")}</button>
        </form>
      )}
    </section>
  );
}
