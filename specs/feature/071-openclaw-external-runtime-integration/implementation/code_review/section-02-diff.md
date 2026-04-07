# Diff Summary: Section 02 - Worker REST Control Plane

## Scope reviewed

The section-02 implementation touched these files:

- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`
- `apps/web/server/services/__tests__/workerAuthService.test.ts`
- `apps/web/server/services/__tests__/workerRegistryService.test.ts`
- `apps/web/server/_core/tokens.ts`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/middleware/publicApiHeaders.ts`
- `apps/web/server/_core/index.ts`
- `apps/web/server/middleware/__tests__/publicApiHeaders.test.ts`
- `apps/web/server/__tests__/requireScopes.test.ts`

## Review note

`apps/web/server/_core/index.ts` already had unrelated branch-local changes before section 02 started. Review for this section therefore focused only on the worker-runtime REST control-plane hunks:

- worker-specific auth/token helpers
- worker registry/control-plane service behavior
- worker policy snapshot service
- worker REST route hosting and mount
- shared worker payload contract updates needed for lease protection
- worker-specific error mapping and updated auth/header fixtures

## Targeted validation run

Passed:

- `npm --prefix apps/web test -- server/services/__tests__/workerAuthService.test.ts server/services/__tests__/workerRegistryService.test.ts server/routes/__tests__/workerRuntime.test.ts`
- `npm --prefix apps/web test -- shared/__tests__/workerRuntime.test.ts server/services/__tests__/workerRuntimeSchema.test.ts server/services/__tests__/tenantFeatureFlagsOpenClawSync.test.ts server/middleware/__tests__/publicApiHeaders.test.ts`
- `npm --prefix apps/web test -- server/__tests__/authExtension.test.ts server/__tests__/requireScopes.test.ts`

No section-02 regressions remain in the targeted suites above.
