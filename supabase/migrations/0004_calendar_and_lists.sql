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
