"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PALETTE_ROLES as ROLES } from "@/lib/brand";

export type PaletteColor = { name: string; hex: string; role: string };
const MAX = 12;

/** Edits the named palette. Submitted as one JSON field; the server validates every entry. */
export function PaletteEditor({ initial, disabled }: { initial: PaletteColor[]; disabled?: boolean }) {
  const t = useTranslations("branding");
  const [rows, setRows] = useState<PaletteColor[]>(initial.length ? initial : [{ name: "", hex: "#ff4e1b", role: "primary" }]);
  const set = (i: number, patch: Partial<PaletteColor>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const valid = rows.filter((r) => r.name.trim());
  return (
    <div className="palette-editor">
      <input type="hidden" name="palette" value={JSON.stringify(valid)} />
      <ul className="plain palette-rows">
        {rows.map((r, i) => (
          <li key={i} className="palette-row">
            <input type="color" aria-label={t("colorValue")} value={r.hex} onChange={(e) => set(i, { hex: e.target.value })} disabled={disabled} />
            <input aria-label={t("colorName")} placeholder={t("colorNamePlaceholder")} value={r.name} maxLength={40} onChange={(e) => set(i, { name: e.target.value })} disabled={disabled} />
            <select aria-label={t("colorRole")} value={r.role} onChange={(e) => set(i, { role: e.target.value })} disabled={disabled}>
              {ROLES.map((x) => <option key={x} value={x}>{t(`roles.${x}`)}</option>)}
            </select>
            <code className="hex">{r.hex.toUpperCase()}</code>
            <button type="button" className="btn ghost small" aria-label={t("removeColor")} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={disabled}>✕</button>
          </li>
        ))}
      </ul>
      {rows.length < MAX && !disabled && (
        <button type="button" className="btn ghost small" onClick={() => setRows((r) => [...r, { name: "", hex: "#cccccc", role: "other" }])}>+ {t("addColor")}</button>
      )}
      <small>{t("paletteHint", { max: MAX })}</small>
    </div>
  );
}
