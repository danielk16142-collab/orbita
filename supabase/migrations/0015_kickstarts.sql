-- Kickstart plans: one per connected account, made after it is connected. The person accepts it (its posts go on the
-- calendar as ideas) or dismisses it. Readable and writable by anyone who can access the client; removed with the account.
create table public.kickstarts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  account_id uuid not null unique references public.social_accounts(id) on delete cascade,
  network public.network not null,
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) < 40000),
  start_date date not null,
  status text not null default 'ready' check (status in ('ready','accepted','dismissed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.kickstarts(client_id);

-- The account must belong to the same client (social_accounts is not fully readable by API roles, so check as definer).
create or replace function public.kickstarts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.social_accounts s where s.id = new.account_id and s.client_id = new.client_id and s.network = new.network) then
    raise exception 'kickstart must belong to an account of the same client';
  end if;
  if tg_op = 'UPDATE' and (new.client_id <> old.client_id or new.account_id <> old.account_id) then
    raise exception 'kickstart cannot move to another client or account';
  end if;
  if auth.uid() is not null then new.created_by := coalesce(old.created_by, auth.uid()); end if;
  return new;
end $$;
create trigger kickstarts_guard before insert or update on public.kickstarts
  for each row execute function public.kickstarts_guard();

alter table public.kickstarts enable row level security;
grant select, insert, update on public.kickstarts to authenticated;
create policy kickstarts_select on public.kickstarts for select to authenticated using (public.can_access_client(client_id));
create policy kickstarts_insert on public.kickstarts for insert to authenticated with check (public.can_access_client(client_id));
create policy kickstarts_update on public.kickstarts for update to authenticated using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
