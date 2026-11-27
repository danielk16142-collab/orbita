"use client";
import { useTranslations } from "next-intl";
import { carouselMarkdown, scriptCsv, scriptText, type DesignBrand, type ScriptMeta } from "@orbita/content";

/** File name from the post title: letters, numbers and dashes only. */
const fileName = (title: string, ext: string) => `${(title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "script")}.${ext}`;

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export a reel script or a carousel: a sheet (CSV, opens in Excel or Google Sheets) or a plain script to read or paste into
 * a doc. A carousel also exports as Markdown for a design agent: specs, brand colours and fonts, and each slide.
 */
export function ScriptExport({ type, content, meta, brand }: { type: "reel" | "carousel"; content: unknown; meta: ScriptMeta; brand?: DesignBrand | null }) {
  const t = useTranslations("posts.export");
  return (
    <span className="btn-row script-export">
      <button type="button" className="btn small ghost" onClick={() => download(fileName(meta.title, "csv"), scriptCsv(type, content, meta), "text/csv;charset=utf-8")}>{t("sheet")}</button>
      <button type="button" className="btn small ghost" onClick={() => download(fileName(meta.title, "txt"), scriptText(type, content, meta), "text/plain;charset=utf-8")}>{t("text")}</button>
      {type === "carousel" && <button type="button" className="btn small ghost" title={t("designHint")} onClick={() => download(fileName(meta.title, "md"), carouselMarkdown(content, meta, brand), "text/markdown;charset=utf-8")}>{t("design")}</button>}
    </span>
  );
}
