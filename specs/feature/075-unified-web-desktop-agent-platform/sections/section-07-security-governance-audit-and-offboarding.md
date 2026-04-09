# Section 07: Security, Governance, Audit, and Offboarding

## Ownership

This section owns the enterprise guardrails that make the desktop-host model acceptable in managed environments.

## Target files and modules

- `apps/web/server/services/deviceRegistryService.ts`
- `apps/web/server/services/deviceEnrollmentService.ts`
- `apps/web/server/services/revocationFeedService.ts`
- `apps/web/server/services/auditLogger.ts`
- `apps/web/server/services/desktopPolicyService.ts`
- `apps/web/server/services/desktopUpdateService.ts`
- `apps/web/server/routes/desktopHost.ts`
- `apps/tauri-shell/src-tauri/src/device_identity.rs`
- `apps/tauri-shell/src-tauri/src/device_enrollment.rs`
- `apps/tauri-shell/src-tauri/src/desktop_runtime_capabilities.rs`
- `apps/tauri-shell/src-tauri/src/secret_store.rs`
- `apps/tauri-shell/src-tauri/src/audit_sink.rs`
- `apps/tauri-shell/src-tauri/src/policy_bridge.rs`
- `apps/tauri-shell/src-tauri/src/updater_bridge.rs`
- document-ingestion and preview worker modules introduced by section 03
- `apps/web/server/services/__tests__/desktopOffboarding.test.ts`
- `apps/tauri-shell/src-tauri/tests/secret_store_tests.rs`

## Scope

- enforce capability manifests at install, sync, materialization, run start, and tool use
- define secret lifecycle and secure store behavior
- define package revocation, quarantine, and kill-switch handling
- add device disable / revoke / re-auth / cleanup flows
- add audit coverage and privacy-aware logging
- enforce network egress and connector/DLP policy classes
- define bootstrap enrollment, proof-of-possession token rotation, cloned-device handling, and binary/update trust-chain requirements
- define approval / step-up rules for destructive or high-risk local actions
- define signer rotation and compromised-key response for desktop updates

## Implementation notes

- desktop-host security states should include:
  - trusted
  - restricted
  - quarantined
  - blocked
  - revoked
  - requires-review
- device cleanup on offboarding should be policy-driven:
  - revoke tokens immediately
  - block new runs
  - invalidate package cache
  - purge or invalidate derived local-file stores introduced by section 03
  - cleanup on next contact where configured
- enrollment should bind the device to server-recognized key material, and refresh/runtime token issuance should require proof-of-possession instead of trusting bearer replay alone
- audit should prefer metadata references and redacted snippets instead of raw content logging
- document preview/index pipelines should run in isolated workers or containers where practical
- signed updater payloads and runtime support bundles must verify before installation and fail closed on downgrade or signature mismatch
- signed updater trust must also support signer rotation, signer revocation, and emergency compromised-key response
- DLP-aware outbound checks should explicitly cover:
  - connector outbound messages
  - model prompt bodies containing sensitive local snippets
  - publication of trust-tainted outputs
  - uploads or exports from managed workspaces

## TDD expectations

- add capability-enforcement tests before runtime integrations go live
- add quarantine/revocation tests before package sync is enabled broadly
- add offboarding tests before admin controls ship
- add proof-of-possession token and re-key tests before broader device rollout
- add redaction tests before audit payloads are persisted
- add updater-signature, signer-rotation, and token-rotation tests before managed rollout

## Acceptance checks

- admins can disable a device and stop future runs
- revoked packages cannot keep running past freshness policy
- secrets are stored in OS-secure storage or equivalent protected stores
- audit covers package sync, file-root registration, runtime selection, and outbound policy decisions
- offboarding cleanup reaches both executable package caches and derived local-file stores according to policy

## Risks and coordination notes

- do not let audit grow into a content-exfiltration surface
- egress/DLP checks must cover connector actions and model prompt bodies, not just raw HTTP requests
- bearer-only desktop credentials would weaken the device-bound security story, so proof-of-possession cannot remain optional in the managed design

## Implementation status

- Implemented enrollment, proof-of-possession binding, and offboarding helpers in:
  - `apps/web/server/routes/desktopHost.ts`
  - `apps/web/server/services/desktopDeviceRegistryService.ts`
  - `apps/tauri-shell/src-tauri/src/device_identity.rs`
  - `apps/web/server/services/deviceEnrollmentService.ts`
  - `apps/tauri-shell/src-tauri/src/device_enrollment.rs`
  - `apps/tauri-shell/src-tauri/src/desktop_runtime_capabilities.rs`
- Implemented updater trust-chain and secret lifecycle primitives in:
  - `apps/web/server/services/desktopUpdateService.ts`
  - `apps/tauri-shell/src-tauri/src/updater_bridge.rs`
  - `apps/tauri-shell/src-tauri/src/secret_store.rs`
- Extended privacy-aware audit coverage in:
  - `apps/web/server/services/auditLogger.ts`
  - `apps/tauri-shell/src-tauri/src/audit_sink.rs`
- Added policy enforcement for capabilities, egress, and cleanup in:
  - `apps/web/server/services/desktopPolicyService.ts`
  - `apps/web/server/routes/desktopHost.ts`
- Added tenant governance enforcement and root-action audit posture in:
  - `apps/web/server/services/desktopDeviceRegistryService.ts`
  - `apps/web/server/routes/desktopHost.ts`
  - tenant-scoped device listing, selected-device state, root action queueing, and authoritative update signer resolution
- Added TDD coverage in:
  - `apps/web/shared/__tests__/desktopHostContracts.test.ts`
  - `apps/web/server/routes/desktopHost.test.ts`
  - `apps/web/server/services/__tests__/desktopOffboarding.test.ts`
  - `apps/web/server/services/__tests__/desktopDeviceRegistryService.test.ts`
  - `apps/web/server/services/__tests__/desktopUpdateService.test.ts`
  - `apps/tauri-shell/src-tauri/tests/device_identity_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/desktop_runtime_capabilities_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/secret_store_tests.rs`

## Final status

- Section 07 is implemented for asymmetric cryptographic device proof-of-possession with expiry, shared-secret compatibility helpers, rekey binding, authoritative signer-backed signed-update verification, tenant/admin device governance, root-action audit events, scoped secret metadata, OS-protected secret storage across supported keychain and DPAPI-backed platforms, attestation posture reporting, device-disable/offboarding actions, and offboarding cleanup plans.
- Residual gap to close in a later hardening slice: the managed enrollment flow is now cryptographically verifiable and can report OS-protected, OS-attested, or hardware-backed posture hints, but it does not yet integrate a universal hardware-backed or platform-attested key broker across every supported desktop platform.
