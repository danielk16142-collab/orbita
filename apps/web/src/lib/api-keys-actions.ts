"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { hashApiKey, newApiKey } from "@orbita/security/api-key";
import { getSession, sessionProblem } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { agentEmail, dropAgentSession } from "@/lib/api/agent-session";

type Result = { ok: true; key?: string } | { ok: false; error: string };

/** Only an agency admin who passed two-step verification in this session manages keys. */
async function adminGate() {
  const s = await getSession();
  if (!s || s.profile.role !== "admin" || (await sessionProblem(s))) return null;
  if (!(await limiter("api-keys", 20, 60 * 60_000).hit(s.user.id)).allowed) return null;
  return s;
}
const master = () => { const m = process.env.ORBITA_MASTER_KEY; if (!m) throw new Error("ORBITA_MASTER_KEY is not set"); return m; };
async function ownKey(agencyId: string, id: string) {
  const { data } = await supabaseAdmin().from("api_keys").select("id, agent_user_id, name, revoked_at").eq("id", id).eq("agency_id", agencyId).maybeSingle();
  return data;
}

/**
 * Create a key: a dedicated agent user (team member of this agency, no password, never emailed) and the key, shown once.
 * Writes use the service role because API roles cannot create users or keys; the admin check above is the gate.
 */
export async function createApiKeyAction(input: unknown): Promise<Result> {
  const p = z.object({ name: z.string().trim().min(1).max(80), canPublish: z.boolean().default(false) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const s = await adminGate();
  if (!s) return { ok: false, error: "forbidden" };
  const admin = supabaseAdmin();
  const id = randomUUID();
  const { data: user, error: uErr } = await admin.auth.admin.createUser({ email: agentEmail(id), email_confirm: true, user_metadata: { agent: true, name: p.data.name } });
  if (uErr || !user.user) { console.error(`api key user failed: ${uErr?.status ?? "?"}`); return { ok: false, error: "failed" }; }
  const agentUserId = user.user.id;
  const { error: pErr } = await admin.from("profiles").insert({ user_id: agentUserId, agency_id: s.profile.agency_id, role: "team", full_name: `${p.data.name} (API)`, locale: s.profile.locale });
  const { key, prefix } = newApiKey();
  const { error: kErr } = pErr ? { error: pErr } : await admin.from("api_keys").insert({
    id, agency_id: s.profile.agency_id, agent_user_id: agentUserId, name: p.data.name, prefix, key_hash: hashApiKey(key, master()), can_publish: p.data.canPublish, created_by: s.user.id,
  });
  if (kErr) {
    console.error(`api key create failed: code=${kErr.code ?? "?"}`);
    await admin.auth.admin.deleteUser(agentUserId).catch(() => {}); // the profile goes with it (on delete cascade)
    return { ok: false, error: ["42P01", "PGRST205"].includes(kErr.code ?? "") ? "not_set_up" : "failed" };
  }
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "api_key.created", entity: "api_key", entityId: id, meta: { name: p.data.name, can_publish: p.data.canPublish } });
  revalidatePath("/", "layout");
  return { ok: true, key };
}

/** New secret for the same key (same agent and permissions). The old secret stops working at once. */
export async function rotateApiKeyAction(input: unknown): Promise<Result> {
  const p = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const s = await adminGate();
  if (!s) return { ok: false, error: "forbidden" };
  const k = await ownKey(s.profile.agency_id, p.data.id);
  if (!k || k.revoked_at) return { ok: false, error: "not_found" };
  const { key, prefix } = newApiKey();
  const { error } = await supabaseAdmin().from("api_keys").update({ prefix, key_hash: hashApiKey(key, master()), rotated_at: new Date().toISOString() }).eq("id", k.id);
  if (error) return { ok: false, error: "failed" };
  dropAgentSession(k.id);
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "api_key.rotated", entity: "api_key", entityId: k.id });
  revalidatePath("/", "layout");
  return { ok: true, key };
}

/** Turn a key off for good and block its agent user. Its history stays in the audit log. */
export async function revokeApiKeyAction(input: unknown): Promise<Result> {
  const p = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const s = await adminGate();
  if (!s) return { ok: false, error: "forbidden" };
  const k = await ownKey(s.profile.agency_id, p.data.id);
  if (!k) return { ok: false, error: "not_found" };
  const admin = supabaseAdmin();
  await admin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id);
  await admin.auth.admin.updateUserById(k.agent_user_id, { ban_duration: "876000h" }).catch(() => {});
  dropAgentSession(k.id);
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "api_key.revoked", entity: "api_key", entityId: k.id });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Allow or stop scheduling and publishing for a key (off by default). */
export async function setApiKeyPublishAction(input: unknown): Promise<Result> {
  const p = z.object({ id: z.string().uuid(), canPublish: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const s = await adminGate();
  if (!s) return { ok: false, error: "forbidden" };
  const k = await ownKey(s.profile.agency_id, p.data.id);
  if (!k || k.revoked_at) return { ok: false, error: "not_found" };
  await supabaseAdmin().from("api_keys").update({ can_publish: p.data.canPublish }).eq("id", k.id);
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "api_key.permissions", entity: "api_key", entityId: k.id, meta: { can_publish: p.data.canPublish } });
  revalidatePath("/", "layout");
  return { ok: true };
}
