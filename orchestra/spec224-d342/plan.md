# D3.42 Bounded Implementation Plan

## Goal and scope

Prepare the Spec 224 → Feature 195 Runner receipt boundary without starting the Rust Runner process or any live/paid provider. Scope is one correctness slice in the existing `worker_jobs` / `worker_job_events` authority, plus a read-only Cloudflare compatibility handoff.

Scope/risk: medium / high (durable execution receipt, idempotency and fencing).

## Verified starting point

- Branch `codex/spec224-d342-runner-prep`, created from D3.41 checkpoint `3664d26d402b20d2ae777047b917bddede8bd6c4`.
- D3.41 checkpoint reports approval continuation PostgreSQL E2E 1/1, Economic PostgreSQL 7/7, Node focused 62/62, Drizzle check PASS. These are historical D3.41 evidence, not D3.42 evidence.
- Current source already has typed `RunnerJobCommand`/`RunnerJobReceipt`, Runner WSS, `recordRunnerReceipt`, and external-agent lease/attempt/fence validation.
- Concrete gap: WSS receipt sequence state is mutated in memory before durable recording; persistence failure can make retry appear duplicate. Durable idempotency also returns duplicate for an event key without checking that the existing persisted event has identical event type and receipt content.
- D3.41 fresh profile defines `revoked_token_jtis`; Cloudflare candidate migration 0345 also creates it. This remains an integration conflict, not an authorized migration edit.

## Bounded work package

WP-RUNNER-RECEIPT-ACK-01 — Make durable `worker_job_events` persistence the ACK/idempotency gate for receipts; reject conflicting replay under a previously used event identity; only advance the per-channel optimization state after persistence confirms recorded/duplicate. Preserve current command, attempt, tenant, Runner session, lease and fencing guards.

Owned paths:
- `apps/web/server/services/runnerJobCommandContracts.ts`
- `apps/web/server/routes/runnerControl.ts`
- `apps/web/server/services/jobControlPlane.ts`
- Existing focused tests directly covering these services/routes.
- `apps/web/server/services/__tests__/spec224DevelopmentRunIntegration.test.ts`
- `orchestra/spec224-d342/**`

No schema, migration, Spec 224, Cloudflare, lockfile, production, Runner-process or provider changes.

## Test design

See `test-design.md`. Use focused Vitest; PostgreSQL integration only if the disposable D3.41 database is demonstrably available. Do not run registered Rust Runner E2E or full regression.

## Cloudflare compatibility boundary

Read-only candidate: `codex/spec224-d336-cloudflare-compat` at `1525a661b370b651fc8982c2ed523324f9baf82a`. Migration 0345 overlaps the isolated fresh baseline's `revoked_token_jtis`; the D336 candidate also differs in migration timeout statements and contains journal entries through 0352. No promotion or edits to that branch.

## Deferred gates

No real Rust Runner process, provider, process-kill/restart, production scheduler, historical database upgrade, live migration, production deployment, P-SOURCE, P-RECOVERY, WP-DB-05 certification or WP-RUNNER-06 certification is established here. TypeScript typecheck remains `SKIPPED_POLICY`.
