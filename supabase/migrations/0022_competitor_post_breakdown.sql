-- "Why it works": the structure breakdown of a competitor post (hook, structure, retention devices, call to action, what to
-- reuse), written by the agent and saved on the post. Written by the server after it checked the row through the person's own
-- session (people keep select/insert/delete only, as in 0021).
alter table public.competitor_posts
  add column if not exists breakdown jsonb check (breakdown is null or (jsonb_typeof(breakdown) = 'object' and pg_column_size(breakdown) < 20000));
