#!/bin/bash
# File-based lock with 30s cooldown between benchmark runs.
# Prevents concurrent benchmarks from interfering with each other
# (e.g. CPU contention skewing results).
#
# Usage: ./lock.sh npx tsx bench/run-bench.ts asia
LOCKFILE="/tmp/nabab-bench.lock"

# macOS doesn't have flock; use a simple mkdir-based lock
if command -v flock &>/dev/null; then
  exec 200>"$LOCKFILE"
  flock -x 200
  echo "[lock] Acquired lock, cooling down for 30s..."
  sleep 30
  "$@"
  STATUS=$?
  flock -u 200
  exit $STATUS
else
  # Fallback for macOS: mkdir-based lock
  LOCKDIR="/tmp/nabab-bench.lockdir"
  while ! mkdir "$LOCKDIR" 2>/dev/null; do
    echo "[lock] Waiting for lock..."
    sleep 5
  done
  trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT
  echo "[lock] Acquired lock, cooling down for 30s..."
  sleep 30
  "$@"
  exit $?
fi
