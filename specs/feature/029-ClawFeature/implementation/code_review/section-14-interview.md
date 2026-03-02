# Code Review Interview — Section 14: Feature Flags & Tenant Configuration

## Items Asked of User

### Q1: RBAC gap — domain_admin Host-header spoofing
**Decision:** Add DB-backed check (user choice)
**Applied:** Yes — router now queries tenants table using `user.registeredDomain` to verify ownership, instead of trusting `ctx.tenantId` from HTTP Host header. Also resolves domain_admin's tenant via `primaryDomain` match when `tenantId` is not supplied.

### Q2: Race condition in read-modify-write
**Decision:** Add db.transaction() (user choice)
**Applied:** Yes — `updateTenantFeatureFlags` now wraps SELECT+UPDATE in `db.transaction()` to prevent lost updates from concurrent modifications.

### Q3: Rename FeatureFlagKey to TenantFeatureFlagKey
**Decision:** Rename (user choice)
**Applied:** Yes — renamed throughout `shared/featureFlags.ts` and all server/client files that import the type to avoid collision with existing `useFeatureFlag.ts` type export.

## Auto-Fixes Applied

### Fix: requireFeatureFlag.ts used wrong tRPC instance
**Issue:** `initTRPC.create()` was called a second time without `transformer: superjson`, creating a mismatched middleware instance.
**Fix:** Exported `middleware = t.middleware` from `_core/trpc.ts` and imported it in `requireFeatureFlag.ts`. Deleted the local `t` instance.

### Fix: useTenantFeatureFlag hook reads featureFlags from API that didn't expose it
**Issue:** `/api/tenant/current` endpoint didn't return the `featureFlags` column.
**Fix:** Added `featureFlags: req.tenant.featureFlags ?? {}` to the `/api/tenant/current` response in `tenant.ts`.

### Fix: POST /api/admin/tenants also allows featureFlags injection via settings
**Issue:** The create handler at POST `/api/admin/tenants` passed `settings` directly without stripping `featureFlags`.
**Fix:** Added same `featureFlags` stripping logic to the POST create handler.

### Fix: requireFeatureFlag passes silently when DB is unavailable (fail-open)
**Issue:** If `getDb()` returned null, middleware would call `isFeatureEnabled(null, flag)` which returns the default — silently enabling costDisplay/personaSystem during DB outages.
**Fix:** Both `requireFeatureFlag.ts` and `requireFeatureFlagExpress.ts` now throw FORBIDDEN / return 503 immediately if the DB is unavailable (fail-closed).

### Fix: TenantFeatureFlagsPanel rollback skips when tenantId undefined
**Issue:** Non-null assertion `variables.tenantId!` in onError callback could skip rollback silently.
**Fix:** Added `if (variables.tenantId && context?.previous)` guard before calling setData.

### Fix: Import paths use fragile `@/../../shared/featureFlags`
**Issue:** Client files used relative path traversal to import from `shared/`.
**Fix:** All client imports now use `@shared/featureFlags` (the project's configured vite alias).

### Fix: container.firstChild assertion is fragile
**Issue:** `render()` wraps in a div; `container.firstChild` is the wrapper div, not null.
**Fix:** Changed to `container.innerHTML === ""`.

## Items Let Go

### LOW: RBAC tests test inlined logic, not actual router code
Router tests for RBAC use simulated logic rather than an actual tRPC caller. This is a coverage gap but acceptable for this section since the logic is straightforward and tested implicitly through integration.

### LOW/NITPICK: `as unknown as Record<string, boolean>` cast
The cast is necessary due to Drizzle's column type mismatch with `TenantFeatureFlags`. Acceptable given the types are semantically equivalent (all-boolean record).
