-- What the brand talks about: topics chosen in the Profile ({ name, level: focus | sometimes | avoid }).
-- Pillars keep using brand_briefs.pillars, now as objects ({ name, angle, share, topics }); older string entries still read.
alter table public.brand_briefs add column if not exists topics jsonb not null default '[]'
  check (jsonb_typeof(topics) = 'array' and pg_column_size(topics) < 20000);
