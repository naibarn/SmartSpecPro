# Section 04 Follow-up Review — 2026-09-28

## Initial review findings

The independent review returned **BLOCK COMMIT** with three P1 findings and two P2 findings. The worktree is shared and contains unrelated changes, so no commit was made.

1. **P1 — orphan image claim after dispatch failure:** fixed by clearing the temporary source-row claim on failure and having the PostgreSQL-pull worker periodically select only rows with no provider or canonical job claim. Bounded user batches carry a cursor so later users are not starved by repeatedly failing earlier users. Regression tests verify claim reset and cursor advancement.
2. **P1 — Python worker flag mismatch:** fixed by rejecting Python job admission before calling the canonical `create` API when hard cutover is enabled but the PostgreSQL-pull worker flag is disabled. Tests cover both rejection and successful worker startup with both flags enabled.
3. **P1 — retryable poll could publish through Celery:** fixed by raising `HardTaskRetryRequested` in hard cutover. The unified worker classifies that as a retryable control-plane failure; Celery `self.retry` remains only on the non-cutover compatibility path.
4. **P2 — recovery documentation overstated delegation:** corrected. Claimed work stays with `worker_jobs`; recovery handles only unclaimed image source rows, reports dispatch failures as `partial` instead of a false success, and leaves failed source rows available to the next recovery attempt.
5. **P2 — startup/durable handoff proof was thin:** added positive startup and Python HTTP create-contract tests. The Node control-plane suite separately verifies duplicate creates produce one canonical job and one outbox intent. There is still no authenticated Python-to-Node-to-PostgreSQL deployment integration proof.

## Verification after fixes

- `DEBUG=false uv run pytest -q --no-cov --tb=short tests/tasks/test_kie_image_fair_queue.py tests/services/test_job_control_plane.py tests/services/test_postgres_job_worker.py tests/services/test_unified_job_task_external_wait.py` — 47 passed; one unrelated LangChain deprecation warning.
- `npm --workspace @smartspec/web exec vitest run server/services/__tests__/jobControlPlane.test.ts` — 54 passed.
- `npm --workspace @smartspec/web exec vitest run scripts/__tests__/cloudflare-migration-compiler.test.ts` — 15 passed.
- `git diff --check` — passed.

## Residual boundary

The local contracts are covered, but live PostgreSQL/outbox behavior, deployed flag parity, provider retries, and target host/runtime state remain unverified. Section 04 remains partial until current external evidence is supplied. This follow-up is a conductor code review; the initial findings came from the independent read-only reviewer.
