#!/bin/sh
# Definition of Done for Pollito.
#
# Exit 0 = done. Any non-zero exit = not done, and the Stop hook will say so.
# Cheapest checks first. Output is shown only for the step that fails.

set -e
cd "$(dirname "$0")/.."
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

step() {
  name="$1"; shift
  if ! "$@" > "$log" 2>&1; then
    cat "$log" >&2
    echo "done.sh: $name failed" >&2
    exit 1
  fi
}

# Type check + production bundle. `build` is `tsc --noEmit && vite build`.
step build npm run build

# Unit tests (vitest).
step test npm test

# RLS suite against a throwaway Postgres. Needs the Docker daemon running.
docker info > /dev/null 2>&1 || { echo "done.sh: Docker is not running - the RLS suite needs it" >&2; exit 1; }
step test:rls npm run test:rls
