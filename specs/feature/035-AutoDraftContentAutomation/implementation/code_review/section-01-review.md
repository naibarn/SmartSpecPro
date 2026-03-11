# Section 01 Code Review

## Overall Assessment

The implementation correctly covers the core requirements, but has several issues ranging from a race condition in the rate limiter to missing test cases and a missing tRPC router registration.

---

## HIGH Severity

### 1. Race Condition in `acquireConcurrentSlot` — Not Atomic
**File:** `apps/web/server/services/contentAutomationRateLimit.ts`

The INCR + conditional DECR pattern is not atomic. Under concurrent load, two requests can both INCR to value 3 (the limit boundary), both see `count <= CONCURRENT_LIMIT`, and both return `{ allowed: true }`, granting 4 concurrent slots instead of 3. The spec says to use SETNX-based or sorted-set approach. Correct approach requires a Lua script or Redis transaction (MULTI/EXEC) to make the check-and-increment atomic.

### 2. `checkHourlyRate` Counts Blocked Requests Against the Limit
**File:** `apps/web/server/services/contentAutomationRateLimit.ts`

The function always calls `redis.incr(key)` before checking the limit. Every blocked request still increments the counter. A user at the 10/hour interactive limit who retries 100 times will see counter reach 110.

### 3. `checkDailyBatchLimit` Resets TTL on Every Call
**File:** `apps/web/server/services/contentAutomationRateLimit.ts`

The `expireat` call is made unconditionally on every invocation, not just when `count === 1`. If called just before midnight, the expiry could be set to a timestamp that is already in the past, causing Redis to immediately delete the key and reset the counter mid-day. Should mirror `checkHourlyRate`: only set the expiry when `count === 1`.

---

## MEDIUM Severity

### 4. `ScheduleDraftRequestSchema` Lacks Cross-Field Validation
**File:** `apps/web/shared/contentAutomation/types.ts`

`cron_expression` is required when `schedule_type` is "recurring", and `run_at` is required when `schedule_type` is "one_time". The implementation makes both fields entirely optional with no `.superRefine()` cross-field check.

### 5. Middleware Route Application Test is Missing
**File:** `apps/web/server/middleware/contentAutomationGate.test.ts`

The spec requires a test for: "middleware is applied to all 4 internal tool routes". This test is absent.

### 6. `releaseConcurrentSlot` Test Does Not Assert Floor-at-Zero
**File:** `apps/web/server/services/contentAutomationRateLimit.test.ts`

Test mocks `get` returning `"0"` but has no assertion that `redis.decr` was NOT called. Effectively a no-op test.

### 7. Missing Language Allowlist Validation
**File:** `apps/web/shared/contentAutomation/types.ts`

Spec says "rejects invalid language values (not in allowed list)" but `language` is `z.string().min(2).max(10).optional()` — no enum/allowlist constraint. Test for invalid language values is also missing.

---

## LOW Severity

### 8. `canvasPresetSchema` is Not Re-exported
**File:** `apps/web/shared/contentAutomation/types.ts`

Local `canvasPresetSchema` is not exported. Later sections may need to import it directly for their own validation.

### 9. `contentAutomationRoutes.ts` Placed in `routers/` Instead of `_core/`
**File:** `apps/web/server/routers/contentAutomationRoutes.ts`

Inconsistent with project convention: Express route registrar functions (`registerLLMRoutes`, `registerMCPRoutes`, `registerAgencyStreamRoutes`) all live in `server/_core/`. Should be moved to `server/_core/contentAutomationRoutes.ts`.

### 10. `resetIn` is Always Hardcoded to 3600
**File:** `apps/web/server/services/contentAutomationRateLimit.ts`

Should call `redis.ttl(key)` to return actual remaining TTL rather than always showing "retry in 1 hour".
