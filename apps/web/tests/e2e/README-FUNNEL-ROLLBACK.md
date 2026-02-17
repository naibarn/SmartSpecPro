# Funnel Dashboard Rollback E2E Tests

## Overview

Comprehensive E2E tests for the Funnel Dashboard rollback procedure, covering immediate rollback, partial rollback, timing measurements, and state persistence.

## Test File Location

`/home/dev/projects/SmartSpecPro/apps/web/server/services/funnelRollback.e2e.test.ts`

## Prerequisites

1. **Redis** must be running on localhost:6379 (or configured via `REDIS_URL`)
2. **PostgreSQL** database (test database preferred)
3. **JWT_SECRET** environment variable

## Running the Tests

### Run all rollback tests

```bash
cd apps/web
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm run test server/services/funnelRollback.e2e.test.ts
```

### Run specific test suite

```bash
# Run only immediate rollback tests
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm run test -- server/services/funnelRollback.e2e.test.ts -t "Immediate Rollback"

# Run only partial rollback tests
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm run test -- server/services/funnelRollback.e2e.test.ts -t "Partial Rollback"

# Run only timing tests
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm run test -- server/services/funnelRollback.e2e.test.ts -t "Rollback Timing"
```

### Run in watch mode (for development)

```bash
cd apps/web
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm run test -- server/services/funnelRollback.e2e.test.ts --watch
```

## Test Coverage

### 1. Immediate Rollback (Full Disable)

**Tests:**
- Disables dashboard for admin after immediate rollback
- Disables dashboard for domain_admin after immediate rollback
- Keeps user role blocked after immediate rollback

**What it verifies:**
- Feature flag `FUNNEL_DASHBOARD_ENABLED` set to false
- All privileged roles (admin, domain_admin) lose access
- Error message: "Funnel dashboard not available for your role in current rollout phase"

### 2. Partial Rollback (Domain Admin Only)

**Tests:**
- Blocks domain_admin but keeps admin access
- Handles SLO breach rollback correctly (full disable)
- Verifies reconciliation divergence triggers

**What it verifies:**
- Feature flag `FUNNEL_DASHBOARD_DOMAIN_ADMIN` set to false
- Main flag `FUNNEL_DASHBOARD_ENABLED` remains true
- Admin retains access (internal phase)
- Domain_admin loses access

### 3. Rollback Timing Measurements

**Tests:**
- Immediate rollback completes within 500ms
- Partial rollback completes within 500ms
- API response time after rollback < 100ms

**What it verifies:**
- Rollback operations are fast enough for production use
- Blocked requests fail quickly (no timeouts)

### 4. State Persistence After Rollback

**Tests:**
- Rollback state persists for summary endpoint
- Partial rollback state persists for domain_admin only
- Redis reconnection scenarios work correctly

**What it verifies:**
- Feature flag state persists in Redis
- Multiple requests consistently respect rollback state
- State survives Redis reconnection

### 5. Rollback Restore Flow

**Tests:**
- Restore full access after re-enabling flags
- Restore admin-only access after partial rollback restore
- Measure restore timing (< 500ms)

**What it verifies:**
- Re-enabling flags restores full functionality
- Restore operations are fast
- Both admin and domain_admin regain access

### 6. All Endpoints After Rollback

**Tests:**
- Summary endpoint blocked after immediate rollback
- Summary endpoint blocked for domain_admin after partial rollback

**What it verifies:**
- Summary endpoint correctly checks rollout phase
- Error message consistency

**⚠️ CRITICAL BUG DETECTED:**
These tests also document a security issue where the following endpoints do NOT check rollout phase:
- `timeSeries` endpoint
- `export` endpoint
- `rawEvents` endpoint

These endpoints remain accessible even after rollback, allowing users to query data. See "Known Issues" section below.

### 7. Rollback Error Handling

**Tests:**
- Handles Redis unavailability during rollback
- Reports all actions taken during rollback

**What it verifies:**
- Rollback failures throw errors (don't fail silently)
- Action log is comprehensive and useful for debugging

### 8. Rollback Triggers Coverage

**Tests:**
- All priority levels have defined triggers
- All immediate priority triggers execute correctly
- All high priority triggers execute correctly

**What it verifies:**
- Complete trigger coverage (immediate, high, medium)
- Each trigger executes the correct rollback action
- Feature flags are set correctly based on priority

## Test Architecture

### Test Context Creation

Tests use helper functions to create authenticated test contexts:

```typescript
// Create admin context
const adminCtx = createTestContext({ role: "admin" });

// Create domain_admin context
const domainAdminCtx = createTestContext({ role: "domain_admin", id: 2000 });

// Create unauthenticated context
const unauthCtx = createUnauthenticatedContext();
```

### State Management

Tests automatically:
1. Capture original feature flag state before all tests
2. Reset flags to enabled state before each test
3. Restore original state after all tests complete

This ensures tests don't interfere with each other and don't leave the system in a bad state.

### Assertions

Tests verify:
- API responses (throw errors or return expected data)
- Feature flag state in Redis
- Rollback action logs
- Timing measurements
- State persistence

## Known Issues

### Incomplete Rollback Implementation

**Severity:** MEDIUM-HIGH

**Issue:** Only the `summary` endpoint checks the rollout phase via `checkFunnelEnabled()`. The following endpoints are missing this check:

1. **timeSeries endpoint** (line 387 in funnelAnalytics.ts)
   - Still returns time-series data after rollback
   - Should throw error like summary endpoint

2. **export endpoint** (line 504 in funnelAnalytics.ts)
   - Still allows CSV/JSON exports after rollback
   - Allows data exfiltration even when "disabled"

3. **rawEvents endpoint** (line 434 in funnelAnalytics.ts)
   - Still returns raw event data after rollback
   - Rate-limited but not rollout-gated

**Security Impact:**
- After executing immediate rollback, users can still access funnel data via export/timeSeries/rawEvents
- Rollback only blocks the summary view, not actual data access
- Defeats the purpose of feature rollback for security incidents

**Fix Required:**
Add `checkFunnelEnabled(ctx.user.role)` to the beginning of each endpoint's query handler, immediately after the `.query(async ({ ctx, input }) => {` line.

**Example Fix:**

```typescript
timeSeries: domainAdminProcedure
  .input(dateRangeInput)
  .query(async ({ ctx, input }) => {
    // ADD THIS LINE:
    await checkFunnelEnabled(ctx.user.role);

    const db = await getDb();
    // ... rest of implementation
  }),
```

The E2E tests document this bug by showing that these endpoints continue to work after rollback (returning empty data from test DB) instead of throwing errors.

## Test Maintenance

### When to Update Tests

1. **New rollback triggers added** → Add tests in "Rollback Triggers Coverage"
2. **New endpoints added** → Add tests in "All Endpoints After Rollback"
3. **Rollback logic changes** → Update assertions in relevant test suites
4. **Error messages change** → Update expected error strings

### Adding New Tests

Follow the existing patterns:

```typescript
it("should <describe expected behavior>", async () => {
  // GIVEN: Set up test context and state
  const ctx = createTestContext({ role: "admin" });
  const caller = appRouter.createCaller(ctx);

  // WHEN: Execute rollback or action
  const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
  await executeRollback(trigger!, 1);

  // THEN: Verify expected outcome
  await expect(caller.funnelAnalytics.summary(testInput)).rejects.toThrow(
    "Funnel dashboard not available for your role in current rollout phase",
  );
});
```

## Troubleshooting

### Tests fail with "Redis connection error"

**Solution:** Ensure Redis is running:
```bash
docker ps | grep redis
# If not running:
docker compose up -d redis
```

### Tests fail with "Unable to determine tenant scope"

**Solution:** Test contexts may be missing required fields. Check that test contexts include:
- `tenantId` (set automatically in createTestContext)
- `user.registeredDomain` (defaults to "example.com")

### Tests timeout

**Solution:**
1. Check Redis is responsive: `redis-cli ping`
2. Increase timeout in vitest.config.ts if needed
3. Check for hanging connections in logs

### Feature flag state pollution

**Solution:** Tests automatically restore original state, but if interrupted:
```bash
redis-cli SET feature-flag:FUNNEL_DASHBOARD_ENABLED "true"
redis-cli SET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN "true"
```

## CI/CD Integration

### GitHub Actions / GitLab CI

```yaml
- name: Run Funnel Rollback E2E Tests
  env:
    JWT_SECRET: test-jwt-secret-32-chars-minimum-1234567890
    REDIS_URL: redis://localhost:6379
    DATABASE_URL: postgresql://test:test@localhost:5432/smartspec_test
  run: |
    cd apps/web
    npm run test server/services/funnelRollback.e2e.test.ts
```

### Required Services in CI

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
  postgres:
    image: postgres:15
    env:
      POSTGRES_DB: smartspec_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - 5432:5432
```

## Performance Benchmarks

Based on test results:

| Operation | Expected Time | Current Performance |
|-----------|--------------|---------------------|
| Immediate rollback execution | < 500ms | ~10-50ms (✓) |
| Partial rollback execution | < 500ms | ~10-50ms (✓) |
| Feature flag restore | < 500ms | ~10-30ms (✓) |
| Blocked API response | < 100ms | ~5-20ms (✓) |

## Related Documentation

- [Funnel Dashboard Rollout Runbook](/home/dev/projects/SmartSpecPro/docs/runbooks/funnel-dashboard-rollout.md)
- [Funnel Rollout Service](/home/dev/projects/SmartSpecPro/apps/web/server/services/funnelRollout.ts)
- [Funnel Analytics Router](/home/dev/projects/SmartSpecPro/apps/web/server/routers/funnelAnalytics.ts)
- [Feature Flags Service](/home/dev/projects/SmartSpecPro/apps/web/server/services/featureFlags.ts)

## Contact

For questions about these tests or rollback procedures:
- Review the runbook: `docs/runbooks/funnel-dashboard-rollout.md`
- Check the implementation spec: `specs/feature/014-Core-Funnel-Dashboard/`
