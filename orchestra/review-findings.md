# Review Findings

## Feature 186 post-publish completeness audit — 2026-09-13

- Rounds 01-14 completed for the current workspace after the latest implementation/spec updates.
- Fixed additive outbox cancellation index migration, publisher cancellation race, adapter reference attempt validation, Node executor pre-side-effect lease assertion, Python `assert-active` parity, hard lease deadline capping, and Kie redirect/private-target/size guards.
- Fresh proof: Node focused control-plane suite 6 files / 35 tests passed; Python focused control-plane/media/Kie suite 85 tests passed with `--no-cov`; changed Python modules compile; Feature 186 verifier passed with additive migration; call-site inventory reports 53 intentionally unmigrated direct transport sites; config JSON and diff checks passed.
- TypeScript typecheck was intentionally skipped because the user identified the workspace RAM constraint. Production Cloudflare/Hyperdrive, live provider, deployment/restart, browser, and full legacy call-site migration remain explicit external or rollout gates; no claim of production cutover is made.
- No `.env`, archive, or oversized changed file is in the publication candidate set.

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

## Kie attachment boundary repeat audit — 2026-09-13

- 20 fresh review rounds completed; the detailed ledger is in `orchestra/kie-attachment-review-rounds.md`.
- Fixed the staged-reference raw-fallback path: failed conversion now fails closed before Kie submission.
- Fixed retry classification to use stable attachment error markers rather than configured-limit-dependent message text.
- Fixed the video transient-download classification bug and tightened private managed-path/redirect target checks.
- Focused proof passed: Python attachment/model/retry suites 81/81; Node staged/catalog/prompt suites 58/58; canonical provider Ruff, Python compilation, async compatibility import, and diff check passed.
- No unresolved MUST_FIX or MUST_DO_NOW Kie attachment finding remains in the reviewed scope.
- Explicit residual gates: existing `mediaGenerationService.test.ts` has 7/52 baseline failures; repository-wide `npm run check` and full legacy Ruff remain noisy. These were recorded, not masked by weakening tenant, format, or upload safety.
- Live Kie/provider behavior, deployment/restart, browser, and production recovery proof remain external authorization/deployment gates.
