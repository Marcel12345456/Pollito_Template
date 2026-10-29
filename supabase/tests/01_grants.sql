-- Privileges, mirroring what Supabase grants.
--
-- Applied after the migrations so newly created tables are covered. Note that
-- grants and RLS are different mechanisms: a grant says "you may attempt this",
-- a policy says "on these rows". Both are needed, and only the policy is
-- row-aware.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated;

-- The bootstrap functions are SECURITY DEFINER and do their own authorisation
-- checks, so anon may call none of them.
revoke execute on function create_household(text, text) from anon;
revoke execute on function join_household(text, text, text) from anon;
revoke execute on function leave_household() from anon;
