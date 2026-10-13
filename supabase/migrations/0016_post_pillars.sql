-- Strategy Map: published (synced) posts get a content pillar too, assigned by the agent, so the map can compare
-- the strategy's pillar mix with what actually went out. Written by the server only (account_posts stays read-only).
alter table public.account_posts add column if not exists pillar text check (pillar is null or char_length(pillar) <= 80);
