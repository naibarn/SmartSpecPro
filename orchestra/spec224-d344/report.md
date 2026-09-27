# Spec 224 D3.44 — Local Runner ACK Integration

## Candidate

- Worktree: `/home/dev/projects/SmartSpecPro-spec224-d344-ack`
- Branch: `codex/spec224-d344-ack-verification`
- Base: D3.43 implementation `d345807d9c6a4175d7db0c1c1d40b7b2a15aebde`
- Scope: local non-production PostgreSQL 15.17 and registered Rust Runner; no paid provider or production credentials.
- Status: implementation candidate; `WP-RUNNER-06` remains dependency-blocked, and P-SOURCE/P-RECOVERY remain blocked.

## Independent review and fixes

The first independent review of D3.43 found a lock-key mismatch: receipt processing serialized by command ID while settlement/reconciliation serialized by external operation key. It also found that the continuation intent parser did not validate persisted lease/fence fields, and that capability snapshot lookup compared a semantic ID to the database row UUID.

D3.44 changes receipt serialization to use the canonical external operation key and re-reads/revalidates the job after acquiring the lock. Continuation intents now require typed lease/fence values; snapshot authorization uses the semantic ID stored in the snapshot JSON. The Rust Runner includes attempt, lease, fence and semantic capability snapshot binding on all receipts. The PostgreSQL fixture now writes snapshot JSON as a JSON object (not a JSON-encoded scalar string).

## Actual verification

- Focused Vitest: 4 files, 89 tests passed, 0 failed; included PostgreSQL-backed continuation tests using disposable PostgreSQL 15.17 and a non-superuser runtime role.
- Registered Rust Runner WebSocket E2E: 1 test passed. It created a DevelopmentRun, dispatched through canonical worker job/outbox path, received the real local Rust Runner receipt/ACK, persisted settlement, reconciled DevelopmentRun to PLANNING once, and verified duplicate reconciliation does not repeat continuation.
- Rust focused unit test: 1 passed (`semantic_completion_receipt_carries_only_bounded_verification_intent`).
- Rust Runner binary built offline with locked dependencies before E2E.
- Prettier check: passed for all touched TypeScript files.
- `git diff --check`: passed.
- TypeScript typecheck: not run (`SKIPPED_POLICY`).
- `cargo fmt --check` was attempted but reports pre-existing formatting differences in untouched `apps/runner-app/src/adapters.rs` and other baseline sections. No broad Rust formatting was applied; the touched assertion was formatted locally.

## Fault coverage and boundaries

PostgreSQL tests cover durable receipt/intent/settlement state, fresh-process reconciliation, concurrent reconcilers, duplicate receipt, stale/revoked/mismatched authorization cases, unknown outcome handling, and process-boundary recovery cases represented by the tests. The actual registered Runner E2E covers the successful WebSocket receipt/ACK path and continuation.

The live Rust Runner WebSocket path was not separately failure-injected for disconnect-before-ACK, SIGKILL at each requested ACK boundary, or lost-ACK redelivery. Those remain deferred. No paid/live provider was invoked. Local deterministic adapter and disposable DB evidence are not runtime admission, P-SOURCE/P-RECOVERY, WP-RUNNER-06, historical upgrade, or production certification.

## Changed files

- `apps/web/server/services/jobControlPlane.ts`
- `apps/web/server/services/spec224RunnerContinuationReconciler.ts`
- `apps/web/server/services/__tests__/jobControlPlane.test.ts`
- `apps/web/server/services/__tests__/spec224RunnerContinuationPostgres.integration.test.ts`
- `apps/web/server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts`
- `apps/runner-app/src/diagnostics.rs`
- `orchestra/spec224-d344/report.md`

Next: run exact-candidate independent review after commit; retain separate live admission and WebSocket crash-injection obligations.
