# Section-05 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** → all fixes applied (see interview file).

## Findings

1. **BLOCKER — non-atomic admission (check-then-act):** sliding window was
   zcard-then-zadd (two round-trips); DB running/queued counts were plain
   SELECTs with the insert happening later — concurrent submits could
   bypass running=1, queued caps, and rate windows entirely. FIXED: atomic
   Redis Lua script for windows + injectable `withAdmissionLock` seam
   whose default impl takes pg advisory transaction locks (connection +
   user keys) around re-checked counts + insertJob; concurrency test
   proves cap-exact admission (12 parallel → exactly 8).
2. **MAJOR — queued-cap weighting asymmetry:** baseline counted rows (1
   each) while incoming requests weighed outputCount (≤4) → ~2.5x
   overshoot. FIXED: weighted SUM(outputCount) baselines; test:
   outputCount:4 vs cap 8 admits exactly 2.
3. **MEDIUM — shared-pool auto-pick:** ignored assetType param + busy
   state; single-pass design turned that into avoidable hard rejections.
   FIXED: capability/asset filter + skip running>0.
4. **MEDIUM — idempotency after admission:** duplicate submits burned
   window/queue budget with no rollback. FIXED: dedupe before admission.
5. **MINOR — silent refund-failure swallow** on insert-failure path.
   FIXED: logger.error with reservationId/userId.
6. **NIT — getHermesConnectionAssignedWorkerId not tenant-scoped.**
   FIXED: tenantId param.

## Clean
Check order per spec §4.1; fee scoped server_shared+fee>0 after dedupe;
single-pass resolution with typed status mapping; claim gating continue-
not-throw with per-call cache + no-regression case; priority 25 < control
50; taskId format; limit-coherence hook tightly scoped; settings parsing
fails closed.
