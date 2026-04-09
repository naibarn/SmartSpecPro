# Section 01: Canonical Surface, Device, and Contract Foundation

## Ownership

This section owns the shared product vocabulary for web + desktop unification:

- device identity
- package trust vocabulary
- runtime labels
- desktop-host shared contracts
- rollout flags and control-plane schema needed by every later section

## Target files and modules

- `apps/web/drizzle/schema.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/desktopHost.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/server/services/deviceRegistryService.ts`
- `apps/web/server/services/desktopPolicyService.ts`
- `apps/web/server/services/__tests__/deviceRegistryService.test.ts`
- `apps/web/shared/__tests__/desktopHostContracts.test.ts`
- `apps/web/shared/__tests__/desktopHostFeatureFlags.test.ts`

## Scope

- add device tables and shared types for desktop registration, health, and policy refresh
- add desktop package trust classes, package states, and run-label vocabulary
- define the shared desktop-host control-plane contract used by both web and Tauri
- define how desktop-host semantics relate to existing worker-runtime semantics without collapsing them into one abstraction
- publish an explicit supersession matrix for 004/070/071-074 assumptions that remain compatibility-only

## Implementation notes

- introduce a new shared module for:
  - `DesktopHostPolicySnapshot`
  - `DesktopDeviceRegistrationPayload`
  - `DesktopPackageTrustClass`
  - `DesktopPackageState`
  - `RunSurfaceLabel`
  - `RunRuntimeLabel`
  - `RunLocalityLabel`
- keep compatibility with existing worker-runtime vocabulary where names already match, but avoid forcing desktop-host registration to pretend it is an external worker
- add fail-closed feature flags for:
  - desktop-host rollout
  - advanced local mode
  - desktop package sync
  - desktop agency runtime
- define the reconciliation rule that Desktop Host may appear in worker fabric as `desktop_zeroclaw_managed`, while Pi and Agency Swarm stay internal runtime labels
- define server-authoritative policy snapshots that desktop can cache locally with freshness metadata
- define the bootstrap enrollment and runtime-token vocabulary before later sections build on it

## TDD expectations

- add shared-contract tests before route/service wiring
- assert feature flags default to disabled
- assert desktop run labels serialize consistently
- assert device registration schema rejects malformed capability and policy payloads
- assert compatibility-only 004-era flows are explicitly marked in shared config/docs rather than assumed

## Acceptance checks

- device identity exists as a first-class control-plane concept
- desktop-host shared contracts exist and are reusable from web and Tauri code
- runtime/surface/trust/locality vocabulary is stable before UI or execution work begins
- worker-runtime shared code remains compatible after desktop-host vocabulary is introduced

## Risks and coordination notes

- do not overload `workerRuntime.ts` with desktop-specific concepts that deserve their own module
- keep device contracts minimal at first; detailed health and audit payloads can evolve later without destabilizing the schema

## Implementation status

- Implemented shared Desktop Host contracts in `apps/web/shared/desktopHost.ts`, including package trust/state vocabulary, truthful run labels, policy snapshots, worker-projection reconciliation, and a compatibility/supersession matrix for 004/070/071-074 assumptions.
- Extended `apps/web/shared/featureFlags.ts` and `apps/web/server/services/tenantFeatureFlagService.ts` with fail-closed desktop rollout flags plus compatibility worker-family flags needed by the current distributed-runtime tests.
- Added `apps/web/server/services/deviceRegistryService.ts` and `apps/web/server/services/desktopPolicyService.ts` for device-registration validation and fail-closed desktop policy snapshot construction.
- Added `desktop_devices` control-plane schema in `apps/web/drizzle/schema.ts` with tenant/user linkage, health status, projection metadata, and policy cursor fields.
- Updated admin grouping in `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts` so all declared desktop/runtime flags remain visible and fully grouped.
- Added/updated tests in:
  - `apps/web/shared/__tests__/desktopHostContracts.test.ts`
  - `apps/web/shared/__tests__/desktopHostFeatureFlags.test.ts`
  - `apps/web/shared/__tests__/openClawExternalRuntimeFeatureFlag.test.ts`
  - `apps/web/server/services/__tests__/deviceRegistryService.test.ts`
  - `apps/web/server/services/__tests__/tenantFeatureFlagsDesktopHostSync.test.ts`
  - `apps/web/client/src/components/admin/tenantFeatureFlagGroups.test.ts`
  - `apps/web/drizzle/desktopHost.schema.test.ts`
- `apps/web/shared/workerRuntime.ts` required no code change because `desktop_zeroclaw_managed` was already the canonical projection runtime type; Section 01 now consumes that vocabulary from the new shared module instead of duplicating it.
