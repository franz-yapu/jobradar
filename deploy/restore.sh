#!/usr/bin/env bash
# Restores a dump made by backup.sh into the database named by a connection URL. DESTRUCTIVE for that database:
# existing objects are dropped first. Use a scratch database to rehearse; for a real recovery stop the API first.
#   restore.sh /backups/jobradar-20261106-030000.dump postgresql://user:pass@host:5432/dbname
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo "usage: restore.sh <dump-file> <postgresql-url>" >&2
  exit 2
fi
dump="$1"
url="$2"
[ -s "$dump" ] || { echo "no such dump: $dump" >&2; exit 1; }
pg_restore --list "$dump" >/dev/null || { echo "not a readable dump: $dump" >&2; exit 1; }
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname="$url" "$dump"
echo "restored $dump"
