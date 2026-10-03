// One-time setup: creates the agency and its first admin. Run by the owner, locally, with the
// service-role key. Sign-up is disabled in Supabase, so this is the only way to the first account.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BOOTSTRAP_PASSWORD='long-password' \
//   node scripts/bootstrap-agency.mjs --agency "Dany Designs" --email you@example.com --name "Your Name"
import { createClient } from "@supabase/supabase-js";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.BOOTSTRAP_PASSWORD; // via env so it does not land in shell history or the process list
const [agency, email, name] = [arg("agency"), arg("email"), arg("name")];
if (!url || !key || !password || !agency || !email || !name) {
  console.error("Missing input. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_PASSWORD, --agency, --email, --name.");
  process.exit(1);
}
if (password.length < 12) { console.error("Password must be at least 12 characters."); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { count } = await sb.from("agencies").select("id", { count: "exact", head: true });
if ((count ?? 0) > 0 && !process.argv.includes("--force")) { console.error("An agency already exists. Pass --force to add another."); process.exit(1); }

const { data: ag, error: e1 } = await sb.from("agencies").insert({ name: agency }).select("id").single();
if (e1) throw e1;
const { data: u, error: e2 } = await sb.auth.admin.createUser({ email: email.toLowerCase(), password, email_confirm: true });
if (e2) { await sb.from("agencies").delete().eq("id", ag.id); throw e2; }
const { error: e3 } = await sb.from("profiles").insert({ user_id: u.user.id, agency_id: ag.id, role: "admin", full_name: name });
if (e3) { await sb.auth.admin.deleteUser(u.user.id); await sb.from("agencies").delete().eq("id", ag.id); throw e3; }
// Terms are accepted on first sign-in (accept-terms screen), so no consent is fabricated here.
console.log(`Created agency "${agency}" and admin ${email}. Sign in, set up two-step verification, accept the terms.`);
