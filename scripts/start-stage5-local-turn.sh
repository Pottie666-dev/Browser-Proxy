#!/usr/bin/env bash
# Disposable loopback-only media fixture. Never use this configuration as a public relay.
set -euo pipefail
turn_binary="${TURN_SERVER_PATH:-$(command -v turnserver || true)}"
if [ -z "$turn_binary" ] && [ -x /workspace/toolchains/turnserver ]; then turn_binary=/workspace/toolchains/turnserver; fi
[ -x "$turn_binary" ] || { echo 'Install coturn from your trusted OS package repository or set TURN_SERVER_PATH.' >&2; exit 1; }
fixture=$(mktemp -d /tmp/browser-proxy-turn.XXXXXX)
chmod 700 "$fixture"
python3 - "$fixture" <<'PY'
import sys,secrets,json,os
root=sys.argv[1];password=secrets.token_urlsafe(32)
with open(root+'/turnserver.conf','w') as f:
 f.write('listening-port=3479\nlistening-ip=127.0.0.1\nrelay-ip=127.0.0.1\nmin-port=49200\nmax-port=49220\nrealm=localhost\nlt-cred-mech\nuser=fixture:'+password+'\nno-cli\nno-tls\nno-dtls\nallow-loopback-peers\nno-multicast-peers\nlog-file=/dev/null\nrelay-threads=1\n')
with open(root+'/ice.json','w') as f:json.dump([{'urls':['turn:127.0.0.1:3479?transport=tcp'],'username':'fixture','credential':password}],f)
for file in ['turnserver.conf','ice.json']:os.chmod(root+'/'+file,0o600)
PY
cleanup() { if [ -n "${relay_pid:-}" ]; then kill "$relay_pid" 2>/dev/null || true; wait "$relay_pid" 2>/dev/null || true; fi; rm -rf "$fixture"; }
trap cleanup EXIT INT TERM
# The managed snapshot contains official coturn image libraries; ordinary OS installs do not need this.
if [ "$turn_binary" = /workspace/toolchains/turnserver ]; then
 env LD_LIBRARY_PATH=/workspace/toolchains/turn-libs "$turn_binary" -c "$fixture/turnserver.conf" >"$fixture/relay.log" 2>&1 &
else
 "$turn_binary" -c "$fixture/turnserver.conf" >"$fixture/relay.log" 2>&1 &
fi
relay_pid=$!
printf 'Local TURN fixture started. In another shell set WEBRTC_TEST_ICE_FILE=%s/ice.json\n' "$fixture"
wait "$relay_pid"
