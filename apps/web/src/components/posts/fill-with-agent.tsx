"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PostChat } from "./post-chat";
import { NETWORK_LABEL } from "./shared";

const LANG_NAME: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };

/** On a planned post (from the strategy or the weekly plan): have the agent write it. The draft fills THIS post when accepted. */
export function FillWithAgent({ postId, clientId, locale, format, network, language, idea, day, time, pillar, why, hasContent, calendarHref }: {
  postId: string; clientId: string; locale: string; format: string; network: string; language: string; idea: string; day: string | null; time: string | null;
  pillar: string | null; why: string | null; hasContent: boolean; calendarHref: string;
}) {
  const t = useTranslations("posts");
  const [open, setOpen] = useState(false);
  const where = NETWORK_LABEL[network] ?? network;
  const opening = t("fill.opening", { format: t(`formatCards.${format}.title`), where, language: LANG_NAME[language] ?? language, idea: idea.slice(0, 500) });
  if (open) return <div style={{ marginTop: "1.25rem" }}><PostChat clientId={clientId} locale={locale} format={format} networks={[network]} language={language} idea={idea} staff opening={opening} calendarHref={calendarHref} postId={postId} onBack={() => setOpen(false)} /></div>;
  return (
    <section className="card fill-card" style={{ marginTop: "1.25rem" }}>
      <div className="section-head">
        <div>
          <h2>{hasContent ? t("fill.titleAgain") : t("fill.title")}</h2>
          <p className="stat-vs">{hasContent ? t("fill.hintAgain") : t("fill.hint")}</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>{hasContent ? t("fill.buttonAgain") : t("fill.button")}</button>
      </div>
      <p className="stat-vs fill-uses">{t("fill.uses")}: {[where, t(`formats.${format}` as never, { default: format } as never), day && `${day}${time ? ` ${time}` : ""}`, pillar && `${t("pillar")}: ${pillar}`].filter(Boolean).join(" · ")}</p>
      {why && <p className="fill-why">“{why}”</p>}
    </section>
  );
}
