# Section 03: Feature Flag — `unifiedSkillExecution`

## Summary

Add the `unifiedSkillExecution` boolean flag to the tenant feature flags system. This flag gates whether Chat and Team Room channels delegate skill execution to the unified orchestrator (sections 07, 08) or continue using their existing inline code paths. Default is `false` (no behavior change until explicitly enabled per tenant).

## Dependencies

- **None.** This section has no dependencies and can be implemented in Batch 1 alongside section-01.

## Blocks

- **section-07-wire-chat-router** — reads this flag to decide whether to delegate to orchestrator
- **section-08-wire-team-room** — reads this flag to decide whether to delegate to orchestrator

## File to Modify

**`apps/web/shared/featureFlags.ts`**

Three locations must be updated:

### 1. `TenantFeatureFlags` interface

Add a new property:

```typescript
unifiedSkillExecution: boolean; // F29 — Unified skill execution pipeline
```

Place it after the last existing entry. The comment number F29 follows the existing numbering convention.

### 2. `ALLOWED_FEATURE_FLAGS` set

Add `"unifiedSkillExecution"` to the `Set<TenantFeatureFlagKey>` constructor argument.

### 3. `FEATURE_FLAG_DEFAULTS` object

Add:

```typescript
unifiedSkillExecution: false,
```

Default **must** be `false`.

## How This Flag Is Consumed

**Server-side:** Via `isFeatureEnabled(storedFlags, "unifiedSkillExecution")` or `getTenantFeatureFlags(tenantId)` from `tenantFeatureFlagService.ts`.

**Client-side:** Via the `useTenantFeatureFlag` hook.

**Redis sync:** NOT needed. This flag is read from the DB column via tRPC context, not from Redis via Express middleware.

## No Migration Required

The `tenants.featureFlags` column is JSON. Adding a new key does not require a database migration. Existing rows fall back to `FEATURE_FLAG_DEFAULTS`.

## TDD Expectations

**File:** `apps/web/shared/__tests__/unifiedSkillExecutionFlag.test.ts`

```
# Test: unifiedSkillExecution exists in FEATURE_FLAG_DEFAULTS with value false
# Test: unifiedSkillExecution is in ALLOWED_FEATURE_FLAGS set
# Test: resolveFeatureFlags returns false for unifiedSkillExecution when stored flags are null
# Test: resolveFeatureFlags returns true when stored flags include unifiedSkillExecution: true
# Test: isFeatureEnabled returns false for unifiedSkillExecution when stored flags are null
# Test: isFeatureEnabled returns true when stored flags have unifiedSkillExecution: true
# Test: validateFeatureFlags preserves unifiedSkillExecution when valid boolean
# Test: validateFeatureFlags strips unifiedSkillExecution when non-boolean
```

## Verification

```bash
cd apps/web && pnpm check
cd apps/web && npx vitest run shared/__tests__/unifiedSkillExecutionFlag.test.ts
```
