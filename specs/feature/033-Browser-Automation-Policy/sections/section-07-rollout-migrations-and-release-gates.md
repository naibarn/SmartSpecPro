# Section 07: Rollout, Migrations, and Release Gates

## Overview

This section finalizes the operational path to release. It covers additive migration sequencing, partition maintenance ownership, rollback posture, rollout metrics, explicit go/no-go thresholds, and the regression and abuse checks that must pass before expanding from observe/read-only toward commit-capable workflows.

**Corresponds to**: Plan sections "Data model and migration strategy", "Regression prevention strategy", "Data safety strategy", "Compatibility notes", and the rollout portions of "Observability and monitoring".

**Dependencies**: Sections 01 through 06.

**Blocks**: Final output only.

---

## Tests

### Web / migration and rollout tests

**Files**:
- `apps/web/drizzle/__tests__/browserPolicyMigrations.test.ts`
- `apps/web/server/__tests__/browserPolicyRolloutGates.test.ts`
- `apps/web/server/__tests__/browserPolicyReleaseReadiness.test.ts`

```typescript
// Test: browser policy migrations are additive and create the expected partitioned structures
// Test: rollout gate calculations enforce 14-day / 10,000-decision threshold and reviewed-sample requirements
// Test: observe mode never opens an unenforced write path
// Test: commit rollout fails if audit completeness or red-team checks are incomplete
```

### Python / rollback and integration tests

**Files**:
- `python-backend/tests/integration/test_browser_policy_rollout.py`
- `python-backend/tests/integration/test_browser_policy_rollback.py`

```python
# Test: additive schema changes coexist with existing approval/browser flows
# Test: rollback disables policy-integrated tenant access without exposing raw-browser bypass
# Test: integration abuse scenarios cover prompt injection, mass extraction, popup origin change, and deceptive labels
```

---

## Implementation Details

### 1. Keep migration ownership explicit

Use raw SQL where needed for the partitioned decision table and its monthly partitions. Keep query typing in Drizzle but avoid ambiguous ownership between Drizzle and SQLAlchemy for the same DDL responsibility.

### 2. Define partition operations and fallback maintenance

`pg_partman` is the primary lifecycle mechanism. If unavailable, use the approved fallback maintenance job and test for:

- future partition creation
- retention drift
- writeability of new partitions

### 3. Make rollout gates executable

Carry the approved thresholds into release logic:

- observe -> read-only: `14 days` and `10,000 decisions`, reviewed sample `>= 500`, precision `>= 98%`, FPR `<= 1%`, FNR `<= 2%`, stable `>= 7 days`, zero P0/P1 misses
- read-only -> draft: deny precision `>= 99%` plus approval UX signoff
- draft -> commit: zero P0 incidents for `7 days`, approval abandonment `< 10%`
- commit -> expanded: zero P0/P1 incidents for `14 days`, red-team pass, audit completeness

### 4. Preserve additive rollback posture

Rollback should disable tenant-facing usage first, avoid destructive table drops during incident response, and verify that Copilot execution, approval listing, approval submission, and tenant gating remain healthy after rollback.

### 5. Require abuse-driven verification

Release readiness must include prompt-injection, deceptive-label, hidden-auth-iframe, popup-origin, mass-extraction, and external-send scenarios in addition to normal regression coverage.

---

## Verification Steps

1. Confirm migration tests prove additive behavior and partition ownership.
2. Confirm fallback partition maintenance is observable and testable.
3. Confirm rollout gates compute the approved thresholds exactly.
4. Confirm observe mode never creates an unenforced commit path.
5. Confirm rollback and abuse scenarios pass before expanded rollout.

## As-Built Notes

### Actual files changed

- `apps/web/drizzle/0060_browser_policy_decision_partitions.sql`
- `apps/web/drizzle/browserPolicyMigrationPlan.ts`
- `apps/web/drizzle/browserPolicyMigrations.test.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/browserPolicyReleaseControl.ts`
- `apps/web/server/services/browserPolicyRolloutGates.ts`
- `apps/web/server/services/browserPolicyReleaseReadiness.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/server/services/__tests__/browserPolicyReleaseControl.test.ts`
- `apps/web/server/services/__tests__/tenantFeatureFlagsUpdate.test.ts`
- `apps/web/server/__tests__/browserPolicyRolloutGates.test.ts`
- `apps/web/server/__tests__/browserPolicyReleaseReadiness.test.ts`
- `python-backend/app/services/browser_policy_rollout.py`
- `python-backend/tests/integration/test_browser_policy_rollout.py`
- `python-backend/tests/integration/test_browser_policy_rollback.py`

### Deviations from plan

- Landed executable migration-plan metadata and rollout-gate helpers before wiring them into feature-flag orchestration.
- The raw SQL partition DDL for `browser_policy_decisions` now exists alongside query typing in Drizzle, while deployment/feature-flag promotion is still the remaining integration step.

### Tests added or updated

- `npm --prefix apps/web test -- drizzle/browserPolicyMigrations.test.ts server/__tests__/browserPolicyRolloutGates.test.ts server/__tests__/browserPolicyReleaseReadiness.test.ts`
- `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/integration/test_browser_policy_rollout.py python-backend/tests/integration/test_browser_policy_rollback.py`

### Known follow-ups

- Invoke rollout and rollback readiness checks from deployment/feature-flag orchestration before promoting tenant-facing access.
