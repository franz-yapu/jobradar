#!/usr/bin/env bash
# Checks what the API would receive from the proxy (SDD-012): a client must not be able to choose its own IP.
# Needs Docker and the image `jobradar-web` (docker build -f deploy/web.Dockerfile -t jobradar-web .).
# Usage: deploy/check-proxy.sh [image]      (default image: jobradar-web)
set -euo pipefail
IMAGE="${1:-jobradar-web}"
NET="jr-proxycheck-$$"
fail=0

cleanup() { docker rm -f "$NET-echo" "$NET-trusted" "$NET-untrusted" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create "$NET" >/dev/null

# Upstream that answers with the headers it received (stands for the API).
docker run -d --name "$NET-echo" --network "$NET" node:22-slim node -e '
require("http").createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ path: req.url, xff: req.headers["x-forwarded-for"] ?? null, cf: req.headers["cf-connecting-ip"] ?? null, real: req.headers["x-real-ip"] ?? null }));
}).listen(8080);' >/dev/null

start() { # name, trusted-proxies value, host port
  docker run -d --name "$1" --network "$NET" -e API_UPSTREAM="$NET-echo:8080" ${2:+-e TRUSTED_PROXIES="$2"} -p "$3:80" "$IMAGE" >/dev/null
}
start "$NET-trusted" "" 18081
start "$NET-untrusted" "203.0.113.0/24" 18082
sleep 3

field() { python3 -c 'import sys,json; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }
check() { # description, actual, expected-regex
  if [[ "$2" =~ $3 ]]; then echo "  ok   $1 ($2)"; else echo "  FAIL $1: got '$2', want /$3/"; fail=1; fi
}

echo "peer is a trusted proxy (private range): its CF-Connecting-IP is believed, the client's own X-Forwarded-For is not"
body=$(curl -s -H "CF-Connecting-IP: 198.51.100.7" -H "X-Forwarded-For: 6.6.6.6" localhost:18081/api/ping)
check "path prefix stripped" "$(echo "$body" | field path)" '^/ping$'
check "X-Forwarded-For is only the client address" "$(echo "$body" | field xff)" '^198\.51\.100\.7$'
check "CF-Connecting-IP not forwarded" "$(echo "$body" | field cf)" '^None$'
check "X-Real-IP not forwarded" "$(echo "$body" | field real)" '^None$'

echo "no header at all: the peer address"
body=$(curl -s localhost:18081/api/ping)
check "X-Forwarded-For is a single address" "$(echo "$body" | field xff)" '^[0-9.]+$'

echo "peer is NOT a trusted proxy: every client-supplied address is ignored"
body=$(curl -s -H "CF-Connecting-IP: 198.51.100.7" -H "X-Forwarded-For: 6.6.6.6" localhost:18082/api/ping)
check "spoofed headers ignored" "$(echo "$body" | field xff)" '^(172|10|192\.168)\.[0-9.]+$'

[ "$fail" -eq 0 ] && echo "PROXY CHECK PASSED" || { echo "PROXY CHECK FAILED"; exit 1; }
