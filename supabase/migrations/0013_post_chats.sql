-- Post chats: a conversation dedicated to drafting one post from the "Create post" page.
-- They are kept out of the main agent chat (which loads the latest non-post conversation).
alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('onboarding','training','planning','post'));
