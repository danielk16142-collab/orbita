-- Orbita core schema. Multi-tenant: agency -> clients. Default deny via RLS.
create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'team', 'client');
create type public.post_status as enum ('idea','draft','approved','scheduled','publishing','published','failed');
create type public.network as enum ('instagram','tiktok','linkedin','youtube','facebook');
create type public.locale_code as enum ('en','fr','es');

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  languages public.locale_code[] not null default '{en}',
  markets text[] not null default '{}',
  logo_light_path text,
  logo_dark_path text,
  primary_color text check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  font text,
  branding_locked boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.clients(agency_id);

-- One row per authenticated user. client_id is set only for role = client.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  role public.user_role not null,
  full_name text,
  locale public.locale_code not null default 'en',
  created_at timestamptz not null default now(),
  constraint client_role_has_client check ((role = 'client') = (client_id is not null))
);
create index on public.profiles(agency_id);
create index on public.profiles(client_id);

create table public.brand_briefs (
  client_id uuid primary key references public.clients(id) on delete cascade,
  brand jsonb not null default '{}',
  voice jsonb not null default '{}',
  personas jsonb not null default '[]',
  objections jsonb not null default '[]',
  pillars jsonb not null default '[]',
  channels jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.proof_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  claim text not null,
  source text not null,
  created_at timestamptz not null default now()
);
create index on public.proof_items(client_id);

create table public.client_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  rule text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.client_rules(client_id);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  network public.network not null,
  url text not null,
  source text not null default 'manual' check (source in ('manual','auto')),
  last_researched_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.competitors(client_id);

-- Tokens are stored encrypted by the application (envelope encryption). Never plaintext.
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  network public.network not null,
  external_id text not null,
  handle text,
  encrypted_tokens bytea,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','expired','revoked')),
  created_at timestamptz not null default now(),
  unique (client_id, network, external_id)
);
create index on public.social_accounts(client_id);

create table public.metrics_daily (
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  metric text not null,
  value numeric not null,
  primary key (account_id, day, metric)
);
create index on public.metrics_daily(client_id, day);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  network public.network not null,
  language public.locale_code not null,
  type text not null default 'post',
  pillar text,
  persona text,
  funnel_stage text,
  status public.post_status not null default 'idea',
  scheduled_at timestamptz,
  caption text,
  hashtags text[] not null default '{}',
  script jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.posts(client_id, scheduled_at);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  author uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index on public.post_comments(post_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.messages(conversation_id, created_at);

create table public.usage_events (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null,
  quantity numeric not null default 1,
  created_at timestamptz not null default now()
);

-- Append-only audit log.
create table public.audit_log (
  id bigint generated always as identity primary key,
  agency_id uuid references public.agencies(id) on delete set null,
  actor uuid,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb not null default '{}',
  ip inet,
  created_at timestamptz not null default now()
);
