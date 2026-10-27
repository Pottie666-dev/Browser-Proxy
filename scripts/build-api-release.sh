#!/usr/bin/env bash
set -euo pipefail
# Never replace an existing release: use a new directory for each artifact.
release_dir="${1:?Provide a new absolute release directory}"
case "$release_dir" in /*) ;; *) echo "Release directory must be absolute" >&2; exit 1;; esac
if [ -e "$release_dir" ]; then echo "Release directory already exists; refusing overwrite" >&2; exit 1; fi
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server deploy --legacy --prod --frozen-lockfile "$release_dir/apps/api"
node - "$release_dir" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2],api=path.join(root,'apps/api');
const files=['dist/index.mjs','tools/chromium-namespace-wrapper.mjs','tools/namespace-browser-worker.mjs','tools/deployment-check.mjs','tools/deployment-policy.mjs'];
const hashes=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(api,file))).digest('hex')]));
fs.writeFileSync(path.join(root,'RELEASE.json'),JSON.stringify({nodeMinimum:'20.19',files:hashes,storage:'Dedicated persistent encrypted profile volume required; not included',host:'Linux Chromium + Bubblewrap + enabled unprivileged namespaces'},null,2)+'\n');
NODE
