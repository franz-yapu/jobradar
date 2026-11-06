#!/usr/bin/env bash
# Smoke test of a deployed JobRadar (SDD-012). Read-only unless --signup is given.
#   deploy/smoke.sh https://jobradar.vertexall.com
#   deploy/smoke.sh http://localhost:18095 --signup            (creates a throwaway account and checks the session cookie)
#   deploy/smoke.sh https://jobradar.vertexall.com --expect-signup closed    (use when ALLOW_SIGNUP=false)
#   WORKER_SECRET=... deploy/smoke.sh <url>                   (also proves the worker's signature reaches the API)
#   deploy/smoke.sh <url> --n8n-url https://jobradar-n8n.vertexall.com   (n8n must ask for a password; add
#       --n8n-host-header jobradar-n8n.vertexall.com to test it on a local port)
set -uo pipefail

BASE="${1:?usage: smoke.sh <base-url> [--signup] [--expect-signup closed]}"
BASE="${BASE%/}"
shift
SIGNUP=0
EXPECT_CLOSED=0
N8N_URL=""
N8N_HOST_HEADER=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --signup) SIGNUP=1 ;;
    --n8n-url) shift; N8N_URL="${1:-}" ;;
    --n8n-host-header) shift; N8N_HOST_HEADER="${1:-}" ;;
    --expect-signup) shift; [ "${1:-}" = "closed" ] && EXPECT_CLOSED=1 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

fail=0
ok() { echo "  ok    $1"; }
bad() { echo "  FAIL  $1"; fail=1; }
check() { # description, actual, expected-regex
  if [[ "$2" =~ $3 ]]; then ok "$1"; else bad "$1 (got '$2', want /$3/)"; fi
}
curl_() { curl -sS --max-time 20 "$@"; }
status() { curl_ -o /dev/null -w '%{http_code}' "$@"; }
UNKNOWN_JOB=00000000-0000-4000-8000-000000000000

echo "JobRadar smoke test: $BASE"

echo "reachability"
check "API health through the proxy" "$(curl_ "$BASE/api/health")" '"status":"ok".*"db":"up"'
check "proxy liveness" "$(status "$BASE/healthz")" '^200$'
check "app shell is served" "$(curl_ "$BASE/")" '<div id="root">'
check "SPA deep link falls back to the shell" "$(curl_ "$BASE/profile")" '<div id="root">'
check "theme script is a file (CSP has no inline script)" "$(status "$BASE/theme-init.js")" '^200$'

echo "headers"
headers="$(curl_ -D - -o /dev/null "$BASE/")"
for h in 'strict-transport-security' 'x-content-type-options: nosniff' 'x-frame-options: DENY' 'referrer-policy' "content-security-policy: default-src 'self'"; do
  check "header $h" "$(echo "$headers" | tr -d '\r' | tr '[:upper:]' '[:lower:]')" "$(echo "$h" | tr '[:upper:]' '[:lower:]')"
done
check "no Server header" "$(echo "$headers" | tr -d '\r' | grep -ci '^server:' || true)" '^0$'
check "same headers on the API" "$(curl_ -D - -o /dev/null "$BASE/api/health" | tr -d '\r' | grep -ci 'x-content-type-options: nosniff')" '^1$'

echo "exposure"
check "Swagger is not published" "$(status "$BASE/api/docs")" '^404$'
check "private endpoints need a session" "$(status "$BASE/api/profile")" '^401$'
check "worker endpoint refuses an unsigned call" "$(status -X POST "$BASE/api/internal/scoring/jobs/$UNKNOWN_JOB/process")" '^401$'

echo "origin guard (WEB_ORIGIN must be this site)"
body='{"email":"smoke@invalid.test","password":"wrong-password-123"}'
check "this origin may write (wrong password, not bad_origin)" "$(status -X POST "$BASE/api/auth/login" -H "Origin: $BASE" -H 'Content-Type: application/json' -d "$body")" '^401$'
check "another origin is refused" "$(status -X POST "$BASE/api/auth/login" -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d "$body")" '^403$'

if [ -n "$N8N_URL" ]; then
  echo "n8n gate (nothing is shown without the password)"
  n8n_args=()
  [ -n "$N8N_HOST_HEADER" ] && n8n_args=(-H "Host: $N8N_HOST_HEADER")
  check "n8n asks for credentials" "$(status "${n8n_args[@]}" "${N8N_URL%/}/")" '^401$'
  check "n8n challenges with Basic auth" "$(curl_ -D - -o /dev/null "${n8n_args[@]}" "${N8N_URL%/}/" | tr -d '\r' | grep -i '^www-authenticate:' || true)" '[Bb]asic'
  check "a wrong password is refused" "$(status -u 'admin:definitely-wrong' "${n8n_args[@]}" "${N8N_URL%/}/")" '^401$'
  check "no n8n page is leaked before the login" "$(curl_ "${n8n_args[@]}" "${N8N_URL%/}/" | grep -ci 'n8n' || true)" '^0$'
fi

if [ -n "${WORKER_SECRET:-}" ]; then
  echo "worker signature (sign the path the Lambda signs: without the /api prefix)"
  path="/internal/scoring/jobs/$UNKNOWN_JOB/process"
  ts="$(($(date +%s) * 1000))"
  sig="$(printf '%s.POST.%s' "$ts" "$path" | openssl dgst -sha256 -hmac "$WORKER_SECRET" -hex | awk '{print $NF}')"
  check "signed call reaches the API (unknown job answers 404)" "$(status -X POST "$BASE/api$path" -H "x-worker-timestamp: $ts" -H "x-worker-signature: $sig")" '^404$'
  check "a wrong secret is refused" "$(status -X POST "$BASE/api$path" -H "x-worker-timestamp: $ts" -H "x-worker-signature: $(printf '%064d' 0)")" '^401$'
fi

if [ "$EXPECT_CLOSED" -eq 1 ]; then
  echo "registration closed"
  code="$(status -X POST "$BASE/api/auth/register" -H "Origin: $BASE" -H 'Content-Type: application/json' -d '{"email":"closed@invalid.test","password":"correct horse battery"}')"
  check "registration answers 403 signup_disabled" "$code" '^403$'
fi

if [ "$SIGNUP" -eq 1 ]; then
  echo "registration and session cookie (creates a throwaway account)"
  jar="$(mktemp)"
  trap 'rm -f "$jar"' EXIT
  email="smoke-$(date +%s)@example.test"
  resp="$(curl_ -D - -c "$jar" -X POST "$BASE/api/auth/register" -H "Origin: $BASE" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"correct horse battery\"}")"
  check "registration is open" "$(echo "$resp" | head -n 1)" ' 201'
  cookie="$(echo "$resp" | tr -d '\r' | grep -i '^set-cookie: jr_session' || true)"
  check "session cookie is HttpOnly" "$cookie" '[Hh]ttp[Oo]nly'
  check "session cookie is SameSite=Lax" "$cookie" '[Ss]ame[Ss]ite=Lax'
  if [[ "$BASE" == https://* ]]; then check "session cookie is Secure" "$cookie" '; [Ss]ecure'; else
    check "session cookie is Secure (NODE_ENV=production)" "$cookie" '; [Ss]ecure'; fi
  check "the session works" "$(curl_ -b "$jar" "$BASE/api/auth/me")" "\"email\":\"$email\""
  curl_ -o /dev/null -b "$jar" -X POST "$BASE/api/auth/logout" -H "Origin: $BASE"
  echo "        (account $email stays in the database; delete it if you care)"
fi

echo
if [ "$fail" -eq 0 ]; then echo "SMOKE PASSED"; else echo "SMOKE FAILED"; exit 1; fi
