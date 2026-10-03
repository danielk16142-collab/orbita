import "server-only";
import { headers } from "next/headers";

/** Client IP (Cloudflare first) and user agent, for audit and consent records. */
export async function requestContext() {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { ip: ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null, userAgent: (h.get("user-agent") ?? "").slice(0, 300) || null };
}
