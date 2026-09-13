# Section 05 — Runtime, Scheduler, and Reconciler

## Goal

Connect worker execution and scheduled intent creation to the central contract without moving business lifecycle ownership into runtimes.

## Files

- Add `apps/web/server/services/jobExecutor.ts`, `jobReporter.ts`, `jobReconciler.ts`, and `apps/web/server/jobs/jobReconcilerJob.ts`.
- Add scheduler/worker route compatibility helpers where existing route contracts permit.
- Add focused runtime/reconciler tests.

## Requirements

Executor claims canonical IDs and reports with complete `LeaseContext`. External wait releases the active execution lease and callback/poll reacquires a fenced lease. Reconciler handles expired leases, missing dispatch evidence, due retries, provider timeout/ambiguity, unresolved settlement, and duplicate schedule occurrences in bounded tenant-aware sweeps. Beat/Cron helpers validate tenant, schedule version/timezone/window/missed policy and only create job intents.

## TDD acceptance

Test worker crash/event-loop stall, stale callback, provider ambiguity, lease release/reacquisition, bounded reconciliation, duplicate/mismatch schedule occurrences, timezone/DST, and missed-occurrence policy.
