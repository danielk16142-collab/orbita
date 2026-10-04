-- Posts calendar: planned date, client timezone, approval rules, comment integrity.

alter table public.clients add column timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64);

-- planned_date: the day on the client's calendar (client-local). scheduled_at stays the real publish instant, set when a post is scheduled.
alter table public.posts add column planned_date date, add column updated_at timestamptz not null default now();
update public.posts set planned_date = (scheduled_at at time zone 'UTC')::date where scheduled_at is not null and planned_date is null;
create index on public.posts(client_id, planned_date);

-- Who may do what to a post.
--  * Staff: anything.
--  * Client users: create ideas; approve a draft or send an approved post back to draft (request changes). Nothing else, and no other column.
--  * Editing the content of an approved post puts it back to draft, so the client approves what will actually be published.
create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    if tg_op = 'INSERT' then
      if new.status <> 'idea' or new.source <> 'manual' or new.scheduled_at is not null then
        raise exception 'clients can only add ideas';
      end if;
      new.created_by := auth.uid();
    elsif tg_op = 'UPDATE' then
      if new.id <> old.id or new.client_id <> old.client_id or new.network <> old.network or new.language <> old.language
         or new.type is distinct from old.type or new.pillar is distinct from old.pillar or new.persona is distinct from old.persona
         or new.funnel_stage is distinct from old.funnel_stage or new.scheduled_at is distinct from old.scheduled_at
         or new.caption is distinct from old.caption or new.hashtags is distinct from old.hashtags or new.script is distinct from old.script
         or new.idea is distinct from old.idea or new.content is distinct from old.content or new.planned_date is distinct from old.planned_date
         or new.suggested_time is distinct from old.suggested_time or new.source <> old.source or new.created_by is distinct from old.created_by then
        raise exception 'clients can only approve or request changes';
      end if;
      if new.status <> old.status and not ((old.status = 'draft' and new.status = 'approved') or (old.status = 'approved' and new.status = 'draft')) then
        raise exception 'status change not allowed';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- Changing what will be published invalidates an earlier approval.
    if old.status = 'approved' and new.status = old.status and (
         new.caption is distinct from old.caption or new.hashtags is distinct from old.hashtags or new.content is distinct from old.content
      or new.idea is distinct from old.idea or new.network <> old.network or new.planned_date is distinct from old.planned_date
      or new.suggested_time is distinct from old.suggested_time or new.script is distinct from old.script) then
      new.status := 'draft';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger posts_guard before insert or update on public.posts
  for each row execute function public.posts_guard();

-- Comments: the author is always the signed-in user, and the comment must belong to a post of the SAME client.
create or replace function public.post_comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.author := auth.uid(); end if;
  if not exists (select 1 from public.posts p where p.id = new.post_id and p.client_id = new.client_id) then
    raise exception 'comment must belong to a post of the same client';
  end if;
  return new;
end $$;
create trigger post_comments_guard before insert on public.post_comments
  for each row execute function public.post_comments_guard();
