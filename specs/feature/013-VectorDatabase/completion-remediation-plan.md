# Vector DB Completion Remediation Plan

Date: 2026-02-16  
Scope: Close all remaining gaps after sections 01-08 so the feature is production-complete.

Execution status (2026-02-16): Implemented.

## 1. Current Gap Summary

1. Node provider parity incomplete (`pgvector`/`chromadb` adapters are still unsupported stubs).
2. Cutover governance service exists but is not fully enforced through runtime admin switch flows.
3. Queue/worker delete payload path still fail-closed (`operation=delete` unsupported in worker payload execution path).
4. Gallery backfill campaign accounting exists but enqueue execution is still skipped.
5. Alert latency regression path uses placeholder values, not real telemetry.
6. Full-suite stability is not green (Node + Python broader suites include failures/import issues).
7. Finalization artifacts from deep-implement are incomplete:
   `implementation-security-review.md`, `implementation-summary.md`, and hardening decision flow.

## 2. Execution Strategy

Recommended sequence: resolve runtime correctness gaps first, then observability signal quality, then suite stabilization and finalization docs.

1. Phase A: Runtime correctness closure
2. Phase B: Cutover + telemetry production wiring
3. Phase C: Full-suite stabilization and CI quality gate
4. Phase D: Mandatory security re-review and implementation summary closeout

## 3. Detailed Plan

## Phase A: Runtime Correctness Closure

### A1. Node provider parity (`pgvector`, `chromadb`)
Objective: eliminate unsupported adapter behavior and make provider switching real.

Tasks:
1. Implement concrete `pgvector` adapter contract in `apps/web/server/services/vectorProvider.ts`:
   - `index`, `delete`, `search`
   - deterministic error mapping to `VectorProviderError`
2. Implement concrete `chromadb` adapter contract in same service (or dedicated provider module).
3. Replace env-only resolution fallback with effective settings loader that can consume persisted vectordb state.
4. Add adapter integration tests for non-cloudflare providers.

TDD checks:
1. `dispatchVectorOperation` succeeds for all three providers with mocked backends.
2. Provider switch changes effective read/write backend behavior deterministically.
3. Error classification remains stable (`transient`/`permanent`).

Done when:
1. No `index_not_supported`/`search_not_supported` returned for supported runtime configurations.
2. Multi-provider tests pass for `cloudflare_vectorize`, `pgvector`, `chromadb`.

### A2. Worker payload delete and gallery parity
Objective: make queue contract fully executable for index+delete and both domains.

Tasks:
1. Implement `operation=delete` path in `python-backend/app/services/library_indexing_service.py`.
2. Wire Celery/task boundary to pass `job_payload` consistently for all worker invocations.
3. Replace gallery campaign enqueue skip behavior with real enqueue path in `library_backfill_service.py`.
4. Add idempotency coverage for repeated delete jobs.

TDD checks:
1. Delete payload removes vectors/chunks deterministically.
2. Gallery backfill batches create queue jobs (not only `skipped` counters).
3. Resume/retry does not re-delete or double-enqueue unexpectedly.

Done when:
1. Delete payload no longer throws `delete_operation_not_supported_in_worker`.
2. Gallery campaigns can complete without persistent enqueue skip diagnostics.

## Phase B: Cutover + Telemetry Production Wiring

### B1. Runtime cutover enforcement
Objective: ensure admin switch operations always use cutover governance service.

Tasks:
1. Integrate `library_cutover_service` into admin/provider switch mutation flow.
2. Enforce non-emergency edit freeze during active cutover.
3. Ensure optimistic-lock conflicts surface user-facing retriable errors.
4. Ensure rollback automation is callable via control-plane trigger path.

TDD checks:
1. Switch request path fails when prechecks fail.
2. Concurrent stale update is rejected with conflict semantics.
3. Read provider only flips after readiness gate pass.

Done when:
1. No direct provider mutation bypasses governance service.
2. Runtime flow matches section-06 policy end-to-end.

### B2. Real telemetry for vector alerts
Objective: replace placeholder alert inputs with real runtime metrics.

Tasks:
1. Feed queue lag from real queue/job timestamps and backlog windows.
2. Feed failure-rate from rolling worker outcomes.
3. Feed search latency p95 and baseline from real telemetry source.
4. Keep owner/runbook metadata and alert dedupe semantics.

TDD checks:
1. Alert evaluator triggers only on genuine threshold breaches using live metric inputs.
2. `/api/admin/vectordb/health` returns real latency ratio values.

Done when:
1. No hardcoded latency placeholder in alert path.
2. Alert output is actionable for on-call with live values.

## Phase C: Full-Suite Stabilization and CI Gate

Objective: enforce production confidence beyond targeted tests.

Tasks:
1. Run and categorize failures into:
   - direct regressions introduced by recent vector work
   - pre-existing unrelated baseline failures
   - environment/sandbox-only failures
2. Fix all direct regressions first; document unrelated baseline debt separately.
3. Add/adjust fixtures where contract signatures changed (especially actor/tenant argument expectations).
4. Establish CI gate for vector scope:
   - required targeted suites
   - migration ordering checks
   - health endpoint contract tests

TDD checks:
1. Vector target suites are consistently green in CI.
2. No new failing tests attributable to vector feature branch work.

Done when:
1. Required quality gate is stable and repeatable in CI environment.

## Phase D: Security Re-Review and Finalization (Mandatory)

Objective: complete deep-implement closeout requirements.

Tasks:
1. Generate `implementation-security-review.md` with severity-grouped findings.
2. Trigger post-review decision (`plan_now`, `fix_now`, `defer`) and record choice.
3. Generate `implementation-summary.md` with:
   - section commits
   - residual risks
   - deferred items and rationale
4. If `plan_now`, create `implementation-hardening-plan.md`.
5. Update `implementation-progress.md` to resolve pending hash references and close run state.

Done when:
1. Finalization artifacts exist and reflect actual code status.
2. Hardening decision is explicitly recorded.

## 4. Commit Plan

Recommended commit split:

1. `fix(vectordb): implement pgvector/chromadb node adapters and provider-state resolution`
2. `fix(vectordb-worker): implement delete payload handling and gallery backfill enqueue parity`
3. `feat(vectordb-cutover): wire runtime admin switch flow to governance service`
4. `feat(vectordb-observability): replace placeholder alert metrics with live telemetry inputs`
5. `test(vectordb): stabilize affected suites and enforce vector CI gate`
6. `docs(vectordb): add security re-review, summary, and hardening artifacts`

## 5. Acceptance Checklist

Release readiness requires all items checked:

1. All three providers are executable in runtime read/write/search paths.
2. Delete + index queue payload contracts are both production-complete.
3. Gallery/library backfill parity is achieved.
4. Cutover governance is enforced by runtime API control path.
5. Alerting uses live telemetry and has on-call runbook ownership metadata.
6. Targeted and required regression suites are green.
7. Mandatory finalization docs are complete and consistent.
