# D3.43 Bounded Recovery Plan

## Task classification

- Scope: medium (3 domains: canonical job receipt persistence, Spec 224 projection recovery, existing periodic reconciler; approximately 8 source/test/artifact files).
- Risk: high (tenant/session/fencing and durable terminal state).
- Route: direct conductor implementation in one isolated worktree; no delegated agents because none were requested and there is no independent writer boundary.
- Baseline: D3.42 checkpoint `f225ca0d61ccce27349e2a803ff52bcd879ede93`, implementation `ffc4638d27a1251b8cef7694305c80e01efe0a25`.
- Worktree/branch: `/home/dev/projects/SmartSpecPro-spec224-d343`, `codex/spec224-d343-durable-continuation`.
- Shared and Cloudflare worktrees remain read-only.

## Evidence ledger and actual transaction boundary

- Runner receipt is persisted by `recordRunnerReceipt` in a canonical `worker_job_events` transaction.
- For a normal external-agent receipt, the route then calls `completeExternal` or `failExternalWait` in a separate transaction, then sends the WSS ACK. A process can die between these operations.
- DevelopmentRun reconciliation is currently called only by explicit `reconcileAndContinueNextPhase` callers/tests; the existing periodic `runJobReconciler` does not scan Spec 224 continuation work.
- `createDevelopmentRunService.reconcile` locks the worker job row, reads canonical job status, and atomically writes the DevelopmentRun projection plus `SPEC224_*` event; its idempotency key is derived from canonical job/attempt/state.
- The safe recovery boundary is a durable continuation-intent `worker_job_events` record committed with the receipt, replayable canonical settlement, then idempotent DevelopmentRun reconciliation. No new queue/table is needed. Next-phase external dispatch remains behind its existing authorization/policy and outbox path; this reconciler does not dispatch a provider.

## Change boundaries

- Application owners: `jobControlPlane.ts`, `spec224DevelopmentRunPersistence.ts`, `jobReconciler.ts` / `unifiedJobControlPlaneReconcilerJob.ts`.
- Tests: focused control-plane and Spec 224 reconciliation tests plus a PostgreSQL 15.17 integration test with child-process restart/failure boundaries.
- No migration/schema changes planned. If current source proves a new persisted column is necessary, stop that write and leave an additive schema proposal; do not modify Cloudflare migration files.
- No provider, Rust Runner, production DB, shared checkout, secrets, or full regression.

## Planned state protocol

1. Validate receipt against tenant, attempt, lease/fence, command, Runner/session, persisted capability and policy binding.
2. Persist exact receipt and stable `SPEC224_CONTINUATION_PENDING` event in one DB transaction.
3. Existing Runner route performs idempotent terminal job settlement and then ACKs; retry or existing periodic reconciler can repeat settlement safely.
4. Existing periodic job reconciler claims pending continuation candidates from canonical events, rechecks row ownership/revision/attempt/fence and calls DevelopmentRun canonical reconcile.
5. DevelopmentRun projection and its `SPEC224_*` completion/decision event commit atomically. Duplicate/concurrent scans observe the same terminal worker job and idempotency operation; no second job/outbox/settlement is created.
6. Unknown outcome or invalid/stale binding becomes operator review; no blind re-dispatch.

## Ownership

Only this branch writes the listed application/test paths. Migration branch `codex/spec224-d336-cloudflare-compat` and `/tmp/SmartSpecPro-spec245-g3` remain read-only. Root instructions prohibit typecheck (`SKIPPED_POLICY`).
