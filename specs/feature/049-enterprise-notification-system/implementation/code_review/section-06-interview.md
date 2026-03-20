# Section 06 Code Review Interview

## Auto-fixed
1. **Tenant isolation in notification query** (HIGH) — Added `innerJoin(users)` with `currentTenantId::text = policy.tenantId` filter to scope notifications to the policy's tenant.
2. **Tenant isolation in role-based target query** (HIGH) — Added `currentTenantId::text = policy.tenantId` filter to role-user query.
3. **Metadata update when no targets** (MEDIUM) — Added `if (targetUserIds.length > 0)` guard and warning log when no targets found.
4. **Shutdown try/catch** (LOW) — Wrapped `shutdownEscalationJob()` in try/catch in `notificationJobs.ts`.

## Let go
- Feature flag env var naming (HIGH per reviewer) — Same temporary pattern as section-05, section-13 will unify.
- SQL parameterization style (MEDIUM) — Server-constructed values, no injection risk.
- Vacuous escalation-skip tests (MEDIUM) — SQL filtering is DB-level, mocks can't test it meaningfully.
- Weak metadata-update assertion (MEDIUM) — Testing exact SQL payload would over-couple.
- console.log vs logger (LOW) — Consistent with codebase.
- shutdown null-before-close (LOW) — Current pattern already sets null after close.
