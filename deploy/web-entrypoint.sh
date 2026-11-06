#!/bin/sh
# Prepares the n8n gate, then runs Caddy. The password arrives in clear text in N8N_BASIC_AUTH_PASSWORD and is turned
# into a bcrypt hash here, because a hash cannot travel safely through compose/Coolify variables (its `$` signs get
# interpolated). Without a password the gate is closed for everybody: the hash is of a random value nobody knows.
set -eu
if [ -n "${N8N_BASIC_AUTH_PASSWORD:-}" ]; then
  secret="$N8N_BASIC_AUTH_PASSWORD"
else
  echo "N8N_BASIC_AUTH_PASSWORD is not set: the n8n host stays closed" >&2
  secret="$(head -c 32 /dev/urandom | base64)"
fi
N8N_BASIC_AUTH_HASH="$(caddy hash-password --plaintext "$secret")"
export N8N_BASIC_AUTH_HASH
unset N8N_BASIC_AUTH_PASSWORD secret
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
