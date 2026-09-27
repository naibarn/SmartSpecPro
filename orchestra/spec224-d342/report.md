# Spec 224 D3.42 — Runner Preparation Report

## Result

Implemented the bounded receipt durability slice on isolated branch `codex/spec224-d342-runner-prep`, based on D3.41 checkpoint commit `3664d26d402b20d2ae777047b917bddede8bd6c4`. The slice uses existing `worker_jobs` and `worker_job_events`; it adds no queue, ledger, approval authority, schema, or migration. Status: `IMPLEMENTED_UNVERIFIED`.

## Runner contract/adapter changes

- Receipt ACK now follows canonical persistence. A failed DB write leaves the per-channel cursor unchanged so the Runner can retry.
- Exact replay is acknowledged only after persisted event identity, type, and payload match. Reuse of an event ID with changed content fails closed.
- Receipt ordering is serialized per job/command inside the existing transaction and compared with the latest persisted Runner event. Older sequence, same sequence under a different event ID, and events following a terminal receipt are rejected.
- Terminal command rejection is treated as terminal; exact terminal replay remains idempotent.
- Existing tenant, Runner/session, attempt, lease, and fencing checks remain in force. No real Runner process was launched.

## Focused evidence

Command from `apps/web`:

```sh
JWT_SECRET=spec224-d342-test-jwt-secret-32-chars-minimum pnpm exec vitest run server/services/__tests__/runnerJobCommandContracts.test.ts server/services/__tests__/jobControlPlane.test.ts server/routes/__tests__/runnerControl.test.ts server/services/__tests__/externalAgentRunnerDispatcher.test.ts server/services/__tests__/spec224DevelopmentRunIntegration.test.ts
```

Result: 5 test files passed, 84 tests passed, exit code 0. `git diff --check` passed. Frozen dependency installation used pnpm 10.4.1 with `--frozen-lockfile --filter @smartspec/web... --ignore-scripts`; lockfile was unchanged and no install hooks ran. TypeScript typecheck is `SKIPPED_POLICY` per `AGENTS.md`.

Not run: PostgreSQL integration/concurrency/restart tests, Rust Runner process, Runner E2E, paid/live provider, full regression, or production paths. No safe host-accessible disposable DB endpoint was available; host port 5432 is occupied by the existing service and the D3.41 test container publishes no host port. No claim of DB/runtime certification is made.

## Cloudflare migration compatibility (read-only)

- D336 compatibility candidate: `codex/spec224-d336-cloudflare-compat` at `1525a661b370b651fc8982c2ed523324f9baf82a`.
- Spec 245 candidate: `/tmp/SmartSpecPro-spec245-g3`, branch `codex/spec245-g3-replacements`, commit `f8f47282b7a852a66d46d0cdacf85daf6339f5c3`; it is not descended from the D336 candidate.
- Dependency conflict: Spec 245 candidate changes package manager from pnpm 10.4.1 to npm 10.9.8, removes root pnpm patches/overrides, changes the Wouter range and moves patch configuration into `apps/web`, and materially rewrites `pnpm-lock.yaml` (about 2,952 changed lines). Do not promote either lockfile without owner-coordinated integration.
- Migration conflict: the D3.41 fresh baseline creates `revoked_token_jtis`, and migration 0345 also creates that table. D336's 0345 adds lock/statement timeout settings and journal history continues through 0352. The fresh-baseline and historical migration journals therefore need a coordinated, explicit integration strategy before either chain is promoted. No migration was changed here.

## Remaining gates

- WP-DB-05: not certified; supported historical upgrade baseline remains unproven, no canonical funded-account path/test funding evidence is included in this slice, post-capture refund/reversal policy remains unapproved, and runtime admission is absent.
- WP-RUNNER-06: not READY/VERIFIED. This slice covers local receipt contracts only. Actual registered Runner, DB-backed restart/reconciliation, and source/runtime admission prerequisites remain.
- P-SOURCE and P-RECOVERY: BLOCKED.
- Deferred recovery issue: semantic-handshake receipt persistence and follow-up continuation are not atomic; a process crash between durable receipt/ACK and continuation needs an existing-authority reconciliation hook.

## Changed files

Application and focused tests:

- `apps/web/server/routes/runnerControl.ts`
- `apps/web/server/services/runnerJobCommandContracts.ts`
- `apps/web/server/services/jobControlPlane.ts`
- `apps/web/server/services/__tests__/runnerJobCommandContracts.test.ts`
- `apps/web/server/services/__tests__/jobControlPlane.test.ts`
- `apps/web/server/services/__tests__/spec224DevelopmentRunIntegration.test.ts`

Orchestra evidence: `plan.md`, `test-design.md`, `lifecycle.md`, `progress.md`, `review-findings.md`, `report.md` under `orchestra/spec224-d342/`.

## Next executable package

WP-RECOVERY-SEMANTIC-CONTINUATION-01: persist/reconcile the semantic-handshake continuation using the existing canonical job/outbox authority, then prove it with a disposable PostgreSQL restart/failure-injection test. Keep actual Runner/provider execution and WP-RUNNER-06 admission as separate gates.
