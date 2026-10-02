# Spec 224 D3.45 — Runner Crash-Window Verification

## Candidate and boundary

- Worktree: `/home/dev/projects/SmartSpecPro-spec224-d345-crash-window`
- Branch: `codex/spec224-d345-crash-window`
- Base: `099f76919367608383ad276884e9601f3a8c65ee` (D3.44 checkpoint)
- Implementation/test commit: `6aa34bc0b8b9c51ef986afdbcdbb1ba8b30434f6`
- Scope: non-production PostgreSQL 15.17, registered local Rust Runner, deterministic local adapter. No live provider, production database, deployment, or Cloudflare migration files.
- Fresh baseline replay used `apps/web/drizzle.spec224-baseline.config.ts` and Drizzle's canonical `migrate` command.
- Database: dedicated `spec224_crash_test`, loopback-only host port `55445`, dedicated Docker network and volume. Migration and runtime roles were both verified `rolsuper=false`; runtime role had only the test grants needed by the integration fixture. Runtime credentials were local test-only and are not recorded here.

## Implemented

- `apps/runner-app/src/journal.rs`: bounded checksum-verified durable Runner receipt journal. Exact duplicate appends are idempotent; key reuse with changed kind/payload fails closed. Receipt envelopes are atomically persisted with restrictive file permissions and retained until accepted/applied/duplicate ACK; acknowledged records compact away.
- `apps/runner-app/src/diagnostics.rs`: all outbound Runner receipts persist before WSS send; pending receipts replay at live control-loop recovery before new commands are polled.
- `apps/runner-app/src/transport.rs`: debug-build-only lost-ACK failpoint, constrained to the deterministic certification adapter, terminal execution receipt, and loopback WSS endpoint. Release builds do not contain this failpoint.
- `apps/web/server/routes/runnerControl.ts`: test-only receipt-persisted and ACK-written boundaries are injectable only in `NODE_ENV=test`; ACK send now awaits the WebSocket send callback. Failpoints apply only to `EXECUTION_COMPLETED` receipts.
- `apps/web/server/services/jobControlPlane.ts`: exact previously persisted receipt replays return `duplicate` even after terminal settlement cleared `externalWait`. Reusing that event identity with a different payload is rejected and durably recorded as `RUNNER_RECEIPT_CONFLICT`; no settlement is repeated.
- `apps/web/server/services/__tests__/spec224RunnerCrashServer.ts` and `spec224RegisteredRunnerE2E.integration.test.ts`: separate WSS child process, deterministic failpoints, SIGKILL/restart, actual registered Rust Runner, PostgreSQL state assertions before/after recovery.
- `apps/web/server/services/__tests__/spec224PostgresIntegration.integration.test.ts`: DB regression assertions for exact duplicate after terminal settlement and conflicting payload audit.

## Failure-window evidence

| Case | Injected boundary | Persisted state at interruption | Recovery result |
|---|---|---|---|
| 1. Disconnect before ACK | WSS closes immediately after receipt+intent commit, before ACK | One terminal receipt, one continuation intent, one settlement | Runner restarts and replays exact receipt; duplicate ACK clears journal; no second settlement or transition |
| 2. ACK lost before local ACK commit | Debug Runner transport consumes but discards the terminal ACK at the client boundary | One terminal receipt, one intent, one settlement | Runner restarts and replays exact event; duplicate ACK clears journal; counts remain one |
| 3. SIGKILL after persist, before ACK | WSS child is SIGKILLed after `recordRunnerReceipt` transaction resolves | Before restart: job `waiting_external`, receipt=1, intent=1, settlement=0 | New WSS process reconciles canonical intent; Runner restart replays exact receipt; final settlement and DevelopmentRun transition each occur once |
| 4. SIGKILL after ACK, before DevelopmentRun continuation | WSS child is SIGKILLed after ACK write callback; Runner journal is observed empty | Before restart: job `succeeded`, receipt=1, intent=1, settlement=1, transition=0 | New WSS process runs canonical reconciler; one DevelopmentRun transition is persisted; no replayed receipt or duplicate settlement |

All cases asserted stable receipt/command correlation, persisted operation ID, exact receipt-to-intent event identity, one settlement, one DevelopmentRun transition, and idempotent reconciliation. Case 1/2 also asserts the Runner's on-disk pending receipt journal is empty only after the duplicate ACK. The DB-backed continuation suite covers stale lease/fence, tenant/session/capability mismatch, revoked Runner binding, and unknown external outcome -> operator review without blind retry.

## Verification results

- Fresh isolated schema replay: PASS, PostgreSQL 15.17, canonical Drizzle migration mechanism.
- Four actual registered Rust Runner + WSS/PostgreSQL crash E2E invocations: **4/4 passed** (one case per invocation; includes actual child-process SIGKILL in cases 3 and 4).
- `spec224RunnerContinuationPostgres.integration.test.ts`: **5 passed**.
- `jobControlPlane.test.ts` focused receipt/fence cases: **2 passed, 53 skipped by test-name filter**.
- `spec224PostgresIntegration.integration.test.ts` terminal duplicate/conflict case: **1 passed, 1 skipped by test-name filter**.
- Rust `journal::tests`: **4 passed**.
- Rust `persisted_receipt_replays_after_transport_loss_and_clears_only_after_duplicate_ack`: **1 passed**.
- Total focused tests passed: **17**; filtered tests skipped: **54**. No comprehensive/full regression was run.
- `cargo build --locked --offline --bin smartaihub-runner`: PASS.
- `rustfmt --edition 2021 --check` on the three changed Rust files: PASS.
- Prettier check on changed TypeScript files: PASS.
- `git diff --check`: PASS.
- TypeScript typecheck: `SKIPPED_POLICY` per repository instruction.

Focused commands (the disposable runtime URL is intentionally redacted):

```sh
SPEC224_BASELINE_DATABASE_URL=<isolated-migration-role-url> pnpm --filter @smartspec/web exec drizzle-kit migrate --config drizzle.spec224-baseline.config.ts
NODE_ENV=test RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<isolated-non-superuser-runtime-url> JWT_SECRET=<disposable-test-secret> SPEC224_RUNNER_CRASH_CASE={disconnect-before-ack|lost-ack-resend|sigkill-after-persist|sigkill-after-ack} FEATURE_186_HARD_CUTOVER=true pnpm --filter @smartspec/web exec vitest run server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts
NODE_ENV=test RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<isolated-non-superuser-runtime-url> JWT_SECRET=<disposable-test-secret> FEATURE_186_HARD_CUTOVER=true pnpm --filter @smartspec/web exec vitest run server/services/__tests__/spec224RunnerContinuationPostgres.integration.test.ts
NODE_ENV=test JWT_SECRET=<disposable-test-secret> pnpm --filter @smartspec/web exec vitest run server/services/__tests__/jobControlPlane.test.ts -t 'fences external-agent receipts to the persisted attempt, lease and fence|persists a stable Spec 224 continuation intent with a terminal Runner receipt'
NODE_ENV=test RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<isolated-non-superuser-runtime-url> JWT_SECRET=<disposable-test-secret> FEATURE_186_HARD_CUTOVER=true pnpm --filter @smartspec/web exec vitest run server/services/__tests__/spec224PostgresIntegration.integration.test.ts -t 'persists outbox, survives a fresh process, fences receipts, and settles once'
cargo build --locked --offline --bin smartaihub-runner
cargo test --locked --offline journal::tests -- --nocapture
cargo test --locked --offline persisted_receipt_replays_after_transport_loss -- --nocapture
rustfmt --edition 2021 --check src/journal.rs src/diagnostics.rs src/transport.rs
```

## Independent verification

- Independent reviewer: read-only clean-context review of exact implementation commit `6aa34bc0b8b9c51ef986afdbcdbb1ba8b30434f6` — **PASS** for source transaction/ACK ordering, durable spool/replay, terminal duplicate handling, conflicting receipt audit, test-only failpoint isolation, and child-process SIGKILL design; no concrete defect found.
- Reviewer independently reran focused Rust checks: **5/5 passed**.
- Reviewer-side PostgreSQL/WSS rerun: **BLOCKED** because that isolated reviewer environment did not receive the disposable `DATABASE_URL`; no credentials were accessed. The four PostgreSQL/WSS crash runs reported above are the Lead's actual test evidence against this exact code tree before its implementation commit.

## Findings and limits

- Confirmed defect: Runner completion receipts were previously sent from volatile process memory and were lost when WSS delivery/ACK failed or the Runner restarted. Added the durable local receipt spool and reconnect replay.
- Confirmed defect: a byte-identical terminal receipt replay could be classified `late` after `externalWait` was cleared; that prevented the Runner from clearing its local journal. Exact persisted duplicates now return `duplicate`; conflicting payloads remain rejected and audited.
- ACK-loss injection is at the Runner transport/application boundary after a real WSS ACK frame was read but before it is returned to receipt-journal settlement. It proves durable replay when the caller cannot commit the ACK; it does not simulate packet loss below the OS socket layer.
- SIGKILL cases target the isolated Node WSS process, and the recovery process reads PostgreSQL persisted state. No power-loss/filesystem durability, production scheduler rollout, paid provider, live runtime admission, P-SOURCE, P-RECOVERY, historical upgrade, or WP-RUNNER-06 certification is claimed.

## Gate assessment

- IMPLEMENTED: PASS for the scoped recovery and test code in this candidate.
- FOCUSED TESTED: PASS for the listed 17 tests and focused checks.
- LOCAL RUST RUNNER VERIFIED: PASS for the registered deterministic local Runner WSS flows only.
- CRASH WINDOWS VERIFIED: PASS for the four explicitly described process/network windows only.
- RUNTIME ADMISSION: BLOCKED; this test sandbox is not an admitted runtime.
- PRODUCTION CERTIFICATION: NOT CERTIFIED.
- P-RECOVERY: remains BLOCKED pending its independent runtime-admission and authorization evidence.
- P-SOURCE / historical upgrade: remain separate blockers.
- WP-RUNNER-06: remains dependency-blocked; D3.45 evidence does not change the DAG gate.

## Changed-file manifest

- `apps/runner-app/src/diagnostics.rs`
- `apps/runner-app/src/journal.rs`
- `apps/runner-app/src/transport.rs`
- `apps/web/server/routes/runnerControl.ts`
- `apps/web/server/services/jobControlPlane.ts`
- `apps/web/server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts`
- `apps/web/server/services/__tests__/spec224RunnerCrashServer.ts`
- `apps/web/server/services/__tests__/spec224PostgresIntegration.integration.test.ts`
- `orchestra/spec224-d345/report.md`
