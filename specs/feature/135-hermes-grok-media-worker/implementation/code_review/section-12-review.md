# Section-12 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** (2 MAJOR + 2 MEDIUM + 1 MINOR) → all fixed.

## Findings
1. **MAJOR — load test vacuous:** core quota-under-parallelism scenario
   asserted `>=0 && <=20` (always true) while claiming to prove the
   lost-update invariant. FIXED: real per-decision invariant + a permanent
   mutation check (non-atomic fake ⇒ test fails, proven).
2. **MAJOR — usage exactly-once fails open on a routine path:** Redis SET NX
   error handler returns "proceed", and the sweep re-processed every job
   (poll path never wrote the settled marker) → duplicate usage row + double
   quota bump on ordinary jobs after any Redis hiccup. FIXED: poll path
   writes the marker (sweep becomes a true backstop) + durable
   worker_job_events usage marker checked before Redis/insert.
3. **MEDIUM — dual traceId** (contract vs audit, same name, different
   values; contract one write-only). FIXED: scheduler reuses the contract
   traceId for the audit chain.
4. **MEDIUM — provider-side revocation unaudited** (reauth_required /
   connect-failure branches emitted nothing; only admin-disable did). FIXED:
   new hermes_connection_reauth_required event on both branches.
5. **MINOR — comments misdescribed the sweep** as lease-expiry-only. FIXED.

## Clean
Audit metadata ids-only (token-leak guard scans hermesWorker/** + hermes*
services + router with a named allowlist for the one legal device-code sink);
hermes-only audit enrichment guard; single buildHermesQuotaKey shared by
writer and reader; xai-hermes provider row find-or-create, cached,
hasApiKey:false + isEnabled:false (never routable); usage failure
awaited-and-swallowed (cannot un-complete a job); admin panel read-only with
zero mutation hooks + adminProcedure gate; runbook contains the flag-flip
order, load verification w/ owner, and the phase-4 gate.
