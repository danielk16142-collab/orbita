-- Brand-training agent: sources, audits, memories, proposals (incl. weekly plans), feedback.

create type public.source_kind as enum ('website','instagram','tiktok','linkedin','youtube','facebook','other');
create type public.memory_kind as enum ('preference','rule','fact','example','avoid');
create type public.proposal_target as enum ('brief','memory','proof_item','rule','plan');
create type public.proposal_status as enum ('pending','accepted','rejected');

-- Brief gets the sections the interview fills in, plus versioning.
alter table public.brand_briefs
  add column goals jsonb not null default '{}',
  add column offers jsonb not null default '{}',
  add column restrictions jsonb not null default '{}',
  add column competitors jsonb not null default '{}',
  add column version int not null default 1,
  add column completeness int not null default 0 check (completeness between 0 and 100);

alter table public.conversations
  add column kind text not null default 'training' check (kind in ('onboarding','training','planning')),
  add column summary text check (char_length(summary) <= 8000);

-- Posts created from an accepted plan remember where they came from.
alter table public.posts add column source text not null default 'manual' check (source in ('manual','agent'));
alter table public.posts add column idea text check (char_length(idea) <= 2000);

create table public.client_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind public.source_kind not null,
  url text check (url is null or (char_length(url) <= 500 and url ~ '^https://')),
  handle text check (handle is null or char_length(handle) <= 120),
  added_by uuid references auth.users(id) on delete set null,
  last_audited_at timestamptz,
  created_at timestamptz not null default now(),
  check (url is not null or handle is not null),
  unique (client_id, url)
);
create index on public.client_sources(client_id);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  report jsonb not null,
  pages jsonb not null default '[]',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.audits(client_id, created_at desc);

create table public.brand_memories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind public.memory_kind not null,
  content text not null check (char_length(content) between 1 and 1000),
  source text not null default 'chat' check (source in ('chat','feedback','edit','manual')),
  status text not null default 'active' check (status in ('active','archived')),
  weight int not null default 1 check (weight between 1 and 5),
  created_at timestamptz not null default now()
);
create index on public.brand_memories(client_id, status);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  target public.proposal_target not null,
  payload jsonb not null,
  reason text check (char_length(reason) <= 1000),
  status public.proposal_status not null default 'pending',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.proposals(client_id, status, created_at desc);

-- What people do with the agent's output: the learning signal.
create table public.generation_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  proposal_id uuid references public.proposals(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  outcome text not null check (outcome in ('accepted','edited','rejected')),
  comment text check (char_length(comment) <= 1000),
  original jsonb,
  final jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.generation_feedback(client_id, created_at desc);

alter table public.client_sources enable row level security;
alter table public.audits enable row level security;
alter table public.brand_memories enable row level security;
alter table public.proposals enable row level security;
alter table public.generation_feedback enable row level security;

grant select, insert, update, delete on public.client_sources, public.brand_memories, public.proposals to authenticated;
grant select, insert, delete on public.audits to authenticated;
grant select, insert on public.generation_feedback to authenticated;

-- Everyone who can access the client (agency staff and that client's users) can train the agent.
do $$
declare t text;
begin
  foreach t in array array['client_sources','audits','brand_memories','proposals','generation_feedback'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_client(client_id))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_access_client(client_id))', t||'_insert', t);
  end loop;
end $$;

create policy client_sources_update on public.client_sources for update to authenticated
  using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy client_sources_delete on public.client_sources for delete to authenticated
  using (public.can_access_client(client_id));
create policy brand_memories_update on public.brand_memories for update to authenticated
  using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy brand_memories_delete on public.brand_memories for delete to authenticated
  using (public.can_access_client(client_id) and public.is_staff());
create policy audits_delete on public.audits for delete to authenticated
  using (public.can_access_client(client_id) and public.is_staff());
create policy proposals_update on public.proposals for update to authenticated
  using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy proposals_delete on public.proposals for delete to authenticated
  using (public.can_access_client(client_id) and public.is_staff());

-- New proposals are always pending. A proposal can be decided once, only by changing status and
-- decision fields; its content is immutable (what was proposed is what the audit trail shows).
create or replace function public.proposals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.decided_by is not null or new.decided_at is not null then
      raise exception 'new proposals must be pending';
    end if;
    return new;
  end if;
  if auth.uid() is not null then
    if old.status <> 'pending' then raise exception 'proposal already decided'; end if;
    if new.client_id <> old.client_id or new.target <> old.target or new.payload is distinct from old.payload
       or new.reason is distinct from old.reason or new.conversation_id is distinct from old.conversation_id
       or new.created_at <> old.created_at then
      raise exception 'proposal content cannot be changed';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end $$;
create trigger proposals_guard before insert or update on public.proposals
  for each row execute function public.proposals_guard();

-- The summary column on conversations is written by the server with the user's session; messages already follow can_access_client.
