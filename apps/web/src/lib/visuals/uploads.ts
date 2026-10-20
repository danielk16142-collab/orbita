import "server-only";
import { sniffMedia, type MediaExt } from "@orbita/visuals";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const BUCKET = "post-media";

/** Size in bytes of a stored object, or null if it is not there. */
export async function storedSize(path: string): Promise<number | null> {
  const i = path.lastIndexOf("/");
  const { data } = await supabaseAdmin().storage.from(BUCKET).list(path.slice(0, i), { search: path.slice(i + 1), limit: 5 });
  const hit = (data ?? []).find((o) => o.name === path.slice(i + 1));
  const size = (hit?.metadata as { size?: number } | null | undefined)?.size;
  return typeof size === "number" ? size : null;
}

/** What a stored file really is, from its first bytes (a ranged read of a short-lived signed URL). null = not an allowed type. */
export async function sniffStored(path: string): Promise<MediaExt | null> {
  const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(path, 60);
  if (!data?.signedUrl) return null;
  try {
    const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-31" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return sniffMedia(new Uint8Array(await res.arrayBuffer()).slice(0, 32));
  } catch { return null; }
}

export async function removeObject(path: string): Promise<void> {
  await supabaseAdmin().storage.from(BUCKET).remove([path]);
}
