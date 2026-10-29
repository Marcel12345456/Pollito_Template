-- 1. What actually landed?
select table_name
  from information_schema.tables
 where table_schema = 'public'
 order by table_name;

-- 2. And the functions?
select routine_name
  from information_schema.routines
 where routine_schema = 'public'
 order by routine_name;

-- 3. If the tables ARE listed above, PostgREST just has a stale cache.
--    This tells it to re-read the schema.
notify pgrst, 'reload schema';
