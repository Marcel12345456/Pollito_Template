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
