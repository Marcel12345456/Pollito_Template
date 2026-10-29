-- RLS policy tests.
--
-- These exist because the Supabase anon key is public by design: it ships in the
-- browser bundle and anyone can read it. Row Level Security is the only thing
-- between one household's finances and the internet, and `current_household_id()`
-- is the single function every policy routes through. That is a lot of weight on
-- one definition, so it gets tested rather than trusted.
--
-- Run inside a transaction that is rolled back, so the suite leaves no data.

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Fixtures, created as the owner (which bypasses RLS - that is the point of
-- doing setup here and assertions as `authenticated` below).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'dave@example.com');

-- Household A: alice creates, bob joins.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
create temporary table a_setup as select * from create_household('Alice');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select join_household((select pairing_code from a_setup), 'Bob');

-- Household B: carol, alone. The neighbour whose data must stay invisible.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
create temporary table b_setup as select * from create_household('Carol');

reset role;

-- Some money in each household.
insert into expense (household_id, amount_cents, category_id, note, spent_on, paid_by, entered_by)
select
  (select household_id from a_setup),
  4250,
  (select id from category where household_id = (select household_id from a_setup) and name = 'Groceries'),
  'A: weekly shop',
  current_date,
  m.id, m.id
from member m where m.household_id = (select household_id from a_setup) and m.display_name = 'Alice';

insert into expense (household_id, amount_cents, note, spent_on)
values ((select household_id from b_setup), 999900, 'B: secret', current_date);

insert into income_entry (household_id, member_id, amount_cents, label, effective_from)
select (select household_id from a_setup), m.id, 300000, 'A salary', current_date
from member m where m.household_id = (select household_id from a_setup) and m.display_name = 'Alice';

insert into income_entry (household_id, member_id, amount_cents, label, effective_from)
select (select household_id from b_setup), m.id, 777700, 'B salary', current_date
from member m where m.household_id = (select household_id from b_setup);

-- Calendar, shopping and to-dos in both households.
insert into event (household_id, title, all_day, starts_on)
values ((select household_id from a_setup), 'A: anniversary', true, current_date),
       ((select household_id from b_setup), 'B: private appointment', true, current_date);

insert into event (household_id, title, all_day, starts_at, ends_at)
values ((select household_id from a_setup), 'A: dinner', false,
        now(), now() + interval '2 hours');

insert into shopping_item (household_id, name, quantity)
values ((select household_id from a_setup), 'A: milk', '2 l'),
       ((select household_id from b_setup), 'B: something', null);

insert into todo (household_id, title, due_on)
values ((select household_id from a_setup), 'A: fix the tap', current_date),
       ((select household_id from b_setup), 'B: private task', null);

-- ---------------------------------------------------------------------------
-- Alice sees her own household, and only that.
-- ---------------------------------------------------------------------------

select test.become('11111111-1111-1111-1111-111111111111');

select test.assert_eq((select count(*)::int from household), 1,
  'alice sees exactly one household');
select test.assert_eq((select count(*)::int from member), 2,
  'alice sees both members of her household');
select test.assert_eq((select count(*)::int from expense), 1,
  'alice sees only her household''s expense');
select test.assert_eq((select count(*)::int from income_entry), 1,
  'alice sees only her household''s income');
select test.assert(
  not exists (select 1 from expense where note = 'B: secret'),
  'alice cannot see the other household''s expense');
select test.assert(
  not exists (select 1 from income_entry where label = 'B salary'),
  'alice cannot see the other household''s income');
select test.assert_eq((select count(*)::int from category), 9,
  'alice sees her nine seeded categories and no others');
select test.assert_eq((select count(*)::int from event), 2,
  'alice sees only her household''s events');
select test.assert_eq((select count(*)::int from shopping_item), 1,
  'alice sees only her household''s shopping items');
select test.assert_eq((select count(*)::int from todo), 1,
  'alice sees only her household''s to-dos');
select test.assert(
  not exists (select 1 from event where title = 'B: private appointment'),
  'alice cannot see the other household''s calendar');
select test.assert(
  not exists (select 1 from shopping_item where name = 'B: something'),
  'alice cannot see the other household''s shopping list');
select test.assert(
  not exists (select 1 from todo where title = 'B: private task'),
  'alice cannot see the other household''s to-dos');

-- Bob, the second member, sees exactly the same. Both members see everything -
-- that is the whole point of the app.
select test.become('22222222-2222-2222-2222-222222222222');
select test.assert_eq((select count(*)::int from expense), 1,
  'bob sees the shared expense too');
select test.assert_eq((select count(*)::int from income_entry), 1,
  'bob can see alice''s income (shared household, by design)');

-- ---------------------------------------------------------------------------
-- Writes cannot cross the household boundary.
--
-- A SELECT policy alone would leave inserts open: `using` filters what you read,
-- `with check` constrains what you write. Both are tested because getting only
-- one right is a silent hole.
-- ---------------------------------------------------------------------------

select test.become('11111111-1111-1111-1111-111111111111');

select test.assert_raises(
  format('insert into expense (household_id, amount_cents, spent_on) values (%L, 100, current_date)',
         (select household_id from b_setup)),
  'alice cannot insert an expense into the other household');

select test.assert_raises(
  format('insert into income_entry (household_id, member_id, amount_cents, effective_from) '
         'values (%L, %L, 100, current_date)',
         (select household_id from b_setup),
         (select id from member where household_id = (select household_id from b_setup) limit 1)),
  'alice cannot insert income into the other household');

select test.assert_raises(
  format('insert into category (household_id, name, colour) values (%L, ''Injected'', ''#000000'')',
         (select household_id from b_setup)),
  'alice cannot add a category to the other household');

select test.assert_raises(
  format('insert into event (household_id, title, all_day, starts_on) '
         'values (%L, ''Injected'', true, current_date)',
         (select household_id from b_setup)),
  'alice cannot add an event to the other household''s calendar');

select test.assert_raises(
  format('insert into shopping_item (household_id, name) values (%L, ''Injected'')',
         (select household_id from b_setup)),
  'alice cannot add to the other household''s shopping list');

select test.assert_raises(
  format('insert into todo (household_id, title) values (%L, ''Injected'')',
         (select household_id from b_setup)),
  'alice cannot add a to-do to the other household');

-- Ticking off someone else's shopping item is the kind of write that a
-- read-only policy would let through.
with attempted as (
  update shopping_item set checked_at = now() where name = 'B: something' returning 1
)
select test.assert_eq((select count(*)::int from attempted), 0,
  'alice cannot tick off the other household''s shopping item');

with attempted as (
  update todo set done_at = now() where title = 'B: private task' returning 1
)
select test.assert_eq((select count(*)::int from attempted), 0,
  'alice cannot complete the other household''s to-do');

-- UPDATE and DELETE across the boundary do not error - the rows are simply not
-- visible, so zero are affected. Silence is the correct behaviour here, and the
-- assertion has to check the count rather than expect an exception.
with attempted as (
  update expense set amount_cents = 1 where note = 'B: secret' returning 1
)
select test.assert_eq((select count(*)::int from attempted), 0,
  'alice''s update of the other household''s expense affects no rows');

with attempted as (
  delete from expense where note = 'B: secret' returning 1
)
select test.assert_eq((select count(*)::int from attempted), 0,
  'alice''s delete of the other household''s expense affects no rows');

with attempted as (
  update household set currency = 'USD' where id = (select household_id from b_setup) returning 1
)
select test.assert_eq((select count(*)::int from attempted), 0,
  'alice cannot change the other household''s settings');

-- ---------------------------------------------------------------------------
-- Membership cannot be rewritten from the client.
--
-- An UPDATE policy without `with check` reuses `using` for the new row, and
-- "the row is still mine" says nothing about which household it is in. The
-- max-two trigger fires on insert only, so an update would bypass that too.
-- The statements are unfiltered on purpose: that is a plain PATCH on
-- /rest/v1/member, and a WHERE clause would trip the SELECT policy and hide the
-- hole.
-- ---------------------------------------------------------------------------

select test.become('33333333-3333-3333-3333-333333333333');

select test.assert_raises(
  format('update member set household_id = %L', (select household_id from a_setup)),
  'carol cannot move herself into another household');

select test.assert_eq((select count(*)::int from expense where note = 'A: weekly shop'), 0,
  'carol still cannot read the other household''s expenses');

select test.become('11111111-1111-1111-1111-111111111111');

select test.assert_raises('update household set pairing_open = true',
  'alice cannot reopen pairing on her full household');

select test.assert_raises('update household set pairing_code = ''AAAAAA''',
  'alice cannot choose her own pairing code');

-- The columns that stay writable still work, so the lock-down is not a lock-out.
with changed as (
  update member set display_name = 'Alice B.', colour = '#1e40af' returning 1
)
select test.assert_eq((select count(*)::int from changed), 1,
  'alice can still rename and recolour herself');

with changed as (
  update member set display_name = 'Robert' where display_name = 'Bob' returning 1
)
select test.assert_eq((select count(*)::int from changed), 0,
  'alice cannot rename bob');

update member set display_name = 'Alice';

-- seed_default_categories is a SECURITY DEFINER helper for create_household,
-- not an endpoint. Callable, it writes into any household by id - and the
-- foreign-key error on an unknown id tells you which ids exist.
select test.assert_raises(
  format('select seed_default_categories(%L)', (select household_id from b_setup)),
  'alice cannot seed categories into another household');

-- Captured now, because anon cannot read the fixture tables.
select household_id as a_household from a_setup \gset

select test.become_anon();

select test.assert_raises(
  format('select seed_default_categories(%L)', :'a_household'),
  'anon cannot seed categories into a household');

-- ---------------------------------------------------------------------------
-- Anonymous sees nothing. This is the case that matters if the anon key leaks,
-- which it will, because it is in the bundle.
-- ---------------------------------------------------------------------------

select test.become_anon();

select test.assert_eq((select count(*)::int from household), 0, 'anon sees no households');
select test.assert_eq((select count(*)::int from member), 0, 'anon sees no members');
select test.assert_eq((select count(*)::int from expense), 0, 'anon sees no expenses');
select test.assert_eq((select count(*)::int from income_entry), 0, 'anon sees no income');
select test.assert_eq((select count(*)::int from category), 0, 'anon sees no categories');
select test.assert_eq((select count(*)::int from event), 0, 'anon sees no events');
select test.assert_eq((select count(*)::int from shopping_item), 0, 'anon sees no shopping items');
select test.assert_eq((select count(*)::int from todo), 0, 'anon sees no to-dos');

-- A signed-in user with no household is in the same position as anon.
select test.become('44444444-4444-4444-4444-444444444444');
select test.assert_eq((select count(*)::int from expense), 0,
  'a user with no household sees no expenses');
select test.assert_eq((select count(*)::int from household), 0,
  'a user with no household sees no households');

-- ---------------------------------------------------------------------------
-- "Exactly two" holds server-side.
-- ---------------------------------------------------------------------------

select test.become('44444444-4444-4444-4444-444444444444');

select test.assert_raises(
  format('select join_household(%L, ''Dave'')', (select pairing_code from a_setup)),
  'a third person cannot join a full household');

reset role;
select test.assert_eq(
  (select pairing_open from household where id = (select household_id from a_setup)),
  false,
  'the pairing code closed once the household filled');

select test.assert_raises(
  format('insert into member (household_id, user_id, display_name) values (%L, %L, ''Sneaky'')',
         (select household_id from a_setup), '44444444-4444-4444-4444-444444444444'),
  'the max-two trigger blocks a direct insert, not just the RPC');

-- ---------------------------------------------------------------------------
-- An event is either timed or all-day, never both and never neither.
--
-- All-day events are stored as dates so "the 14th" stays the 14th wherever you
-- are. The constraint is what stops the two representations being mixed.
-- ---------------------------------------------------------------------------

select test.become('11111111-1111-1111-1111-111111111111');

select test.assert_raises(
  format('insert into event (household_id, title, all_day, starts_at) '
         'values (%L, ''Contradictory'', true, now())',
         (select household_id from a_setup)),
  'an all-day event cannot carry a timestamp');

select test.assert_raises(
  format('insert into event (household_id, title, all_day, starts_on) '
         'values (%L, ''Contradictory'', false, current_date)',
         (select household_id from a_setup)),
  'a timed event cannot carry a bare date');

select test.assert_raises(
  format('insert into event (household_id, title, all_day) values (%L, ''Undated'', false)',
         (select household_id from a_setup)),
  'an event must have a start');

select test.assert_raises(
  format('insert into event (household_id, title, all_day, starts_at, ends_at) '
         'values (%L, ''Backwards'', false, now(), now() - interval ''1 hour'')',
         (select household_id from a_setup)),
  'an event cannot end before it starts');

-- ---------------------------------------------------------------------------
-- Leaving keeps shared history and removes personal data.
-- ---------------------------------------------------------------------------

-- Bob's salary, so there is personal data of his to remove.
insert into income_entry (household_id, member_id, amount_cents, label, effective_from)
select (select household_id from a_setup), m.id, 250000, 'Bob salary', current_date
from member m where m.household_id = (select household_id from a_setup) and m.display_name = 'Bob';

select test.become('22222222-2222-2222-2222-222222222222');
select leave_household();

reset role;

select test.assert_eq(
  (select count(*)::int from expense
    where household_id = (select household_id from a_setup) and deleted_at is null),
  1,
  'the shared expense survives bob leaving');

select test.assert(
  exists (select 1 from member
           where household_id = (select household_id from a_setup)
             and display_name = 'Bob' and user_id is null and left_at is not null),
  'bob''s member row is kept with the user detached, so history still resolves');

select test.assert_eq(
  (select count(*)::int from income_entry
    where household_id = (select household_id from a_setup) and deleted_at is null),
  1,
  'alice''s income is untouched by bob leaving');

select test.assert(
  exists (select 1 from household where id = (select household_id from a_setup)),
  'the household survives while one member remains');

select test.assert_eq(
  (select count(*)::int from shopping_item
    where household_id = (select household_id from a_setup) and deleted_at is null),
  1,
  'the shared shopping list survives bob leaving');

select test.assert_eq(
  (select count(*)::int from event
    where household_id = (select household_id from a_setup) and deleted_at is null),
  2,
  'shared calendar events survive bob leaving');

-- Alice, still present, sees the household as before.
select test.become('11111111-1111-1111-1111-111111111111');
select test.assert_eq((select count(*)::int from expense), 1,
  'alice''s view is unchanged after her partner left');

-- Marking it deleted is not enough: the income policy has no deleted_at filter,
-- so a soft-deleted salary stays readable to the ex-partner indefinitely.
select test.assert(
  not exists (select 1 from income_entry where label = 'Bob salary'),
  'alice cannot read bob''s income after he left');

-- And when the last member leaves, the household goes.
select leave_household();
reset role;
select test.assert(
  not exists (select 1 from household where id = (select household_id from a_setup)),
  'the household is removed once nobody is left');

rollback;
