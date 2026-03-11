# Section 02 Implementation Interview

## Issues Raised and Decisions

### Issue: `releaseConcurrentSlot` called without prior acquisition (LOW)

**Finding:** The error handler called `releaseConcurrentSlot(userId)` but the handler uses Redis SET NX (not the semaphore from `acquireConcurrentSlot`) for concurrency control. This would decrement the semaphore counter incorrectly.

**Decision:** Remove the spurious `releaseConcurrentSlot` call from the error handler. The SET NX lock is released via `redis.del(lockKey)` in the try/catch, which is the correct cleanup mechanism.

**Applied:** Yes — removed the orphaned `releaseConcurrentSlot` import and call.

### Issue: `origin` claim via type intersection cast (LOW)

**Finding:** `TokenClaims` doesn't have an `origin` field. The code uses a TypeScript intersection type but immediately casts it to `TokenClaims`. The claim is included at runtime by jwt.sign (which serializes all properties), so it works correctly.

**Decision:** Accept as-is. Adding `origin` to `TokenClaims` would require modifying the shared tokens interface which may affect other callers. The current pattern follows the same workaround used in `agencyStreamProxy.ts`. Runtime behavior is correct.

**Applied:** No change needed.

### Issue: Double `getDb()` call for slide count (LOW)

**Finding:** `getDb()` is called twice. Second call returns the same singleton.

**Decision:** Accept as-is. The singleton nature means no extra connections are opened. Extracting to a variable would require restructuring the try/catch scope. Harmless.

**Applied:** No change needed.
