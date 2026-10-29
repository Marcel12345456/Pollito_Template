-- Pollito schema, all migrations concatenated.
--
-- Safe to run more than once: every statement is guarded, so re-running is a
-- no-op rather than an error. That matters because there is no migration
-- runner here - this gets pasted into a SQL editor by hand.

-- Households and membership.
--
-- A household holds exactly two members. That is enforced by a trigger rather
-- than left to the application, because "exactly two" is the assumption every
-- other design decision rests on - no roles, no permissions, no invitations.
-- If it can quietly become three, all of that has to be revisited.

create extension if not exists "pgcrypto";

create table if not exists household (
  id            uuid primary key default gen_random_uuid(),
  -- Short human-typeable code, used once to pair the second person.
  pairing_code  text not null unique,
  -- Cleared once the second member joins, so a leaked code stops working.
  pairing_open  boolean not null default true,
  currency      text not null default 'EUR',
  created_at    timestamptz not null default now()
);

create table if not exists member (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  -- Null once the person leaves: their shared expenses survive, re-attributed to
  -- a member row with no user. Deleting the row would cascade the expenses away
  -- and retroactively change the other person's totals.
  user_id       uuid unique references auth.users(id) on delete set null,
  display_name  text not null,
  colour        text not null default '#166534',
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  unique (household_id, display_name)
);

create index if not exists member_household_idx on member(household_id);

-- "Exactly two" as a database constraint. A partial unique index cannot express
-- a maximum, so this is a trigger.
create or replace function assert_household_has_room()
returns trigger language plpgsql as $$
declare
  active_count integer;
begin
  select count(*) into active_count
  from member
  where household_id = new.household_id and left_at is null;

  if active_count >= 2 then
    raise exception 'household % already has two active members', new.household_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger member_max_two
  before insert on member
  for each row execute function assert_household_has_room();

-- Close pairing as soon as the household is full, so the code cannot be reused.
create or replace function close_pairing_when_full()
returns trigger language plpgsql as $$
begin
  update household h
     set pairing_open = false
   where h.id = new.household_id
     and (select count(*) from member m
           where m.household_id = h.id and m.left_at is null) >= 2;
  return new;
end;
$$;

create or replace trigger member_closes_pairing
  after insert on member
  for each row execute function close_pairing_when_full();

-- The household of the signed-in user. Used by every RLS policy below, so it is
-- defined once. SECURITY DEFINER because policies on `member` would otherwise
-- recurse when this queries `member`.
create or replace function current_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from member
   where user_id = auth.uid() and left_at is null
   limit 1;
$$;

alter table household enable row level security;
alter table member    enable row level security;

-- Read your own household only. The anon key is public by design; these policies
-- are the actual security boundary, not the key.
drop policy if exists household_read on household;
create policy household_read on household
  for select using (id = current_household_id());

drop policy if exists household_update on household;
create policy household_update on household
  for update using (id = current_household_id());

drop policy if exists member_read on member;
create policy member_read on member
  for select using (household_id = current_household_id());

drop policy if exists member_update_self on member;
create policy member_update_self on member
  for update using (user_id = auth.uid());

-- Income and expenses.
--
-- The money model is transparency, not settlement: both people see everything,
-- and nothing computes who owes whom. Income is per person because it is
-- personal; expenses are household-level because they are shared.

-- Amounts are integer minor units (cents). Never floats: money in floating point
-- is a bug waiting for a rounding boundary.

create table if not exists category (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  name          text not null,
  colour        text not null,
  -- Seeded categories can be renamed but are recreated for a new household.
  is_default    boolean not null default false,
  archived_at   timestamptz,
  unique (household_id, name)
);

create index if not exists category_household_idx on category(household_id);

create table if not exists income_entry (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references household(id) on delete cascade,
  -- Personal data. Deleted when its owner leaves, unlike shared expenses.
  member_id      uuid not null references member(id) on delete cascade,
  amount_cents   bigint not null check (amount_cents > 0),
  label          text,
  -- Recurring income is stored once with a start date rather than materialised
  -- per month, so a change to salary does not require editing history.
  recurring      boolean not null default true,
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists income_member_idx on income_entry(member_id) where deleted_at is null;

create table if not exists expense (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  -- Who typed it in. Kept for provenance, not for arithmetic.
  entered_by    uuid references member(id) on delete set null,
  -- Who actually paid. Recorded so the overview can say "you spent X, I spent Y"
  -- without any settlement machinery. This column is the seam if the model ever
  -- needs to become a ledger.
  paid_by       uuid references member(id) on delete set null,
  amount_cents  bigint not null check (amount_cents > 0),
  category_id   uuid references category(id) on delete set null,
  note          text,
  -- The date the money was spent, which is not the date it was entered.
  spent_on      date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists expense_household_spent_idx on expense(household_id, spent_on desc)
  where deleted_at is null;
create index if not exists expense_category_idx on expense(category_id) where deleted_at is null;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger expense_touch before update on expense
  for each row execute function touch_updated_at();

alter table category     enable row level security;
alter table income_entry enable row level security;
alter table expense      enable row level security;

-- Everything is scoped to the caller's household. Both members see all of it -
-- that is the whole point of the app - so there is no per-member read policy.
drop policy if exists category_all on category;
create policy category_all on category
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists income_all on income_entry;
create policy income_all on income_entry
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists expense_all on expense;
create policy expense_all on expense
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- Household bootstrap and default categories.
--
-- Categories are per household and fully editable - renameable, recolourable,
-- and new ones added by free text. The seeded set is a starting point, not a
-- fixed taxonomy, so `is_default` marks provenance only and carries no special
-- behaviour.

create or replace function seed_default_categories(target_household uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into category (household_id, name, colour, is_default)
  values
    (target_household, 'Groceries',   '#166534', true),
    (target_household, 'Rent',        '#1e40af', true),
    (target_household, 'Utilities',   '#0f766e', true),
    (target_household, 'Transport',   '#7c2d12', true),
    (target_household, 'Eating out',  '#b45309', true),
    (target_household, 'Household',   '#4c1d95', true),
    (target_household, 'Health',      '#be123c', true),
    (target_household, 'Fun',         '#a21caf', true),
    (target_household, 'Other',       '#475569', true)
  on conflict (household_id, name) do nothing;
end;
$$;

/**
 * Creates a household and puts the caller in it.
 *
 * A single transaction rather than three client round-trips, because a household
 * with no members - or with categories but no creator - is a state nothing in
 * the app can recover from.
 */
create or replace function create_household(display_name text, colour text default '#166534')
returns table (household_id uuid, pairing_code text)
language plpgsql security definer set search_path = public as $$
declare
  new_household uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from member where user_id = auth.uid() and left_at is null) then
    raise exception 'already a member of a household' using errcode = 'check_violation';
  end if;

  -- Six characters from an unambiguous alphabet: no O/0, no I/1/L. This gets
  -- read aloud or typed from a screenshot.
  code := (
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                             (random() * 30)::int + 1, 1), '')
    from generate_series(1, 6)
  );

  insert into household (pairing_code) values (code) returning id into new_household;
  insert into member (household_id, user_id, display_name, colour)
  values (new_household, auth.uid(), display_name, colour);
  perform seed_default_categories(new_household);

  return query select new_household, code;
end;
$$;

/**
 * Joins an existing household using its pairing code.
 *
 * The `pairing_open` check and the max-two trigger are both enforced server
 * side. A client that skipped the UI could otherwise put a third person in.
 */
create or replace function join_household(code text, display_name text, colour text default '#1e40af')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from member where user_id = auth.uid() and left_at is null) then
    raise exception 'already a member of a household' using errcode = 'check_violation';
  end if;

  select id into target from household
   where pairing_code = upper(trim(code)) and pairing_open = true;

  if target is null then
    raise exception 'no household is open for that code' using errcode = 'no_data_found';
  end if;

  insert into member (household_id, user_id, display_name, colour)
  values (target, auth.uid(), display_name, colour);

  return target;
end;
$$;

/**
 * Leaves the household.
 *
 * Shared expenses survive: the member row is kept with user_id cleared, so
 * history and the other person's totals are unchanged. Personal income is
 * removed. The household itself goes only when nobody is left.
 */
create or replace function leave_household()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid;
  my_household uuid;
begin
  select id, household_id into me, my_household
    from member where user_id = auth.uid() and left_at is null;
  if me is null then
    raise exception 'not a member of a household' using errcode = 'no_data_found';
  end if;

  update income_entry set deleted_at = now()
   where member_id = me and deleted_at is null;

  update member set left_at = now(), user_id = null where id = me;

  if not exists (select 1 from member where household_id = my_household and left_at is null) then
    delete from household where id = my_household;
  end if;
end;
$$;

-- Calendar, shopping list and to-do list.
--
-- Same shape as the money tables: household-scoped, soft-deleted, and every one
-- gets an RLS policy in the same statement that creates it. A new table without
-- a policy is a data leak, and the gap is invisible until someone looks.

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------

/**
 * An event is either timed or all-day, never both.
 *
 * All-day events are stored as dates, not instants. "Anniversary on 14 June" is
 * the 14th wherever you are; storing it as a timestamp means it becomes the 13th
 * for one of you the moment either person travels. Timed events are the opposite
 * - "dinner at 19:00" is a specific moment - so they are timestamptz.
 *
 * The check constraint makes the two cases mutually exclusive rather than
 * relying on the application to keep them straight.
 */
create table if not exists event (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  note          text,
  all_day       boolean not null default false,

  starts_at     timestamptz,
  ends_at       timestamptz,
  starts_on     date,
  ends_on       date,

  created_by    uuid references member(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint event_timing_shape check (
    (all_day     and starts_on is not null and starts_at is null and ends_at is null)
    or
    (not all_day and starts_at is not null and starts_on is null and ends_on is null)
  ),
  constraint event_timed_order check (ends_at is null or ends_at >= starts_at),
  constraint event_allday_order check (ends_on is null or ends_on >= starts_on)
);

/**
 * One comparable column so a mixed list of timed and all-day events can be
 * ordered and range-filtered by a single index.
 *
 * Maintained by a trigger rather than GENERATED, because `date::timestamptz` is
 * not immutable - the conversion depends on the session's TimeZone setting, and
 * Postgres rejects a non-immutable generation expression outright.
 *
 * The all-day case is pinned to UTC midnight explicitly rather than left to the
 * session timezone, so the stored value is deterministic no matter who writes it.
 * That is only a sort key; the authoritative date is still `starts_on`, which is
 * why an all-day event stays on the same calendar day wherever it is read.
 */
alter table event add column if not exists sort_key timestamptz;

create or replace function event_set_sort_key()
returns trigger language plpgsql as $$
begin
  new.sort_key := coalesce(new.starts_at, (new.starts_on::timestamp at time zone 'UTC'));
  return new;
end;
$$;

create or replace trigger event_sort_key
  before insert or update of starts_at, starts_on, all_day on event
  for each row execute function event_set_sort_key();

create index if not exists event_household_sort_idx on event(household_id, sort_key)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Shopping list
-- ---------------------------------------------------------------------------

/**
 * Quantity is free text on purpose.
 *
 * "2 kg", "a bunch", "the big one" are all things people actually write on a
 * shopping list. A numeric quantity with a unit dropdown is more structured and
 * less usable, and nothing here needs to compute with it.
 */
create table if not exists shopping_item (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  quantity      text,
  added_by      uuid references member(id) on delete set null,
  -- Null means outstanding. A timestamp rather than a boolean so the list can
  -- show what was picked up most recently, and so two people ticking the same
  -- item converges instead of conflicting.
  checked_at    timestamptz,
  checked_by    uuid references member(id) on delete set null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists shopping_open_idx on shopping_item(household_id, created_at)
  where deleted_at is null and checked_at is null;

-- ---------------------------------------------------------------------------
-- To-do list
-- ---------------------------------------------------------------------------

create table if not exists todo (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  note          text,
  -- Null means "either of us", which is a real and common answer.
  assigned_to   uuid references member(id) on delete set null,
  due_on        date,
  done_at       timestamptz,
  done_by       uuid references member(id) on delete set null,
  created_by    uuid references member(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists todo_open_idx on todo(household_id, due_on nulls last)
  where deleted_at is null and done_at is null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace trigger event_touch before update on event
  for each row execute function touch_updated_at();
create or replace trigger todo_touch before update on todo
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Identical shape to the money tables: everything scoped to the caller's
-- household, both members see all of it.
-- ---------------------------------------------------------------------------

alter table event         enable row level security;
alter table shopping_item enable row level security;
alter table todo          enable row level security;

drop policy if exists event_all on event;
create policy event_all on event
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists shopping_all on shopping_item;
create policy shopping_all on shopping_item
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists todo_all on todo;
create policy todo_all on todo
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- Realtime publication.
--
-- Supabase does not broadcast changes for a table until it is in the
-- `supabase_realtime` publication. Without this the app subscribes successfully,
-- receives nothing, and one person's edits never reach the other - a silent
-- failure with no error to notice.
--
-- REPLICA IDENTITY FULL is needed so DELETE and UPDATE events carry enough of the
-- old row for the client to know which household they belong to. With the default
-- (primary key only), the `household_id=eq.…` filter cannot match and the events
-- are dropped.
--
-- RLS still applies to realtime: a subscriber only receives rows their policies
-- allow, so this does not widen access.
--
-- Written defensively, because this file runs against two different worlds. On a
-- bare Postgres (the test container) the publication does not exist. On Supabase
-- it already exists, is owned by `supabase_admin`, and may already contain some
-- of these tables. Any of those raised an error - and because the SQL editor runs
-- a pasted script as one transaction, that error rolled back all five migrations
-- and left the database empty.

alter table expense       replica identity full;
alter table income_entry  replica identity full;
alter table category      replica identity full;
alter table member        replica identity full;
alter table event         replica identity full;
alter table shopping_item replica identity full;
alter table todo          replica identity full;

do $$
declare
  target text;
  publication_exists boolean;
begin
  select exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    into publication_exists;

  if not publication_exists then
    -- Bare Postgres: create it empty and add the tables below.
    execute 'create publication supabase_realtime';
  end if;

  foreach target in array array[
    'expense', 'income_entry', 'category', 'member', 'event', 'shopping_item', 'todo'
  ]
  loop
    -- Skip anything already published, so re-running is safe.
    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = target
    ) then
      continue;
    end if;

    begin
      execute format('alter publication supabase_realtime add table public.%I', target);
    exception
      when insufficient_privilege then
        -- The publication is owned by supabase_admin and this role cannot alter
        -- it. Not fatal: realtime can be switched on per table in the dashboard
        -- under Database -> Replication. Warn rather than abort, so one
        -- permission problem does not roll back the whole schema.
        raise warning
          'could not add %.% to supabase_realtime (%). Enable it in Database > Replication.',
          'public', target, sqlerrm;
      when others then
        raise warning 'could not add public.% to supabase_realtime: %', target, sqlerrm;
    end;
  end loop;
end
$$;
