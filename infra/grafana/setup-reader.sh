#!/usr/bin/env bash
# Gives the read-only `grafana_reader` role (created by a migration) a login password, from GRAFANA_DB_PASSWORD in .env.
# Idempotent. Needs the compose postgres service running. The password goes through a psql variable, never into a shell string.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && { set -a; . ./.env; set +a; }
: "${GRAFANA_DB_PASSWORD:?Set GRAFANA_DB_PASSWORD in .env (e.g. openssl rand -hex 16)}"
echo "ALTER ROLE grafana_reader LOGIN PASSWORD :'pw'" |
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -v pw="$GRAFANA_DB_PASSWORD" -U jobradar -d jobradar
echo "grafana_reader can log in. Restart Grafana: docker compose up -d grafana"
