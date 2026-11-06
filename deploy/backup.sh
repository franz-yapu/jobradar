#!/usr/bin/env bash
# Daily pg_dump of the JobRadar database with retention. Reads the usual libpq variables (PGHOST, PGUSER, PGPASSWORD,
# PGDATABASE). A failed backup is logged and retried the next day, never fatal; the container healthcheck turns
# unhealthy when no dump is younger than ~26 h, so a silent failure shows up in Coolify.
set -euo pipefail

DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-14}"
HOUR="${BACKUP_HOUR_UTC:-3}"
mkdir -p "$DIR"

backup() {
  local file tmp
  file="$DIR/jobradar-$(date -u +%Y%m%d-%H%M%S).dump"
  tmp="$file.partial"
  # --no-owner/--no-acl: the dump restores into any cluster (roles such as grafana_reader may not exist there).
  pg_dump --format=custom --no-owner --no-acl --file="$tmp"
  pg_restore --list "$tmp" >/dev/null # the archive must be readable before it replaces anything
  mv "$tmp" "$file"
  # Keep the newest $KEEP dumps.
  ls -1t "$DIR"/jobradar-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
  echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"
}

until pg_isready -q; do echo "waiting for the database"; sleep 3; done

# `backup.sh once`: take one dump now and exit (manual backup before a risky change, and the tests).
if [ "${1:-}" = "once" ]; then
  backup
  exit 0
fi

# First start (or a long outage): do not wait for tomorrow's slot.
if [ -z "$(find "$DIR" -name 'jobradar-*.dump' -mmin -1200 | head -n 1)" ]; then
  backup || echo "$(date -u +%FT%TZ) backup FAILED" >&2
fi

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "today ${HOUR}:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -u -d "tomorrow ${HOUR}:00" +%s)
  sleep "$((next - now))"
  backup || echo "$(date -u +%FT%TZ) backup FAILED" >&2
done
