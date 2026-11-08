import "server-only";
import { usernameFromLink } from "@orbita/connectors";
import type { AgentActor } from "@/lib/agent/access";

type Sb = AgentActor["sb"];
export type ChannelRow = { id: string; network: "tiktok" | "linkedin"; source: string; handle: string | null; summary: unknown; audit: unknown; audited_at: string | null; created_at: string };

/** The client's TikTok account name, from its saved links (Profile > Links): a handle or a profile URL. */
export async function tiktokHandle(sb: Sb, clientId: string): Promise<string | null> {
  const { data } = await sb.from("client_sources").select("kind, url, handle").eq("client_id", clientId).eq("kind", "tiktok");
  for (const s of data ?? []) {
    const h = (s.handle ?? "").replace(/^@/, "").trim();
    if (/^[A-Za-z0-9._]{1,60}$/.test(h)) return h;
    const fromUrl = s.url ? usernameFromLink("tiktok", s.url) : null;
    if (fromUrl) return fromUrl;
  }
  return null;
}

/** The latest snapshot per channel (null when the table is not set up yet or nothing was fetched or uploaded). */
export async function latestChannelStats(sb: Sb, clientId: string): Promise<{ tiktok: ChannelRow | null; linkedin: ChannelRow | null; setUp: boolean }> {
  const { data, error } = await sb.from("channel_stats").select("id, network, source, handle, summary, audit, audited_at, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20);
  if (error) return { tiktok: null, linkedin: null, setUp: !["42P01", "PGRST205", "PGRST204", "42703"].includes(error.code ?? "") };
  const rows = (data ?? []) as ChannelRow[];
  return { tiktok: rows.find((r) => r.network === "tiktok") ?? null, linkedin: rows.find((r) => r.network === "linkedin") ?? null, setUp: true };
}
