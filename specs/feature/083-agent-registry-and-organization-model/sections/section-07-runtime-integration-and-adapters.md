# Section 07 - Runtime Integration And Adapters

## Objective

Integrate the registry into the existing role-agent and delegated-worker runtime paths while preserving current behavior through adapter layers.

## Scope

- Map current role-agent concepts onto registry identities and versions.
- Update role-monitor and role-configuration paths to resolve via the registry adapter.
- Feed registry capability and policy data into delegated worker manifest generation.
- Ensure worker and runtime selection consult the registry before executing an agent version.

## Files Likely Changed

- `apps/web/server/services/roleConfigurationService.ts`
- `apps/web/server/routers/roleMonitor.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/delegatedWorkerPlatformService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/_core/mcpRegistry.ts` or adjacent runtime manifest code

## Implementation Notes

1. Preserve the current role-agent user experience while the backing registry changes.
2. Treat the registry as the source of truth for capability and rollout decisions.
3. Keep adapters thin so the old concepts can be removed later without a full rewrite.
4. Selection in runtime paths must fail closed if registry resolution is incomplete.

## TDD Stubs

- Test that role creation resolves or creates the expected registry identity.
- Test that role updates produce new registry versions instead of mutating published versions.
- Test that delegated worker manifests include registry-driven capability metadata.
- Test that runtime selection rejects missing or ambiguous registry resolution results.
- Test that the adapter path preserves existing behavior for unchanged role-agent flows.

## Completion Check

This section is done when current runtime consumers are reading registry data through an adapter, not through duplicated governance logic.
