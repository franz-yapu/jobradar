#!/bin/sh
# Applies pending migrations, then starts the API. A failed migration stops the container (it never serves a
# schema it does not match). Run a single API instance: two starting together would race on the migrations.
set -eu
./node_modules/.bin/prisma migrate deploy
exec node --enable-source-maps dist/main.mjs
