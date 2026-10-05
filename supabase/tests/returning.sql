-- INSERT ... RETURNING as an authenticated API user, for every table the app inserts into and reads back
-- (supabase-js .insert().select()). RETURNING re-checks the SELECT policy against the new row, using the
-- statement's snapshot: a policy that calls a STABLE function reading the same table cannot see the row.
-- Also checks that making new rows visible does not widen access across agencies or client users.
-- No psql meta-commands: this file also runs unchanged through any SQL endpoint, inside a transaction.

insert into auth.users(id) values
 ('a1000000-0000-0000-0000-000000000001'), -- admin A
 ('a1000000-0000-0000-0000-000000000002'), -- team A
 ('a1000000-0000-0000-0000-000000000003'), -- client user of R1
 ('b1000000-0000-0000-0000-000000000001'); -- admin B

insert into agencies(id,name) values
 ('aa000000-0000-0000-0000-000000000001','Agency A'),
 ('bb000000-0000-0000-0000-000000000001','Agency B');
insert into clients(id,agency_id,name) values
 ('c1000000-0000-0000-0000-0000000000a1','aa000000-0000-0000-0000-000000000001','R1'),
 ('c2000000-0000-0000-0000-0000000000a2','aa000000-0000-0000-0000-000000000001','R2');
insert into profiles(user_id,agency_id,client_id,role) values
 ('a1000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',null,'admin'),
 ('a1000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001',null,'team'),
 ('a1000000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-0000000000a1','client'),
 ('b1000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000001',null,'admin');

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); perform set_config('request.jwt.claims','',false); end $$;
-- The statement must succeed AND return a row (RETURNING that is filtered out yields no row, or an RLS error).
create or replace function pg_temp.expect_returning(label text, stmt text) returns void language plpgsql as $$
declare r text;
begin
  execute stmt into r;
  if r is null then raise exception 'FAIL %: no row returned', label; end if;
  raise notice 'ok   % (returned %)', label, r;
exception when others then
  if sqlerrm like 'FAIL %' then raise; end if;
  raise exception 'FAIL %: % (%)', label, sqlerrm, sqlstate;
end $$;
create or replace function pg_temp.expect_error(label text, stmt text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin execute stmt; exception when others then failed := true; end;
  if not failed then raise exception 'FAIL %: statement should have been denied', label; end if;
  raise notice 'ok   % (denied)', label;
end $$;
create or replace function pg_temp.expect(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok   %', label;
end $$;

-- ===== staff (admin A): every table the app writes with the user's session =====
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select pg_temp.expect_returning('staff: clients',
  $$insert into clients(id,agency_id,name,languages) values ('c3000000-0000-0000-0000-0000000000a3','aa000000-0000-0000-0000-000000000001','New client',array['en']::locale_code[]) returning id::text$$);
select pg_temp.expect_returning('staff: brand_briefs',
  $$insert into brand_briefs(client_id) values ('c3000000-0000-0000-0000-0000000000a3') returning client_id::text$$);
select pg_temp.expect_returning('staff: invitations (client user)',
  $$insert into invitations(agency_id,client_id,email,role,token_hash) values ('aa000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-0000000000a3','c@a.test','client','th-1') returning id::text$$);
select pg_temp.expect_returning('staff: invitations (staff, admin only)',
  $$insert into invitations(agency_id,email,role,token_hash) values ('aa000000-0000-0000-0000-000000000001','s@a.test','team','th-2') returning id::text$$);
select pg_temp.expect_returning('staff: conversations',
  $$insert into conversations(id,client_id,created_by,kind) values ('e1000000-0000-0000-0000-0000000000a1','c1000000-0000-0000-0000-0000000000a1','a1000000-0000-0000-0000-000000000001','training') returning id::text$$);
select pg_temp.expect_returning('staff: messages',
  $$insert into messages(conversation_id,client_id,role,content) values ('e1000000-0000-0000-0000-0000000000a1','c1000000-0000-0000-0000-0000000000a1','user','{"text":"hi"}') returning id::text$$);
select pg_temp.expect_returning('staff: client_sources',
  $$insert into client_sources(client_id,kind,url) values ('c1000000-0000-0000-0000-0000000000a1','website','https://example.com') returning id::text$$);
select pg_temp.expect_returning('staff: audits',
  $$insert into audits(client_id,report) values ('c1000000-0000-0000-0000-0000000000a1','{}') returning id::text$$);
select pg_temp.expect_returning('staff: research_notes',
  $$insert into research_notes(client_id,kind,title,summary) values ('c1000000-0000-0000-0000-0000000000a1','trend','t','s') returning id::text$$);
select pg_temp.expect_returning('staff: strategies',
  $$insert into strategies(client_id,title,period,content) values ('c1000000-0000-0000-0000-0000000000a1','Q','month','{}') returning id::text$$);
select pg_temp.expect_returning('staff: brand_memories',
  $$insert into brand_memories(client_id,kind,content) values ('c1000000-0000-0000-0000-0000000000a1','fact','likes blue') returning id::text$$);
select pg_temp.expect_returning('staff: proposals',
  $$insert into proposals(client_id,conversation_id,target,payload) values ('c1000000-0000-0000-0000-0000000000a1','e1000000-0000-0000-0000-0000000000a1','memory','{}') returning id::text$$);
select pg_temp.expect_returning('staff: generation_feedback',
  $$insert into generation_feedback(client_id,outcome) values ('c1000000-0000-0000-0000-0000000000a1','accepted') returning id::text$$);
select pg_temp.expect_returning('staff: proof_items',
  $$insert into proof_items(client_id,claim,source) values ('c1000000-0000-0000-0000-0000000000a1','c','s') returning id::text$$);
select pg_temp.expect_returning('staff: client_rules',
  $$insert into client_rules(client_id,rule) values ('c1000000-0000-0000-0000-0000000000a1','r') returning id::text$$);
select pg_temp.expect_returning('staff: competitors',
  $$insert into competitors(client_id,network,url) values ('c1000000-0000-0000-0000-0000000000a1','instagram','https://x.test') returning id::text$$);
select pg_temp.expect_returning('staff: posts',
  $$insert into posts(id,client_id,network,language,status) values ('f1000000-0000-0000-0000-0000000000a1','c1000000-0000-0000-0000-0000000000a1','instagram','en','draft') returning id::text$$);
select pg_temp.expect_returning('staff: post_comments',
  $$insert into post_comments(post_id,client_id,body) values ('f1000000-0000-0000-0000-0000000000a1','c1000000-0000-0000-0000-0000000000a1','hello') returning id::text$$);
select pg_temp.expect_returning('staff: data_requests',
  $$insert into data_requests(agency_id,requester_id,kind) values ('aa000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','access') returning id::text$$);
select pg_temp.expect_returning('staff: legal_acceptances',
  $$insert into legal_acceptances(user_id,agency_id,document,version) values ('a1000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','privacy-policy','1') returning id::text$$);
select pg_temp.reset();

-- team (not admin) can create clients too
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002');
select pg_temp.expect_returning('team: clients',
  $$insert into clients(agency_id,name) values ('aa000000-0000-0000-0000-000000000001','Team client') returning id::text$$);
select pg_temp.reset();

-- ===== client user (R1): what a client may write, with RETURNING =====
select pg_temp.as_user('a1000000-0000-0000-0000-000000000003');
select pg_temp.expect_returning('client: posts (idea)',
  $$insert into posts(client_id,network,language,status) values ('c1000000-0000-0000-0000-0000000000a1','instagram','en','idea') returning id::text$$);
select pg_temp.expect_returning('client: post_comments',
  $$insert into post_comments(post_id,client_id,body) values ('f1000000-0000-0000-0000-0000000000a1','c1000000-0000-0000-0000-0000000000a1','from client') returning id::text$$);
select pg_temp.expect_returning('client: conversations',
  $$insert into conversations(id,client_id,created_by,kind) values ('e2000000-0000-0000-0000-0000000000a2','c1000000-0000-0000-0000-0000000000a1','a1000000-0000-0000-0000-000000000003','onboarding') returning id::text$$);
select pg_temp.expect_returning('client: messages',
  $$insert into messages(conversation_id,client_id,role,content) values ('e2000000-0000-0000-0000-0000000000a2','c1000000-0000-0000-0000-0000000000a1','user','{"text":"hi"}') returning id::text$$);
select pg_temp.expect_returning('client: brand_memories',
  $$insert into brand_memories(client_id,kind,content) values ('c1000000-0000-0000-0000-0000000000a1','preference','short captions') returning id::text$$);
select pg_temp.expect_returning('client: proposals',
  $$insert into proposals(client_id,conversation_id,target,payload) values ('c1000000-0000-0000-0000-0000000000a1','e2000000-0000-0000-0000-0000000000a2','rule','{}') returning id::text$$);
select pg_temp.expect_returning('client: client_sources',
  $$insert into client_sources(client_id,kind,url) values ('c1000000-0000-0000-0000-0000000000a1','instagram','https://instagram.com/r1') returning id::text$$);
select pg_temp.expect_returning('client: audits',
  $$insert into audits(client_id,report) values ('c1000000-0000-0000-0000-0000000000a1','{}') returning id::text$$);
select pg_temp.expect_returning('client: research_notes',
  $$insert into research_notes(client_id,kind,title,summary) values ('c1000000-0000-0000-0000-0000000000a1','idea','t','s') returning id::text$$);
select pg_temp.expect_returning('client: strategies',
  $$insert into strategies(client_id,title,period,content,active) values ('c1000000-0000-0000-0000-0000000000a1','S','quarter','{}',false) returning id::text$$);
select pg_temp.expect_returning('client: generation_feedback',
  $$insert into generation_feedback(client_id,outcome) values ('c1000000-0000-0000-0000-0000000000a1','edited') returning id::text$$);
select pg_temp.expect_returning('client: data_requests',
  $$insert into data_requests(agency_id,requester_id,kind) values ('aa000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','export') returning id::text$$);
-- clients still cannot create clients, or write for a client they don't belong to
select pg_temp.expect_error('client cannot create a client',
  $$insert into clients(agency_id,name) values ('aa000000-0000-0000-0000-000000000001','Nope') returning id$$);
select pg_temp.expect_error('client cannot insert into another client',
  $$insert into posts(client_id,network,language,status) values ('c2000000-0000-0000-0000-0000000000a2','instagram','en','idea') returning id$$);
select pg_temp.reset();

-- ===== no widening: fresh rows stay inside their tenant =====
select pg_temp.as_user('b1000000-0000-0000-0000-000000000001'); -- admin B
select pg_temp.expect_returning('adminB: own client',
  $$insert into clients(id,agency_id,name) values ('c4000000-0000-0000-0000-0000000000b4','bb000000-0000-0000-0000-000000000001','B client') returning id::text$$);
select pg_temp.expect_error('adminB cannot create a client in agency A (even with RETURNING)',
  $$insert into clients(agency_id,name) values ('aa000000-0000-0000-0000-000000000001','Hijack') returning id$$);
select pg_temp.expect('adminB sees only its own client', (select count(*) from clients), 1);
select pg_temp.reset();

select pg_temp.as_user('a1000000-0000-0000-0000-000000000001'); -- admin A
select pg_temp.expect('adminA does not see agency B client', (select count(*) from clients where agency_id='bb000000-0000-0000-0000-000000000001'), 0);
select pg_temp.expect('adminA sees all four agency A clients', (select count(*) from clients), 4);
select pg_temp.reset();

select pg_temp.as_user('a1000000-0000-0000-0000-000000000003'); -- client user R1
select pg_temp.expect('client user still sees only their own client', (select count(*) from clients), 1);
select pg_temp.reset();

select 'ALL RETURNING TESTS PASSED' as result;
