# Section 01 Code Review Interview

## Interview Decisions

### Race Condition in `acquireConcurrentSlot`
**Decision:** Fix with Lua script (atomic check-and-increment)
**Action:** Auto-fix

### Cross-field validation for `ScheduleDraftRequestSchema`
**Decision:** Add `.superRefine()` validation
**Action:** Auto-fix

### Language field allowlist
**Decision:** Keep as `z.string().min(2).max(10)` — flexible, handlers validate downstream
**Action:** No change

## Auto-fixes (without user input)

### Fix 1: `checkDailyBatchLimit` — only set expireat when count === 1
**Rationale:** Prevents midnight boundary bug; mirrors pattern used in checkHourlyRate

### Fix 2: Export `canvasPresetSchema` from types.ts
**Rationale:** Later sections may need it

### Fix 3: Add assertion to `releaseConcurrentSlot` floor-at-zero test
**Rationale:** Test was a no-op without assertion

## Summary of All Changes to Apply
1. Atomic Lua script for `acquireConcurrentSlot`
2. `.superRefine()` cross-field validation on `ScheduleDraftRequestSchema`
3. `expireat` only on `count === 1` in `checkDailyBatchLimit`
4. Export `canvasPresetSchema`
5. Fix the no-op test for `releaseConcurrentSlot`
