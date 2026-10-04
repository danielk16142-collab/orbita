-- Structured post content (reel scripts, carousel slides, static briefs), content strategies, research notes.

alter table public.posts
  add column content jsonb check (content is null or pg_column_size(content) < 40000),
  add column suggested_time text check (suggested_time is null or suggested_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter type public.proposal_target add value if not exists 'post';
alter type public.proposal_target add value if not exists 'strategy';

-- The strategy a client is currently following. One active strategy per client at a time.
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  period text not null check (period in ('month','quarter')),
  content jsonb not null check (pg_column_size(content) < 60000),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.strategies(client_id, created_at desc);
create unique index strategies_one_active on public.strategies(client_id) where active;

-- Findings from web research (trends, competitors, audience, ideas). Web-derived text: always shown to the model as untrusted.
create table public.research_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('trend','competitor','audience','idea')),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 2000),
  sources jsonb not null default '[]' check (pg_column_size(sources) < 6000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.research_notes(client_id, created_at desc);

alter table public.strategies enable row level security;
alter table public.research_notes enable row level security;
grant select, insert, update, delete on public.strategies, public.research_notes to authenticated;

do $$
declare t text;
begin
  foreach t in array array['strategies','research_notes'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_client(client_id))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_access_client(client_id))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_access_client(client_id)) with check (public.can_access_client(client_id))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_access_client(client_id))', t||'_delete', t);
  end loop;
end $$;
