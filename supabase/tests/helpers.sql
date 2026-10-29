-- Assertion helpers.
--
-- Plain SQL rather than pgTAP: no extension to install, and a failed assertion
-- aborting the transaction with a clear message is all this needs.

create schema if not exists test;

create or replace function test.assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'PASS  %', description;
  else
    raise exception 'FAIL  %', description;
  end if;
end;
$$;

create or replace function test.assert_eq(actual anyelement, expected anyelement, description text)
returns void language plpgsql as $$
begin
  if actual is not distinct from expected then
    raise notice 'PASS  % (= %)', description, expected;
  else
    raise exception 'FAIL  % — expected %, got %', description, expected, actual;
  end if;
end;
$$;

/** Switches to an authenticated session for the given user. */
create or replace function test.become(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);
  execute 'set local role authenticated';
end;
$$;

/** Switches to an anonymous session. */
create or replace function test.become_anon()
returns void language plpgsql as $$
begin
  -- Empty string rather than a reset, because that is what a request arriving
  -- with no JWT actually produces - and auth.uid() has to survive it.
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end;
$$;

/**
 * Asserts that a statement fails.
 *
 * Needed because "the policy blocked it" and "the statement worked" are both
 * silent outcomes for an INSERT - only the error distinguishes them.
 */
create or replace function test.assert_raises(statement text, description text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    raise notice 'PASS  % (blocked: %)', description, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % — the statement was allowed', description;
end;
$$;

-- The assertions run *after* switching to `authenticated`, so that role needs to
-- reach this schema. Test-only, and granted explicitly rather than by putting the
-- helpers in `public` where they could be mistaken for application code.
grant usage on schema test to anon, authenticated;
grant execute on all functions in schema test to anon, authenticated;
