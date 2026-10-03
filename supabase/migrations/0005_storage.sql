-- Private bucket for client logos. Path convention: {client_id}/{file}.
-- Access mirrors the clients table: read if you can access the client, write if you can edit branding.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-logos', 'client-logos', false, 1048576, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
  allowed_mime_types = array['image/webp','image/png','image/jpeg'];

create or replace function public.logo_client_id(object_name text) returns uuid
language sql immutable as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end
$$;
grant execute on function public.logo_client_id(text) to authenticated;

create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'client-logos' and public.can_access_client(public.logo_client_id(name)));
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'client-logos' and public.can_edit_branding(public.logo_client_id(name)));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'client-logos' and public.can_edit_branding(public.logo_client_id(name)))
  with check (bucket_id = 'client-logos' and public.can_edit_branding(public.logo_client_id(name)));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'client-logos' and public.can_edit_branding(public.logo_client_id(name)));
