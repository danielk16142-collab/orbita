"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; text: string };
type Ev = { type: string; text?: string; conversationId?: string; code?: string; learnDue?: boolean };

/** A normal chat. Streams the agent's reply and refreshes the page when it adds suggestions, sources or an audit. */
const GOALS = ["sales", "awareness", "followers", "offer", "trust", "educate", "consistency"] as const;

export function AgentChat({ locale, clientId, initialMessages, initialConversationId, onboarding = false }: {
  locale: string; clientId?: string; initialMessages: Msg[]; initialConversationId: string | null; onboarding?: boolean;
}) {
  const t = useTranslations("agent");
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const conv = useRef<string | null>(initialConversationId);
  const end = useRef<HTMLDivElement>(null);
  const [, startRefresh] = useTransition();
  useEffect(() => { if (messages.length) end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  const refresh = () => startRefresh(() => router.refresh());

  async function learn(silent: boolean) {
    if (!conv.current) return;
    setNote(silent ? null : t("learning"));
    const res = await fetch("/api/agent/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, conversationId: conv.current, locale }) }).catch(() => null);
    const data = res?.ok ? ((await res.json()) as { proposals: number }) : null;
    if (data && data.proposals > 0) { setNote(t("learned", { count: data.proposals })); refresh(); }
    else setNote(silent ? null : data ? t("nothingNew") : t("errors.generic"));
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setError(null); setNote(null); setInput("");
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);
    let touched = false, learnDue = false;
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, conversationId: conv.current ?? undefined, message, locale }) });
      if (!res.ok || !res.body) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic";
        setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
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
          if (ev.type === "meta" && ev.conversationId) conv.current = ev.conversationId;
          else if (ev.type === "text" && ev.text) setMessages((m) => { const c = [...m]; const last = c[c.length - 1]; c[c.length - 1] = { ...last, text: last.text + ev.text }; return c; });
          else if (["proposal", "source", "audit", "research"].includes(ev.type)) touched = true;
          else if (ev.type === "error") setError(t.has(`errors.${ev.code}`) ? t(`errors.${ev.code}`) : t("errors.generic"));
          else if (ev.type === "done") learnDue = !!ev.learnDue;
        }
      }
    } catch { setError(t("errors.generic")); }
    finally {
      setBusy(false);
      setMessages((m) => (m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].text ? m.slice(0, -1) : m));
      if (touched) refresh();
      if (learnDue) void learn(true);
    }
  }

  const welcome = messages.length === 0 && onboarding;
  const toggleGoal = (g: string) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  /** Chips picked in the welcome are sent together with whatever was typed, as one message. */
  function submit() {
    const picked = welcome ? goals.map((g) => t(`welcome.goals.${g}`)) : [];
    const text = [picked.length ? `${t("welcome.goalsPrefix")}: ${picked.join(", ")}.` : "", input.trim()].filter(Boolean).join("\n");
    if (picked.length) setGoals([]);
    void send(text);
  }
  const starters = [t("starters.plan"), t("starters.strategy"), t("starters.reel"), t("starters.ideas")];
  return (
    <section className="card agent-chat" aria-label={t("title")}>
      <div className="agent-log" role="log" aria-live="polite" aria-busy={busy}>
        {welcome && (
          <div className="agent-msg assistant">
            <span className="eyebrow">{t("assistant")}</span>
            <p>{t("welcome.greeting")}</p>
            <ol><li>{t("welcome.q1")}</li><li>{t("welcome.q2")}</li></ol>
            <p className="stat-vs">{t("welcome.hint")}</p>
            <div className="agent-goals" role="group" aria-label={t("welcome.goalsLabel")}>
              {GOALS.map((g) => <button key={g} type="button" className="btn ghost small" aria-pressed={goals.includes(g)} onClick={() => toggleGoal(g)} disabled={busy}>{t(`welcome.goals.${g}`)}</button>)}
            </div>
          </div>
        )}
        {messages.length === 0 && !welcome && (
          <div>
            <p>{t("intro")}</p>
            <div className="agent-starters">{starters.map((s) => <button key={s} type="button" className="btn ghost" onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`agent-msg ${m.role}`}>
            <span className="eyebrow">{m.role === "user" ? t("you") : t("assistant")}</span>
            {m.role === "assistant" ? (m.text ? <ReactMarkdown disallowedElements={["img"]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}>{m.text}</ReactMarkdown> : <p className="agent-typing">{t("thinking")}</p>) : <p>{m.text}</p>}
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p role="status">{note}</p>}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="agent-form">
        <label htmlFor="agent-input" className="sr-only">{t("placeholder")}</label>
        <textarea id="agent-input" value={input} rows={2} maxLength={8000} placeholder={t("placeholder")} disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <div className="agent-actions">
          <button type="submit" className="btn" disabled={busy || (!input.trim() && !(welcome && goals.length))}>{t("send")}</button>
          <button type="button" className="btn ghost" disabled={busy || !conv.current} onClick={() => void learn(false)}>{t("learnNow")}</button>
        </div>
      </form>
    </section>
  );
}
