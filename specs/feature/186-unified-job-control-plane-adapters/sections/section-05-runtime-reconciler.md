# Section 05 — Runtime, Scheduler, and Reconciler

## Goal

Connect worker execution and scheduled intent creation to the central contract without moving business lifecycle ownership into runtimes.

## Files

- Add `apps/web/server/services/jobExecutor.ts` and `jobReporter.ts`; extend `jobReconciler.ts` and the existing `apps/web/server/jobs/unifiedJobControlPlaneReconcilerJob.ts` entry point.
- Add scheduler/worker route compatibility helpers where existing route contracts permit.
- Add focused runtime/reconciler tests.

The executor/reporter ports are thin wrappers around the control-plane service.
Runtime startup must register a real adapter map before enabling
`FEATURE_186_RECONCILER`; foundation-only startup intentionally leaves
publication disabled when no adapter resolver is supplied.

## Requirements

Executor claims canonical IDs and reports with complete `LeaseContext`. Persist a deterministic provider operation key before the first external submission and reuse it for the same logical operation; if inspection is unavailable after an ambiguous result, fail closed to operator review. External wait releases the active execution lease and callback/poll reacquires a fenced lease. Reconciler runs on a configurable 1–5 minute cadence subject to capacity and handles expired leases, missing dispatch evidence, due retries, soft-timeout requests, hard deadlines, provider timeout/ambiguity, unresolved settlement, and duplicate schedule occurrences in bounded tenant-aware sweeps. Beat/Cron helpers validate tenant, schedule version/timezone/window/missed policy and only create job intents.

## TDD acceptance

Test worker crash/event-loop stall, stale callback, provider ambiguity, lease release/reacquisition, bounded reconciliation, duplicate/mismatch schedule occurrences, timezone/DST, and missed-occurrence policy.
