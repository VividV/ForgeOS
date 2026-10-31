#!/usr/bin/env bash
# Wipes the local database and starts the stack fresh (local development only).
set -euo pipefail
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/opt/pgdata/main}"
pkill -f "/opt/stack/postgrest" 2>/dev/null || true
pkill -f "/opt/stack/auth serve" 2>/dev/null || true
pkill -f "local-stack/gateway" 2>/dev/null || true
if [ -f "$PGDATA/PG_VERSION" ]; then
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA stop -m fast" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
fi
exec "$(dirname "$0")/start.sh"
