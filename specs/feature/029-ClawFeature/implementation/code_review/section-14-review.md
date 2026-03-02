# Code Review: Section 14 — Feature Flags & Tenant Configuration

## HIGH SEVERITY

### 1. requireFeatureFlag.ts creates a second tRPC instance with different configuration
`apps/web/server/middleware/requireFeatureFlag.ts` calls `initTRPC.create()` without `transformer: superjson` — this creates a mismatched middleware instance. Attaching middleware from a different `t` instance will cause runtime errors or broken serialisation. Fix: export `t.middleware` from `_core/trpc.ts` and import it instead.

### 2. useTenantFeatureFlag hook reads featureFlags from API response that doesn't expose it
`/api/tenant/current` response only includes `settings` and `contactInfo` fields — not the `featureFlags` column. The hook will always hit the null fallback path, making UI feature gates silently use defaults. Fix: either expose `featureFlags` in the tenant endpoint, or use the tRPC `getFeatureFlags` query.

### 3. RBAC gap: domain_admin can update another tenant by spoofing Host header
When `input.tenantId` is not provided, `ctx.tenantId` comes from the HTTP Host header resolution — a domain_admin could manipulate this. Fix: use an explicit DB-backed check (user.registeredDomain vs. tenant.primaryDomain) rather than trusting ctx.tenantId alone.

## MEDIUM SEVERITY

### 4. POST /api/admin/tenants (create) still allows featureFlags injection via settings
The audit only patched the PUT handler. The POST create handler passes `settings` directly. Fix: strip featureFlags from settings in the create handler too.

### 5. Race condition: no transaction in read-modify-write
Two concurrent updates to the same tenant's flags will cause lost updates. Fix: wrap in a db.transaction() or use an atomic jsonb update.

### 6. requireFeatureFlag passes silently when DB is unavailable (for default-true flags)
If `getDb()` returns null, `isFeatureEnabled(null, 'costDisplay')` returns true — features remain accessible without verifying tenant config. Fix: fail closed by throwing FORBIDDEN when DB is unreachable.

### 7. FeatureFlagKey type name collision with existing useFeatureFlag.ts export
Both files export `FeatureFlagKey`. The new type should be renamed `TenantFeatureFlagKey`.

### 8. TenantFeatureFlagsPanel rollback skips when variables.tenantId is undefined
Non-null assertion `variables.tenantId!` on rollback will skip the rollback silently. Fix: guard with `if (variables.tenantId)`.

## LOW SEVERITY

### 9. RBAC tests test inlined logic, not actual router code
The RBAC tests copy-paste conditions rather than calling the real procedure. Low value as regression protection.

### 10. `as unknown as Record<string, boolean>` cast silences type safety

## NITPICK

### 11. Import path `@/../../shared/featureFlags` should be `@shared/featureFlags`
The project has an `@shared/` alias that should be used instead of relative path traversal.

### 12. `container.firstChild` assertion in gate test is fragile
`render()` wraps in a div, so `firstChild` is the wrapper, not null. Use `container.innerHTML === ''` or `queryByText` instead.
