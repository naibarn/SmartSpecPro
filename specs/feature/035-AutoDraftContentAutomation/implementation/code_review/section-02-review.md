# Section 02 Code Review

## Overall Assessment

Implementation is correct and well-structured. The handler follows the spec flow precisely: authenticate → validate → user verify → rate limit → skill resolve → canvas map → JWT mint → create deck → lock → await generateAIDraft → gather results → return. All 22 tests pass, no TypeScript errors.

---

## Issues Found

### LOW Severity

### 1. `db` Null Guard Duplicated for Slide Count Query
**File:** `apps/web/server/routers/autoDraftTool.ts`

`getDb()` is called twice — once for user verification and once for slide count after generation. The second call allocates another variable (`db2`) and checks for null again. Since `getDb()` is idempotent (returns the same singleton), this pattern is harmless but slightly redundant. Minor readability issue only.

### 2. `releaseConcurrentSlot` Called in Error Handler Without Prior Acquisition
**File:** `apps/web/server/routers/autoDraftTool.ts`

`releaseConcurrentSlot(userId)` is called in the catch block, but `acquireConcurrentSlot` is never called — the handler uses `ai_draft_lock:auto:{userId}` (Redis SET NX) as its concurrency control instead. Calling `releaseConcurrentSlot` on error will decrement the semaphore counter even though it was never incremented by this handler. This is a correctness issue: the counter could go negative over time.

**Fix:** Remove the `releaseConcurrentSlot(userId)` call from the error handler, or add `acquireConcurrentSlot` / `releaseConcurrentSlot` calls around the generation phase.

### 3. `TokenClaims & { origin: string }` Intersection Discarded via Cast
**File:** `apps/web/server/routers/autoDraftTool.ts`

The `origin` claim is set in a typed intersection object but immediately cast to `TokenClaims` before being passed to `signBearerToken`. This means the `origin` field is included in the JWT payload at runtime (jwt.sign passes all object properties), but TypeScript provides no compile-time guarantee that it persists through the cast. Functionally correct, but fragile — adding TokenClaims validation in `verifyBearerToken` would strip `origin`.

---

## Confirmed Correct

- Authentication pattern matches existing internal endpoints (index.ts:448 pattern)
- Separate lock key `ai_draft_lock:auto:{userId}` avoids collision with manual drafts
- Error message sanitization strips URLs and limits to 200 chars (matches presentation.ts:324 pattern)
- `signBearerToken` correctly called synchronously (not awaited)
- `auditLogger.log` correctly called synchronously (not awaited)
- `isDisabled` used instead of non-existent `status` column
- Canvas preset mapping delegates to `canvasPresetToSize` from shared types
