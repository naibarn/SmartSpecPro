<!-- GENERATED FROM manifest.json AND requirement-ledger.json; DO NOT EDIT -->
# 205 — Spec 205 — SmartAIHub Runner Cross-Platform Runtime

- Disposition: `DORMANT_UNRESOLVED` (UNRESOLVED)
- Lifecycle: `VALIDATION_PENDING`
- Continuation: `RECONCILIATION_REQUIRED` (UNRESOLVED)
- Requirements: 0 pass / 201 unresolved of 201
- Next action: The Windows review workflow 41071803159 passed for source 50df3ea7c09476ed9ea706747977fd0ecbf414ff. Unsigned review installer SmartAIHub Runner_0.2.49_x64-setup.exe is available in that workflow artifact; verify its SHA-256 cdf25374b26585200340ffe19c9f3fbe2c6a9bdd516fab316897d5f8ec31dcd2 before use. Owner/authorized installation and live reconnect validation on the already enrolled Windows Runner remain outstanding. Preserve Runner/device/session identity; verify token refresh, transient network/control-plane recovery, capability ACK, and heartbeat. Do not install another Runner or claim runtime acceptance from CI. Keep Debian SPEC-224 Pilot separate.
- Manifest generation: 42

## Source-declared status and relationship claims

These are cited author/artifact claims for review; they do not set canonical status by themselves.

- Status claim: `Runner runtime/control-plane and release-portal implementation complete in the repository; native-host, signing, deployment and provider/session acceptance remain external gates` — `specs/feature/205-smartaihub-runner-cross-platform/spec.md#5`
- Deep-implement section claims (14): COMPLETE: 9, PENDING: 5
