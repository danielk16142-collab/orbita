-- Social connectors: token storage format, sync state, posts and sync history.

-- Tokens are stored as our envelope-encrypted string (see packages/security/src/crypto.ts), not raw bytes.
alter table public.social_accounts
  alter column encrypted_tokens type text using encode(encrypted_tokens, 'escape'),
  add column token_expires_at timestamptz,
  add column last_synced_at timestamptz,
  add column last_error text check (last_error is null or char_length(last_error) <= 200),
  add column display_name text check (display_name is null or char_length(display_name) <= 200);

-- API roles may read these new, non-secret columns. encrypted_tokens stays unreadable (see 0002).
grant select (token_expires_at, last_synced_at, last_error, display_name) on public.social_accounts to authenticated;

create table public.account_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  external_id text not null,
  published_at timestamptz,
  permalink text check (permalink is null or char_length(permalink) <= 500),
  caption text check (caption is null or char_length(caption) <= 2200),
  media_type text,
  metrics jsonb not null default '{}' check (pg_column_size(metrics) < 4000),
  fetched_at timestamptz not null default now(),
  unique (account_id, external_id)
);
create index on public.account_posts(client_id, published_at desc);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','error')),
  error text check (error is null or char_length(error) <= 200),
  rows int not null default 0
);
create index on public.sync_runs(account_id, started_at desc);

alter table public.account_posts enable row level security;
alter table public.sync_runs enable row level security;
-- Read-only for API roles; only the server (service role) writes.
grant select on public.account_posts, public.sync_runs to authenticated;
create policy account_posts_select on public.account_posts for select to authenticated using (public.can_access_client(client_id));
create policy sync_runs_select on public.sync_runs for select to authenticated using (public.can_access_client(client_id));
