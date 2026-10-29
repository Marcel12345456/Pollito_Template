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
