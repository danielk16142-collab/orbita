-- One strategy per language: a client that posts in English and Spanish can have an active strategy for each, and the
-- calendar is split by language too (posts already carry their language). Existing strategies take the client's first
-- language.
alter table public.strategies add column if not exists language public.locale_code;
update public.strategies s set language = coalesce(c.languages[1], 'en')
  from public.clients c where c.id = s.client_id and s.language is null;
update public.strategies set language = 'en' where language is null;
alter table public.strategies alter column language set not null;

drop index if exists public.strategies_one_active;
create unique index if not exists strategies_one_active_per_language on public.strategies(client_id, language) where active;
