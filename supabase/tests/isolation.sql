-- Tenant-isolation tests. Raises an exception on the first failure.
\set ON_ERROR_STOP on
\set agA '''aaaaaaaa-0000-0000-0000-000000000001'''
\set agB '''bbbbbbbb-0000-0000-0000-000000000001'''

insert into auth.users(id) values
 ('a0000000-0000-0000-0000-000000000001'), -- adminA
 ('a0000000-0000-0000-0000-000000000002'), -- teamA
 ('a0000000-0000-0000-0000-000000000003'), -- clientA1
 ('a0000000-0000-0000-0000-000000000004'), -- clientA2
 ('b0000000-0000-0000-0000-000000000001'); -- adminB

insert into agencies(id,name) values (:agA,'Agency A'),(:agB,'Agency B');
insert into clients(id,agency_id,name) values
 ('c1000000-0000-0000-0000-000000000001',:agA,'A1'),
 ('c2000000-0000-0000-0000-000000000002',:agA,'A2'),
 ('c3000000-0000-0000-0000-000000000003',:agB,'B1');
insert into profiles(user_id,agency_id,client_id,role) values
 ('a0000000-0000-0000-0000-000000000001',:agA,null,'admin'),
 ('a0000000-0000-0000-0000-000000000002',:agA,null,'team'),
 ('a0000000-0000-0000-0000-000000000003',:agA,'c1000000-0000-0000-0000-000000000001','client'),
 ('a0000000-0000-0000-0000-000000000004',:agA,'c2000000-0000-0000-0000-000000000002','client'),
 ('b0000000-0000-0000-0000-000000000001',:agB,null,'admin');
insert into posts(client_id,network,language,caption) values
 ('c1000000-0000-0000-0000-000000000001','instagram','en','A1 post'),
 ('c2000000-0000-0000-0000-000000000002','instagram','en','A2 post'),
 ('c3000000-0000-0000-0000-000000000003','tiktok','fr','B1 post');
insert into social_accounts(id,client_id,network,external_id,encrypted_tokens) values
 ('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','instagram','ig1','\xdeadbeef');

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;
create or replace function pg_temp.expect(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok   %', label;
end $$;
create or replace function pg_temp.expect_error(label text, stmt text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin execute stmt; exception when others then failed := true; end;
  if not failed then raise exception 'FAIL %: statement should have been denied', label; end if;
  raise notice 'ok   % (denied)', label;
end $$;

-- client A1 sees only its own data
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
select pg_temp.expect('clientA1 sees 1 post',  (select count(*) from posts), 1);
select pg_temp.expect('clientA1 sees 1 client',(select count(*) from clients), 1);
select pg_temp.expect('clientA1 cannot see other agency', (select count(*) from agencies where id=:agB), 0);
select pg_temp.expect_error('clientA1 cannot insert post for A2',
  $$insert into posts(client_id,network,language) values ('c2000000-0000-0000-0000-000000000002','instagram','en')$$);
select pg_temp.expect_error('clientA1 cannot rename own client',
  $$update clients set name='x' where id='c1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_error('clientA1 cannot read encrypted tokens',
  $$select encrypted_tokens from social_accounts$$);
select pg_temp.expect_error('clientA1 cannot escalate role',
  $$update profiles set role='admin' where user_id='a0000000-0000-0000-0000-000000000003'$$);
select pg_temp.expect_error('clientA1 cannot write metrics',
  $$insert into metrics_daily values ('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',current_date,'reach',1)$$);
update clients set primary_color='#112233' where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.expect('clientA1 can edit branding', (select count(*) from clients where primary_color='#112233'), 1);
select pg_temp.reset();

-- locked branding blocks the client
update clients set branding_locked=true where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
update clients set primary_color='#445566' where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.expect('locked branding cannot be changed by client', (select count(*) from clients where primary_color='#445566'), 0);
select pg_temp.reset();

-- team in agency A sees both A clients, none of B
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
select pg_temp.expect('teamA sees 2 posts', (select count(*) from posts), 2);
select pg_temp.expect('teamA sees 2 clients', (select count(*) from clients), 2);
delete from clients where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.expect('teamA cannot delete client (0 rows affected)', (select count(*) from clients), 2);
select pg_temp.reset();

-- admin B sees only B
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select pg_temp.expect('adminB sees 1 post', (select count(*) from posts), 1);
select pg_temp.expect('adminB sees 1 client', (select count(*) from clients), 1);
select pg_temp.reset();

-- anon sees nothing
set role anon;
select pg_temp.expect_error('anon cannot read posts', $$select count(*) from posts$$);
reset role;

-- audit log is append-only for API roles
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select pg_temp.expect_error('admin cannot write audit_log', $$insert into audit_log(action) values ('x')$$);
select pg_temp.reset();


-- legal: acceptances are own-only and append-only; requests are scoped and guarded
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
insert into legal_acceptances(user_id,agency_id,document,version)
  values ('a0000000-0000-0000-0000-000000000003',:agA,'privacy-policy','0.1');
select pg_temp.expect_error('cannot record acceptance for someone else',
  $$insert into legal_acceptances(user_id,agency_id,document,version) values ('a0000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','privacy-policy','0.1')$$);
select pg_temp.expect_error('acceptances cannot be edited',
  $$update legal_acceptances set version='9'$$);
select pg_temp.expect_error('acceptances cannot be deleted',
  $$delete from legal_acceptances$$);
insert into data_requests(agency_id,requester_id,kind)
  values (:agA,'a0000000-0000-0000-0000-000000000003','delete');
select pg_temp.expect_error('cannot file a request as already completed',
  $$insert into data_requests(agency_id,requester_id,kind,status) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','access','completed')$$);
update data_requests set status='completed';
select pg_temp.expect('requester cannot close their own request', (select count(*) from data_requests where status='completed'), 0);
select pg_temp.reset();

select pg_temp.as_user('a0000000-0000-0000-0000-000000000004');
select pg_temp.expect('other client user cannot see the request', (select count(*) from data_requests), 0);
select pg_temp.expect('other client user cannot see acceptances', (select count(*) from legal_acceptances), 0);
select pg_temp.reset();

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select pg_temp.expect('adminA sees the request', (select count(*) from data_requests), 1);
update data_requests set status='in_progress';
select pg_temp.expect('adminA can work the request', (select count(*) from data_requests where status='in_progress'), 1);
select pg_temp.expect_error('adminA cannot change the due date', $$update data_requests set due_at = now() + interval '1 year'$$);
select pg_temp.reset();

select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select pg_temp.expect('adminB cannot see agency A requests', (select count(*) from data_requests), 0);
select pg_temp.reset();


-- invitations and storage
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002'); -- team A
insert into invitations(agency_id,client_id,email,role,token_hash)
  values (:agA,'c1000000-0000-0000-0000-000000000001','new@a1.test','client','hash-1');
select pg_temp.expect('team can invite a client user', (select count(*) from invitations), 1);
select pg_temp.expect_error('team cannot invite an admin',
  $$insert into invitations(agency_id,email,role,token_hash) values ('aaaaaaaa-0000-0000-0000-000000000001','x@a.test','admin','hash-2')$$);
select pg_temp.expect_error('team cannot invite for another agency client',
  $$insert into invitations(agency_id,client_id,email,role,token_hash) values ('aaaaaaaa-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000003','x@b.test','client','hash-3')$$);
select pg_temp.expect_error('token hash is not readable', $$select token_hash from invitations$$);
select pg_temp.expect_error('client invitation needs a client',
  $$insert into invitations(agency_id,email,role,token_hash) values ('aaaaaaaa-0000-0000-0000-000000000001','x@a.test','client','hash-4')$$);
select pg_temp.reset();

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- admin A
insert into invitations(agency_id,email,role,token_hash) values (:agA,'staff@a.test','team','hash-5');
select pg_temp.expect('admin can invite staff', (select count(*) from invitations), 2);
select pg_temp.reset();

select pg_temp.as_user('a0000000-0000-0000-0000-000000000003'); -- client A1
select pg_temp.expect('client user cannot see invitations', (select count(*) from invitations), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- admin B
select pg_temp.expect('other agency cannot see invitations', (select count(*) from invitations), 0);
select pg_temp.reset();

-- logos: path convention {client_id}/file
insert into storage.buckets(id,name) values ('client-logos','client-logos') on conflict do nothing;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003'); -- client A1 (branding unlocked? it was locked earlier)
select pg_temp.expect_error('locked branding blocks client logo upload',
  $$insert into storage.objects(bucket_id,name) values ('client-logos','c1000000-0000-0000-0000-000000000001/logo.webp')$$);
select pg_temp.reset();
update clients set branding_locked=false where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
insert into storage.objects(bucket_id,name) values ('client-logos','c1000000-0000-0000-0000-000000000001/logo.webp');
select pg_temp.expect('client uploads own logo when unlocked', (select count(*) from storage.objects), 1);
select pg_temp.expect_error('client cannot upload into another client folder',
  $$insert into storage.objects(bucket_id,name) values ('client-logos','c2000000-0000-0000-0000-000000000002/logo.webp')$$);
select pg_temp.expect_error('non-uuid folder is rejected',
  $$insert into storage.objects(bucket_id,name) values ('client-logos','../etc/logo.webp')$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- client A2
select pg_temp.expect('other client cannot see the logo', (select count(*) from storage.objects), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select pg_temp.expect('other agency cannot see the logo', (select count(*) from storage.objects), 0);
select pg_temp.reset();

-- consent records survive account deletion
delete from auth.users where id='a0000000-0000-0000-0000-000000000003';
select pg_temp.expect('acceptance record kept after user deletion', (select count(*) from legal_acceptances where user_id='a0000000-0000-0000-0000-000000000003'), 1);


-- a staff user who authored content can be deleted (account deletion must not be blocked)
insert into posts(client_id,network,language,created_by) values ('c1000000-0000-0000-0000-000000000001','instagram','en','a0000000-0000-0000-0000-000000000002');
insert into post_comments(post_id,client_id,author,body)
  select id,client_id,'a0000000-0000-0000-0000-000000000002','hi' from posts where created_by='a0000000-0000-0000-0000-000000000002' limit 1;
insert into conversations(client_id,created_by) values ('c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002');
delete from auth.users where id='a0000000-0000-0000-0000-000000000002';
select pg_temp.expect('user who authored content can be deleted', (select count(*) from auth.users where id='a0000000-0000-0000-0000-000000000002'), 0);
select pg_temp.expect('their invitation is kept, author cleared', (select count(*) from invitations where token_hash='hash-1' and created_by is null), 1);
select pg_temp.expect('their post is kept, author cleared', (select count(*) from posts where caption is null and created_by is null and client_id='c1000000-0000-0000-0000-000000000001' and network='instagram' and language='en' and id in (select post_id from post_comments)), 1);


-- agent tables (client A1 id c100..., user a..03 was deleted above, so use staff and a fresh client user)
insert into auth.users(id) values ('a0000000-0000-0000-0000-000000000005');
insert into profiles(user_id,agency_id,client_id,role) values ('a0000000-0000-0000-0000-000000000005',:agA,'c1000000-0000-0000-0000-000000000001','client');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
insert into proposals(client_id,target,payload) values ('c1000000-0000-0000-0000-000000000001','memory','{"kind":"avoid","content":"no emojis"}');
select pg_temp.expect('client user can see their proposal', (select count(*) from proposals), 1);
select pg_temp.expect_error('new proposal cannot be pre-accepted',
  $$insert into proposals(client_id,target,payload,status) values ('c1000000-0000-0000-0000-000000000001','memory','{}','accepted')$$);
select pg_temp.expect_error('cannot propose for another client',
  $$insert into proposals(client_id,target,payload) values ('c2000000-0000-0000-0000-000000000002','memory','{}')$$);
update proposals set status='accepted';
select pg_temp.expect('client user can accept a pending proposal', (select count(*) from proposals where status='accepted' and decided_by='a0000000-0000-0000-0000-000000000005'), 1);
select pg_temp.expect_error('a decided proposal cannot change again', $$update proposals set status='rejected'$$);
select pg_temp.expect_error('proposal content is immutable', $$update proposals set payload='{"x":1}'$$);
insert into brand_memories(client_id,kind,content) values ('c1000000-0000-0000-0000-000000000001','avoid','no emojis');
select pg_temp.expect('client user can add a memory', (select count(*) from brand_memories), 1);
update brand_memories set status='archived';
select pg_temp.expect('client user can archive a memory', (select count(*) from brand_memories where status='archived'), 1);
insert into client_sources(client_id,kind,url) values ('c1000000-0000-0000-0000-000000000001','website','https://example.com');
select pg_temp.expect_error('sources must be https',
  $$insert into client_sources(client_id,kind,url) values ('c1000000-0000-0000-0000-000000000001','website','http://example.com/x')$$);
select pg_temp.expect_error('sources cannot target another client',
  $$insert into client_sources(client_id,kind,url) values ('c2000000-0000-0000-0000-000000000002','website','https://x.example.com')$$);
insert into generation_feedback(client_id,outcome) values ('c1000000-0000-0000-0000-000000000001','accepted');
select pg_temp.expect_error('feedback is append-only', $$update generation_feedback set outcome='rejected'$$);
select pg_temp.reset();

select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- client A2 user
select pg_temp.expect('other client sees no proposals/memories/sources/feedback',
  (select count(*) from proposals) + (select count(*) from brand_memories) + (select count(*) from client_sources) + (select count(*) from generation_feedback), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- admin B
select pg_temp.expect('other agency sees no agent data',
  (select count(*) from proposals) + (select count(*) from brand_memories) + (select count(*) from client_sources) + (select count(*) from audits), 0);
select pg_temp.reset();


-- strategies, research notes, structured post content
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
insert into strategies(client_id,title,period,content) values ('c1000000-0000-0000-0000-000000000001','Q4','quarter','{"objectives":["grow"]}');
select pg_temp.expect_error('only one active strategy per client',
  $$insert into strategies(client_id,title,period,content) values ('c1000000-0000-0000-0000-000000000001','Q4b','quarter','{}')$$);
update strategies set active=false;
insert into strategies(client_id,title,period,content) values ('c1000000-0000-0000-0000-000000000001','Q4b','quarter','{}');
select pg_temp.expect('a new strategy can replace the old one', (select count(*) from strategies where active), 1);
select pg_temp.expect_error('cannot create a strategy for another client',
  $$insert into strategies(client_id,title,period,content) values ('c2000000-0000-0000-0000-000000000002','x','month','{}')$$);
insert into research_notes(client_id,kind,title,summary) values ('c1000000-0000-0000-0000-000000000001','trend','Short reels','Trend summary');
select pg_temp.expect('client user sees its research', (select count(*) from research_notes), 1);
select pg_temp.expect_error('bad research kind rejected', $$insert into research_notes(client_id,kind,title,summary) values ('c1000000-0000-0000-0000-000000000001','gossip','t','s')$$);
insert into posts(client_id,network,language,type,status,content,suggested_time) values
  ('c1000000-0000-0000-0000-000000000001','instagram','en','carousel','idea','{"slides":[{"title":"a"}]}','18:30');
select pg_temp.expect('structured content stored on a post', (select count(*) from posts where suggested_time='18:30' and content is not null), 1);
select pg_temp.expect_error('suggested time must be HH:MM',
  $$insert into posts(client_id,network,language,suggested_time) values ('c1000000-0000-0000-0000-000000000001','instagram','en','6pm')$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- client A2 user
select pg_temp.expect('other client sees no strategies or research', (select count(*) from strategies) + (select count(*) from research_notes), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- admin B
select pg_temp.expect('other agency sees no strategies or research', (select count(*) from strategies) + (select count(*) from research_notes), 0);
select pg_temp.reset();


-- connectors: accounts, posts, sync runs
insert into social_accounts(id,client_id,network,external_id,handle,encrypted_tokens,last_synced_at,token_expires_at)
  values ('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','tiktok','tt1','acme','v1.cipher-text-here',now(),now()+interval '1 day');
insert into account_posts(account_id,client_id,external_id,metrics) values ('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','p1','{"views":10}');
insert into sync_runs(account_id,client_id,status) values ('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','ok');
insert into metrics_daily values ('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001',current_date,'followers',120);

select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
select pg_temp.expect('client user sees its account (non-secret columns)', (select count(*) from social_accounts where last_synced_at is not null), 1);
select pg_temp.expect_error('tokens are still unreadable', $$select encrypted_tokens from social_accounts$$);
select pg_temp.expect_error('select * is refused too (it includes tokens)', $$select * from social_accounts$$);
select pg_temp.expect('client user sees its posts, runs and metrics', (select count(*) from account_posts) + (select count(*) from sync_runs) + (select count(*) from metrics_daily where metric='followers'), 3);
select pg_temp.expect_error('cannot write posts', $$insert into account_posts(account_id,client_id,external_id) values ('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','x')$$);
select pg_temp.expect_error('cannot write sync runs', $$insert into sync_runs(account_id,client_id) values ('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001')$$);
select pg_temp.expect_error('cannot edit account state', $$update social_accounts set status='active'$$);
select pg_temp.reset();

select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- client A2 user
select pg_temp.expect('other client sees no connector data',
  (select count(*) from account_posts) + (select count(*) from sync_runs) + (select count(*) from metrics_daily where metric='followers'), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- admin B
select pg_temp.expect('other agency sees no connector data',
  (select count(*) from account_posts) + (select count(*) from sync_runs) + (select count(*) from social_accounts), 0);
select pg_temp.reset();
delete from social_accounts where id='d2000000-0000-0000-0000-000000000002';
select pg_temp.expect('removing an account removes its posts, runs and metrics', (select count(*) from account_posts) + (select count(*) from sync_runs) + (select count(*) from metrics_daily where metric='followers'), 0);


-- posts calendar: approval rules, comment integrity, timezone
insert into posts(id,client_id,network,language,type,status,caption,planned_date,source) values
  ('f1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','instagram','en','reel','draft','Original caption','2026-10-12','agent'),
  ('f2000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002','instagram','en','reel','draft','A2 caption','2026-10-12','agent');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
update posts set status='approved' where id='f1000000-0000-0000-0000-000000000001';
select pg_temp.expect('client can approve a draft', (select count(*) from posts where id='f1000000-0000-0000-0000-000000000001' and status='approved'), 1);
update posts set status='draft' where id='f1000000-0000-0000-0000-000000000001';
select pg_temp.expect('client can request changes (back to draft)', (select count(*) from posts where id='f1000000-0000-0000-0000-000000000001' and status='draft'), 1);
select pg_temp.expect_error('client cannot edit the caption', $$update posts set caption='hacked' where id='f1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_error('client cannot move the date', $$update posts set planned_date='2026-12-01' where id='f1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_error('client cannot schedule or publish', $$update posts set status='scheduled' where id='f1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_error('client cannot publish', $$update posts set status='published' where id='f1000000-0000-0000-0000-000000000001'$$);
delete from posts where id='f1000000-0000-0000-0000-000000000001';
select pg_temp.expect('client cannot delete posts (0 rows)', (select count(*) from posts where id='f1000000-0000-0000-0000-000000000001'), 1);
insert into posts(client_id,network,language,status,source,idea) values ('c1000000-0000-0000-0000-000000000001','tiktok','en','idea','manual','An idea');
select pg_temp.expect('client can add an idea', (select count(*) from posts where idea='An idea' and created_by='a0000000-0000-0000-0000-000000000005'), 1);
select pg_temp.expect_error('client cannot add a draft', $$insert into posts(client_id,network,language,status,source) values ('c1000000-0000-0000-0000-000000000001','tiktok','en','draft','manual')$$);
select pg_temp.expect_error('client cannot add an agent post', $$insert into posts(client_id,network,language,status,source) values ('c1000000-0000-0000-0000-000000000001','tiktok','en','idea','agent')$$);
-- comments
insert into post_comments(post_id,client_id,author,body) values ('f1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','Please change the hook');
select pg_temp.expect('comment author is forced to the signed-in user', (select count(*) from post_comments where author='a0000000-0000-0000-0000-000000000005'), 1);
select pg_temp.expect_error('cannot comment on another client post (post/client mismatch)',
  $$insert into post_comments(post_id,client_id,author,body) values ('f2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005','x')$$);
select pg_temp.reset();

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- admin A
update posts set status='approved' where id='f1000000-0000-0000-0000-000000000001';
update posts set caption='Edited by staff' where id='f1000000-0000-0000-0000-000000000001';
select pg_temp.expect('editing an approved post sends it back to draft', (select count(*) from posts where id='f1000000-0000-0000-0000-000000000001' and status='draft' and caption='Edited by staff'), 1);
update posts set status='approved' where id='f1000000-0000-0000-0000-000000000001';
update posts set status='scheduled' where id='f1000000-0000-0000-0000-000000000001';
select pg_temp.expect('staff can schedule an approved post without losing status', (select count(*) from posts where id='f1000000-0000-0000-0000-000000000001' and status='scheduled'), 1);
update clients set timezone='America/Toronto' where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.expect('timezone can be set', (select count(*) from clients where timezone='America/Toronto'), 1);
select pg_temp.expect_error('timezone length is bounded', $$update clients set timezone=repeat('x',80) where id='c1000000-0000-0000-0000-000000000001'$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- other client
select pg_temp.expect('other client sees none of those posts or comments', (select count(*) from posts where client_id='c1000000-0000-0000-0000-000000000001') + (select count(*) from post_comments where client_id='c1000000-0000-0000-0000-000000000001'), 0);
select pg_temp.reset();

-- brand visuals: palette, fonts, reference images
insert into storage.buckets(id,name) values ('brand-references','brand-references') on conflict do nothing;
update clients set branding_locked=false where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
update clients set palette='[{"name":"Sand","hex":"#e8dcc4","role":"background"}]', body_font='Inter' where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.expect('client edits own palette and fonts', (select count(*) from clients where body_font='Inter' and jsonb_array_length(palette)=1), 1);
select pg_temp.expect_error('palette must be an array', $$update clients set palette='{"a":1}' where id='c1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_error('palette size is bounded', $$update clients set palette=(select jsonb_agg(jsonb_build_object('name','x','hex','#000000')) from generate_series(1,13)) where id='c1000000-0000-0000-0000-000000000001'$$);
insert into storage.objects(bucket_id,name) values ('brand-references','c1000000-0000-0000-0000-000000000001/ref-1.webp');
insert into brand_references(client_id,path,kind,caption) values ('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001/ref-1.webp','style','Warm light');
select pg_temp.expect('client adds a reference visual', (select count(*) from brand_references), 1);
select pg_temp.expect_error('reference path must belong to the client',
  $$insert into brand_references(client_id,path) values ('c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000002/x.webp')$$);
select pg_temp.expect_error('client cannot add a reference to another client',
  $$insert into brand_references(client_id,path) values ('c2000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002/x.webp')$$);
select pg_temp.expect_error('client cannot upload a reference file for another client',
  $$insert into storage.objects(bucket_id,name) values ('brand-references','c2000000-0000-0000-0000-000000000002/x.webp')$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- other client
select pg_temp.expect('other client sees no references', (select count(*) from brand_references) + (select count(*) from storage.objects where bucket_id='brand-references'), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- other agency
select pg_temp.expect('other agency sees no references', (select count(*) from brand_references) + (select count(*) from storage.objects where bucket_id='brand-references'), 0);
select pg_temp.reset();
update clients set branding_locked=true where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005');
delete from brand_references where client_id='c1000000-0000-0000-0000-000000000001';
select pg_temp.reset();
select pg_temp.expect('locked branding keeps references from client deletes', (select count(*) from brand_references), 1);
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- admin A
delete from brand_references where client_id='c1000000-0000-0000-0000-000000000001';
select pg_temp.reset();
select pg_temp.expect('staff can remove references even when locked', (select count(*) from brand_references), 0);
update clients set branding_locked=false where id='c1000000-0000-0000-0000-000000000001';


-- competitors as profiles, and their analyses
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
insert into competitors(id,client_id,name,website,links) values ('e1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Rival Café','https://rival.example.com','[{"network":"instagram","url":"https://www.instagram.com/rival"}]');
select pg_temp.expect('client adds a competitor profile', (select count(*) from competitors where name='Rival Café'), 1);
select pg_temp.expect_error('competitor website must be https', $$insert into competitors(client_id,name,website) values ('c1000000-0000-0000-0000-000000000001','X','http://x.example.com')$$);
select pg_temp.expect_error('competitor needs a name or url', $$insert into competitors(client_id) values ('c1000000-0000-0000-0000-000000000001')$$);
insert into competitor_analyses(client_id,competitor_id,analysis) values ('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','{"summary":"ok"}');
select pg_temp.expect('client saves an analysis', (select count(*) from competitor_analyses), 1);
select pg_temp.expect_error('analysis cannot point at another client',
  $$insert into competitor_analyses(client_id,competitor_id,analysis) values ('c2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','{}')$$);
select pg_temp.expect_error('analysis must be an object', $$insert into competitor_analyses(client_id,competitor_id,analysis) values ('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','[]')$$);
delete from competitor_analyses;
insert into competitor_posts(client_id,competitor_id,hook,views,likes) values ('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','$18,000 is what one clause cost me',120000,4300);
select pg_temp.expect('client records a competitor post', (select count(*) from competitor_posts), 1);
select pg_temp.expect_error('competitor post cannot point at another client''s competitor',
  $$insert into competitor_posts(client_id,competitor_id,hook) values ('c2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','x')$$);
select pg_temp.expect_error('competitor post url must be https', $$insert into competitor_posts(client_id,competitor_id,hook,url) values ('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','x','http://x.example.com/p')$$);
select pg_temp.expect_error('competitor post counts cannot be negative', $$insert into competitor_posts(client_id,competitor_id,hook,views) values ('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','x',-1)$$);
select pg_temp.expect_error('competitor post needs a hook', $$insert into competitor_posts(client_id,competitor_id,hook) values ('c1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','')$$);
delete from competitor_posts;
select pg_temp.expect('client cannot delete competitor posts', (select count(*) from competitor_posts), 1);
select pg_temp.expect('client cannot delete analyses', (select count(*) from competitor_analyses), 1);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- other client
select pg_temp.expect('other client sees no competitors or analyses', (select count(*) from competitors) + (select count(*) from competitor_analyses) + (select count(*) from competitor_posts), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- other agency
select pg_temp.expect('other agency sees no competitors or analyses', (select count(*) from competitors) + (select count(*) from competitor_analyses) + (select count(*) from competitor_posts), 0);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- admin A
delete from competitors where id='e1000000-0000-0000-0000-000000000001';
select pg_temp.reset();
select pg_temp.expect('deleting a competitor removes its analyses and posts', (select count(*) from competitor_analyses) + (select count(*) from competitor_posts), 0);

-- kickstart plans
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
insert into kickstarts(client_id,account_id,network,plan,start_date) values ('c1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','instagram','{"summary":"ok"}',current_date);
select pg_temp.expect('client saves a kickstart for its account', (select count(*) from kickstarts), 1);
select pg_temp.expect_error('one kickstart per account', $$insert into kickstarts(client_id,account_id,network,plan,start_date) values ('c1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','instagram','{}',current_date)$$);
select pg_temp.expect_error('kickstart cannot use another client''s account',
  $$insert into kickstarts(client_id,account_id,network,plan,start_date) values ('c2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','instagram','{}',current_date)$$);
update kickstarts set status='accepted', decided_at=now();
select pg_temp.expect('client accepts its kickstart', (select count(*) from kickstarts where status='accepted'), 1);
select pg_temp.expect_error('kickstart status is checked', $$update kickstarts set status='nope'$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- other client
select pg_temp.expect('other client sees no kickstart', (select count(*) from kickstarts), 0);
update kickstarts set status='dismissed';
select pg_temp.reset();
select pg_temp.expect('other client cannot change it', (select count(*) from kickstarts where status='accepted'), 1);
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- other agency
select pg_temp.expect('other agency sees no kickstart', (select count(*) from kickstarts), 0);
select pg_temp.reset();

-- API keys: admins of the agency see the list, never the hash; nobody writes through the API roles
insert into auth.users(id) values ('f1000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into api_keys(agency_id,agent_user_id,name,prefix,key_hash) select agency_id,'f1000000-0000-0000-0000-000000000001','Camila','abcdefghij',repeat('a',64) from clients where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- admin A
select pg_temp.expect('admin sees the agency keys', (select count(*) from api_keys), 1);
select pg_temp.expect_error('nobody reads key hashes', $$select key_hash from api_keys$$);
select pg_temp.expect_error('keys are not created through the API', $$insert into api_keys(agency_id,agent_user_id,name,prefix,key_hash) values (public.current_agency_id(),'f1000000-0000-0000-0000-000000000001','x','zzzzzzzzzz',repeat('b',64))$$);
select pg_temp.expect_error('keys are not changed through the API', $$update api_keys set can_publish=true$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
select pg_temp.expect('client users see no keys', (select count(*) from api_keys), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- other agency
select pg_temp.expect('other agency sees no keys', (select count(*) from api_keys), 0);
select pg_temp.reset();

-- visual creation module (Moda): switch, jobs, generated images
insert into storage.buckets(id,name) values ('post-media','post-media') on conflict do nothing;
insert into auth.users(id) values ('a0000000-0000-0000-0000-000000000009') on conflict do nothing; -- a team member for these tests
insert into profiles(user_id,agency_id,client_id,role) values ('a0000000-0000-0000-0000-000000000009',:agA,null,'team') on conflict do nothing;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- admin A
insert into client_modules(client_id,module,enabled,config) values ('c1000000-0000-0000-0000-000000000001','visuals',true,'{"monthly_cap":5}') returning client_id;
select pg_temp.expect('admin turns the module on', (select count(*) from client_modules where enabled), 1);
select pg_temp.expect('admin write stamps who and when', (select count(*) from client_modules where updated_by='a0000000-0000-0000-0000-000000000001'), 1);
select pg_temp.expect_error('config is bounded', $$update client_modules set config=jsonb_build_object('x',repeat('y',3000))$$);
select pg_temp.expect_error('config must be an object', $$update client_modules set config='[1]'::jsonb$$);
select pg_temp.expect_error('unknown modules are rejected', $$insert into client_modules(client_id,module) values ('c1000000-0000-0000-0000-000000000001','nope')$$);
select pg_temp.expect_error('admin cannot switch a module for another agency', $$insert into client_modules(client_id,module,enabled) values ('c3000000-0000-0000-0000-000000000003','visuals',true)$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000009'); -- team member (not admin)
select pg_temp.expect('team members can see the switch', (select count(*) from client_modules), 1);
update client_modules set enabled=false;
select pg_temp.reset();
select pg_temp.expect('team members cannot change the switch', (select count(*) from client_modules where enabled), 1);
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
select pg_temp.expect('the client sees its own switch', (select count(*) from client_modules), 1);
update client_modules set enabled=false;
select pg_temp.expect_error('clients cannot create switches', $$insert into client_modules(client_id,module,enabled) values ('c2000000-0000-0000-0000-000000000002','visuals',true)$$);
select pg_temp.reset();
select pg_temp.expect('clients cannot change the switch', (select count(*) from client_modules where enabled), 1);
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- other client
select pg_temp.expect('other clients see no switches', (select count(*) from client_modules), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- other agency
select pg_temp.expect('other agencies see no switches', (select count(*) from client_modules), 0);
select pg_temp.reset();

-- jobs and media are written by the server (service role = this script before as_user)
insert into visual_jobs(client_id,post_id,status,idempotency_key,pages) values
 ('c1000000-0000-0000-0000-000000000001',(select id from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1),'running','job-1',2);
select pg_temp.expect_error('a post cannot have two active jobs', $$insert into visual_jobs(client_id,post_id,status,idempotency_key) values ('c1000000-0000-0000-0000-000000000001',(select id from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1),'queued','job-2')$$);
select pg_temp.expect_error('idempotency keys are unique', $$insert into visual_jobs(client_id,post_id,status,idempotency_key) values ('c1000000-0000-0000-0000-000000000001',(select id from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1),'failed','job-1')$$);
select pg_temp.expect_error('a job cannot point at another client''s post', $$insert into visual_jobs(client_id,post_id,status,idempotency_key) values ('c2000000-0000-0000-0000-000000000002',(select id from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1),'failed','job-3')$$);
update visual_jobs set status='succeeded', completed_at=now() where idempotency_key='job-1';
insert into storage.objects(bucket_id,name) values ('post-media','c1000000-0000-0000-0000-000000000001/p/j/page-1.png');
insert into post_media(post_id,client_id,job_id,path,page,width,height)
 select p.id, p.client_id, j.id, 'c1000000-0000-0000-0000-000000000001/p/j/page-1.png', 1, 1080, 1350
 from posts p join visual_jobs j on j.post_id=p.id where j.idempotency_key='job-1';
select pg_temp.expect_error('media path must start with the client', $$insert into post_media(post_id,client_id,path,page) select id,client_id,'c2000000-0000-0000-0000-000000000002/x/y/page-1.png',1 from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1$$);
select pg_temp.expect_error('media page is bounded', $$insert into post_media(post_id,client_id,path,page) select id,client_id,'c1000000-0000-0000-0000-000000000001/x/y/page-99.png',99 from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1$$);
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
select pg_temp.expect('the client sees its jobs, images and files', (select count(*) from visual_jobs) + (select count(*) from post_media) + (select count(*) from storage.objects where bucket_id='post-media'), 3);
select pg_temp.expect_error('clients cannot create jobs', $$insert into visual_jobs(client_id,post_id,status,idempotency_key) values ('c1000000-0000-0000-0000-000000000001',(select id from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1),'queued','x1')$$);
select pg_temp.expect_error('clients cannot create media rows', $$insert into post_media(post_id,client_id,path,page) select id,client_id,'c1000000-0000-0000-0000-000000000001/a/b/page-1.png',1 from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1$$);
select pg_temp.expect_error('clients cannot upload to the media bucket', $$insert into storage.objects(bucket_id,name) values ('post-media','c1000000-0000-0000-0000-000000000001/z/z/page-1.png')$$);
select pg_temp.expect_error('clients cannot edit jobs', $$update visual_jobs set status='failed'$$);
select pg_temp.expect_error('clients cannot delete media rows', $$delete from post_media$$);
delete from storage.objects where bucket_id='post-media';
select pg_temp.reset();
select pg_temp.expect('clients cannot edit or delete jobs and images', (select count(*) from visual_jobs where status='succeeded') + (select count(*) from post_media) + (select count(*) from storage.objects where bucket_id='post-media'), 3);
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- admin A: staff reads, but cannot write either
select pg_temp.expect_error('staff cannot write jobs through the API', $$insert into visual_jobs(client_id,post_id,status,idempotency_key) values ('c1000000-0000-0000-0000-000000000001',(select id from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1),'failed','x2')$$);
select pg_temp.expect('staff read the client''s jobs and images', (select count(*) from visual_jobs) + (select count(*) from post_media), 2);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- other client
select pg_temp.expect('other clients see no jobs, images or files', (select count(*) from visual_jobs) + (select count(*) from post_media) + (select count(*) from storage.objects where bucket_id='post-media'), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- other agency
select pg_temp.expect('other agencies see no jobs, images or files', (select count(*) from visual_jobs) + (select count(*) from post_media) + (select count(*) from storage.objects where bucket_id='post-media'), 0);
select pg_temp.reset();
delete from posts where id=(select post_id from visual_jobs where idempotency_key='job-1');
select pg_temp.expect('deleting a post removes its jobs and media rows', (select count(*) from visual_jobs where idempotency_key='job-1') + (select count(*) from post_media where client_id='c1000000-0000-0000-0000-000000000001'), 0);

-- uploaded media (images and short videos made outside Orbita)
insert into visual_jobs(client_id,post_id,status,idempotency_key,pages) values
 ('c1000000-0000-0000-0000-000000000001',(select id from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1),'succeeded','job-up',1);
insert into post_media(post_id,client_id,path,page,kind,source,uploaded_by,name)
 select id, client_id, 'c1000000-0000-0000-0000-000000000001/p2/upload-1.mp4', 1, 'video', 'uploaded', 'a0000000-0000-0000-0000-000000000001', 'reel.mp4'
 from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1;
select pg_temp.expect('uploaded video is recorded', (select count(*) from post_media where kind='video' and source='uploaded'), 1);
select pg_temp.expect('media defaults to a generated image', (select count(*) from post_media where kind='image' and source='generated'), 0 + (select count(*) from post_media where source='generated'));
select pg_temp.expect_error('media kind is limited to image and video', $$insert into post_media(post_id,client_id,path,page,kind) select id,client_id,'c1000000-0000-0000-0000-000000000001/p2/upload-2.mp3',2,'audio' from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1$$);
select pg_temp.expect_error('media source is limited to generated and uploaded', $$insert into post_media(post_id,client_id,path,page,source) select id,client_id,'c1000000-0000-0000-0000-000000000001/p2/upload-3.png',2,'scraped' from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1$$);
select pg_temp.expect_error('media names are bounded', $$insert into post_media(post_id,client_id,path,page,name) select id,client_id,'c1000000-0000-0000-0000-000000000001/p2/upload-4.png',2,repeat('x',200) from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1$$);
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005'); -- client A1 user
select pg_temp.expect('the client sees the uploaded video', (select count(*) from post_media where kind='video'), 1);
select pg_temp.expect_error('clients cannot upload media rows', $$insert into post_media(post_id,client_id,path,page,kind,source) select id,client_id,'c1000000-0000-0000-0000-000000000001/p2/upload-5.mp4',3,'video','uploaded' from posts where client_id='c1000000-0000-0000-0000-000000000001' limit 1$$);
select pg_temp.expect_error('clients cannot relabel media', $$update post_media set kind='image'$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- other client
select pg_temp.expect('other clients do not see uploaded media', (select count(*) from post_media where kind='video'), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- other agency
select pg_temp.expect('other agencies do not see uploaded media', (select count(*) from post_media where kind='video'), 0);
select pg_temp.reset();
delete from visual_jobs where idempotency_key='job-up';
delete from post_media where source='uploaded';

\echo ALL TENANT ISOLATION TESTS PASSED
