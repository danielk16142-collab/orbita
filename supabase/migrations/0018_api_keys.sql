-- API keys for agents. Each key acts as its own agency team member (agent_user_id, profile role 'team'), so every
-- API request runs under row-level security exactly like a person on the team. The key itself is never stored:
-- only an HMAC of it (packages/security/src/api-key.ts). Keys are created, rotated and revoked by admins through
-- the server (service role); admins can read the list but never the hash.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  agent_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prefix text not null unique check (prefix ~ '^[a-z0-9]{10}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  can_publish boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index on public.api_keys(agency_id);

alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
grant select (id, agency_id, agent_user_id, name, prefix, can_publish, created_at, rotated_at, last_used_at, revoked_at) on public.api_keys to authenticated;
create policy api_keys_select on public.api_keys for select to authenticated using (agency_id = public.current_agency_id() and public.is_admin());
