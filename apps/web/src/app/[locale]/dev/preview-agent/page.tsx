import { notFound } from "next/navigation";
import { fakeEnabled } from "@orbita/connectors";
import { AgentChat } from "@/components/agent/agent-chat";

/** Development only (CONNECTORS_FAKE=1): the agent chat for a brand-new client, to review the welcome. */
export default async function Preview({ params }: { params: Promise<{ locale: string }> }) {
  if (!fakeEnabled()) notFound();
  const { locale } = await params;
  return (<main className="content"><p className="eyebrow">Preview</p><h1>Agent</h1><AgentChat locale={locale} initialMessages={[{ role: "user", text: "Can you write the reel script for Thursday?" }, { role: "assistant", text: "Sure. Here is a 30 second script built on yesterday's plan: **Hook:** This homepage was losing clients..." }]} initialConversationId={null} historyHref="#" hasEarlier /></main>);
}
