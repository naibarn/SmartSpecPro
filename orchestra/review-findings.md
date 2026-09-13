# Review Findings

## Feature 186 implementation convergence — 2026-09-12

- Rounds 01-10 completed across persistence, identity, lifecycle, lease, retry, outbox, adapters, scheduler, security/admin, migration/data, and operations.
- Material findings were fixed in scoped implementation files; no unresolved MUST_FIX or MUST_DO_NOW finding remains.
- Rounds 11-12 were clean consecutive rounds after the final code/schema changes.
- Fresh gates: 8 Feature 186 test files / 31 tests passed; migration runner applied/no-op succeeded; migration verifier passed; Python compile passed; audit found 53 intentionally legacy direct transport call sites; journal JSON and diff checks passed.
- Final local DB snapshot: zero missing definition hashes, zero missing event sequence/idempotency keys, zero duplicate event sequences, zero duplicate attempts, zero pending outbox rows; migration hashes for 0304 and 0303 matched.
- Deferred by explicit scope: adapter-by-adapter migration of legacy call sites and production Cloudflare proof.

## Feature 186 implementation audit rerun — 2026-09-12

- 22 fresh review rounds completed against the current workspace; detailed ledger is in `specs/feature/186-unified-job-control-plane-adapters/reviews/implementation-review-rounds-rerun.md`.
- Fixed timeout persistence by adding `worker_jobs.timeoutPolicyJson` in additive migration 0305 and materializing `worker_jobs.startedAt` during STARTED.
- Added idempotent cooperative soft-timeout requests and reconciler accounting, plus deterministic bounded retry jitter and audited delay metadata.
- Found and disabled the legacy fleet cleanup deletion of `worker_job_events`; canonical lifecycle history is now protected from in-place deletion.
- Final local snapshot: 507 jobs, 7,262 events, 502 attempts, zero pending/unquarantined outbox rows, zero orphan companion rows, zero missing hashes/policies, and zero duplicate event sequences.
- Focused proof: 8 files / 34 tests passed; `db:migrate`, `verify:feature-186`, dry-run backfill, static call-site inventory, and Python compile passed.
- Remaining explicit gates: 53 legacy direct transport call sites, adapter registry/cutover, full repository typecheck, Python pytest dependency, and production Cloudflare proof.
