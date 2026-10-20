-- Visual creation module (Moda). Three small pieces:
--   client_modules  per-client on/off switch (+ config), written only by agency admins, off by default
--   visual_jobs     one row per generation request, written only by the server (service role)
--   post_media      the generated images attached to a post; files live in the private post-media bucket
-- Grants are explicit (revoke everything, then grant exactly what is needed) so this behaves the same on a database
-- whose default privileges were already tightened and on one that was not.

-- 1. Module switch ---------------------------------------------------------------------------------------
create table public.client_modules (
  client_id uuid not null references public.clients(id) on delete cascade,
  module text not null check (module in ('visuals')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 2048),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (client_id, module)
);
alter table public.client_modules enable row level security;
revoke all on public.client_modules from anon, authenticated;
grant select, insert, update on public.client_modules to authenticated;
-- Everyone with access to the client can see whether a module is on (so the UI knows what to show); only admins change it.
create policy client_modules_select on public.client_modules for select to authenticated
  using (public.can_access_client(client_id));
create policy client_modules_insert on public.client_modules for insert to authenticated
  with check (public.can_access_client(client_id) and public.is_admin());
create policy client_modules_update on public.client_modules for update to authenticated
  using (public.can_access_client(client_id) and public.is_admin())
  with check (public.can_access_client(client_id) and public.is_admin());

create or replace function public.client_modules_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end $$;
create trigger client_modules_stamp before insert or update on public.client_modules
  for each row execute function public.client_modules_stamp();

-- 2. Generation jobs -------------------------------------------------------------------------------------
create table public.visual_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  provider text not null default 'moda' check (provider in ('moda')),
  external_task_id text check (external_task_id is null or char_length(external_task_id) <= 80),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','canceled')),
  error_code text check (error_code is null or char_length(error_code) <= 40),
  credits numeric check (credits is null or credits >= 0),
  pages int check (pages is null or pages between 1 and 12),
  requested_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null unique check (char_length(idempotency_key) <= 120),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on public.visual_jobs(client_id, created_at desc);
create index on public.visual_jobs(post_id, created_at desc);
-- One active generation per post at a time (also stops double clicks).
create unique index visual_jobs_one_active on public.visual_jobs(post_id) where status in ('queued','running');

-- 3. Generated images ------------------------------------------------------------------------------------
create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  job_id uuid references public.visual_jobs(id) on delete cascade,
  path text not null unique check (char_length(path) <= 200 and split_part(path, '/', 1) = client_id::text),
  page int not null check (page between 1 and 12),
  width int check (width is null or width between 1 and 10000),
  height int check (height is null or height between 1 and 10000),
  created_at timestamptz not null default now()
);
create index on public.post_media(post_id, created_at desc);

-- The post and the client on a row must agree (the server writes these rows, this is the backstop).
create or replace function public.visual_rows_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.posts p where p.id = new.post_id and p.client_id = new.client_id) then
    raise exception 'post does not belong to this client';
  end if;
  return new;
end $$;
create trigger visual_jobs_guard before insert on public.visual_jobs for each row execute function public.visual_rows_guard();
create trigger post_media_guard before insert on public.post_media for each row execute function public.visual_rows_guard();

alter table public.visual_jobs enable row level security;
alter table public.post_media enable row level security;
revoke all on public.visual_jobs, public.post_media from anon, authenticated;
grant select on public.visual_jobs, public.post_media to authenticated;     -- writes: service role only
create policy visual_jobs_select on public.visual_jobs for select to authenticated using (public.can_access_client(client_id));
create policy post_media_select on public.post_media for select to authenticated using (public.can_access_client(client_id));

-- 4. Private bucket for the images. Path: {client_id}/{post_id}/{job_id}/page-N.png. Read-only through the API; the server writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 15728640, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['image/png'];
create policy post_media_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'post-media' and public.can_access_client(public.logo_client_id(name)));
