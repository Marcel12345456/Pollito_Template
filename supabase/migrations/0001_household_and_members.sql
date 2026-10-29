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
