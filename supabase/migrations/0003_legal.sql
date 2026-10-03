-- Consent records and data-subject rights requests (GDPR, Quebec Law 25, CCPA).

create type public.legal_document as enum
  ('privacy-policy','terms-of-service','cookie-policy','acceptable-use','data-processing-agreement');
create type public.request_kind as enum ('access','export','correct','delete','restrict','withdraw_consent');
create type public.request_status as enum ('received','verifying','in_progress','completed','rejected');

-- Append-only proof of which version of which document a user accepted.
create table public.legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  document public.legal_document not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  unique (user_id, document, version)
);
create index on public.legal_acceptances(agency_id);

-- Rights requests, tracked against the 30-day response deadline.
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  requester_id uuid not null references auth.users(id) on delete cascade,
  kind public.request_kind not null,
  status public.request_status not null default 'received',
  details text check (char_length(details) <= 4000),
  created_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '30 days'),
  resolved_at timestamptz,
  resolution_note text
);
create index on public.data_requests(agency_id, status);
create index on public.data_requests(requester_id);

alter table public.legal_acceptances enable row level security;
alter table public.data_requests     enable row level security;

grant select, insert on public.legal_acceptances to authenticated;
grant select, insert, update on public.data_requests to authenticated;

-- Acceptances: you record and read your own; agency admins read their agency's.
create policy acceptances_insert on public.legal_acceptances for insert to authenticated
  with check (user_id = auth.uid() and agency_id = public.current_agency_id());
create policy acceptances_select on public.legal_acceptances for select to authenticated
  using (user_id = auth.uid() or (public.is_admin() and agency_id = public.current_agency_id()));

-- Requests: anyone can file their own (status forced to 'received'); admins see and
-- work their agency's requests; requesters can see their own status.
create policy requests_insert on public.data_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and agency_id = public.current_agency_id()
    and status = 'received'
    and resolved_at is null
  );
create policy requests_select on public.data_requests for select to authenticated
  using (requester_id = auth.uid() or (public.is_admin() and agency_id = public.current_agency_id()));
create policy requests_update on public.data_requests for update to authenticated
  using (public.is_admin() and agency_id = public.current_agency_id())
  with check (public.is_admin() and agency_id = public.current_agency_id());

-- Admins may change only workflow columns.
create or replace function public.data_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
       new.id <> old.id or new.agency_id <> old.agency_id or new.requester_id <> old.requester_id
    or new.kind <> old.kind or new.created_at <> old.created_at or new.due_at <> old.due_at
    or new.details is distinct from old.details) then
    raise exception 'only status and resolution fields can be changed';
  end if;
  return new;
end $$;
create trigger data_requests_guard before update on public.data_requests
  for each row execute function public.data_requests_guard();
