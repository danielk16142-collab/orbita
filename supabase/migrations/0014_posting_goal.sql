-- Weekly posting goal per client: the "Your next post" card tracks published posts against it.
alter table public.clients add column if not exists posting_goal smallint not null default 3 check (posting_goal between 1 and 21);
