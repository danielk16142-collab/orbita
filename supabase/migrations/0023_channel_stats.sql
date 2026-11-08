-- Numbers for channels without an official connection: TikTok (the account's public videos, fetched with Apify) and LinkedIn
-- (the analytics file people export from LinkedIn and upload). One row per fetch or upload, newest first; the agent's audit of
-- that snapshot is stored on it.
create table public.channel_stats (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  network text not null check (network in ('tiktok','linkedin')),
  source text not null check (source in ('apify','linkedin_export')),
  handle text check (handle is null or char_length(handle) <= 100),
  summary jsonb not null check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 60000),
  audit jsonb check (audit is null or (jsonb_typeof(audit) = 'object' and pg_column_size(audit) < 30000)),
  audited_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.channel_stats(client_id, network, created_at desc);

alter table public.channel_stats enable row level security;
revoke all on public.channel_stats from anon, authenticated;
grant select, insert, delete on public.channel_stats to authenticated;
grant update (audit, audited_at) on public.channel_stats to authenticated; -- the numbers themselves are never edited
create policy channel_stats_select on public.channel_stats for select to authenticated using (public.can_access_client(client_id));
create policy channel_stats_insert on public.channel_stats for insert to authenticated with check (public.can_access_client(client_id));
create policy channel_stats_update on public.channel_stats for update to authenticated using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy channel_stats_delete on public.channel_stats for delete to authenticated using (public.can_access_client(client_id) and public.is_staff());
