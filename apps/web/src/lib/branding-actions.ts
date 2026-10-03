"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import { checkBrandColor, validateLogoUpload } from "@orbita/security";
import { localeFrom, requireStaff, requireUser, requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { limiter } from "@/lib/rate-limit";

const Uuid = z.string().uuid();

/**
 * Who is editing which client's branding. A client user can only ever edit their own client:
 * the id comes from their profile, never from the form. Staff must have passed MFA.
 */
async function actor(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireUser(locale);
  if (s.profile.role === "client") {
    return { ...s, locale, clientId: s.profile.client_id!, back: `/${locale}/portal/settings` };
  }
  await requireStaff(locale);
  const clientId = Uuid.parse(form.get("clientId"));
  return { ...s, locale, clientId, back: `/${locale}/clients/${clientId}?tab=branding` };
}
const go = (back: string, k: "saved" | "error", v = "1") => redirect(`${back}${back.includes("?") ? "&" : "?"}${k}=${v}`);

export async function saveColorsAction(form: FormData) {
  const a = await actor(form);
  const primary = String(form.get("primary") ?? ""), accent = String(form.get("accent") ?? "");
  const reset = form.get("reset") === "1";
  const bad = reset ? null : checkBrandColor(primary) ?? checkBrandColor(accent);
  if (bad) go(a.back, "error", bad === "invalid" ? "invalid" : "lowContrast");
  const { data, error } = await a.sb.from("clients")
    .update(reset ? { primary_color: null, accent_color: null } : { primary_color: primary.toLowerCase(), accent_color: accent.toLowerCase() })
    .eq("id", a.clientId).select("id");
  // RLS + trigger: a client whose branding is locked updates zero rows.
  if (error || !data?.length) go(a.back, "error", "locked");
  await audit({ agencyId: a.profile.agency_id, actor: a.user.id, action: reset ? "branding.reset" : "branding.colors", entity: "client", entityId: a.clientId });
  go(a.back, "saved");
}

export async function uploadLogoAction(form: FormData) {
  const a = await actor(form);
  const variant = form.get("variant") === "dark" ? "dark" : "light";
  if (!(await limiter("logo-upload", 10, 10 * 60_000).hit(a.user.id)).allowed) go(a.back, "error", "rate");
  const file = form.get("file");
  if (!(file instanceof File)) go(a.back, "error", "empty");
  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const problem = validateLogoUpload(bytes); // checks magic bytes and size, ignores file name/type
  if (problem) go(a.back, "error", problem === "too-large" ? "tooLarge" : problem === "empty" ? "empty" : "unsupported");

  let out: Buffer;
  try {
    // Re-encode: strips metadata and any payload hidden in the file, caps dimensions.
    out = await sharp(bytes, { limitInputPixels: 24_000_000, failOn: "error" })
      .rotate().resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch { return go(a.back, "error", "unsupported"); }

  const path = `${a.clientId}/logo-${variant}.webp`;
  const up = await a.sb.storage.from("client-logos").upload(path, out, { contentType: "image/webp", upsert: true, cacheControl: "300" });
  if (up.error) go(a.back, "error", "locked");
  const { data } = await a.sb.from("clients").update(variant === "dark" ? { logo_dark_path: path } : { logo_light_path: path }).eq("id", a.clientId).select("id");
  if (!data?.length) go(a.back, "error", "locked");
  await audit({ agencyId: a.profile.agency_id, actor: a.user.id, action: "branding.logo", entity: "client", entityId: a.clientId, meta: { variant } });
  go(a.back, "saved");
}

/** Only admins may lock or unlock branding. */
export async function setBrandingLockAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireAdmin(locale);
  const clientId = Uuid.parse(form.get("clientId"));
  const lock = form.get("lock") === "1";
  const { data } = await s.sb.from("clients").update({ branding_locked: lock }).eq("id", clientId).select("id");
  if (!data?.length) redirect(`/${locale}/clients/${clientId}?tab=branding&error=locked`);
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: lock ? "branding.locked" : "branding.unlocked", entity: "client", entityId: clientId });
  redirect(`/${locale}/clients/${clientId}?tab=branding&saved=1`);
}
