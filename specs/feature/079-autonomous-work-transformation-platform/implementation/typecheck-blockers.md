# Repo-wide Typecheck Status

Date: 2026-04-10

Command:
```bash
npm --workspace=@smartspec/web run typecheck -- --pretty false
```

Result:
- `tsc` now passes at repository level.
- Feature 079 workpack types pass together with the surrounding auth, desktop-host, release-build, and finance surfaces that previously blocked merge readiness.
- This file is kept as a completion record so future regressions have a clear before/after reference.

## Resolved blocker areas

### Auth service

- `apps/web/client/src/services/authService.ts:314`
  - fixed null-safe fallback for the fetch interceptor

### Desktop host route

- `apps/web/server/routes/desktopHost.ts:912`
  - removed unreachable `cleanup_device` comparison from root actions

### Desktop device registry service

- `apps/web/server/services/desktopDeviceRegistryService.ts:852`
  - aligned audit event names with the audit logger type union
- `apps/web/server/services/desktopDeviceRegistryService.ts:972`
  - typed admin-mutated health summary as a mutable record with health status support
- `apps/web/server/services/desktopDeviceRegistryService.ts:975`
  - typed admin-mutated health summary as a mutable record with health status support
- `apps/web/server/services/desktopDeviceRegistryService.ts:990`
  - aligned audit event names with the audit logger type union

### Desktop release build service

- `apps/web/server/services/desktopReleaseBuildService.ts:294`
  - fixed portal sync state type alias drift

### Finance audit logging

- `apps/web/server/services/financeDocumentExtractionService.ts:311`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeDocumentExtractionService.ts:341`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeDocumentExtractionService.ts:438`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeDocumentExtractionService.ts:459`
  - audit logger now explicitly accepts tenant-scoped entries

### Finance service

- `apps/web/server/services/financeService.ts:1051`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1052`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1054`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1055`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1056`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1088`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1197`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeService.ts:1229`
  - normalized finance numeric persistence to drizzle-compatible string values
- `apps/web/server/services/financeService.ts:1242`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeService.ts:1312`
  - relaxed helper signatures to accept transaction executors structurally
- `apps/web/server/services/financeService.ts:1350`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeService.ts:1396`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1397`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1399`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1400`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1401`
  - materialized structured draft payload fields onto `FinanceDraftRecord`
- `apps/web/server/services/financeService.ts:1402`
  - normalized finance numeric persistence to drizzle-compatible string values
- `apps/web/server/services/financeService.ts:1435`
  - relaxed helper signatures to accept transaction executors structurally
- `apps/web/server/services/financeService.ts:1437`
  - relaxed helper signatures to accept transaction executors structurally
- `apps/web/server/services/financeService.ts:1443`
  - relaxed helper signatures to accept transaction executors structurally
- `apps/web/server/services/financeService.ts:1450`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeService.ts:1461`
  - relaxed helper signatures to accept transaction executors structurally
- `apps/web/server/services/financeService.ts:1510`
  - audit logger now explicitly accepts tenant-scoped entries
- `apps/web/server/services/financeService.ts:1970`
  - normalized finance numeric persistence to drizzle-compatible string values
- `apps/web/server/services/financeService.ts:2019`
  - relaxed helper signatures to accept transaction executors structurally
- `apps/web/server/services/financeService.ts:2022`
  - relaxed helper signatures to accept transaction executors structurally
- `apps/web/server/services/financeService.ts:2051`
  - audit logger now explicitly accepts tenant-scoped entries

## Readiness call

Feature 079 is locally test-covered and no longer contributes typecheck failures. Full-repo merge readiness is restored.

Validation completed:

1. `npm --workspace=@smartspec/web run typecheck -- --pretty false`
2. `npm --workspace=@smartspec/web test -- client/src/services/__tests__/authService.test.ts server/routes/desktopHost.test.ts server/services/__tests__/desktopDeviceRegistryService.test.ts server/services/__tests__/desktopReleaseBuildService.test.ts server/services/__tests__/financeService.test.ts server/services/__tests__/workpackConnectorService.test.ts shared/__tests__/workpackContracts.test.ts`
