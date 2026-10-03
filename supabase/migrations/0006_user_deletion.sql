-- Deleting a user (account deletion, offboarding) must never be blocked by content they authored.
-- Content is kept; the author reference is cleared.
alter table public.posts drop constraint posts_created_by_fkey,
  add constraint posts_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

alter table public.conversations drop constraint conversations_created_by_fkey,
  add constraint conversations_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

alter table public.post_comments alter column author drop not null;
alter table public.post_comments drop constraint post_comments_author_fkey,
  add constraint post_comments_author_fkey foreign key (author) references auth.users(id) on delete set null;

alter table public.invitations alter column created_by drop not null;
