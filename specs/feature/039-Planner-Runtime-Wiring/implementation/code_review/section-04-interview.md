# Section 04 — Code Review Interview

## Review Summary

Code review identified 2 actionable findings. Both were auto-fixed (no user input required).

## Finding 1: Missing `recordStepAttempt` at 3 sites (HIGH — Auto-fix)

**Issue:** channelGateway.ts (both agency paths) and webhookTriggers.ts created task_runs via `runPlanner()` but never called `recordStepAttempt()`, resulting in orphaned task_runs with no step data.

**Action:** Added `recordStepAttempt()` calls with `.catch(() => {})` at all 3 locations:
- `channelGateway.ts` ~line 195 (channel router override path)
- `channelGateway.ts` ~line 290 (direct agency conversation path)
- `webhookTriggers.ts` after agency execution in test trigger

**Status:** Applied, tests pass.

## Finding 2: Accuracy metric inflated by null recommendedModel (MEDIUM — Auto-fix)

**Issue:** In `plannerTelemetry.ts`, `getPlannerAccuracyReport()` treated rows where `recommendedModel` was null as a "match", inflating accuracy for agency runs (which use model: "agency" but have no planner recommendation).

**Before:**
```typescript
const isMatch = !recommendedModel || recommendedModel === row.effectiveModel;
```

**After:**
```typescript
if (!recommendedModel) continue; // Skip rows without planner recommendation
const isMatch = recommendedModel === row.effectiveModel;
```

**Status:** Applied, tests pass.

## Items Let Go

- No nitpick-level findings worth addressing.
