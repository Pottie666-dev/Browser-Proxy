#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Only a dedicated NEW empty database is accepted by the regression tests.
name="browser-proxy-test-${RANDOM}-$$"
cleanup() { docker rm -f "$name" >/dev/null; }
trap cleanup EXIT
image=mongo:8.0.16@sha256:4b58ebcb1dc7a7b4e84cd8ce9098d48764ae4478876898ff9551acf2ac4a6a6d
docker run -d --name "$name" -p 127.0.0.1::27017 "$image" --replSet rs0 --bind_ip_all >/dev/null
for attempt in {1..30}; do
 if docker exec "$name" mongosh --quiet --eval 'db.adminCommand({ping:1})' >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$name" mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})' >/dev/null
for attempt in {1..30}; do
 if docker exec "$name" mongosh --quiet --eval 'if(!db.hello().isWritablePrimary) quit(1)' >/dev/null 2>&1; then break; fi
 sleep 1
done
port=$(docker port "$name" 27017/tcp | sed 's/.*://')
export MONGO_TEST_URI="mongodb://127.0.0.1:${port}/browser_proxy_test_stage5_${RANDOM}_$$?directConnection=true&replicaSet=rs0"
pnpm install --frozen-lockfile
pnpm run codegen
pnpm run typecheck
pnpm test
pnpm --filter @workspace/api-server exec tsx --test test/remote-media.check.mjs
