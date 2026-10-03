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

\echo ALL TENANT ISOLATION TESTS PASSED
