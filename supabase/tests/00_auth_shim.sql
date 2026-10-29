-- Minimal replica of the Supabase contract the policies depend on.
--
-- Testing RLS against plain Postgres rather than a full local Supabase stack is
-- deliberate: the policies only need four things from Supabase, and stubbing
-- exactly those makes the test deterministic, fast, and honest about what it
-- covers. It does NOT test Supabase's own auth service - only that the policies
-- do the right thing given an authenticated user id.
--
-- The four things:
--   1. an `auth.users` table for member.user_id to reference
--   2. `auth.uid()`, which Supabase defines as a JWT claim lookup
--   3. the `anon` and `authenticated` roles, which are NOT table owners
--   4. the privileges Supabase grants those roles (see the end of this file)
--
-- Point 3 is the one that matters most: a table's owner bypasses RLS in
-- Postgres unless FORCE is set. Testing as the owner would make every policy
-- appear to work while proving nothing. Supabase serves requests as
-- `authenticated`, so the tests must too.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Mirrors Supabase's own definition: the user id comes from the `sub` claim of
-- the request JWT, exposed as a session setting.
--
-- The `nullif` goes *before* the cast, not after. An unauthenticated request has
-- no claims, and `''::jsonb` raises "invalid input syntax for type json" - so
-- getting the order wrong makes every anonymous request error instead of
-- resolving to a null user. The first version of this shim had it backwards and
-- the anon tests failed on the harness rather than on any policy.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

grant usage on schema public, auth to anon, authenticated;

-- 4. Supabase's grants, given the way Supabase gives them: as default privileges,
--    so every table and function a migration creates is granted to both roles at
--    creation time. Granting afterwards with `grant ... on all tables` would
--    silently undo any column-level revoke a migration makes, and the tests would
--    pass against a database that does not exist anywhere.
alter default privileges in schema public
  grant all on tables to anon, authenticated;
alter default privileges in schema public
  grant all on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
