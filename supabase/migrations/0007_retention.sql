-- Retention: deleted rows are erased, and a deleted account counts as leaving.
--
-- Soft deletion exists so a delete syncs reliably to the other device, not to
-- keep the data. Clients filter on `deleted_at is null`, so a purged row
-- disappears exactly like a soft-deleted one; 30 days is well past the 7-day
-- local cache, so no device can still be waiting on it.

/**
 * Erases rows marked deleted longer ago than `retention`.
 *
 * Not an endpoint: run by pg_cron below, or by hand from the SQL editor.
 */
create or replace function purge_deleted_rows(retention interval default '30 days')
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from income_entry  where deleted_at < now() - retention;
  delete from expense       where deleted_at < now() - retention;
  delete from event         where deleted_at < now() - retention;
  delete from shopping_item where deleted_at < now() - retention;
  delete from todo          where deleted_at < now() - retention;
end;
$$;

revoke execute on function purge_deleted_rows(interval) from public, anon, authenticated;

-- Nightly, where pg_cron exists - on Supabase, including the free plan. Plain
-- Postgres (the test harness) has no pg_cron, so the schedule is skipped there.
-- Scheduling under an existing name replaces that job, so re-running is a no-op.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('pollito-purge', '17 3 * * *', 'select public.purge_deleted_rows()');
  end if;
end
$$;

-- Deleting an auth user clears member.user_id through the foreign key, but left
-- the member active: still counted toward the two, still holding income, and
-- keeping a solo household alive forever. A cleared user_id now means "left".
create or replace function member_mark_left_when_detached()
returns trigger language plpgsql as $$
begin
  new.left_at := now();
  return new;
end;
$$;

create or replace trigger member_detached_means_left
  before update on member
  for each row
  when (old.user_id is not null and new.user_id is null and new.left_at is null)
  execute function member_mark_left_when_detached();

-- What leaving means, however it happens: personal income goes, shared history
-- stays, and the household goes once nobody is left. A plain `after update`,
-- not `of left_at`: column triggers ignore changes made by a BEFORE trigger,
-- which is exactly how a deleted account gets here. leave_household does the
-- same itself; running twice is harmless.
create or replace function member_clean_up_after_leaving()
returns trigger language plpgsql as $$
begin
  delete from income_entry where member_id = new.id;

  if not exists (select 1 from member where household_id = new.household_id and left_at is null) then
    delete from household where id = new.household_id;
  end if;
  return null;
end;
$$;

create or replace trigger member_left_cleanup
  after update on member
  for each row
  when (old.left_at is null and new.left_at is not null)
  execute function member_clean_up_after_leaving();

-- Existing data, from before these rules. Accounts already deleted become
-- leavers (the trigger above then cleans up), and income that leaving only
-- marked deleted before 0006 is erased now rather than in 30 days.
update member set left_at = now() where user_id is null and left_at is null;

delete from income_entry i
 using member m
 where i.member_id = m.id and m.left_at is not null;
