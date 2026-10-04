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
  ('c1000000-0000-0000-0000-000000000001','instagram','en','carousel','draft','{"slides":[{"title":"a"}]}','18:30');
select pg_temp.expect('structured content stored on a draft post', (select count(*) from posts where suggested_time='18:30' and content is not null), 1);
select pg_temp.expect_error('suggested time must be HH:MM',
  $$insert into posts(client_id,network,language,suggested_time) values ('c1000000-0000-0000-0000-000000000001','instagram','en','6pm')$$);
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); -- client A2 user
select pg_temp.expect('other client sees no strategies or research', (select count(*) from strategies) + (select count(*) from research_notes), 0);
select pg_temp.reset();
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001'); -- admin B
select pg_temp.expect('other agency sees no strategies or research', (select count(*) from strategies) + (select count(*) from research_notes), 0);
select pg_temp.reset();

\echo ALL TENANT ISOLATION TESTS PASSED
