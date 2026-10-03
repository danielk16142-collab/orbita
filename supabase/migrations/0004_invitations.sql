-- Invitations, consent-record retention, and branding edit helper.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role public.user_role not null,
  token_hash text not null unique,              -- SHA-256 of the token; the token itself is never stored
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invitation_client_role check ((role = 'client') = (client_id is not null))
);
create index on public.invitations(agency_id, created_at desc);
create index on public.invitations(client_id);

alter table public.invitations enable row level security;
revoke all on public.invitations from authenticated;
-- The token hash is never readable through the API.
grant select (id, agency_id, client_id, email, role, expires_at, used_at, created_by, created_at)
  on public.invitations to authenticated;
grant insert (agency_id, client_id, email, role, token_hash, expires_at) on public.invitations to authenticated;
grant delete on public.invitations to authenticated;

create policy invitations_select on public.invitations for select to authenticated
  using (public.is_staff() and agency_id = public.current_agency_id());

-- Staff may invite users for their agency's clients. Only admins may invite staff.
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    public.is_staff()
    and agency_id = public.current_agency_id()
    and used_at is null
    and (
      (role = 'client' and exists (select 1 from public.clients c where c.id = client_id and c.agency_id = agency_id))
      or (role in ('admin','team') and public.is_admin())
    )
  );
-- Revoke a pending invitation.
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_staff() and agency_id = public.current_agency_id() and used_at is null);

-- Consent and request records outlive the account (privacy policy: kept 3 years).
-- The user id remains as a de-identified reference once the auth user is deleted.
alter table public.legal_acceptances drop constraint legal_acceptances_user_id_fkey;
alter table public.data_requests drop constraint data_requests_requester_id_fkey;

-- Who may edit branding (logos/colors) for a client: staff, or the client's own users while unlocked.
create or replace function public.can_edit_branding(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = cid and c.agency_id = p.agency_id
      and (p.role in ('admin','team') or (p.client_id = c.id and not c.branding_locked))
  )
$$;
grant execute on function public.can_edit_branding(uuid) to authenticated;
