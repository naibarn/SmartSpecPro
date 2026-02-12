# Research Notes

Date: 2026-02-12  
Scope: `apps/web` TypeScript error remediation

## 1) Baseline Metrics (Current)

Source: `apps/web npm run check -- --pretty false`

- Total errors: `2604`
- Top codes:
  - `TS2305` = 1090
  - `TS7006` = 770
  - `TS2339` = 453
  - `TS2307` = 57
  - `TS2554` = 39
- Top file clusters:
  - `client/src/pages/ComponentShowcase.tsx`
  - `client/src/pages/AdminSettings.tsx`
  - `client/src/pages/MediaStudio.tsx`
  - `client/src/pages/AdminSkills.tsx`
  - `client/src/pages/AdminQueues.tsx`

## 2) Architecture and Integration Findings

### 2.1 Frontend module graph
- `client` imports `@/components/ui/*` wrappers.
- Wrapper files re-export from `@smartspec/ui/src/components/ui/*`.
- Current `apps/web/tsconfig.json` does **not** include path mapping for `@smartspec/ui/src/*`, causing wrapper import failures.

### 2.2 tRPC typing chain
- `client/src/lib/trpc.ts` imports `type AppRouter` from `@server/routers`.
- Current `tsconfig` lacks `@server/*` path mapping, causing `TS2307` and downstream unknown-type errors in pages/components.

### 2.3 Server routing contracts
- `server/routers/factory.ts` imports from `../trpc` (invalid path in current tree).
- Correct helper is in `server/_core/trpc.ts`.

### 2.4 ENV contract drift
- `server/storage.ts` references `ENV.forgeApiUrl` and `ENV.forgeApiKey`.
- `server/_core/env.ts` currently does not expose these fields.

### 2.5 Dependency/type gaps
- `server/routers/systemSettings.ts` dynamically imports `pg`; type declarations missing (`TS7016`).
- `server/routers/systemSettings.ts` also has tenantId type mismatches (`string|number` vs schema `varchar`).

## 3) Schema and Data Flow Findings (Impacted Risk Areas)

### 3.1 Tenant ID shape inconsistency
- `drizzle/schema.ts` mixes `tenantId` types:
  - many tables: `varchar(36)` (e.g., `library_items`, `invoice_config`, callback tables)
  - some older tables: `integer`
- This mismatch contributes to TypeScript and query overload errors.

### 3.2 Library and callback attribution paths
- Existing services show tenant-scoped operations and migration utilities:
  - `libraryOpsService.ts`
  - `libraryOpsTenantAttributionService.ts`
  - `libraryUrlMigrationService.ts`
- Current remediation scope (TypeScript fix) should not mutate runtime data behavior unintentionally.

## 4) Testing Setup and Existing Coverage

- Test runner: `vitest` in `apps/web`.
- Existing tests already cover key security/tenant paths:
  - `server/routers/media.addToLibrary.test.ts`
  - `server/routers/library.test.ts`
  - `server/services/libraryOpsTenantAttributionService.test.ts`
  - `server/services/securityRegressionReleaseGate.test.ts`
  - several URL policy/content safety tests
- Existing coverage provides regression anchors for tenant attribution and URL safety during type cleanup.

## 5) Security and Tenant Constraints Observed

- Tenant and ownership controls are already present across library/media routers.
- URL safety policy exists and blocks local/private hosts for external URLs.
- Type fixes must preserve:
  - auth and admin/domain-admin guard flows
  - tenant scope enforcement in query/update paths
  - URL validation policy behavior

## 6) Root-Cause Summary to Address in Plan

1. Missing alias resolution for `@smartspec/ui/src/*` and `@server/*` (high blast radius).
2. Incorrect import path in `server/routers/factory.ts`.
3. Missing ENV keys used by storage integration.
4. Missing `pg` type declarations and several schema-type drift points.
5. Strict typing debt in admin/media/chat/service layers.

## 7) Research Risk Flags

- High regression risk if broad edits are done without phase gates and snapshots.
- Moderate security risk if quick fixes bypass strict typing with unsafe casts.
- Low DB migration risk for this plan if limited to TypeScript and dependency fixes; no schema/data mutation required by default.
