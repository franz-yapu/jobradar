#!/usr/bin/env bash
# Checks what the API receives from the proxy and that the n8n host is gated (SDD-012).
# Needs Docker and the image `jobradar-web` (docker build -f deploy/web.Dockerfile -t jobradar-web .).
# Usage: deploy/check-proxy.sh [image]      (default image: jobradar-web)
set -euo pipefail
IMAGE="${1:-jobradar-web}"
NET="jr-proxycheck-$$"
fail=0

cleanup() { docker rm -f "$NET-echo" "$NET-default" "$NET-cf" "$NET-untrusted" "$NET-nopass" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create "$NET" >/dev/null

# Upstream that answers with the headers it received (stands for the API and for n8n).
docker run -d --name "$NET-echo" --network "$NET" node:22-slim node -e '
require("http").createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ path: req.url, xff: req.headers["x-forwarded-for"] ?? null, cf: req.headers["cf-connecting-ip"] ?? null, real: req.headers["x-real-ip"] ?? null }));
}).listen(8080);' >/dev/null

# name, host port, extra docker args...
start() {
  local name="$1" port="$2"; shift 2
  docker run -d --name "$name" --network "$NET" -e API_UPSTREAM="$NET-echo:8080" -e N8N_UPSTREAM="$NET-echo:8080" \
    -e N8N_HOST=n8n.test -e N8N_BASIC_AUTH_USER=franz -e N8N_BASIC_AUTH_PASSWORD='correct horse 123' "$@" -p "$port:80" "$IMAGE" >/dev/null
}
start "$NET-default" 18081                                            # production defaults
start "$NET-cf" 18082 -e CLIENT_IP_HEADERS="CF-Connecting-IP X-Forwarded-For" # opt-in for a Cloudflare-proxied host
start "$NET-untrusted" 18083 -e TRUSTED_PROXIES=203.0.113.0/24         # the peer is not a trusted proxy
docker run -d --name "$NET-nopass" --network "$NET" -e N8N_UPSTREAM="$NET-echo:8080" -e N8N_HOST=n8n.test -p 18084:80 "$IMAGE" >/dev/null # no password configured
sleep 4

field() { python3 -c 'import sys,json; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }
check() { # description, actual, expected-regex
  if [[ "$2" =~ $3 ]]; then echo "  ok   $1 ($2)"; else echo "  FAIL $1: got '$2', want /$3/"; fail=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "client address, production defaults: only X-Forwarded-For from a private peer (Traefik) is believed"
body=$(curl -s -H "X-Forwarded-For: 198.51.100.7" localhost:18081/api/ping)
check "path prefix stripped" "$(echo "$body" | field path)" '^/ping$'
check "the address Traefik put in X-Forwarded-For" "$(echo "$body" | field xff)" '^198\.51\.100\.7$'
body=$(curl -s -H "X-Forwarded-For: 6.6.6.6, 198.51.100.7" localhost:18081/api/ping)
check "an address the client prepended is not the client" "$(echo "$body" | field xff)" '^198\.51\.100\.7$'
body=$(curl -s -H "CF-Connecting-IP: 9.9.9.9" -H "X-Forwarded-For: 198.51.100.7" localhost:18081/api/ping)
check "CF-Connecting-IP is ignored (spoofable without Cloudflare)" "$(echo "$body" | field xff)" '^198\.51\.100\.7$'
check "CF-Connecting-IP is not forwarded" "$(echo "$body" | field cf)" '^None$'
check "X-Real-IP is not forwarded" "$(echo "$(curl -s -H 'X-Real-IP: 8.8.8.8' localhost:18081/api/ping)" | field real)" '^None$'
body=$(curl -s localhost:18081/api/ping)
check "no header at all: the peer address, one value" "$(echo "$body" | field xff)" '^[0-9.]+$'

echo "opt-in CLIENT_IP_HEADERS=\"CF-Connecting-IP X-Forwarded-For\" (host proxied by Cloudflare)"
body=$(curl -s -H "CF-Connecting-IP: 198.51.100.7" -H "X-Forwarded-For: 6.6.6.6" localhost:18082/api/ping)
check "Cloudflare's header wins" "$(echo "$body" | field xff)" '^198\.51\.100\.7$'

echo "peer is NOT a trusted proxy: every client-supplied address is ignored"
body=$(curl -s -H "CF-Connecting-IP: 198.51.100.7" -H "X-Forwarded-For: 6.6.6.6" localhost:18083/api/ping)
check "spoofed headers ignored" "$(echo "$body" | field xff)" '^(172|10|192\.168)\.[0-9.]+$'

echo "n8n host (Host: n8n.test) is gated by the shared password"
check "no credentials: 401" "$(code -H 'Host: n8n.test' localhost:18081/)" '^401$'
check "wrong password: 401" "$(code -u 'franz:nope' -H 'Host: n8n.test' localhost:18081/)" '^401$'
check "wrong user: 401" "$(code -u 'root:correct horse 123' -H 'Host: n8n.test' localhost:18081/)" '^401$'
check "right password reaches n8n" "$(code -u 'franz:correct horse 123' -H 'Host: n8n.test' localhost:18081/)" '^200$'
body=$(curl -s -u 'franz:correct horse 123' -H 'Host: n8n.test' -H 'X-Forwarded-For: 198.51.100.7' localhost:18081/rest/settings)
check "n8n sees the real client address too" "$(echo "$body" | field xff)" '^198\.51\.100\.7$'
check "the n8n host does not serve the app or the API" "$(code -H 'Host: n8n.test' localhost:18081/api/health)" '^401$'
check "the app host is not gated" "$(code localhost:18081/healthz)" '^200$'
check "the app host cannot reach n8n through the app" "$(curl -s localhost:18081/ | grep -c 'id="root"')" '^1$'

echo "no password configured: the n8n host is closed for everybody"
check "empty password does not open it" "$(code -u 'admin:' -H 'Host: n8n.test' localhost:18084/)" '^401$'
check "guessing a password does not open it" "$(code -u 'admin:admin' -H 'Host: n8n.test' localhost:18084/)" '^401$'

[ "$fail" -eq 0 ] && echo "PROXY CHECK PASSED" || { echo "PROXY CHECK FAILED"; exit 1; }
