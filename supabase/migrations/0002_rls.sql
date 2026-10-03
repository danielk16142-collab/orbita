-- Row-level security. Default deny: every table has RLS enabled, and access
-- is granted only by the explicit policies below.

-- Helper functions. SECURITY DEFINER so they can read profiles without recursing
-- through profiles' own RLS. search_path is pinned.
create or replace function public.current_agency_id() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_role_name() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where user_id = auth.uid()
$$;

-- True when the caller may access this client's data:
-- agency staff of the owning agency, or the client's own users.
create or replace function public.can_access_client(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = cid
      and c.agency_id = p.agency_id
      and (p.role in ('admin','team') or p.client_id = c.id)
  )
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('admin','team'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false)
$$;

revoke execute on all functions in schema public from public;
grant execute on function
  public.current_agency_id(), public.current_role_name(), public.current_client_id(),
  public.can_access_client(uuid), public.is_staff(), public.is_admin()
to authenticated;

-- Base privileges (Supabase grants these by default; explicit here so behavior never
-- depends on platform defaults). RLS policies and the revokes at the end narrow them.
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table public.agencies        enable row level security;
alter table public.clients         enable row level security;
alter table public.profiles        enable row level security;
alter table public.brand_briefs    enable row level security;
alter table public.proof_items     enable row level security;
alter table public.client_rules    enable row level security;
alter table public.competitors     enable row level security;
alter table public.social_accounts enable row level security;
alter table public.metrics_daily   enable row level security;
alter table public.posts           enable row level security;
alter table public.post_comments   enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.usage_events    enable row level security;
alter table public.audit_log       enable row level security;

-- agencies: members see their own agency; only admins edit it.
create policy agencies_select on public.agencies for select to authenticated
  using (id = public.current_agency_id());
create policy agencies_update on public.agencies for update to authenticated
  using (id = public.current_agency_id() and public.is_admin())
  with check (id = public.current_agency_id() and public.is_admin());

-- clients: staff see all of their agency's clients; a client user sees only their own.
create policy clients_select on public.clients for select to authenticated
  using (public.can_access_client(id));
create policy clients_insert on public.clients for insert to authenticated
  with check (agency_id = public.current_agency_id() and public.is_staff());
create policy clients_delete on public.clients for delete to authenticated
  using (agency_id = public.current_agency_id() and public.is_admin());
-- Staff may update anything; a client user may update only their own row, and only
-- when branding is not locked. Column limits are enforced by the trigger below.
create policy clients_update on public.clients for update to authenticated
  using (
    public.can_access_client(id)
    and (public.is_staff() or not branding_locked)
  )
  with check (public.can_access_client(id) and agency_id = public.current_agency_id());

-- A client user may change ONLY branding columns, never name/agency/lock state.
create or replace function public.clients_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    if new.id <> old.id
       or new.agency_id <> old.agency_id
       or new.name <> old.name
       or new.languages <> old.languages
       or new.markets <> old.markets
       or new.branding_locked <> old.branding_locked then
      raise exception 'clients may only edit branding fields';
    end if;
  end if;
  return new;
end $$;
create trigger clients_guard_update before update on public.clients
  for each row execute function public.clients_guard_update();

-- profiles: you see yourself; staff see their agency's profiles. Role/agency/client
-- changes are never allowed from the client API (done server-side with the service role).
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or (public.is_staff() and agency_id = public.current_agency_id()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and role = public.current_role_name()
    and agency_id = public.current_agency_id()
    and client_id is not distinct from public.current_client_id()
  );

-- Per-client data tables share one pattern: access iff can_access_client(client_id).
do $$
declare t text;
begin
  foreach t in array array[
    'brand_briefs','proof_items','client_rules','competitors',
    'posts','post_comments','conversations','messages'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_client(client_id))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_access_client(client_id))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_access_client(client_id)) with check (public.can_access_client(client_id))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_access_client(client_id) and public.is_staff())', t||'_delete', t);
  end loop;
end $$;

-- social_accounts: read-only from the API. Tokens are written by server code with the
-- service role. encrypted_tokens is never exposed to API roles (column privilege below).
create policy social_accounts_select on public.social_accounts for select to authenticated
  using (public.can_access_client(client_id));
revoke select on public.social_accounts from authenticated;
grant select (id, client_id, network, external_id, handle, scopes, status, created_at)
  on public.social_accounts to authenticated;

-- metrics_daily and usage_events: read-only from the API; written by jobs.
create policy metrics_select on public.metrics_daily for select to authenticated
  using (public.can_access_client(client_id));
create policy usage_select on public.usage_events for select to authenticated
  using (public.can_access_client(client_id));

-- audit_log: admins read their agency's log. Nobody writes or edits it via the API.
create policy audit_select on public.audit_log for select to authenticated
  using (agency_id = public.current_agency_id() and public.is_admin());

-- Defense in depth: the anon role gets nothing, and audit_log is append-only.
revoke all on all tables in schema public from anon;
revoke update, delete, truncate on public.audit_log from authenticated;
revoke insert, update, delete on public.metrics_daily, public.usage_events, public.social_accounts, public.audit_log from authenticated;
