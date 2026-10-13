import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferenceView = { id: string; kind: string; caption: string | null; url: string | null; width: number | null; height: number | null };

/** A client's reference visuals with short-lived signed URLs (the bucket is private). RLS decides what the caller sees. */
export async function loadReferences(sb: SupabaseClient, clientId: string): Promise<ReferenceView[]> {
  const { data: rows } = await sb.from("brand_references").select("id, path, kind, caption, width, height").eq("client_id", clientId).order("created_at", { ascending: false }).limit(60);
  if (!rows?.length) return [];
  const { data: signed } = await sb.storage.from("brand-references").createSignedUrls(rows.map((r) => r.path), 3600);
  const urls = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  return rows.map((r) => ({ id: r.id, kind: r.kind, caption: r.caption, url: urls.get(r.path) ?? null, width: r.width, height: r.height }));
}
