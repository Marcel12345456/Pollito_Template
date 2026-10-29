#!/usr/bin/env bash
#
# Runs the RLS suite against a throwaway Postgres container.
#
# Plain Postgres rather than a full local Supabase stack: the policies need only
# an `auth.users` table, an `auth.uid()` function and the anon/authenticated
# roles, all of which 00_auth_shim.sql provides. That keeps the test fast and
# deterministic, at the cost of not exercising Supabase's own auth service - which
# is not what these tests are about.
set -euo pipefail

CONTAINER=pollito-rls-test
IMAGE=postgres:17-alpine
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"

cleanup() { docker rm -f "$CONTAINER" > /dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pollito \
  "$IMAGE" > /dev/null

printf 'waiting for postgres'
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d pollito > /dev/null 2>&1; then
    echo ' ready'
    break
  fi
  printf '.'
  sleep 1
done

run_sql() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d pollito -q < "$1"
}

echo '--- auth shim ---'
run_sql "$HERE/00_auth_shim.sql"

echo '--- migrations ---'
for migration in "$MIGRATIONS"/*.sql; do
  echo "    $(basename "$migration")"
  run_sql "$migration"
done

# Applied a second time to prove they are idempotent. There is no migration
# runner tracking what has been applied - these get pasted into a SQL editor by
# hand - so re-running is a normal accident and must be a no-op.
echo '--- migrations, again (idempotency) ---'
for migration in "$MIGRATIONS"/*.sql; do
  run_sql "$migration"
done
echo '    re-applied cleanly'

echo '--- grants ---'
run_sql "$HERE/01_grants.sql"

echo '--- helpers ---'
run_sql "$HERE/helpers.sql"

echo '--- rls tests ---'
# NOTICEs carry the PASS lines, so they must not be suppressed.
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d pollito \
  --set=VERBOSITY=terse < "$HERE/rls_test.sql" 2>&1 \
  | grep -E '^(NOTICE|ERROR|psql)' \
  | sed -E 's/^NOTICE:  //; s/^ERROR:  /FAILED: /'
