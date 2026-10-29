-- Test-only privilege changes, applied after the migrations.
--
-- The grants themselves come from the default privileges in 00_auth_shim.sql,
-- mirroring Supabase. Anything a migration revokes must stay revoked, so nothing
-- here grants.

-- The bootstrap functions are SECURITY DEFINER and do their own authorisation
-- checks, so anon may call none of them.
revoke execute on function create_household(text, text) from anon;
revoke execute on function join_household(text, text, text) from anon;
revoke execute on function leave_household() from anon;
