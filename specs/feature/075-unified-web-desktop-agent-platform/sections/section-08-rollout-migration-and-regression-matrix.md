# Section 08: Rollout, Migration, and Regression Matrix

## Ownership

This section owns the safe transition from today's Tauri shell posture to the governed desktop-host platform.

## Target files and modules

- `apps/web/docs/help/en/*`
- `apps/web/docs/help/th/*`
- rollout and migration notes under this feature directory
- test suites across web, Tauri, and python-backend where desktop-host contracts touch runtime services
- admin/monitoring UI that surfaces desktop-host health and policy state

## Scope

- define rollout phases, migration sequencing, and backward compatibility posture
- keep current useful local capabilities available where safe while the desktop-host layer is introduced
- define regression suites that prevent the product from claiming more than it actually supports
- define how desktop-host work coexists with the existing worker-runtime family during rollout
- make the 004 localhost-proxy path explicitly compatibility-only until retired
- define phase exit gates that block broader rollout if the required controls are not live

## Implementation notes

- recommended rollout order:
  1. device contracts and policy snapshots
  2. package sync and trust
  3. local file roots and managed workspaces
  4. Pi runtime host
  5. Agency Swarm and connectors
  6. enterprise hardening and offboarding
- migration should preserve current local skill runtime and raw commands behind explicit advanced or internal pathways until managed replacements are stable
- migration notes must explicitly call out whether a flow still depends on localhost `python-backend` compatibility versus the new Desktop Host control-plane contracts
- degraded-mode rules should remain explicit:
  - safe local browsing, indexing, history, and package inspection may continue
  - managed LLM execution and trust-sensitive execution stop when policy or revocation freshness expires
  - direct public-provider fallback is never allowed in managed mode
- phase exit gates should at minimum block rollout when:
  - proof-of-possession-capable device binding is not live
  - signed package verification or signed updater verification is bypassable
  - raw path discovery still acts as the default managed file-discovery path
  - Pi or Agency Swarm can still start in managed mode with unmanaged provider keys
- docs must clearly distinguish:
  - desktop-host local execution
  - external worker execution
  - server/cloud execution

## TDD expectations

- add regression tests for current desktop flows that must keep working during migration
- add truthfulness tests for docs/discovery surfaces and UI labels
- add rollout-flag tests for every phase gate
- add degraded/offline behavior tests before enablement broadens
- add phase-exit-gate tests so later rollout flags cannot enable if foundational controls are still unmet

## Acceptance checks

- rollout can proceed feature-flag-first and fail closed
- existing external worker features remain usable
- current desktop capabilities are not broken accidentally while governance layers are added
- docs and product labels stay truthful about what is and is not managed, local, external, or server-side
- broad managed rollout is blocked until the defined phase exit gates pass

## Risks and coordination notes

- do not try to flip every current Tauri behavior into managed mode in one release
- keep advanced/local-only escape hatches explicit so enterprise-managed behavior is never ambiguous

## Implementation status

- Implemented rollout-gate evaluation and managed-phase blocking in:
  - `apps/web/server/services/desktopRolloutGates.ts`
  - `apps/web/server/routes/desktopHost.ts`
  - `apps/web/server/services/desktopDeviceRegistryService.ts`
- Registered authenticated Desktop Host route mounting in:
  - `apps/web/server/routes/desktopHost.ts`
  - `apps/web/server/_core/index.ts`
- Added managed-mode help docs in:
  - `apps/web/docs/help/en/desktop-host-managed-mode.md`
  - `apps/web/docs/help/th/desktop-host-managed-mode.md`
- Added release workflow gating for Desktop Host hardening suites in:
  - `.github/workflows/desktop-release.yml`
- Added regression coverage in:
  - `apps/web/server/services/__tests__/desktopRolloutGates.test.ts`
  - `apps/web/server/routes/desktopHost.test.ts`
  - `apps/web/client/src/pages/__tests__/Settings.desktopHostTab.test.tsx`
  - `apps/tauri-shell/src-tauri/tests/package_sync_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/device_attestation_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/device_identity_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/secret_store_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/local_file_service_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/desktop_runtime_capabilities_tests.rs`

## Final status

- Section 08 is implemented for feature-flagged rollout gates, authenticated route exposure, disabled-device policy closure after refresh, managed-mode docs, targeted regression coverage, and release-workflow gating that blocks desktop builds when Desktop Host hardening suites fail.
