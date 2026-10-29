-- Lock down membership, household settings and the internal helpers.
--
-- Found in a security review: the client could rewrite rows it should only read.
-- RLS answers "which rows", not "which columns", so the column limits are grants.
-- Supabase grants every table to anon and authenticated by default; a revoke
-- here takes table-level UPDATE away, and the grant puts back only the columns
-- the app actually edits.

-- member: only the cosmetic columns are writable. An UPDATE policy without
-- `with check` reuses `using` for the new row, and "the row is still mine" says
-- nothing about household_id - so a user could move into any household whose id
-- they knew, past the max-two trigger, which fires on insert only.
revoke update on member from authenticated, anon;
grant update (display_name, colour) on member to authenticated;

drop policy if exists member_update_self on member;
create policy member_update_self on member
  for update using (user_id = auth.uid() and left_at is null)
  with check (user_id = auth.uid() and household_id = current_household_id());

-- household: only the currency is writable. Pairing state belongs to the
-- join/create functions; a member who can set it can reopen a full household
-- or pick a code of their choosing.
revoke update on household from authenticated, anon;
grant update (currency) on household to authenticated;

-- An internal helper of create_household, not an endpoint. Postgres grants
-- EXECUTE to PUBLIC by default, so revoking from anon alone would change
-- nothing: callable, it writes categories into any household by id, and its
-- foreign-key error reveals which ids exist.
revoke execute on function seed_default_categories(uuid) from public, anon, authenticated;

/**
 * Leaves the household.
 *
 * Shared expenses survive: the member row is kept with user_id cleared, so
 * history and the other person's totals are unchanged. Personal income is
 * deleted outright - marking it deleted left it readable to the ex-partner,
 * because the income policy does not filter on deleted_at. The household itself
 * goes only when nobody is left.
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

  delete from income_entry where member_id = me;

  update member set left_at = now(), user_id = null where id = me;

  if not exists (select 1 from member where household_id = my_household and left_at is null) then
    delete from household where id = my_household;
  end if;
end;
$$;
