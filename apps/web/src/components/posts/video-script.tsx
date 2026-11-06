"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { NETWORK_LABEL } from "./shared";

export type NetworkCaption = { caption: string; hashtags: string[] };

/**
 * "I already have the video": paste what is said in it, then the agent writes the caption for each network from that
 * script. Captions stay editable; the post is created with them (and the script) by the page.
 */
export function VideoScript({ clientId, locale, language, languageName, format, networks, idea, script, onScript, captions, onCaptions, onTitle }: {
  clientId?: string; locale: string; language: string; languageName: string; format: string; networks: string[]; idea: string;
  script: string; onScript: (s: string) => void; captions: Record<string, NetworkCaption>; onCaptions: (c: Record<string, NetworkCaption>) => void; onTitle: (t: string) => void;
}) {
  const t = useTranslations("posts.fromVideo");
  const ta = useTranslations("agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = script.trim().length >= 20;

  async function write() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/posts/caption-from-script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, locale, language, format, networks, idea, script }) });
      const data = (await res.json().catch(() => ({}))) as { title?: string; captions?: ({ network: string } & NetworkCaption)[]; error?: string };
      if (!res.ok || !data.captions?.length) { const c = data.error ?? "generic"; setError(t.has(`errors.${c}`) ? t(`errors.${c}`) : ta.has(`errors.${c}`) ? ta(`errors.${c}`) : ta("errors.generic")); return; }
      onCaptions(Object.fromEntries(data.captions.map((c) => [c.network, { caption: c.caption, hashtags: c.hashtags }])));
      if (data.title) onTitle(data.title);
    } catch { setError(ta("errors.generic")); }
    finally { setBusy(false); }
  }
  const set = (n: string, patch: Partial<NetworkCaption>) => onCaptions({ ...captions, [n]: { ...(captions[n] ?? { caption: "", hashtags: [] }), ...patch } });
  const written = networks.filter((n) => captions[n]);

  return (
    <div className="video-script">
      <label>{t("scriptLabel")}
        <textarea value={script} onChange={(e) => onScript(e.target.value)} rows={7} maxLength={8000} placeholder={t("scriptPlaceholder")} />
      </label>
      <p className="stat-vs">{t("scriptHint")}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={write} disabled={busy || !ready}>{busy ? t("writing") : written.length ? t("rewrite") : t("write")}</button>
        {!ready && script.trim() ? <span className="stat-vs">{t("tooShort")}</span> : <span className="stat-vs">{t("inLanguage", { language: languageName })}</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {written.map((n) => (
        <div key={n} className="video-caption">
          <label>{t("captionFor", { network: NETWORK_LABEL[n] ?? n })}
            <textarea value={captions[n].caption} onChange={(e) => set(n, { caption: e.target.value })} rows={6} maxLength={2200} />
          </label>
          <label>{t("hashtags")}
            <input value={captions[n].hashtags.map((h) => `#${h}`).join(" ")} maxLength={900}
              onChange={(e) => set(n, { hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#+/, "")).filter(Boolean).slice(0, 30) })} />
          </label>
          <p className="stat-vs">{t("length", { n: captions[n].caption.length })}</p>
        </div>
      ))}
    </div>
  );
}
