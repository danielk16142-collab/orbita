-- Winning posts/videos of a competitor ("what is working"): entered by staff (or pasted and parsed by the agent), ranked by how far
-- each beat the competitor's own median. One row per post; the numbers are whatever was visible when it was recorded.
create table public.competitor_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  competitor_id uuid not null,
  url text check (url is null or (char_length(url) <= 500 and url ~ '^https://')),
  network text not null default 'instagram' check (network in ('instagram','tiktok','linkedin','youtube','facebook')),
  hook text not null check (char_length(hook) between 1 and 300),
  caption text check (caption is null or char_length(caption) <= 2200),
  transcript text check (transcript is null or char_length(transcript) <= 8000),
  views bigint check (views is null or views >= 0),
  likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0),
  shares bigint check (shares is null or shares >= 0),
  followers bigint check (followers is null or followers >= 0),
  posted_at date,
  formula_id int check (formula_id is null or formula_id between 1 and 99),
  source text not null default 'manual' check (source in ('manual','agent','meta','provider')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (competitor_id, client_id) references public.competitors(id, client_id) on delete cascade
);
create index on public.competitor_posts(competitor_id, created_at desc);
create index on public.competitor_posts(client_id, created_at desc);

alter table public.competitor_posts enable row level security;
revoke all on public.competitor_posts from anon, authenticated;
grant select, insert, delete on public.competitor_posts to authenticated;
-- Same rule as competitor_analyses: anyone with access to the client reads and adds; only staff remove.
create policy competitor_posts_select on public.competitor_posts for select to authenticated using (public.can_access_client(client_id));
create policy competitor_posts_insert on public.competitor_posts for insert to authenticated with check (public.can_access_client(client_id));
create policy competitor_posts_delete on public.competitor_posts for delete to authenticated using (public.can_access_client(client_id) and public.is_staff());
