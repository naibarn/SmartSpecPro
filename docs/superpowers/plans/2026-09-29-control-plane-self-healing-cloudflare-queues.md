# Control Plane Self-Healing and Cloudflare Queues Implementation Plan

**Goal:** Prevent background work from waiting silently, shorten retry exhaustion to workload-appropriate deadlines, and migrate canonical job delivery to Cloudflare Queues with PostgreSQL remaining the sole job authority.

**Architecture:** Keep Feature 186/195 `worker_jobs` and its transactional outbox as the only durable job state. Add independent worker-runtime health evidence and actionable alerts, enforce bounded per-workload retry/deadline policy, then connect the outbox to Cloudflare Queues and the consumer to the existing PostgreSQL database through Hyperdrive and the approved private-network tunnel. Promote transport by family only after duplicate, outage, timeout, and rollback evidence passes.

**Tech Stack:** Python 3.13, FastAPI/SQLAlchemy, PostgreSQL, Node/TypeScript/Drizzle, Cloudflare Workers, Queues, Hyperdrive, Wrangler, systemd.

**Spec:** `specs/feature/245-Full-System Cloudflare Migration Master Plan/spec.md`; `specs/feature/257-cloudflare-admin-control-plane-and-redisless-readiness/spec.md`; queue mechanics must also conform to `specs/feature/232-Zero-Downtime RedisBullMQ to Cloudflare Migration & Runtime Hardening/spec.md`.

## Global Constraints

- PostgreSQL `worker_jobs` and its transactional outbox remain canonical; Cloudflare Queue is transport only.
- Preserve unrelated dirty worktree changes; edit only listed files and explicitly inspect existing diffs before touching overlapping files.
- Do not put provider/network calls inside a PostgreSQL transaction; use fresh reads for job identity, status, fencing, and leases.
- Do not automatically replay an ambiguous paid/provider operation without idempotency or reconciled provider evidence.
- No production cutover claim without real Cloudflare binding, Hyperdrive/Tunnel, queue/DLQ, synthetic-job, and rollback evidence.
- Do not run repository TypeScript typecheck; verify only focused package checks/tests explicitly listed below.

## Review Focus

- A worker's process is alive while its control-plane polling is failing; alerting must detect this separately from process liveness.
- Jobs in `retry_scheduled` can remain nonterminal despite short execution timeouts; the end-to-end retry deadline must be bounded and visible.
- Duplicate Cloudflare Queue deliveries and a lost publish response must not cause duplicate provider charges or conflicting settlements.
- Hyperdrive transaction pooling and unsupported session features must not invalidate lease, tenant, idempotency, or RLS behavior.
- A control-plane/database outage must not be turned into a poison-message quarantine or silently acknowledged Queue message.

---

### Task 1: Bound retry and phase deadlines by workload

**Files:**
- Modify `python-backend/app/core/job_task_registry.py`
- Modify `python-backend/app/services/job_control_plane.py`
- Modify `python-backend/tests/services/test_job_control_plane.py`
- Add/update focused task-registry tests under `python-backend/tests/`

**Interfaces:** Preserve `dispatch_python_task(...) -> TaskDispatchRef` and the existing `retryPolicy` contract consumed by `worker_jobs`. Explicit task deadlines remain supported up to a hard 2-hour cap; provider waits use separate provider deadlines.

- [x] Add failing tests showing ordinary Python deadlines are 10 minutes, video jobs are 60 minutes, image retries are 10 minutes, and legacy 24-hour policy is rejected.
- [x] Run the focused tests and confirm the expected prior-policy failures.
- [x] Set Python/skill and image retry windows to 10 minutes and video retry windows to 60 minutes; keep external provider wait deadlines separate from worker retry deadlines.
- [x] Re-run focused tests; verify legacy tasks without explicit policy cannot regain a 24-hour default.
- [x] Preserve task-specific fixed deadlines only when they fit the Admin-configured per-family cap.

### Task 1a: Admin policy and load-aware recommendations

**Files:**
- Add canonical queue deadline policy service backed by `system_settings` (operational configuration only; never another job ledger).
- Add admin-only read/update endpoints and a focused policy panel in the existing queue dashboard.
- Add queue health telemetry for current queued/active concurrency and users, rolling average/p95 queue-wait, worker-execution, and end-to-end job durations by family.
- Keep bounded defaults: Python/skill 10m, image 10m, video 60m. Admin may raise each family cap within global hard limits.

**Policy:**
- Compute live queue wait separately from retry exhaustion and execution timeout. Async provider waiting has its own deadline and is excluded from worker lease/runtime statistics.
- Provide an adaptive recommendation using live eligible backlog, available workers/concurrency, and recent p50/p95. Clamp effective thresholds to the Admin-configured hard cap; when telemetry is sparse, fall back to static defaults and report low confidence.
- LLM may summarize anomalies and suggest an adjustment from redacted aggregate metrics, but cannot write or activate a policy.
- Policy changes affect newly admitted jobs. Existing jobs retain their persisted policy so retries remain idempotent and reproducible.
- [x] Add bounded settings validation, admin-only read/update endpoints, per-family load metrics/recommendations, and an inline Admin queue policy panel.
- [x] Apply the adaptive policy when canonical jobs are admitted; fixed task deadlines may only be lowered to the family cap.
- [x] Keep policy/metric DB failures fail-soft to bounded defaults and show degraded telemetry in Admin.
- [x] Verify policy thresholds/recommendations and canonical create behavior with focused tests.

### Task 2: Make worker-control-plane loss observable and actionable

**Files:**
- Add a small durable worker-runtime health table/schema and migration, unless the source/schema audit finds an existing operational-health table with the same semantics.
- Modify `python-backend/app/workers/postgres_job_worker.py` and add `python-backend/app/services/` health writer.
- Modify `apps/web/server/services/queueHealthMonitor.ts` and its tests.
- Modify the admin queue health/ops alert path only where needed to surface the health condition.

**Interfaces:** Health records identify runtime and instance, last successful ready poll, consecutive failures, last safe error code, current phase, and observation time. They contain no credentials or job payload. They are operational telemetry, never job state.

- [ ] Add failing tests for repeated ready-endpoint failure, recovery after a successful poll, stale heartbeat, and backlog with an unavailable Python consumer.
- [ ] Verify a worker can report a control-plane failure through a path independent of the failing HTTP ready endpoint while PostgreSQL is reachable; keep structured journald logging as the fallback when PostgreSQL is unavailable.
- [ ] Emit one immediate degraded transition and rate-limited follow-up/escalation records, including safe error codes and last success time; avoid one log/alert per polling second.
- [ ] Surface critical health in the existing admin queue monitor and Ops alert/notification pipeline within 60 seconds; recover/resolve the alert when polling succeeds.
- [ ] Run only focused Python and queue-monitor tests.

### Task 3: Make queue wait, execution, lease, and provider-wait deadlines distinct

**Files:**
- Modify `apps/web/server/services/jobControlPlane.ts`, `apps/web/server/services/jobReconciler.ts`, and the relevant timeout policy tests.
- Modify `apps/web/server/services/queueHealthMonitor.ts` if age thresholds are needed for queue-wait alerts.

**Interfaces:** Keep persisted `timeoutPolicyJson`, `retryPolicyJson`, `leaseExpiresAt`, provider deadlines, and terminal statuses compatible. External provider waits retain provider-specific deadlines and are not treated as worker-queue wait.

- [ ] Add tests for queued/outbox age breach, stale heartbeat/lease, active progress, and provider-wait status so each chooses the correct recovery action.
- [ ] Keep recovery idempotent and fenced: expired safe-to-retry work becomes retryable; ambiguous provider work goes to explicit operator review; terminal work is projected back to its user-visible task state.
- [ ] Set and document explicit thresholds per lifecycle phase; ensure no ordinary Python retry path uses a 24-hour deadline.
- [ ] Verify the reconciler exposes counts/outcomes for resumed, retried, expired, quarantined, and operator-review jobs.

### Task 4: Complete Cloudflare Queue publication and consumer bindings

**Files:**
- Modify `apps/cloudflare/src/index.ts`, `queueConsumer.ts`, `contracts.ts`, and focused tests.
- Modify `apps/cloudflare/wrangler.jsonc` and deployment-safe production template to define Queue consumer, retry, DLQ, and cron shape without embedding production IDs or secrets.
- Modify `apps/web/server/services/feature186RuntimeAdapter.ts` / outbox retry policy only after idempotency behavior is proven.

**Interfaces:** Reuse the versioned Feature 186 envelope and existing outbox dispatch identity. Cloudflare delivery remains at-least-once. Queue acknowledgement is allowed only after an idempotent canonical terminal/retry/quarantine outcome has been durably recorded.

- [ ] Add failing tests for duplicate delivery, reorder, publish timeout after acceptance, consumer crash, transient Hyperdrive failure, malformed poison message, retry exhaustion, and durable DLQ/operator review.
- [ ] Implement stable dispatch identity and canonical PostgreSQL fencing so publish-response ambiguity can safely redeliver; never quarantine a transient database/control-plane outage as poison input.
- [ ] Keep `/readyz` fail-closed and report readiness for the capability subset required by the active workload family.
- [ ] Verify local Queue batch behavior acknowledges only recorded terminal dispositions and that recovery sweep can republish missing deliveries.

### Task 5: Connect the Cloudflare consumer to canonical PostgreSQL through Hyperdrive

**Files:**
- Implement a concrete repository/executor behind `apps/cloudflare/src/controlPlaneHandler.ts` and `hyperdrive.ts`.
- Modify package dependencies only if the selected Cloudflare-supported PostgreSQL driver is required.
- Add integration/fault tests under `apps/cloudflare/src/` and database migration/schema checks only if schema changes are required.

**Interfaces:** Implement load, record-dispatch, fenced claim, heartbeat, complete, retry/fail, event, and outbox reconciliation against existing `worker_jobs`, `worker_job_dispatches`, `worker_job_events`, and `worker_job_outbox`. Reuse existing job IDs, attempts, idempotency, tenant scope, and settlement authority.

- [ ] Add failing repository tests for fresh reads, transaction rollback, fence mismatch, same-attempt duplicate, stale-attempt rejection, retry decision, and terminal idempotency.
- [ ] Use Hyperdrive FRESH/no-cache for authority reads; restrict transactions to database work and retry only known rolled-back serialization/deadlock states.
- [ ] Inventory advisory-lock, session-state, `LISTEN/NOTIFY`, prepared-statement, and tenant-RLS assumptions before enabling the Worker path; replace unsupported assumptions with transaction-scoped, pool-safe SQL.
- [ ] Test private PostgreSQL connectivity through the approved Cloudflare Tunnel/Access route without printing database credentials.

### Task 6: Scheduled reconciliation, canary, and transport promotion

**Files:**
- Complete `apps/cloudflare/src/index.ts` scheduled handler and deployment config.
- Update `apps/cloudflare/README.md` with exact local/staging/prod gates and rollback.
- Update Spec 245/257 crosswalk/status artifacts without rewriting their existing plans.

**Interfaces:** Cron is a wake-up signal for bounded canonical PostgreSQL scans, not a second scheduler/job ledger. The PostgreSQL-pull path remains rollback-capable until the family promotion receipt is complete.

- [ ] Add deterministic tests for due outbox republish, expired leases, due retries, provider poll deadlines, and scheduler replay.
- [ ] Canary one low-risk job family with duplicate/crash/outage/rollback evidence before promoting additional families.
- [ ] Run synthetic create → outbox → Cloudflare Queue → Hyperdrive claim → executor → settlement and prove the terminal result reaches the user-visible projection.
- [ ] Promote Python/media and remaining job families only after each has a certified Cloudflare execution target (Worker, Container, or approved Worker App) and per-family rollback.
- [ ] Do not retire the old worker or claim full migration while any production family lacks a verified consumer or while Cloudflare credentials/bindings/tunnel/DB grants remain unproven.

## Execution order

Tasks 1 and 2 are the immediate incident-prevention stage. Task 3 closes the state/deadline contract. Tasks 4 and 5 establish a real Cloudflare Queue + Hyperdrive consumer. Task 6 proves migration by canary and promotes by family. Keep the system on the known-good PostgreSQL-pull transport until the canary is durable, observable, and reversible.
