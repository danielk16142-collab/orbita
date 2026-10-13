"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import { checkBrandColor, HEX, validateLogoUpload, validateReferenceUpload } from "@orbita/security";
import { localeFrom, requireStaff, requireUser, requireAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { MAX_REFERENCES, PALETTE_ROLES, REFERENCE_KINDS } from "@/lib/brand";
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


const Palette = z.array(z.object({
  name: z.string().trim().min(1).max(40),
  hex: z.string().regex(HEX).transform((h) => h.toLowerCase()),
  role: z.enum(PALETTE_ROLES),
})).max(12);
// Font names are labels for designers and the agent; the app never loads them, so letters, digits, spaces and - ' are enough.
const FontName = z.string().trim().max(80).regex(/^[\p{L}\p{N} '\-]*$/u).transform((v) => v || null);

/** Full palette and fonts. The theme colors (main and accent) stay separate because they are contrast-checked for the portal. */
export async function savePaletteAction(form: FormData) {
  const a = await actor(form);
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("palette") ?? "[]")); } catch { raw = null; }
  const palette = Palette.safeParse(raw);
  const font = FontName.safeParse(String(form.get("font") ?? "")), body = FontName.safeParse(String(form.get("body_font") ?? ""));
  if (!palette.success || !font.success || !body.success) go(a.back, "error", "invalid");
  const { data } = await a.sb.from("clients").update({ palette: palette.data, font: font.data, body_font: body.data }).eq("id", a.clientId).select("id");
  if (!data?.length) go(a.back, "error", "locked");
  await audit({ agencyId: a.profile.agency_id, actor: a.user.id, action: "branding.palette", entity: "client", entityId: a.clientId });
  go(a.back, "saved");
}

/** Reference visuals for image creation. Re-encoded like logos, kept private, capped per client. */
export async function uploadReferenceAction(form: FormData) {
  const a = await actor(form);
  if (!(await limiter("reference-upload", 30, 10 * 60_000).hit(a.user.id)).allowed) go(a.back, "error", "rate");
  const kind = z.enum(REFERENCE_KINDS).catch("style").parse(form.get("kind"));
  const caption = z.string().trim().max(300).catch("").parse(form.get("caption") ?? "") || null;
  const { count } = await a.sb.from("brand_references").select("id", { count: "exact", head: true }).eq("client_id", a.clientId);
  if ((count ?? 0) >= MAX_REFERENCES) go(a.back, "error", "tooMany");
  const file = form.get("file");
  if (!(file instanceof File)) go(a.back, "error", "empty");
  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const problem = validateReferenceUpload(bytes);
  if (problem) go(a.back, "error", problem === "too-large" ? "refTooLarge" : problem === "empty" ? "empty" : "unsupported");

  let out: { data: Buffer; info: { width: number; height: number } };
  try {
    out = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  } catch { return go(a.back, "error", "unsupported"); }

  const path = `${a.clientId}/ref-${crypto.randomUUID()}.webp`;
  const up = await a.sb.storage.from("brand-references").upload(path, out.data, { contentType: "image/webp", upsert: false, cacheControl: "300" });
  if (up.error) go(a.back, "error", "locked");
  const { error } = await a.sb.from("brand_references").insert({ client_id: a.clientId, path, kind, caption, width: out.info.width, height: out.info.height, added_by: a.user.id });
  if (error) { await a.sb.storage.from("brand-references").remove([path]); go(a.back, "error", "locked"); }
  await audit({ agencyId: a.profile.agency_id, actor: a.user.id, action: "branding.reference_added", entity: "client", entityId: a.clientId, meta: { kind } });
  go(a.back, "saved");
}

export async function deleteReferenceAction(form: FormData) {
  const a = await actor(form);
  const id = Uuid.parse(form.get("id"));
  const { data: ref } = await a.sb.from("brand_references").select("id, path").eq("id", id).eq("client_id", a.clientId).maybeSingle();
  if (!ref) go(a.back, "error", "locked");
  const { data } = await a.sb.from("brand_references").delete().eq("id", id).select("id");
  if (!data?.length) go(a.back, "error", "locked");
  await a.sb.storage.from("brand-references").remove([ref!.path]);
  await audit({ agencyId: a.profile.agency_id, actor: a.user.id, action: "branding.reference_removed", entity: "client", entityId: a.clientId });
  go(a.back, "saved");
}
