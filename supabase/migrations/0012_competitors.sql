-- Competitors as profiles (name, website, social links) and their analyses.

-- A competitor used to be one network URL. It is now a profile: a name, an optional website and up to 8 links.
alter table public.competitors alter column network drop not null, alter column url drop not null;
alter table public.competitors
  add column name text check (name is null or char_length(name) between 1 and 120),
  add column website text check (website is null or (char_length(website) <= 300 and website ~ '^https://')),
  add column links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 8 and pg_column_size(links) < 4000),
  add column notes text check (notes is null or char_length(notes) <= 1000),
  add column updated_at timestamptz not null default now();
alter table public.competitors add constraint competitors_named check (name is not null or url is not null);
alter table public.competitors add constraint competitors_url_https check (url is null or url ~ '^https://') not valid;
-- Lets analyses reference (competitor, client) together, so an analysis can never point at another client's competitor.
alter table public.competitors add constraint competitors_id_client unique (id, client_id);

-- One row per analysis run; the latest is shown, older ones are kept as history.
create table public.competitor_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  competitor_id uuid not null,
  analysis jsonb not null check (jsonb_typeof(analysis) = 'object' and pg_column_size(analysis) < 40000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (competitor_id, client_id) references public.competitors(id, client_id) on delete cascade
);
create index on public.competitor_analyses(competitor_id, created_at desc);
create index on public.competitor_analyses(client_id);

alter table public.competitor_analyses enable row level security;
grant select, insert, delete on public.competitor_analyses to authenticated;
create policy competitor_analyses_select on public.competitor_analyses for select to authenticated using (public.can_access_client(client_id));
create policy competitor_analyses_insert on public.competitor_analyses for insert to authenticated with check (public.can_access_client(client_id));
create policy competitor_analyses_delete on public.competitor_analyses for delete to authenticated using (public.can_access_client(client_id) and public.is_staff());
