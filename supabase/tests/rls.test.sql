-- Row-level security tests (pgTAP). Run with: supabase test db
begin;
select plan(9);

-- Two users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- Act as user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.habit_lists (id, user_id, name, color, icon, created_at, updated_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A list', '#2F9E7E', '📋', now(), now())
$$, 'user A can create own list');

select throws_ok($$
  insert into public.habit_lists (id, user_id, name, color, icon, created_at, updated_at)
  values ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Spoof', '#2F9E7E', '📋', now(), now())
$$, '42501', null, 'user A cannot create a list for user B');

select lives_ok($$
  insert into public.habits (id, user_id, list_id, name, icon, color, start_date, created_at, updated_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000001', 'Read', '📖', '#2F9E7E', current_date, now(), now())
$$, 'user A can add a habit to own list');

select lives_ok($$
  insert into public.habit_completions (habit_id, date, user_id, status, created_at, updated_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', current_date, '11111111-1111-1111-1111-111111111111', 'done', now(), now())
$$, 'user A can log a completion');

select throws_ok($$
  insert into public.habit_completions (habit_id, date, user_id, status, created_at, updated_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', current_date, '11111111-1111-1111-1111-111111111111', 'done', now(), now())
$$, '23505', null, 'duplicate completion for the same habit/date is rejected');

-- Stale write is ignored (last-writer-wins trigger)
update public.habit_completions set status = 'missed', updated_at = now() - interval '1 day'
  where habit_id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select status from public.habit_completions where habit_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'done', 'older update does not overwrite newer data');

-- Act as user B
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*) from public.habits)::int, 0, 'user B cannot see user A habits');

select throws_ok($$
  insert into public.habits (id, user_id, list_id, name, icon, color, start_date, created_at, updated_at)
  values ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
          'aaaaaaaa-0000-0000-0000-000000000001', 'Hijack', '📖', '#2F9E7E', current_date, now(), now())
$$, '42501', null, 'user B cannot attach a habit to user A list (nested ownership)');

select throws_ok($$
  insert into public.subscription_entitlements (user_id, entitlement, is_active)
  values ('22222222-2222-2222-2222-222222222222', 'premium', true)
$$, '42501', null, 'clients cannot grant themselves premium');

select * from finish();
rollback;
