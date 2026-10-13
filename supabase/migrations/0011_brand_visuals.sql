-- Branding: a full named palette, a body font, and reference visuals for image creation.

-- Palette: [{ "name": "Sand", "hex": "#e8dcc4", "role": "background" }, ...]. The app validates each entry;
-- the database bounds the shape and size so a bad write can never grow without limit.
alter table public.clients
  add column palette jsonb not null default '[]'::jsonb
    check (jsonb_typeof(palette) = 'array' and jsonb_array_length(palette) <= 12 and pg_column_size(palette) <= 4096),
  add column body_font text check (body_font is null or char_length(body_font) <= 80);
alter table public.clients add constraint clients_font_length check (font is null or char_length(font) <= 80);

create type public.reference_kind as enum ('style','product','people','place','avoid');

-- Reference visuals (mood, products, people, places, and what to avoid). Files live in the private
-- brand-references bucket under {client_id}/...; this table holds the caption and kind.
create table public.brand_references (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  path text not null unique check (char_length(path) <= 200 and split_part(path, '/', 1) = client_id::text),
  kind public.reference_kind not null default 'style',
  caption text check (caption is null or char_length(caption) <= 300),
  width int check (width is null or width between 1 and 10000),
  height int check (height is null or height between 1 and 10000),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.brand_references(client_id, created_at desc);

alter table public.brand_references enable row level security;
grant select, insert, update, delete on public.brand_references to authenticated;
-- Everyone with access to the client sees the references; editing follows the branding rules (lock included).
create policy brand_references_select on public.brand_references for select to authenticated
  using (public.can_access_client(client_id));
create policy brand_references_insert on public.brand_references for insert to authenticated
  with check (public.can_edit_branding(client_id));
create policy brand_references_update on public.brand_references for update to authenticated
  using (public.can_edit_branding(client_id)) with check (public.can_edit_branding(client_id));
create policy brand_references_delete on public.brand_references for delete to authenticated
  using (public.can_edit_branding(client_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-references', 'brand-references', false, 5242880, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/webp','image/png','image/jpeg'];

-- Same path convention as logos ({client_id}/file), so the same helper applies.
create policy references_select on storage.objects for select to authenticated
  using (bucket_id = 'brand-references' and public.can_access_client(public.logo_client_id(name)));
create policy references_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-references' and public.can_edit_branding(public.logo_client_id(name)));
create policy references_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-references' and public.can_edit_branding(public.logo_client_id(name)))
  with check (bucket_id = 'brand-references' and public.can_edit_branding(public.logo_client_id(name)));
create policy references_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-references' and public.can_edit_branding(public.logo_client_id(name)));
