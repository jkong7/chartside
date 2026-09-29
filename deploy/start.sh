#!/bin/sh
set -e
mkdir -p "$(dirname "$CHARTSIDE_DB")"
if [ -n "$LITESTREAM_BUCKET" ]; then
  litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "$CHARTSIDE_DB"
  exec litestream replicate -config /etc/litestream.yml -exec "node_modules/.bin/tsx server.ts"
fi
exec node_modules/.bin/tsx server.ts
