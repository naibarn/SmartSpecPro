# Section 02: Server Scopes and Readiness

## Ownership

- `apps/web/server/services/hermesConnectionService.ts`
- `apps/web/server/services/hermesWorkerSettings.ts`
- related service/router tests
- production infrastructure settings

## TDD

Availability must expose enough worker readiness information for UI actions to
fail closed. Preserve server-shared admin-only and server-personal owner-only
semantics.

## Acceptance

- Both server scopes are available only with the paired online worker.
- Central and personal server connection starts enqueue tenant-scoped control
  jobs assigned to that worker.
- Scope flags are enabled only after readiness evidence passes.
