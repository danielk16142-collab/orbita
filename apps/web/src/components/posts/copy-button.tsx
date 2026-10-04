"use client";
import { useState } from "react";

/** Copies text to the clipboard (caption, hashtags, script). Fails quietly where the clipboard is blocked. */
export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn ghost small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* clipboard unavailable */ }
    }}>{ok ? done : label}</button>
  );
}
