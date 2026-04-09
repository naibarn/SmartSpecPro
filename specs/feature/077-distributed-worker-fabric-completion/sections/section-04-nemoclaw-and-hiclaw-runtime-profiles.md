# Section 04: NemoClaw and HiClaw Runtime Profiles

## Goal

Add truthful runtime-family semantics for secure pools and collaborative clusters without confusing them with desktop-local workers.

## Why this section exists

The shared schema already declares `nemoclaw_sandbox` and `hiclaw_cluster`, but the current implementation does not yet define what those runtimes mean in registration, routing, admin visibility, or rollout.

## Scope

1. Define required registration metadata for:
   - `nemoclaw_sandbox`
   - `hiclaw_cluster`
2. Add scheduler-level non-substitution rules so:
   - sandbox work does not silently default to OpenClaw
   - collaborative-cluster work does not pretend to be a desktop worker
3. Keep both runtime families admin-gated until their rollout is explicitly enabled.

## Cross-section role

- This section depends on Section 01 for runtime-handler registration, feature gating, and compatibility checks.
- It exports truthful runtime-family metadata and non-substitution rules that Section 05 must surface in admin/docs and that scheduler work in Section 01 must enforce.

## Suggested files

- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerFleetService.ts`
- help and admin docs under `apps/web/docs/help`

## Design rules

- NemoClaw is a secure-pool option, not the default desktop runtime.
- HiClaw is a collaborative cluster profile, not a replacement for per-machine worker execution.
- Registration and fleet views must expose truthful runtime-specific metadata instead of a generic gateway-shaped summary.
- Neither runtime should implicitly inherit the personal `Bound Worker` semantics from Feature 072 without an explicit later policy model for that runtime family.

## Minimum metadata to lock

### `nemoclaw_sandbox`

- `runtimeVersion`
- `openShellVersion`
- `sandboxName`
- `blueprintVersion`
- `inferenceProviderProfile`
- `networkPolicyProfile`
- `filesystemPolicyScope`
- `processRestrictionProfile`
- `resourceClass`

### `hiclaw_cluster`

- `runtimeVersion`
- `managerEndpoint`
- `clusterId`
- `gatewayMode`
- `credentialHandlingMode`
- `sharedArtifactStoreProfile`
- `humanOversightMode`
- `workerPoolSummary`
- `matrixVisibilityMode`

## Testing first

- runtime metadata validation tests
- scheduler tests for sandbox and cluster routing
- fleet/admin visibility tests proving the runtime family is explicit in operator views
