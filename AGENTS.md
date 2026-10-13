# Browser-Proxy development rules

- Repository: Pottie666-dev/Browser-Proxy. Primary lineage: restructure/monorepo.
- Stage 1 foundation: 81e38a840dc29dd4de8d44222c3ea8684e74b4c6.
- Preserve existing work. Do not reset, overwrite, delete native browser code, or merge branches without owner approval.
- Implement and commit small, verified stages. Inspect the current branch and working tree first.
- Every account supports Browser Mode independently of physical Android device assignment.
- Android Mode uses physical companions, MediaProjection, WebRTC and explicitly authorized accessibility/managed-device APIs. Never assume silent or permanent permissions.
- Do not provision paid infrastructure, require root, expose ADB publicly, or claim fingerprint changes make profiles distinct physical devices.
- Keep authentication, ownership, encrypted credentials and fail-closed egress protections in every integration.
- Run frozen installation, code generation, workspace typechecks, relevant regression tests and builds. MongoDB tests require a new empty browser_proxy_test_ database.
- Report unverified native/device behavior accurately; compilation is not hardware validation or an isolation test.
- Development roadmap: Stage 2 security/database; Stage 3 browser isolation/egress; Stage 4 companion; Stage 5 streaming/control; Stage 6 dashboard; Stage 7 charging/fleet; Stage 8 production readiness.
