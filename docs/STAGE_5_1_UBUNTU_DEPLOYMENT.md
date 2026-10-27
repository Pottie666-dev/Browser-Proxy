# Stage 5.1 — Ubuntu 24.04 deployment and recovery

These are operator-reviewed templates and checks, not a completed deployment. No VPS, Atlas cluster, DNS zone, certificate or paid relay has been purchased or created. The Stage 5 implementation and account/proxy boundaries remain intact. Use an existing authorized host and record the precise deployment commit. Stage 5.1 prepares deployment; it does not certify production readiness or physical phones.

## Recover and verify the development branch

The Stage 5 starting point `48bfd68678cb39bed35dbf4866645a119588d861` includes implementation commits `b2cd6f0` and `86cad13` and documentation commits `8194b27` and `48bfd68`. A normal non-force push succeeded on 27 October 2026, and `git ls-remote` returned that exact SHA. Stage 5.1 commits follow it without rewriting history.

```sh
git fetch origin development/stage-5-webrtc
git log --oneline origin/development/stage-5-webrtc
git merge-base --is-ancestor 48bfd68678cb39bed35dbf4866645a119588d861 origin/development/stage-5-webrtc
git ls-remote origin refs/heads/development/stage-5-webrtc
```

The original Stage 5 bundle is retained separately. A current complete-history backup is exported at `/workspace/Browser-Proxy-stage5-1.bundle`; retain it outside the checkout. For recovery, first verify its checksum and bundle integrity, then recover into a NEW directory:

```sh
sha256sum -c /workspace/Browser-Proxy-stage5-1.bundle.sha256
git clone -b development/stage-5-webrtc /workspace/Browser-Proxy-stage5-1.bundle /workspace/Browser-Proxy-recovered
git -C /workspace/Browser-Proxy-recovered bundle verify /workspace/Browser-Proxy-stage5-1.bundle
git -C /workspace/Browser-Proxy-recovered log -5 --oneline
```

For an existing checkout, fetch into a NEW recovery branch (never reset/overwrite):

```sh
git fetch /workspace/Browser-Proxy-stage5-1.bundle refs/heads/development/stage-5-webrtc:refs/heads/recovery/stage-5-bundle
```

If that recovery branch already exists, choose a new name. On a recovered clone, the original `origin` points to the bundle; add `github` as a separate remote, fetch it and compare histories before a normal `git push github development/stage-5-webrtc`. A rejected non-fast-forward push requires review, not force.

## Host and browser prerequisites

Use Ubuntu 24.04 amd64 with an unprivileged `browserproxy` system account, a current security-supported Node.js version meeting >=20.19 (the build uses Node 24.19.0), PNPM 10.28.2 on the build host, native Chromium/Chrome, Bubblewrap, Python 3, CA certificates, Caddy and coturn. Install OS packages through Ubuntu's signed APT repositories; use the vendor's signed repository for Node/Google Chrome/Caddy where needed. Verify repository signing-key fingerprints against official vendor instructions; do not use unsigned mirrors or disable package/TLS checks. Installing packages requires an administrator; the API and browsers must run without root.

```sh
sudo apt-get update
sudo apt-get install --no-install-recommends bubblewrap python3 ca-certificates curl gnupg coturn fonts-liberation
sudo useradd --system --create-home --home-dir /var/lib/browser-proxy --shell /usr/sbin/nologin browserproxy
sudo install -d -m 0700 -o browserproxy -g browserproxy /var/lib/browser-proxy/profiles
sudo install -d -m 0700 /etc/browser-proxy
```

Create the account only if it does not exist. Ubuntu's default Chromium package transitions to **Snap**; a Snap launcher is not a verified browser for this restricted filesystem wrapper. A concrete native option is the official Google Chrome stable signed APT/deb distribution at `/usr/bin/google-chrome-stable`; verify `/opt/google/chrome` assets are root-owned and not writable by the service user. The wrapper now exposes only that fixed vendor directory read-only, alongside existing OS assets. It does not expose all of `/opt`, API secrets or sibling profiles. This path has been prepared but Google Chrome on a real Ubuntu host still needs the positive preflight/acceptance tests below. Another native Chromium under `/usr` can be used after the same checks.

Run namespace checks **as the service user in the actual systemd service context**, not merely as root:

```sh
sudo -u browserproxy bwrap --unshare-net --unshare-pid --unshare-ipc --ro-bind / / -- /usr/bin/true
sysctl user.max_user_namespaces
sysctl kernel.unprivileged_userns_clone  # if this sysctl exists
sysctl kernel.apparmor_restrict_unprivileged_userns  # Ubuntu-specific, if present
```

A nonzero namespace limit and successful Bubblewrap operation are required. Ubuntu 24.04 AppArmor can restrict unprivileged user namespaces even when kernel support exists. Use reviewed distribution/vendor AppArmor profiles permitting user namespaces for the exact Bubblewrap and browser executables. Check `aa-status` and denial records privately; do not globally disable AppArmor, seccomp, or namespace restrictions to make tests pass. Do not add `--no-sandbox`, run the API as root, expose CDP, or replace the wrapper. A container/VPS whose kernel disallows required namespaces is unsuitable until its administrator supplies the capability safely.

The preflight checks root-owned native browser assets, rejects sandbox/namespace overrides and test/direct-egress settings, runs a namespace probe, then launches the **packaged browser wrapper with Chromium sandbox enabled** and checks `chrome://sandbox` for network namespaces and seccomp-BPF. It requires a TLS replica-set database, valid account key, explicit HTTPS/CORS and authenticated TURN/TLS configuration. A failure exits nonzero. The service's `ExecStartPre` prevents startup. Never remove this gate to get an apparently healthy API. This managed build environment is Debian, not a verified Ubuntu VPS.

## Release and persistent encryption

On the trusted build machine, use a clean reviewed commit, frozen install, code generation, typecheck and tests. Create a new immutable release directory with `bash scripts/build-api-release.sh /absolute/new/release`. It includes bundled API, runtime dependencies, namespace helpers and the deployment policy/preflight, plus `RELEASE.json` integrity hashes. Verify those hashes after transfer over authenticated SSH. Keep Node at `/usr/bin/node` on the runtime host; the namespace wrapper mounts that executable explicitly. Do not ship development profiles, database fixtures, logs or secrets in a release.

Install the release under `/opt/browser-proxy/releases/COMMIT`, root-owned and service-readable. Point `/opt/browser-proxy/current` at the reviewed release during a controlled service stop/start. Preserve a previous release for rollback without changing Git history. Rollback must retain compatible database schema and encryption keys.

Profiles must live on a dedicated persistent encrypted volume at `/var/lib/browser-proxy/profiles`, mode 0700, owned by `browserproxy`. Filesystem permissions alone are not encryption. Use provider-backed disk encryption with documented key controls or an administrator-managed LUKS volume; verify encryption and persistence on the actual host. Ensure the mount is available before starting the service (add the appropriate `RequiresMountsFor=` entry), and fail startup if the encrypted volume is missing. Browser cookies, caches, downloads and histories on disk require encrypted storage even though API account secrets already use AES-GCM.

Back up Atlas and the encrypted profile volume using application-consistent procedures. Keep `ACCOUNT_ENCRYPTION_KEY` securely recoverable in a separate secret manager/backup domain; losing it makes encrypted account/proxy data unrecoverable. Never rotate it by replacing an environment value without a migration/re-encryption plan. Test restore into an isolated environment before relying on backups.

## MongoDB Atlas replica set

Prepare an existing Atlas replica-set cluster in the selected region. Do not silently choose a paid tier. A test/free tier's storage, connections and backup limits are not a production SLA. Create a dedicated `browserproxy` database user with only the database's `readWrite` role; use a separate migration/admin identity if needed. Never use an organization administrator credential in the app.

Allow only the VPS's fixed egress IP(s) in Atlas Network Access (or an approved private endpoint). Do not allow `0.0.0.0/0`. With `mongodb+srv`, permit DNS SRV/TXT resolution and outbound TLS to the actual returned cluster nodes, normally TCP 27017. No inbound MongoDB port is required on the VPS. Use Atlas's supplied hostname and normal certificate/hostname verification; never set `tlsInsecure`, `tlsAllowInvalidCertificates` or `tlsAllowInvalidHostnames`. Use URL-encoded credentials and `retryWrites=true&w=majority&tls=true`. Replica-set transactions are required by device assignment and remote-session replacement. Atlas is not configured or contacted by this preparation.

Populate `deploy/ubuntu-24.04/api.env.example` into a root-owned mode-600 `/etc/browser-proxy/api.env` through secure configuration management. Replace every placeholder. Generate a random 32-byte account key and >=32-character TURN shared secret without printing either or adding them to shell history. Set the exact same TURN secret in the API and Coturn's protected config. These are raw local cryptographic bytes/strings; HTTPS proxy-injection placeholders cannot supply the HMAC key. Do not put credentials in Expo public variables, Git, logs or deep links.

Start with `ALLOW_REGISTRATION=false`. If test accounts need creation, use a deliberate, time-limited administrator-controlled enrollment window and turn it off afterward. Keep account/device ownership, encrypted proxy credentials and existing authentication middleware active. Browser accounts still need approved egress proxies and proxy-routed DoH; no proxy means Browser Mode fails closed. Do not substitute direct routing. Review `docs/STAGE_3_BROWSER_ENGINE.md` for existing proxy/DNS requirements.

## HTTPS API and systemd

Replace `api.example.com` with an existing authorized public DNS hostname. Install Caddy from its signed official/OS repository and place the provided Caddyfile under `/etc/caddy/Caddyfile`. Validate it with `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`. Allow HTTP 80 for certificate issuance/redirect and HTTPS 443. Configure explicit `PUBLIC_API_ORIGIN` and matching `CORS_ORIGINS`; the Node listener stays on 127.0.0.1:8080. Caddy preserves Authorization; it must not log headers, bodies, query strings, SDP or command text. Do not add permissive CORS or enable trust of arbitrary forwarded headers. The current API retains its forwarding-header protections and shared reverse-proxy-IP interactive rate limit; load/capacity testing and reviewed distributed quotas remain future work.

Install `deploy/ubuntu-24.04/browser-proxy.service` into `/etc/systemd/system/`. It runs under `browserproxy`, reads the protected environment, runs preflight and starts the bundled API. Keep the entire systemd cgroup together on shutdown so browser workers do not survive API termination. Do not add `RestrictNamespaces`, `PrivateUsers`, a conflicting system-call filter or other hardening until the full sandbox tests pass under those exact settings.

```sh
sudo systemctl daemon-reload
sudo systemctl start browser-proxy
sudo systemctl status browser-proxy --no-pager
# Only after successful preflight and security review:
sudo systemctl enable browser-proxy
curl --fail --silent --show-error https://YOUR_ACTUAL_API_HOST/api/healthz
```

Preflight may fail before an API health endpoint exists; diagnose its named checks privately. A successful health check still does not certify browser egress or relay paths. Verify unauthenticated account/remote calls are rejected and unapproved Origins fail. Stage 5 signaling uses authenticated HTTPS POST polling on `/api/remote`, not WSS. The reverse proxy needs ordinary HTTPS routing, not a separate signaling server or WebSocket port.

## Coturn for independent mobile networks

Use a separate public DNS hostname such as `turn.example.com`, resolving directly to the relay's public IP. Do not put TURN behind a CDN's HTTP proxy. Coturn can share the VPS using TCP/TLS 5349 while Caddy owns 443. For TURN/TLS on 443 (useful for restrictive carriers), use another public IP or dedicated relay host; a standard Caddy HTTP reverse proxy cannot carry raw TURN. Do not bind both services to the same address/443.

Install the public template as Coturn's protected configuration, replacing hostname, interface/NAT mapping and shared secret. Obtain a trusted certificate for the TURN hostname through an ACME client using an authorized DNS challenge or nonconflicting HTTP challenge. Install fullchain/key with minimum permissions readable by the distribution's Coturn service account; configure a tested renewal hook to deploy renewed files and reload/restart Coturn. Do not expose the private key to the API or repository. Retain certificate and hostname verification on clients.

The template uses coturn REST HMAC credentials generated by the API, expiring with each five-minute session. It rejects private/loopback/link-local/multicast relay peers and disables CLI, verbose logs and RFC6062 TCP peer allocations. TURN client transport over TCP/TLS still works with UDP relay allocations. No `allow-loopback-peers`, anonymous relay or static username/password is used in public hosting. Review IPv4/IPv6 and provider metadata ranges for the actual network; add provider-specific exclusions. Keep Coturn patched and run an authenticated allocation/permission test before exposing it. A revoked application session terminates its peer within the application lease; existing TURN allocations do not disappear instantly just because a credential timestamp expires.

The template is deliberately bounded: relay UDP ports 49160–49259, 100 total/4 per-user allocations, five-minute maximum allocation lifetime, max-bps 1,000,000 and bps-capacity 10,000,000 (Coturn values are bytes/second; verify distribution semantics). Review these limits for the number of phones/codecs. Never enlarge them without measuring capacity and egress cost. At 2 Mbit/s video, one relayed stream is roughly 0.9 GB/hour payload outbound and roughly the same inbound, plus protocol overhead; three simultaneous streams are roughly 2.7 GB/hour outbound. Resolution alone does not cap bitrate. Monitor allocation count, bandwidth, drops, CPU and thermal behavior without logging credentials or stream contents.

## Firewall and egress

Apply administrator-reviewed UFW/provider firewall rules; preserve the existing SSH rule before enabling a firewall. Restrict SSH to administrator addresses. Required inbound:

| Port | Protocol / purpose |
| --- | --- |
| 22 or chosen SSH port | TCP, administrators only |
| 80 | TCP, ACME HTTP/redirect if used |
| 443 | TCP, API HTTPS; UDP 443 only if deliberately enabling HTTP/3 |
| 3478 | UDP and TCP, authenticated STUN/TURN |
| 5349 | TCP, trusted TURN/TLS |
| 49160–49259 | UDP, relay allocations, exactly matching Coturn config |

Never expose 8080, 27017, CDP, ADB 5555/5037 or local test fixture ports. Native phones only make outbound connections. NAT/firewall mapping must preserve the advertised relay IP/ports. Egress needs DNS, NTP, approved Atlas nodes, certificate renewal, authenticated per-account proxies/DoH and public TURN peers. Browser workers still have only their per-account gateway route; host firewall openness does not justify browser direct fallback. Configure IPv6 deliberately or disable advertising unsupported AAAA records; do not assume IPv4 firewall rules cover IPv6.

## Four-phone acceptance — NOT executed here

Use controller A and Companions B/C/D, preferably on four independent carrier networks with Wi-Fi disabled. Record date, commit, APK SHA256, model/Android version, carrier label, case, outcome, timestamps and redacted diagnostics. Never record SIM/phone identifiers, passwords, pairing codes, raw SDP or bearer tokens.

- Install verified development APKs with expected signatures; configure the public trusted HTTPS origin, sign in, pair each Companion once and assign owned accounts. Verify consumed/expired code refusal and a browser-only account.
- Authorize MediaProjection on each Companion and verify foreground/system indications. Cancel capture and deny notifications separately; local Stop must terminate viewing/input. No automatic capture after process death/reboot.
- Manually enable Accessibility. Verify tap/swipe, focused non-password text and Back/Home/Recents. Disable Accessibility mid-session; control must cease. Protected/password screens must remain protected. Rotate the phone; capture deliberately stops and requires fresh consent. Check display scaling/keyboard coordinates.
- Verify 360/720/1080 streaming, quality status, latency, sustained thermal/battery behavior and three simultaneous independent streams.
- Exercise direct ICE and authenticated relay paths, then force TURN/TCP and TURN/TLS through controlled test network conditions. Confirm actual selected candidate pairs privately; STUN success alone is insufficient. Test independent CGNAT carriers, Wi-Fi/carrier switches, short loss/ICE restart and long loss requiring Connect again.
- Verify five-minute expiry, controller background/Stop, replacement, logout, device revoke and reassignment while streaming. No expired command replay; media shutdown respects the bounded lease rather than an impossible instant-revocation promise.
- A second login/owner must not list, signal or control another owner's devices/sessions. Revoke B and verify C/D remain unaffected. Re-pair only with a fresh code.
- Re-run Browser Hub account isolation, encrypted persistence and proxy failure tests on the actual host. Run strict confined regressions and the positive preflight as the service user. No direct/proxy/DNS fallback is acceptable.
- Verify TLS renewal, service/host restart, encrypted-volume availability and backup restore. Validate no public debug/database ports and no secrets in logs.

All items remain pending until observed on real phones and the actual public deployment. Automated tests, successful compilation and prepared templates do not count as four-phone acceptance.
