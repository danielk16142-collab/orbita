"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import { getProposalAction } from "@/lib/agent-actions";
import { createPostAction, fillPostCaptionAction } from "@/lib/posts-actions";
import { ProposalCard, type ProposalView } from "@/components/agent/proposal-card";

type Msg = { role: "user" | "assistant"; text: string };
type Ev = { type: string; text?: string; conversationId?: string; code?: string; id?: string; target?: string };
/** Formats the agent drafts as a structured post (review card); the others are written in the reply. */
const STRUCTURED = ["reel", "video", "carousel", "static", "story"];

/**
 * The post chat: on the "Create post" page, a conversation only about this post. It opens by asking for the draft,
 * shows each draft as an editable card to accept into the calendar, and takes follow-up requests ("shorter", "add a CTA").
 */
export function PostChat({ clientId, locale, format, networks, language, idea, staff, calendarHref, opening, onBack, postId }: {
  clientId?: string; locale: string; format: string; networks: string[]; language: string; idea: string; staff: boolean;
  calendarHref: string; opening: string; onBack: () => void;
  /** Set when writing for an existing planned post: accepted drafts fill that post (the server decides, this only asks for it). */
  postId?: string;
}) {
  const router = useRouter();
  const t = useTranslations("posts");
  const ta = useTranslations("agent");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [drafts, setDrafts] = useState<{ proposal: ProposalView; after: number; decided?: "accept" | "reject" }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [savingText, startSave] = useTransition();
  const conv = useRef<string | null>(null);
  const started = useRef(false);
  const replyIndex = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, drafts]);
  useEffect(() => { if (!started.current) { started.current = true; void send(opening); } }); // the person clicked "Write it with the agent": start right away

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setError(null); setInput("");
    setMessages((m) => { replyIndex.current = m.length + 1; return [...m, { role: "user", text: message }, { role: "assistant", text: "" }]; });
    try {
      const res = await fetch("/api/posts/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, conversationId: conv.current ?? undefined, message, locale, format, networks, idea: idea.slice(0, 500), postId }) });
      if (!res.ok || !res.body) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic";
        setError(t.has(`chatErrors.${code}`) ? t(`chatErrors.${code}`) : ta.has(`errors.${code}`) ? ta(`errors.${code}`) : ta("errors.generic"));
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
          else if (ev.type === "text" && ev.text) setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], text: c[c.length - 1].text + ev.text }; return c; });
          else if (ev.type === "proposal" && ev.id && ev.target === "post") {
            const r = await getProposalAction({ clientId, id: ev.id });
            const after = replyIndex.current;
            if (r.ok) setDrafts((d) => (d.some((x) => x.proposal.id === r.proposal.id) ? d : [...d, { proposal: r.proposal as ProposalView, after }]));
          } else if (ev.type === "error") setError(ta.has(`errors.${ev.code}`) ? ta(`errors.${ev.code}`) : ta("errors.generic"));
        }
      }
    } catch { setError(ta("errors.generic")); }
    finally {
      setBusy(false);
      setMessages((m) => (m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].text ? m.slice(0, -1) : m));
    }
  }

  /** Text posts and articles: save the agent's reply as the caption of a draft (one per network). */
  const saveText = (i: number) => startSave(async () => {
    setError(null);
    if (postId) {
      const r = await fillPostCaptionAction({ postId, caption: messages[i].text.slice(0, 2200) });
      if (!r.ok) { setError(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic")); return; }
      setSaved((s) => ({ ...s, [i]: true })); router.refresh();
      return;
    }
    for (const network of networks) {
      const r = await createPostAction({ clientId, network, language, type: format, idea: idea.trim() || messages[i].text.split("\n")[0].slice(0, 200) || format, caption: messages[i].text.slice(0, 2200), status: staff ? "draft" : "idea" });
      if (!r.ok) { setError(t("errors.generic")); return; }
    }
    setSaved((s) => ({ ...s, [i]: true }));
  });

  const draft = (d: (typeof drafts)[number]) => (
    <div key={d.proposal.id} className="draft-card">
      {d.decided === "accept" ? <p className="ok">✓ {postId ? t("fill.accepted") : <>{t("chat.accepted")} <a href={calendarHref}>{t("chat.openCalendar")}</a></>}</p>
        : d.decided === "reject" ? <p className="stat-vs">{t("chat.rejected")}</p>
        : <ProposalCard proposal={d.proposal} clientId={clientId} onDecided={(decision) => { setDrafts((all) => all.map((x) => (x.proposal.id === d.proposal.id ? { ...x, decided: decision } : x))); if (decision === "accept" && postId) router.refresh(); }} />}
    </div>
  );

  return (
    <section className="card post-chat" aria-label={t("chat.title")}>
      <div className="section-head">
        <h2>{t("chat.title")}</h2>
        <button type="button" className="btn ghost small" onClick={onBack}>{t("chat.backToDetails")}</button>
      </div>
      <p className="stat-vs">{t("chat.hint")}</p>
      <div className="agent-log post-log" role="log" aria-live="polite" aria-busy={busy}>
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`agent-msg ${m.role}`}>
              <span className="eyebrow">{m.role === "user" ? ta("you") : ta("assistant")}</span>
              {m.role === "assistant" ? (m.text ? <ReactMarkdown disallowedElements={["img"]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}>{m.text}</ReactMarkdown> : <p className="agent-typing">{t("chat.writing")}</p>) : <p>{m.text}</p>}
            </div>
            {m.role === "assistant" && m.text && !STRUCTURED.includes(format) && !busy && (
              <div className="btn-row draft-save">
                {saved[i] ? <a className="btn small ghost" href={calendarHref}>✓ {t("chat.savedText")}</a>
                  : <button type="button" className="btn small" disabled={savingText} onClick={() => saveText(i)}>{t("chat.saveText")}</button>}
              </div>
            )}
            {drafts.filter((d) => d.after === i).map(draft)}
          </div>
        ))}
        {/* A reply that was only a draft (no text) has no message bubble: show its drafts here. */}
        {drafts.filter((d) => d.after >= messages.length).map(draft)}
        <div ref={end} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="agent-form" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <label htmlFor="post-chat-input" className="sr-only">{t("chat.placeholder")}</label>
        <textarea id="post-chat-input" rows={2} maxLength={8000} value={input} disabled={busy} placeholder={t("chat.placeholder")}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
        <div className="agent-actions">
          <button type="submit" className="btn" disabled={busy || !input.trim()}>{ta("send")}</button>
          {[t("chat.quick.shorter"), t("chat.quick.hook"), t("chat.quick.cta")].map((q) => <button key={q} type="button" className="btn ghost small" disabled={busy} onClick={() => void send(q)}>{q}</button>)}
        </div>
      </form>
    </section>
  );
}
