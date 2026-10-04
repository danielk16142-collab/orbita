"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PromptLine } from "@orbita/content";

type Prefs = { speed: number; size: number; mirror: boolean };
const DEFAULTS: Prefs = { speed: 60, size: 44, mirror: false };
const KEY = "orbita.teleprompter";
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Full-screen reader: the script scrolls at a steady pace. Space plays/pauses, arrows adjust speed. Preferences stay in this browser only. */
export function Teleprompter({ lines, hooks, hookIndex, back }: { lines: PromptLine[]; hooks: string[]; hookIndex: number; back: string }) {
  const t = useTranslations("posts");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const pos = useRef(0);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (s) setPrefs({ speed: clamp(Number(s.speed) || 60, 10, 200), size: clamp(Number(s.size) || 44, 20, 120), mirror: !!s.mirror }); } catch { /* storage unavailable */ }
  }, []);
  const update = (p: Partial<Prefs>) => setPrefs((cur) => { const n = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });

  useEffect(() => {
    if (!playing) return;
    const el = box.current; if (!el) return;
    pos.current = el.scrollTop;
    let last = performance.now();
    const tick = (now: number) => {
      pos.current += ((now - last) / 1000) * prefs.speed; last = now;
      el.scrollTop = pos.current;
      if (pos.current >= el.scrollHeight - el.clientHeight) { setPlaying(false); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, prefs.speed]);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) { setCount(null); setPlaying(true); return; }
    const id = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(id);
  }, [count]);

  const toggle = useCallback(() => { if (playing) setPlaying(false); else if (count === null) setCount(3); else setCount(null); }, [playing, count]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); update({ speed: clamp(prefs.speed + 10, 10, 200) }); }
      else if (e.key === "ArrowDown") { e.preventDefault(); update({ speed: clamp(prefs.speed - 10, 10, 200) }); }
      else if (e.key === "Home") { if (box.current) box.current.scrollTop = 0; }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [toggle, prefs.speed]);

  return (
    <div className="tp">
      <div className="tp-bar">
        <a className="btn ghost small" href={back}>← {t("back")}</a>
        <button type="button" className="btn small" onClick={toggle}>{playing ? t("pause") : count !== null ? t("cancel") : t("play")}</button>
        <button type="button" className="btn ghost small" onClick={() => { if (box.current) box.current.scrollTop = 0; setPlaying(false); }}>{t("restart")}</button>
        <label>{t("speed")}<input type="range" min={10} max={200} step={5} value={prefs.speed} onChange={(e) => update({ speed: Number(e.target.value) })} /></label>
        <label>{t("fontSize")}<input type="range" min={20} max={120} step={2} value={prefs.size} onChange={(e) => update({ size: Number(e.target.value) })} /></label>
        <label className="plan-include"><input type="checkbox" checked={prefs.mirror} onChange={(e) => update({ mirror: e.target.checked })} />{t("mirror")}</label>
        {hooks.length > 1 && (
          <label>{t("hook")}<select value={hookIndex} onChange={(e) => { window.location.search = `?hook=${e.target.value}`; }}>{hooks.map((h, i) => <option key={i} value={i}>{i + 1}. {h.slice(0, 40)}</option>)}</select></label>
        )}
      </div>
      {count !== null && count > 0 && <div className="tp-count" aria-live="assertive">{count}</div>}
      <div className="tp-text" ref={box} style={{ fontSize: prefs.size, transform: prefs.mirror ? "scaleX(-1)" : undefined }} tabIndex={0} aria-label={t("script")}>
        <div className="tp-pad" />
        {lines.map((l, i) => (
          <p key={i} className={`tp-line tp-${l.kind}`}>
            {l.cue && <small className="tp-cue">[{l.cue}]</small>}
            {l.text}
          </p>
        ))}
        <div className="tp-pad" />
      </div>
    </div>
  );
}
