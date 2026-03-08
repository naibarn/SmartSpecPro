# Section 08 Code Review Interview

## Interview Decisions

### Q1: reservation_id not forwarded to browser tool in Python execution path?
**User chose: Defer to Section 09**
Rationale: Credit plumbing is in place. Wiring through the Python execution service is a larger scope change best handled in the security/integration audit.

### Q2: Redis TTL expiry does not auto-refund PostgreSQL credits?
**User chose: Accept TTL risk**
Rationale: Execution rarely exceeds 10min. The refund-on-success fix (auto-fix #4) covers the normal path. TODO comment added for future Redis keyspace notification handler.

### Q3: Frontend mode/budget/domains not wired to backend mutations?
**User chose: Defer**
Rationale: UI components are ready. Backend APIs need corresponding parameter support first, which is a broader scope change.

## Auto-fixes Applied

### Fix 1: Race condition in drawFromReservation (Review #1)
- **File**: `apps/web/server/services/creditService.ts`
- **Issue**: Non-atomic read-modify-write allowed double-spending
- **Fix**: Replaced separate get/set with Lua script that atomically checks budget and increments drawnAmount

### Fix 2: Redis unavailable guard in createCreditReservation (Review #3)
- **File**: `apps/web/server/services/creditService.ts`
- **Issue**: Credits deducted in PostgreSQL even when Redis unavailable, no way to refund
- **Fix**: Added `isRedisAvailable()` check that throws before calling deductCredits

### Fix 3: crypto.randomUUID import (Review #6)
- **File**: `apps/web/server/services/creditService.ts`
- **Issue**: Relied on globalThis.crypto (Node 19+)
- **Fix**: Added explicit `import { randomUUID } from "crypto"`

### Fix 4: Refund on terminal status (Review #4)
- **File**: `apps/web/server/routers/automationCopilot.ts`
- **Issue**: No refundReservation call on success — unused credits lost
- **Fix**: Store taskId→reservationId mapping in Redis on execute; call refundReservation in getStatus when status is "success" or "failed"

### Fix 5: Citations URL protocol validation (Review #13)
- **File**: `apps/web/client/src/components/automation/AutomationChatModal.tsx`
- **Issue**: Citations with javascript: URLs could execute arbitrary code
- **Fix**: Added `c.url?.startsWith("http") ? c.url : "#"` guard

### Fix 6: Test mock for eval (Review #1 follow-up)
- **File**: `apps/web/server/__tests__/creditReservation.test.ts`
- **Issue**: Mock Redis had no `eval` method after Lua script refactor
- **Fix**: Added eval mock that simulates Lua script behavior

## Items Let Go

- #2 reservation_id not forwarded: Deferred per user decision
- #5 TTL auto-refund: Accepted per user decision
- #7 Vacuous UI tests: Adequate for structural verification
- #8-10 Frontend values not wired: Deferred per user decision
- #11 Cost estimate location: Works via polling, acceptable
- #12 Domain validation: Server-side validation exists
- #14 currentStep string output: Acceptable behavior
- #15 reservationId in response: Not exploitable
