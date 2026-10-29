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
