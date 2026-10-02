# Section 04 — Database, Runtime and Debian Retirement

## Local status (2026-09-28)

- Python PostgreSQL-pull worker now refuses startup unless both `FEATURE_186_HARD_CUTOVER` and `FEATURE_186_POSTGRES_PYTHON_WORKER` are enabled; Python job admission also fails before writing `worker_jobs` if the hard-cutover worker flag is absent. The worker periodically requeues unclaimed media source rows itself, without relying on the retired Celery beat path.
- Python image producers persist canonical jobs through `dispatch_python_task`; the pending-image feeder submits every unclaimed task and leaves admission/concurrency to `worker_jobs`. Recovery leaves claimed/stale work to `worker_jobs` and retries only unclaimed image rows, reporting `partial` if redispatch still fails. Retryable Kie poll failures use the control-plane retry exception in hard cutover, not Celery retry publication.
- Focused control-plane, worker, external-wait and Kie image dispatch tests pass 47/47. This proves local mocked/unit contracts only, not deployment mode, cross-process database locking or provider outcome reconciliation.
- Full implementation is not yet supportable from repository-local evidence. Section 01's scan found 917 source candidates (including 108 PostgreSQL session-feature candidates), and no owner-backed service/process/scheduler/callback inventory is present to assign every database/runtime dependency safely.
- Follow-on read-only scan (2026-09-28 08:16 +07:00): the current dirty worktree contains 2,444 scanned files and 920 candidate signals (109 PostgreSQL session-feature candidates); two files exceed the scan limit. Empty-example-manifest verification reports 923 blockers. This is Local static evidence only and supersedes the earlier scan counts for current planning; it does not close owner/runtime inventory gates.
- Scanner follow-up (2026-09-28 08:18 +07:00): the 2 MB bounded scan now includes both formerly oversized files and reports 931 candidate signals with zero scan problems. Empty-manifest verification reports 932 blockers, all due to unreconciled owner/component inventory. No external or production state was read by these compiler runs.
- Production-host recheck (2026-09-28 08:27 +07:00): Cloudflare Tunnel `smartspec` is active with one connector, but its configured Web/API origins point to host ports 3000/8000 with no listener. Public Web/API `/healthz` return 502; the separate runtime Worker `/healthz` returns 200 while `/readyz` is 503 (`activation=disabled`, required job bindings absent). Web/Backend systemd units are still masked; Redis and Celery Beat containers are active. Sanitized evidence is in `ops/feature-245/evidence/production-host-readonly-2026-09-28.yaml`; no service, route, or Worker setting was changed.
- PostgreSQL/Hyperdrive compatibility, target DB parity/restore, callback and schedule ownership, Cloudflare runtime placement, and Debian network-deny/power-off journeys all need current target evidence. No database, service, route, or host changes were made in this pass.
- This section remains `BLOCKED_ON_SECTION_01_INVENTORY_AND_EXTERNAL_PROOF`; do not infer successful retirement from locally passing component tests.

## Goal

Complete the remaining migration from Debian-hosted application/runtime dependencies to Cloudflare-compatible Workers, Containers, Queues, managed PostgreSQL and approved external workers, then prove Debian no longer serves an active dependency.

## Work areas

1. **PostgreSQL:** inventory schema, extensions, advisory locks, LISTEN/NOTIFY, triggers, transactions, pool behavior, backup and restore. Keep one writer. Use Hyperdrive only after driver/network/pool tests; move primary through a consistent snapshot plus replication/reconciliation or a planned write pause and exact delta/checksum validation. Never claim that R2/Vectorize migration also moved relational authority.
2. **Node/Python:** classify every service, package API call, filesystem/native dependency, CPU duration, memory and outbound network need. Place stateless supported routes on Workers; long-running/native/media work on approved Cloudflare Container or Runner. Preserve Feature 195, Specs 224/242 boundaries.
3. **Ingress/schedules:** inventory DNS, custom domains, TLS, callbacks/webhooks, mail/egress, recurring tasks and static assets. Ensure one scheduler and one callback authority, byte-preserving signature verification, no proxy recursion and no origin bypass.
   - Include callback-triggered work, every scheduled occurrence, startup/reconciliation tasks, detached/in-process async paths, and bounded business work initiated by long-lived listeners. Before first side effect, each operation must enter canonical `worker_jobs` with an outbox intent; identify waiter daemons separately from the job they trigger.
4. **Existing Cloudflare destinations:** verify R2 object authorization/checksum and Vectorize tenant ACL, deletion/rebuild behavior and job consistency; do not unnecessarily retransfer known-good data.
5. **Host retirement:** stop and observe Debian services after all callers moved; simulate long-period schedules and rare callbacks; run network-deny/power-off smoke; keep recoverable image/data according to retention; remove credentials only after no active consumer can use them.

## Tests before implementation

- PG schema parity/checksum, writer exclusion, PITR restore and ambiguous commit/idempotency drill.
- Node method-level compatibility probes, Container startup/resource/network policy and Runner reconnection/fencing where applicable.
- Route graph prevents loops; webhook verifies raw signed bytes; scheduler uniqueness prevents duplicate paid work.
- R2/Vectorize lifecycle and authorization contracts pass; full journey includes auth, tenant data, credit/job, artifact read/write, callback and reconnect.
- Debian network-deny identifies no required caller; powered-off mode continues the supported business journey.

## Acceptance

- Every production ingress, egress, schedule, service, worker and storage dependency has a Cloudflare target or approved explicit exception.
- No unowned or untracked business-background execution remains across any transport, and each bounded operation has a canonical `worker_jobs` record plus outbox intent before its first side effect.
- Managed DB and all target bindings have real environment proof before calling the production path complete.
- Full-system `M245.10` has separate Debian retirement evidence; the Redis 14–30 day wait is not reused as a blocker.

## UI/UX Contract

### Target User / JTBD

N/A. This section defines database/runtime migration and host-retirement operations, not a browser feature.

### Surface Inventory

N/A. Any operational admin UI is handled by its owning subsystem section.

### Component Map

N/A. No browser component is added or changed here.

### State Matrix

N/A for browser states. Runtime/deployment state is covered by the acceptance matrix above.

### Responsive Matrix

N/A. No browser-visible UI is changed here.

### Accessibility Acceptance

N/A. No browser-visible UI is changed here.

### Copy Contract

N/A. No user-facing copy is introduced here.

### Browser Evidence Required

N/A. No browser-visible UI is changed here; target journey and operations evidence apply instead.
