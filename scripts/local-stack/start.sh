#!/usr/bin/env bash
# Starts a Supabase-compatible stack without Docker:
#   PostgreSQL (54322) + Supabase Auth/GoTrue (9999) + PostgREST (3001) + gateway (54321)
# The gateway exposes /auth/v1 and /rest/v1 exactly like a Supabase project URL.
# Prefer `supabase start` (Docker) when it is available; this exists for CI and
# containerised environments where Docker images cannot be pulled.
#
# Required binaries (paths overridable):
#   PG_BIN      directory with initdb/pg_ctl/postgres (PostgreSQL 15+)
#   GOTRUE_BIN  Supabase Auth binary   (github.com/supabase/auth/releases)
#   POSTGREST_BIN PostgREST binary     (github.com/PostgREST/postgrest/releases)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
GOTRUE_BIN="${GOTRUE_BIN:-/opt/stack/auth}"
GOTRUE_MIGRATIONS="${GOTRUE_MIGRATIONS:-/opt/stack/migrations}"
POSTGREST_BIN="${POSTGREST_BIN:-/opt/stack/postgrest}"
PGDATA="${PGDATA:-/opt/pgdata/main}"
RUN="${RUN_DIR:-/tmp/forgeos-stack}"
JWT_SECRET="${LOCAL_JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
PGPORT=54322
mkdir -p "$RUN"

export PGOPTIONS="--client-min-messages=warning"
psqlc() { psql -h 127.0.0.1 -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

# 1. PostgreSQL
if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p $PGPORT >/dev/null 2>&1; then
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA"; chown postgres "$PGDATA" 2>/dev/null || true
    su postgres -c "$PG_BIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
    printf "listen_addresses='127.0.0.1'\nport=$PGPORT\n" >> "$PGDATA/postgresql.conf"
  fi
  touch "$RUN/postgres.log"; chown postgres "$RUN/postgres.log" 2>/dev/null || true
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l $RUN/postgres.log start" >/dev/null
  for _ in $(seq 1 30); do "$PG_BIN/pg_isready" -h 127.0.0.1 -p $PGPORT >/dev/null && break; sleep 0.5; done
fi
psqlc -f "$ROOT/supabase/local/bootstrap.sql"

# 2. Supabase Auth (runs its own migrations into the auth schema)
pkill -f "$GOTRUE_BIN serve" 2>/dev/null || true
for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/9999) 2>/dev/null || break; sleep 0.5; done
(
  cd "$(dirname "$GOTRUE_BIN")"
  export GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
    API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
    GOTRUE_DB_DRIVER=postgres \
    DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PGPORT/postgres?sslmode=disable" \
    GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_MIGRATIONS" \
    GOTRUE_SITE_URL="${SITE_URL:-http://localhost:3000}" \
    GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**,http://127.0.0.1:3000/**" \
    GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
    GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    GOTRUE_MAILER_AUTOCONFIRM="${MAILER_AUTOCONFIRM:-true}" \
    GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 \
    GOTRUE_LOG_LEVEL=warn
  "$GOTRUE_BIN" migrate > "$RUN/gotrue-migrate.log" 2>&1 || { tail -20 "$RUN/gotrue-migrate.log"; exit 1; }
  nohup "$GOTRUE_BIN" serve > "$RUN/gotrue.log" 2>&1 &
)
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 0.5; done
curl -sf http://127.0.0.1:9999/health >/dev/null || { echo "auth failed to start"; tail -20 "$RUN/gotrue.log"; exit 1; }

# 3. Application migrations (tracked in public.schema_migrations_local)
psqlc -c "create table if not exists public._local_migrations (name text primary key, applied_at timestamptz default now())"
shopt -s nullglob
for f in "$ROOT"/supabase/migrations/*.sql; do
  n="$(basename "$f")"
  if [ "$(psqlc -Atc "select 1 from public._local_migrations where name='$n'")" != "1" ]; then
    echo "applying $n"
    psqlc -1 -f "$f"
    psqlc -c "insert into public._local_migrations(name) values ('$n')"
  fi
done
psqlc -c "revoke all on public._local_migrations from anon, authenticated"

# 4. PostgREST
pkill -f "$POSTGREST_BIN" 2>/dev/null || true
for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/3001) 2>/dev/null || break; sleep 0.5; done
cat > "$RUN/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:postgres@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3001
db-max-rows = 1000
EOF
nohup "$POSTGREST_BIN" "$RUN/postgrest.conf" > "$RUN/postgrest.log" 2>&1 &

# 5. Gateway
pkill -f "local-stack/gateway" 2>/dev/null || true
for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/54321) 2>/dev/null || break; sleep 0.5; done
LOCAL_JWT_SECRET="$JWT_SECRET" nohup node "$ROOT/scripts/local-stack/gateway.mjs" > "$RUN/gateway.log" 2>&1 &
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:3001/ >/dev/null 2>&1 && break; sleep 0.5; done
curl -sf http://127.0.0.1:3001/ >/dev/null || { echo "PostgREST failed to start"; tail -5 "$RUN/postgrest.log"; exit 1; }
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:54321/health >/dev/null && break; sleep 0.5; done
echo "Local stack ready at http://127.0.0.1:54321"
node "$ROOT/scripts/local-stack/keys.mjs"
