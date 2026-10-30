"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { restoreStrategyAction } from "@/lib/focus-actions";

type Msg = { role: "user" | "assistant"; text: string };
type Ev = { type: string; text?: string; code?: string };

/** A box on the Strategy section: say what to change (or paste a new strategy) and the agent updates it right away. */
export function StrategyChat({ clientId, locale, hasStrategy }: { clientId?: string; locale: string; hasStrategy: boolean }) {
  const t = useTranslations("strategyChat");
  const ta = useTranslations("agent");
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [undoing, startUndo] = useTransition();
  const log = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setError(null); setApplied(false); setInput("");
    const history = messages.slice(-10);
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);
    try {
      const res = await fetch("/api/strategy/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, locale, message, history }) });
      if (!res.ok || !res.body) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic";
        setError(ta.has(`errors.${code}`) ? ta(`errors.${code}`) : ta("errors.generic"));
        setMessages((m) => m.slice(0, -1));
        return;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let ev: Ev; try { ev = JSON.parse(part.slice(6)); } catch { continue; }
          if (ev.type === "text" && ev.text) setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], text: c[c.length - 1].text + ev.text }; return c; });
          else if (ev.type === "applied") { setApplied(true); router.refresh(); }
          else if (ev.type === "error") setError(t.has(`errors.${ev.code}`) ? t(`errors.${ev.code}`) : ta.has(`errors.${ev.code}`) ? ta(`errors.${ev.code}`) : ta("errors.generic"));
        }
      }
    } catch { setError(ta("errors.generic")); }
    finally {
      setBusy(false);
      setMessages((m) => (m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].text ? m.slice(0, -1) : m));
      setTimeout(() => log.current?.scrollTo({ top: log.current.scrollHeight }), 50);
    }
  }
  const examples = [t("ex1"), t("ex2"), t("ex3")];
  return (
    <section className="card strategy-chat" aria-label={t("title")}>
      <h2>{t("title")}</h2>
      <p className="stat-vs">{hasStrategy ? t("hint") : t("hintNew")}</p>
      {messages.length > 0 && (
        <div className="strategy-chat-log" ref={log} role="log" aria-live="polite" aria-busy={busy}>
          {messages.map((m, i) => <p key={i} className={`agent-msg ${m.role}`}><span className="eyebrow">{m.role === "user" ? ta("you") : ta("assistant")}</span><br />{m.text || <span className="agent-typing">{t("working")}</span>}</p>)}
        </div>
      )}
      {applied && (
        <p className="ok" role="status">✓ {t("applied")}{" "}
          <button type="button" className="btn ghost small" disabled={undoing} onClick={() => startUndo(async () => { const r = await restoreStrategyAction({ clientId }); if (r.ok) { setApplied(false); router.refresh(); } else setError(t("errors.undo")); })}>{t("undo")}</button>
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <form className="agent-form" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <label htmlFor="strategy-chat-input" className="sr-only">{t("title")}</label>
        <textarea id="strategy-chat-input" rows={3} maxLength={12000} value={input} disabled={busy} placeholder={t("placeholder")}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
        <div className="agent-actions">
          <button type="submit" className="btn" disabled={busy || !input.trim()}>{busy ? t("working") : t("send")}</button>
          {hasStrategy && examples.map((q) => <button key={q} type="button" className="btn ghost small" disabled={busy} onClick={() => setInput(q)}>{q}</button>)}
        </div>
      </form>
    </section>
  );
}
