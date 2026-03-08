# Section 08 Code Review

## Findings

1. [HIGH] Race condition in drawFromReservation — non-atomic read-modify-write. Uses separate get()/set() instead of Lua script or WATCH/MULTI/EXEC.
2. [HIGH] reservation_id accepted by Python task but never forwarded to Node browser tool. Parent reservation pattern is dead code in execution path.
3. [HIGH] Credits silently lost when Redis is unavailable — deductCredits succeeds but reservation never stored, no refund possible.
4. [HIGH] No refundReservation call on successful execution. Unused credits permanently lost; only refunded on enqueue failure.
5. [HIGH] Redis TTL expiry does not trigger auto-refund. If key expires, PostgreSQL deduction is never reversed.
6. [MEDIUM] Missing crypto import — relies on globalThis.crypto (Node 19+). Could fail on older Node.
7. [MEDIUM] Frontend UI tests are vacuous — 5/6 only check module exports, no DOM rendering.
8. [MEDIUM] Budget input value not passed to execute mutation — purely cosmetic.
9. [MEDIUM] Mode toggle value not passed to analyze mutation — non-functional.
10. [MEDIUM] additionalDomains not sent to any backend call.
11. [MEDIUM] Cost estimate computed in status endpoint instead of analyze endpoint per plan.
12. [LOW] No domain validation on additionalDomains input.
13. [LOW] Citations rendered with user-controlled URLs without protocol validation.
14. [LOW] Type widening of currentStep may produce nonsensical output with string values.
15. [LOW] reservationId exposed in execute mutation return value.
