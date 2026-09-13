# Feature 186 implementation review — rounds 01–10

Each round compared the implemented paths with the corresponding Feature 186 contract. Defects found in a round were patched before the next round.

1. Persistence/migration: added additive columns/tables, deterministic legacy event sequencing, legacy event idempotency keys, initial attempt snapshots, and rerun-safe backfill command parsing.
2. Canonical lifecycle: preserved `worker_jobs.id` as identity, added guarded claim/start/heartbeat/progress/complete/fail paths, and added external-wait resume.
3. Retry/timeout: centralized attempt increment, policy-based backoff/error allowlist/deadline, retry attempt/outbox creation, fenced hard-timeout terminalization, and lease-expiry recovery.
4. Outbox: added request/attempt/failure events, publisher lease/fencing, bounded retry/quarantine, stable dedupe, and dispatch reference persistence.
5. Transport adapters: BullMQ duplicate lookup, Celery canonical payload, and in-memory queue/workflow/container convergence tests.
6. Reconciliation: added bounded PostgreSQL-first sweeps for expired leases, due retries, and pending outbox work; startup hook is feature-flagged and has shutdown cleanup.
7. Scheduling: added deterministic schedule intent, tenant check, schedule-occurrence uniqueness, and schedule-derived idempotency key.
8. Security/admin: added internal-token-protected executor routes, runtime payload bounds, admin-scoped monitor/timeline/action routes, redaction, and operator action idempotency keys.
9. Python/Celery compatibility: added lease field mapping, canonical-only client payloads, thin executor registry, and fail-closed unknown exception classification.
10. Operations/proof: added dry-run-first backfill, additive migration verifier, call-site inventory, rollout manifest, recovery runbook, focused tests, and explicit Cloudflare production-proof boundary.
11. Local data execution: verified the localhost target, applied the job definition/event backfill, and checked zero missing hashes/sequences/keys plus zero duplicate sequences/attempts.
12. Final regression: reran all Feature 186 focused tests, route compatibility tests, migration verifier, section checker, journal JSON validation, and changed-path typecheck filtering.

## Intentional gates remaining after the review

- Existing direct queue call sites remain listed in the inventory; no queue family was silently cut over. The active side-effecting adapter remains `legacy` until a wave manifest and production evidence approve it.
- The live database migration/backfill is not run by the code review itself. It requires verifying the local target, backup/restore point, migration journal, and an approved maintenance window; the command defaults to dry-run.
- Cloudflare account/deployment behavior is not claimed by local fake-adapter tests.
- Repository-wide TypeScript and Python test commands retain unrelated baseline/environment failures; changed-path focused proof is reported separately.
