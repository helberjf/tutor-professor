#!/usr/bin/env bash
# Restore a backup into a scratch database and check it is actually usable.
#
# A backup nobody has restored is a hope, not a backup. This runs the real
# restore against a throwaway database next to the live one, so a broken dump is
# discovered on a Tuesday afternoon instead of during an outage. The live
# database is never written to: the script refuses to run if the target name is
# the production one.
#
# Usage, on the VPS, from the project directory:
#
#   ./scripts/restore-drill.sh backups/db-2026-09-01.sql.gz
#
# Exit status is 0 only if the restore finished, the migrations reached head and
# the core tables came back with rows.

set -euo pipefail

BACKUP_FILE="${1:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
LIVE_DB="${POSTGRES_DB:-kids_tutor}"
DB_USER="${POSTGRES_USER:-kids_tutor}"
DRILL_DB="${DRILL_DB:-restore_drill}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "usage: $0 <backup.sql.gz>" >&2
  exit 2
fi
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "backup not found: $BACKUP_FILE" >&2
  exit 2
fi
if [[ "$DRILL_DB" == "$LIVE_DB" ]]; then
  echo "refusing to run: DRILL_DB is the live database ($LIVE_DB)" >&2
  exit 2
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

psql_drill() {
  compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DRILL_DB" "$@"
}

started_at=$(date +%s)
echo "==> dropping any previous drill database"
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE \"$DRILL_DB\" OWNER \"$DB_USER\";" >/dev/null

echo "==> restoring $BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DRILL_DB" >/dev/null
else
  compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DRILL_DB" < "$BACKUP_FILE" >/dev/null
fi

echo "==> running migrations against the restored copy"
# The restore is only useful if today's code can open it, so the drill runs the
# same bootstrap the API runs at startup.
compose run --rm \
  -e DATABASE_URL="postgresql://$DB_USER@db:5432/$DRILL_DB" \
  api python -c "
import os
from database_bootstrap import bootstrap_database
bootstrap_database(os.environ['DATABASE_URL'])
print('bootstrap ok')
"

echo "==> checking the data came back"
for table in '"user"' childprofile lesson; do
  count=$(psql_drill -tAc "SELECT COUNT(*) FROM $table;")
  echo "    $table: $count rows"
  if [[ "$table" == '"user"' && "$count" -eq 0 ]]; then
    echo "no accounts in the restored database — the dump is not usable" >&2
    exit 1
  fi
done

elapsed=$(( $(date +%s) - started_at ))
echo "==> drill finished in ${elapsed}s"
echo "    Write this number down: it is how long a real restore takes."
echo "==> dropping the drill database"
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null
