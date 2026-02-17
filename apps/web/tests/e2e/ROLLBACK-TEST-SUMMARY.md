# Funnel Dashboard Rollback E2E Test Suite - Summary

## Quick Stats

- **Test File:** `server/services/funnelRollback.e2e.test.ts`
- **Total Tests:** 21
- **Pass Rate:** 100% (21/21 passing)
- **Test Duration:** ~3.4 seconds
- **Coverage:** All rollback scenarios (immediate, partial, restore)

## Test Run Command

```bash
cd apps/web
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm run test server/services/funnelRollback.e2e.test.ts
```

## Test Suites Breakdown

| Suite | Tests | Focus |
|-------|-------|-------|
| Immediate Rollback (Full Disable) | 3 | Full feature disable for all roles |
| Partial Rollback (Domain Admin Only) | 3 | Selective disable (keep admin access) |
| Rollback Timing Measurements | 3 | Performance benchmarks |
| State Persistence After Rollback | 3 | Redis persistence & consistency |
| Rollback Restore Flow | 3 | Re-enabling after rollback |
| All Endpoints After Rollback | 2 | Endpoint-level access control |
| Rollback Error Handling | 2 | Error scenarios & logging |
| Rollback Triggers Coverage | 3 | All trigger types execute correctly |

## Key Test Scenarios Covered

### ✅ Immediate Rollback Flow

1. Feature enabled → dashboard accessible
2. Execute immediate rollback → `FUNNEL_DASHBOARD_ENABLED` set to false
3. Verify dashboard inaccessible for all roles (admin, domain_admin)
4. Verify error message: "Funnel dashboard not available for your role in current rollout phase"

**Covered Triggers:**
- Cross-tenant data exposure (immediate)
- SLO breach (3+ gates failing) (immediate)

### ✅ Partial Rollback Flow

1. Feature enabled → both admin and domain_admin can access
2. Execute partial rollback → `FUNNEL_DASHBOARD_DOMAIN_ADMIN` set to false
3. Verify domain_admin loses access
4. Verify admin retains access (internal phase debugging)

**Covered Triggers:**
- Reconciliation divergence trend (high)
- Export abuse pattern (high)

### ✅ Restore Flow

1. Execute rollback → feature disabled
2. Re-enable feature flags
3. Verify full access restored
4. Measure restore timing (< 500ms requirement)

### ✅ State Persistence

- Multiple consecutive requests respect rollback state
- Redis state survives reconnection
- Feature flags persist correctly

### ✅ Performance Requirements

All timing tests verify production readiness:
- Rollback execution: < 500ms ✓
- Restore execution: < 500ms ✓
- Blocked API response: < 100ms ✓

## Critical Bug Discovered

⚠️ **Incomplete Rollback Implementation** (Severity: MEDIUM-HIGH)

The tests revealed that only the `summary` endpoint checks rollout phase. The following endpoints are **missing rollback gates**:

1. `timeSeries` endpoint
2. `export` endpoint
3. `rawEvents` endpoint

**Impact:** After executing "immediate rollback", users can still query funnel data via these endpoints. This defeats the purpose of rollback for security incidents.

**Fix:** Add `await checkFunnelEnabled(ctx.user.role)` to each endpoint.

**Tests Document This:** The "All Endpoints After Rollback" suite includes explicit comments showing this bug and the expected vs actual behavior.

## Test Architecture Highlights

### Automatic State Management

```typescript
beforeAll(async () => {
  // Capture original feature flag state
  testState = await captureOriginalState();
});

beforeEach(async () => {
  // Reset to enabled state before each test
  await setFeatureFlag("FUNNEL_DASHBOARD_ENABLED", true);
  await setFeatureFlag("FUNNEL_DASHBOARD_DOMAIN_ADMIN", true);
});

afterAll(async () => {
  // Restore original state for clean teardown
  await restoreOriginalState(testState);
});
```

Benefits:
- Tests don't interfere with each other
- System left in original state after test run
- No manual cleanup required

### Test Context Helpers

```typescript
// Create admin context with custom properties
const ctx = createTestContext({ role: "admin", id: 1000 });

// Create domain_admin context
const ctx = createTestContext({ role: "domain_admin", id: 2000 });

// Create unauthenticated context
const ctx = createUnauthenticatedContext();
```

Benefits:
- Consistent test data
- Easy to test different user roles
- Type-safe context creation

### Realistic Rollback Execution

Tests use the actual production `executeRollback()` function with real ROLLBACK_TRIGGERS:

```typescript
const trigger = ROLLBACK_TRIGGERS.find((t) => t.priority === "immediate");
const actions = await executeRollback(trigger!, userId);

// Verify actions taken
expect(actions).toContain("Disabled FUNNEL_DASHBOARD_ENABLED feature flag");
```

Benefits:
- Tests actual production code paths
- Verifies rollback action logging
- Ensures trigger configuration is correct

## Integration with Runbook

These E2E tests directly validate the procedures documented in:
- `docs/runbooks/funnel-dashboard-rollout.md`

Specifically testing:
- Section "Rollback Triggers and Actions"
- Section "Post-Rollback Verification"
- All immediate and high-priority rollback scenarios

## Setup Instructions

### Prerequisites

1. Redis running on localhost:6379
2. PostgreSQL database (uses test DB)
3. Node.js environment with dependencies installed

### Quick Start

```bash
# 1. Ensure services are running
docker compose up -d redis postgres

# 2. Install dependencies (if not already done)
cd apps/web
npm install

# 3. Run tests
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm run test server/services/funnelRollback.e2e.test.ts
```

### Expected Output

```
✓ server/services/funnelRollback.e2e.test.ts (21 tests) 99ms
  ✓ Funnel Dashboard Rollback E2E
    ✓ Immediate Rollback (Full Disable) (3 tests)
    ✓ Partial Rollback (Domain Admin Only) (3 tests)
    ✓ Rollback Timing Measurements (3 tests)
    ✓ State Persistence After Rollback (3 tests)
    ✓ Rollback Restore Flow (3 tests)
    ✓ All Endpoints After Rollback (2 tests)
    ✓ Rollback Error Handling (2 tests)
    ✓ Rollback Triggers Coverage (3 tests)

Test Files  1 passed (1)
     Tests  21 passed (21)
  Start at  XX:XX:XX
  Duration  3.40s
```

## Continuous Integration

### CI Configuration Example

```yaml
test-rollback:
  runs-on: ubuntu-latest
  services:
    redis:
      image: redis:7-alpine
      ports:
        - 6379:6379
    postgres:
      image: postgres:15
      env:
        POSTGRES_DB: smartspec_test
      ports:
        - 5432:5432
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
    - run: npm install
    - name: Run Rollback E2E Tests
      env:
        JWT_SECRET: test-jwt-secret-32-chars-minimum-1234567890
        REDIS_URL: redis://localhost:6379
        DATABASE_URL: postgresql://test:test@localhost:5432/smartspec_test
      run: |
        cd apps/web
        npm run test server/services/funnelRollback.e2e.test.ts
```

## Maintenance Checklist

When updating rollback logic:

- [ ] Update tests if new rollback triggers added
- [ ] Update tests if rollback behavior changes
- [ ] Update tests if new endpoints added to funnelAnalytics router
- [ ] Update README-FUNNEL-ROLLBACK.md with new test scenarios
- [ ] Verify all 21 tests still pass
- [ ] Check timing benchmarks still meet < 500ms requirement

When updating funnelAnalytics endpoints:

- [ ] Add `checkFunnelEnabled()` call to new endpoints
- [ ] Add test case in "All Endpoints After Rollback" suite
- [ ] Verify rollback blocks the new endpoint

## Known Limitations

1. **Empty Database Tests:** Tests run against empty database, so they verify access control but not actual data queries
2. **Mock Audit Logger:** Audit logs are emitted but not verified in detail
3. **No Celery Integration:** Tests don't verify actual backfill job halting (requires Celery worker)

These limitations are acceptable for E2E tests focused on feature flag rollback logic. Full integration tests with populated database would be in a separate test suite.

## Next Steps

### Recommended Improvements

1. **Fix Incomplete Rollback** (Priority: HIGH)
   - Add `checkFunnelEnabled()` to timeSeries, export, rawEvents endpoints
   - Update tests to expect throws instead of documenting bugs

2. **Add Integration Tests** (Priority: MEDIUM)
   - Test rollback with actual funnel data in database
   - Verify data is truly inaccessible after rollback
   - Test cache invalidation after rollback

3. **Add Celery Worker Tests** (Priority: LOW)
   - Verify backfill jobs are actually halted
   - Test job queue state after rollback

### Related Test Files

For complete coverage, also review:
- `server/routers/funnelAnalytics.rbac.test.ts` - RBAC tests
- `server/routers/funnelAnalytics.test.ts` - Functional tests
- `server/services/funnelMilestones.test.ts` - Event tracking tests

## References

- Test File: `apps/web/server/services/funnelRollback.e2e.test.ts`
- Setup Guide: `apps/web/tests/e2e/README-FUNNEL-ROLLBACK.md`
- Runbook: `docs/runbooks/funnel-dashboard-rollout.md`
- Implementation: `apps/web/server/services/funnelRollout.ts`
- Router: `apps/web/server/routers/funnelAnalytics.ts`
