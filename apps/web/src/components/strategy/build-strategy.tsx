"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { restoreStrategyAction } from "@/lib/focus-actions";

/**
 * "Build the strategy from these pillars and topics": the agent builds (or rebuilds) the strategy around what was chosen in
 * this section and it is applied right away, with an undo. beforeBuild runs first (the editor saves unsaved changes there).
 */
/** The channels a strategy can be built for. YouTube and Facebook can be added later. */
export const STRATEGY_CHANNELS = ["instagram", "tiktok", "linkedin"] as const;
const LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn" };
/** The last choice, per client, on this device. */
const channelsKey = (clientId?: string) => `orbita:strategy-channels:${clientId ?? "me"}`;

export function BuildStrategyButton({ clientId, locale, hasStrategy, ghost, beforeBuild, language }: {
  clientId?: string; locale: string; hasStrategy: boolean; ghost?: boolean; beforeBuild?: () => Promise<boolean>; /** which language's strategy */ language?: string;
}) {
  const t = useTranslations("buildStrategy");
  const ta = useTranslations("agent");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoing, startUndo] = useTransition();
  const [channels, setChannels] = useState<string[]>([...STRATEGY_CHANNELS]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(channelsKey(clientId)) ?? "null"); if (Array.isArray(v) && v.length) setChannels(v.filter((x) => (STRATEGY_CHANNELS as readonly string[]).includes(x))); } catch { /* none saved */ } }, [clientId]);
  const toggle = (n: string) => setChannels((c) => { const next = c.includes(n) ? c.filter((x) => x !== n) : [...c, n]; try { localStorage.setItem(channelsKey(clientId), JSON.stringify(next)); } catch { /* private mode */ } return next; });
  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : ta.has(`errors.${code}`) ? ta(`errors.${code}`) : ta("errors.generic"));

  async function build() {
    if (busy || !channels.length) return;
    if (hasStrategy && !window.confirm(t("confirmRebuild"))) return;
    setBusy(true); setError(null); setReply(""); setApplied(false);
    try {
      if (beforeBuild && !(await beforeBuild())) return;
      const res = await fetch("/api/strategy/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, locale, language, mode: "from_focus", networks: channels }) });
      if (!res.ok || !res.body) { setError(errorText(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic")); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let ev: { type: string; text?: string; code?: string; detail?: string }; try { ev = JSON.parse(part.slice(6)); } catch { continue; }
          if (ev.type === "text" && ev.text) setReply((r) => r + ev.text);
          else if (ev.type === "applied") { setApplied(true); router.refresh(); }
          else if (ev.type === "error") setError(`${errorText(ev.code ?? "generic")}${ev.detail ? ` (${ev.detail})` : ""}`);
        }
      }
    } catch { setError(ta("errors.generic")); }
    finally { setBusy(false); }
  }

  return (
    <div className="build-strategy">
      {ghost
        ? <p className="stat-vs">{t("forChannels", { list: channels.map((c) => LABEL[c]).join(", ") || "-" })}</p>
        : (
          <fieldset className="strategy-channels" disabled={busy}>
            <legend>{t("channels")}</legend>
            {STRATEGY_CHANNELS.map((n) => (
              <label key={n} className="check-line"><input type="checkbox" checked={channels.includes(n)} onChange={() => toggle(n)} /> <span>{LABEL[n]}</span></label>
            ))}
            <p className="stat-vs">{[channels.includes("instagram") && channels.includes("tiktok") ? t("sameVideos") : t("channelsHint"), channels.includes("linkedin") ? t("linkedinOwn") : ""].filter(Boolean).join(" ")}</p>
          </fieldset>
        )}
      <button type="button" className={`btn${ghost ? " small ghost" : ""}`} onClick={build} disabled={busy || !channels.length}>
        {busy ? t("building") : hasStrategy ? t("rebuild") : t("build")}
      </button>
      {busy && <p className="stat-vs" role="status">{t("buildingHint")}</p>}
      {applied && (
        <p className="ok" role="status">✓ {hasStrategy ? t("rebuilt") : t("built")}{" "}
          {hasStrategy && <button type="button" className="btn ghost small" disabled={undoing} onClick={() => startUndo(async () => { const r = await restoreStrategyAction({ clientId, language }); if (r.ok) { setApplied(false); router.refresh(); } else setError(t("errors.undo")); })}>{t("undo")}</button>}
        </p>
      )}
      {reply && !busy && <p className="build-strategy-reply">{reply}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
