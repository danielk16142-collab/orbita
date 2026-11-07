"use client";
import { useTranslations } from "next-intl";
import { scriptCsv, scriptText, type ScriptMeta } from "@orbita/content";

/** File name from the post title: letters, numbers and dashes only. */
const fileName = (title: string, ext: string) => `${(title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "script")}.${ext}`;

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export a reel script or a carousel: a sheet (CSV, opens in Excel or Google Sheets) or a plain script to read or paste into a doc. */
export function ScriptExport({ type, content, meta }: { type: "reel" | "carousel"; content: unknown; meta: ScriptMeta }) {
  const t = useTranslations("posts.export");
  return (
    <span className="btn-row script-export">
      <button type="button" className="btn small ghost" onClick={() => download(fileName(meta.title, "csv"), scriptCsv(type, content, meta), "text/csv;charset=utf-8")}>{t("sheet")}</button>
      <button type="button" className="btn small ghost" onClick={() => download(fileName(meta.title, "txt"), scriptText(type, content, meta), "text/plain;charset=utf-8")}>{t("text")}</button>
    </span>
  );
}
