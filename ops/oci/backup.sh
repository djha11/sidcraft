#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-/var/backups/sidcraft}"
retention_days="${BACKUP_RETENTION_DAYS:-7}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_dir/sidcraft-$timestamp.sql.gz"

mkdir -p "$backup_dir"
umask 077
docker compose --env-file .env -f compose.yaml exec -T postgres \
  pg_dump --clean --if-exists --no-owner -U sidcraft sidcraft | gzip -9 > "$destination"
find "$backup_dir" -type f -name 'sidcraft-*.sql.gz' -mtime "+$retention_days" -delete
echo "$destination"
