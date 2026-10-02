diff --git a/python-backend/app/tasks/unified_job_task.py b/python-backend/app/tasks/unified_job_task.py
index 1125fdd88..8bc6bffa5 100644
--- a/python-backend/app/tasks/unified_job_task.py
+++ b/python-backend/app/tasks/unified_job_task.py
@@ -25,6 +25,23 @@ _executors: dict[str, Executor] = {}
 logger = logging.getLogger(__name__)
 
 
+def _feature_flag_enabled(name: str) -> bool:
+    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}
+
+
+def _hard_cutover_enabled() -> bool:
+    return _feature_flag_enabled("FEATURE_186_HARD_CUTOVER")
+
+
+def _postgres_pull_enabled() -> bool:
+    return _feature_flag_enabled("FEATURE_186_POSTGRES_PYTHON_WORKER")
+
+
+def assert_postgres_pull_worker_enabled() -> None:
+    if not _hard_cutover_enabled() or not _postgres_pull_enabled():
+        raise RuntimeError("FEATURE_186_HARD_CUTOVER and FEATURE_186_POSTGRES_PYTHON_WORKER must both be enabled")
+
+
 class HardTaskRetryRequested(RuntimeError):
     """Convert a legacy task retry request into a control-plane retry."""
 
diff --git a/python-backend/app/workers/postgres_job_worker.py b/python-backend/app/workers/postgres_job_worker.py
index 9ecc6a300..ae16579d3 100644
--- a/python-backend/app/workers/postgres_job_worker.py
+++ b/python-backend/app/workers/postgres_job_worker.py
@@ -15,7 +15,7 @@ import time
 from typing import Any
 
 from app.services.job_control_plane import JobControlPlaneClient, JobControlPlaneError
-from app.tasks.unified_job_task import run_unified_job
+from app.tasks.unified_job_task import assert_postgres_pull_worker_enabled, run_unified_job
 
 logger = logging.getLogger(__name__)
 
@@ -69,6 +69,7 @@ class PostgresJobWorker:
 
 
 def main() -> None:
+    assert_postgres_pull_worker_enabled()
     PostgresJobWorker(
         batch_size=int(os.getenv("FEATURE_186_PYTHON_WORKER_BATCH_SIZE", "10")),
         poll_interval_seconds=float(os.getenv("FEATURE_186_PYTHON_WORKER_POLL_SECONDS", "1")),
diff --git a/python-backend/tests/services/test_job_control_plane.py b/python-backend/tests/services/test_job_control_plane.py
index 4c5165d53..72d88a479 100644
--- a/python-backend/tests/services/test_job_control_plane.py
+++ b/python-backend/tests/services/test_job_control_plane.py
@@ -8,7 +8,7 @@ import pytest
 from app.services.job_control_plane import JobControlPlaneClient, JobControlPlaneError, LeaseContext, ReadyJob, dispatch_python_task
 
 
-def test_hard_cutover_publish_endpoint_fails_closed_without_postgres_worker(monkeypatch):
+def test_retired_publisher_endpoint_rejects_legacy_publish(monkeypatch):
     from fastapi import HTTPException
 
     from app.api import internal_job_control_plane
@@ -23,8 +23,8 @@ def test_hard_cutover_publish_endpoint_fails_closed_without_postgres_worker(monk
             "token",
         )
 
-    assert error.value.status_code == 503
-    assert error.value.detail == "POSTGRES_PULL_REQUIRED"
+    assert error.value.status_code == 410
+    assert error.value.detail == "LEGACY_JOB_PUBLISHER_RETIRED"
 
 
 def test_hard_cutover_media_recovery_is_deferred_to_control_plane(monkeypatch):
@@ -38,8 +38,8 @@ def test_hard_cutover_media_recovery_is_deferred_to_control_plane(monkeypatch):
         "reason": "feature_186_hard_cutover",
     }
     assert asyncio.run(media_tasks._recover_stuck_pending_tasks_async()) == {
-        "status": "skipped",
-        "reason": "feature_186_hard_cutover",
+        "status": "delegated",
+        "owner": "worker_jobs",
     }
     assert asyncio.run(media_tasks._recover_unclaimed_pending_image_tasks_async()) == {
         "status": "skipped",
diff --git a/python-backend/tests/services/test_postgres_job_worker.py b/python-backend/tests/services/test_postgres_job_worker.py
index 03999a864..367069ef0 100644
--- a/python-backend/tests/services/test_postgres_job_worker.py
+++ b/python-backend/tests/services/test_postgres_job_worker.py
@@ -6,9 +6,19 @@ from app.services.job_control_plane import ReadyJob
 from app.workers import postgres_job_worker
 
 
-def test_postgres_worker_requires_both_hard_cutover_flags(monkeypatch):
-    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
-    monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)
+@pytest.mark.parametrize(
+    ("hard_cutover", "postgres_worker"),
+    [("true", None), (None, "true"), (None, None)],
+)
+def test_postgres_worker_requires_both_hard_cutover_flags(monkeypatch, hard_cutover, postgres_worker):
+    if hard_cutover is None:
+        monkeypatch.delenv("FEATURE_186_HARD_CUTOVER", raising=False)
+    else:
+        monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", hard_cutover)
+    if postgres_worker is None:
+        monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)
+    else:
+        monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", postgres_worker)
 
     with pytest.raises(RuntimeError, match="FEATURE_186_HARD_CUTOVER and FEATURE_186_POSTGRES_PYTHON_WORKER"):
         postgres_job_worker.main()
diff --git a/python-backend/tests/tasks/test_kie_image_fair_queue.py b/python-backend/tests/tasks/test_kie_image_fair_queue.py
index 57f8bb6ea..af50ebb54 100644
--- a/python-backend/tests/tasks/test_kie_image_fair_queue.py
+++ b/python-backend/tests/tasks/test_kie_image_fair_queue.py
@@ -15,23 +15,27 @@ def _result(*, scalar=None, rows=None):
 
 
 @pytest.mark.asyncio
-async def test_dispatcher_claims_only_free_per_user_slots():
+async def test_dispatcher_submits_every_unclaimed_task_to_worker_jobs():
     from app.tasks.media_tasks import _dispatch_pending_image_tasks_async
 
     queued = [
         SimpleNamespace(
             id="task-3",
             user_id=7,
+            tenant_id="tenant-7",
             model="nano-banana-2",
             prompt="third",
+            status=TaskStatus.PENDING.value,
             parameters={"extra_params": {}},
             celery_task_id=None,
         ),
         SimpleNamespace(
             id="task-4",
             user_id=7,
+            tenant_id="tenant-7",
             model="nano-banana-2",
             prompt="fourth",
+            status=TaskStatus.PENDING.value,
             parameters={"extra_params": {}},
             celery_task_id=None,
         ),
@@ -39,54 +43,40 @@ async def test_dispatcher_claims_only_free_per_user_slots():
     session = AsyncMock()
     session.__aenter__ = AsyncMock(return_value=session)
     session.__aexit__ = AsyncMock(return_value=False)
-    session.execute = AsyncMock(
-        side_effect=[_result(), _result(scalar=2), _result(rows=queued[:1])]
-    )
+    execution_results = [
+        _result(),
+        _result(rows=queued),
+        *[_result() for _ in queued],
+    ]
+    execution_results[2].scalar_one_or_none.return_value = queued[0]
+    execution_results[3].scalar_one_or_none.return_value = queued[1]
+    session.execute = AsyncMock(side_effect=execution_results)
     session.commit = AsyncMock()
 
-    apply_async = MagicMock()
+    dispatch = MagicMock(side_effect=lambda *args, **kwargs: SimpleNamespace(id=f"job-{kwargs['args'][0]}"))
     with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
-        "app.tasks.media_tasks.generate_image_task.apply_async", apply_async
+        "app.tasks.media_tasks.dispatch_python_task", dispatch
     ):
         result = await _dispatch_pending_image_tasks_async(7)
 
-    assert result["available_slots"] == 1
-    assert result["dispatched_task_ids"] == ["task-3"]
-    assert queued[0].celery_task_id
-    assert queued[1].celery_task_id is None
-    apply_async.assert_called_once()
-    assert apply_async.call_args.kwargs["args"][0:2] == ["task-3", 7]
-    assert apply_async.call_args.kwargs["args"][2]["model"] == "nano-banana-2"
+    assert result["submitted_count"] == 2
+    assert result["dispatched_task_ids"] == ["task-3", "task-4"]
+    assert queued[0].celery_task_id == "job-task-3"
+    assert queued[1].celery_task_id == "job-task-4"
+    assert dispatch.call_count == 2
+    assert {call.kwargs["args"][0] for call in dispatch.call_args_list} == {"task-3", "task-4"}
+    assert all(call.kwargs["tenant_id"] == "tenant-7" for call in dispatch.call_args_list)
+    assert all(call.kwargs["idempotency_key"].startswith("media:image:tenant-7:") for call in dispatch.call_args_list)
     assert session.execute.await_args_list[0].args[1] == {"lock_key": "kie-image-user:7"}
     assert session.execute.await_args_list[1].args[0].compile().params["user_id_1"] == 7
 
 
-def test_recovery_runs_unclaimed_dispatch_when_processing_recovery_fails():
+def test_recovery_defers_all_stuck_task_ownership_to_worker_jobs():
     from app.tasks.media_tasks import recover_stuck_tasks
 
-    with patch(
-        "app.tasks.media_tasks._recover_stuck_tasks_async",
-        side_effect=RuntimeError("processing recovery unavailable"),
-    ), patch(
-        "app.tasks.media_tasks._recover_stuck_pending_tasks_async",
-        return_value={"status": "success", "recovered": 0},
-    ), patch(
-        "app.tasks.media_tasks._recover_unclaimed_pending_image_tasks_async",
-        return_value={"users_checked": 1, "dispatched": 1},
-    ), patch(
-        "app.tasks.media_tasks._run_async",
-        side_effect=[
-            RuntimeError("processing recovery unavailable"),
-            {"status": "success", "recovered": 0},
-            {"users_checked": 1, "dispatched": 1},
-        ],
-    ):
-        result = recover_stuck_tasks()
+    result = recover_stuck_tasks()
 
-    assert result["status"] == "partial"
-    assert result["pending_recovered"] == 0
-    assert result["pending_dispatched"] == 1
-    assert result["phase_errors"] == ["processing"]
+    assert result == {"status": "skipped", "reason": "feature_186_hard_cutover"}
 
 
 @pytest.mark.asyncio
@@ -559,6 +549,11 @@ def test_kie_policy_exception_is_terminal_and_does_not_trigger_celery_retry():
         "Provider failed: Sorry, but the image we created may violate OpenAI's content policies."
     )
     retry = MagicMock()
+    task_context = SimpleNamespace(
+        request=SimpleNamespace(retries=0),
+        max_retries=3,
+        retry=retry,
+    )
 
     with patch(
         "app.tasks.media_tasks._run_async",
@@ -575,8 +570,8 @@ def test_kie_policy_exception_is_terminal_and_does_not_trigger_celery_retry():
     ), patch(
         "app.tasks.media_tasks._dispatch_pending_image_tasks_async",
         AsyncMock(),
-    ), patch.object(poll_kie_image_task, "retry", retry):
-        result = poll_kie_image_task.run("task-policy-exception")
+    ):
+        result = poll_kie_image_task(task_context, "task-policy-exception")
 
     assert result["status"] == "failed"
     assert result["retryable"] is False
@@ -610,7 +605,7 @@ async def test_periodic_failed_task_sweep_does_not_requeue_mixed_policy_error():
     session.commit = AsyncMock()
 
     with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
-        "app.tasks.media_tasks.generate_image_task.delay"
+        "app.tasks.media_tasks.dispatch_python_task"
     ) as submit:
         outcome = await _retry_failed_tasks_async()
 
@@ -620,7 +615,7 @@ async def test_periodic_failed_task_sweep_does_not_requeue_mixed_policy_error():
 
 
 @pytest.mark.asyncio
-async def test_periodic_image_retry_reenters_per_user_dispatcher():
+async def test_periodic_image_retry_reenters_canonical_worker_jobs_dispatcher():
     from app.tasks.media_tasks import _retry_failed_tasks_async
 
     task = SimpleNamespace(
@@ -644,7 +639,7 @@ async def test_periodic_image_retry_reenters_per_user_dispatcher():
     session.commit = AsyncMock()
 
     with patch("app.tasks.media_tasks.AsyncSessionLocal", return_value=session), patch(
-        "app.tasks.media_tasks.generate_image_task.delay"
+        "app.tasks.media_tasks.dispatch_python_task"
     ) as submit, patch(
         "app.tasks.media_tasks._dispatch_pending_image_tasks_async", AsyncMock()
     ) as dispatch:
diff --git a/specs/feature/245-Full-System Cloudflare Migration Master Plan/claude-plan-tdd.md b/specs/feature/245-Full-System Cloudflare Migration Master Plan/claude-plan-tdd.md
index 660e21d29..3f0d1616e 100644
--- a/specs/feature/245-Full-System Cloudflare Migration Master Plan/claude-plan-tdd.md	
+++ b/specs/feature/245-Full-System Cloudflare Migration Master Plan/claude-plan-tdd.md	
@@ -4,9 +4,11 @@ The implementation sections below define tests to add/run before each code chang
 
 ## Section 01 — Inventory and Cloudflare foundation
 
+- `apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts`: all five CLI operations consume a bounded fixture and emit deterministic required artifacts; invalid manifests, unknown active callers, missing canonical `worker_jobs`/outbox linkage, and bundle-only compatibility claims fail closed; secret-valued fixture data never appears in artifacts. `verify` also blocks unreconciled source findings, incomplete trigger inventory, duplicate scheduler owners, and missing/unreadable/oversized/symlinked source paths. RED evidence is absent command/module and failing contract cases; run `npm --workspace @smartspec/web exec vitest run scripts/__tests__/cloudflare-migration-compiler.test.ts`. These tests prove local deterministic compiler behavior only, not production inventory completeness or deployment state.
 - Inventory parser/schema rejects unclassified active responsibilities before a full-retirement result.
 - Local, target and production readiness are separate; target mode remains blocked without authentic evidence.
 - Maintenance pause/resume handles queued, active, delayed and provider-unknown jobs without duplicate ownership.
+- Inventory verification rejects a full-retirement claim when a detached task, callback, scheduled occurrence, startup/reconciliation task, or long-lived-listener operation lacks an owner, destination, canonical `worker_jobs` record, or outbox intent before its first side effect. Waiting daemons are distinguished from the bounded jobs they trigger.
 - Worker auth, disabled activation, binding subset, health/readiness, size limit and origin-loop cases are covered.
 
 ## Section 02 — Search cache KV and Admin control
@@ -22,6 +24,7 @@ The implementation sections below define tests to add/run before each code chang
 
 ## Section 03 — Redis groups and DO
 
+- Existing G3/G4 migration regressions remain covered by `apiKeyQuotaMultiprocess.integration.test.ts`, `delegatedWorkerLeaseMultiprocess.integration.test.ts`, and `postgresDelegatedWorkerSemaphore` tests; prove cross-process quota atomicity, lease expiry/fencing, stale-owner rejection, and one canonical authority. Local tests do not certify deployed schema/head or runtime cutover.
 - Per family, assert old owner is paused and exactly one new executor/scheduler/lock authority is active.
 - Verify duplicate Queue delivery, outbox retry, lease expiry/fencing, DLQ, provider unknown outcome, credit/idempotency and pause/resume.
 - Auth revoke and tenant ACL remain fresh with KV unavailable; rate limiting does not replace credit accounting.
@@ -29,9 +32,12 @@ The implementation sections below define tests to add/run before each code chang
 
 ## Section 04 — Database/runtime/Debian
 
+- Python Postgres-pull worker refuses startup unless both hard-cutover and worker flags are true; direct hard-cutover execution fails before claim when the executor flag is missing. Image recovery and retry producers must persist/re-enter `worker_jobs`, never Celery's publisher API or UI-owned concurrency slots. Focused tests: `python-backend/tests/services/test_job_control_plane.py`, `test_postgres_job_worker.py`, `test_unified_job_task_external_wait.py`, and `python-backend/tests/tasks/test_kie_image_fair_queue.py`.
+- `apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts`: callback, scheduled, startup/reconciliation, and listener-triggered operations enter the canonical job/outbox path before any external or billable effect; periodic occurrences are owner-attributed individually. This contract fixture does not prove exhaustive production host/process discovery.
 - Schema parity/checksum, one-writer transition, Hyperdrive behavior, PITR restore and ambiguous commit/idempotency.
 - Node methods are tested on actual call paths; package import alone is insufficient. Container resource/network and Runner lease/reconnect behaviors are verified where used.
 - Webhook raw-byte signature, redirect semantics, schedule uniqueness, provider callbacks, and route graph recursion are covered.
+- Callback, startup/reconciliation, and listener-triggered business operations enter the canonical job/outbox path before any external or billable effect; a periodic/delayed trigger is checked per occurrence and owner.
 - R2 authorization/integrity and Vectorize tenant ACL/rebuild/deletion behaviors pass.
 - Whole journey works on target; Debian network-deny catches no required call; long-interval schedule and rare callback fixtures complete.
 - Post-cutover fix-forward path and affected-slice pause preserve canonical work.
diff --git a/specs/feature/245-Full-System Cloudflare Migration Master Plan/sections/section-04-database-runtime-and-debian-retirement.md b/specs/feature/245-Full-System Cloudflare Migration Master Plan/sections/section-04-database-runtime-and-debian-retirement.md
index 1e40a5a6d..00179120f 100644
--- a/specs/feature/245-Full-System Cloudflare Migration Master Plan/sections/section-04-database-runtime-and-debian-retirement.md	
+++ b/specs/feature/245-Full-System Cloudflare Migration Master Plan/sections/section-04-database-runtime-and-debian-retirement.md	
@@ -1,5 +1,14 @@
 # Section 04 — Database, Runtime and Debian Retirement
 
+## Local status (2026-09-28)
+
+- Python PostgreSQL-pull worker now refuses startup unless both `FEATURE_186_HARD_CUTOVER` and `FEATURE_186_POSTGRES_PYTHON_WORKER` are enabled; direct hard-cutover execution has an explicit fail-closed guard instead of referencing undefined helpers.
+- Python image producers continue to persist canonical jobs through `dispatch_python_task`; the pending-image feeder submits every unclaimed task and leaves admission/concurrency to `worker_jobs`. Recovery is delegated to the canonical control plane. Tests were updated to assert this ownership instead of obsolete Celery/per-user slot behavior.
+- Focused control-plane, worker, external-wait and Kie image dispatch tests pass 38/38. This proves local mocked/unit contracts only, not deployment mode, cross-process database locking or provider outcome reconciliation.
+- Full implementation is not yet supportable from repository-local evidence. Section 01's scan found 809 source candidates, and no owner-backed service/process/scheduler/callback inventory is present to assign every database/runtime dependency safely.
+- PostgreSQL/Hyperdrive compatibility, target DB parity/restore, callback and schedule ownership, Cloudflare runtime placement, and Debian network-deny/power-off journeys all need current target evidence. No database, service, route, or host changes were made in this pass.
+- This section remains `BLOCKED_ON_SECTION_01_INVENTORY_AND_EXTERNAL_PROOF`; do not infer successful retirement from locally passing component tests.
+
 ## Goal
 
 Complete the remaining migration from Debian-hosted application/runtime dependencies to Cloudflare-compatible Workers, Containers, Queues, managed PostgreSQL and approved external workers, then prove Debian no longer serves an active dependency.
@@ -9,6 +18,7 @@ Complete the remaining migration from Debian-hosted application/runtime dependen
 1. **PostgreSQL:** inventory schema, extensions, advisory locks, LISTEN/NOTIFY, triggers, transactions, pool behavior, backup and restore. Keep one writer. Use Hyperdrive only after driver/network/pool tests; move primary through a consistent snapshot plus replication/reconciliation or a planned write pause and exact delta/checksum validation. Never claim that R2/Vectorize migration also moved relational authority.
 2. **Node/Python:** classify every service, package API call, filesystem/native dependency, CPU duration, memory and outbound network need. Place stateless supported routes on Workers; long-running/native/media work on approved Cloudflare Container or Runner. Preserve Feature 195, Specs 224/242 boundaries.
 3. **Ingress/schedules:** inventory DNS, custom domains, TLS, callbacks/webhooks, mail/egress, recurring tasks and static assets. Ensure one scheduler and one callback authority, byte-preserving signature verification, no proxy recursion and no origin bypass.
+   - Include callback-triggered work, every scheduled occurrence, startup/reconciliation tasks, detached/in-process async paths, and bounded business work initiated by long-lived listeners. Before first side effect, each operation must enter canonical `worker_jobs` with an outbox intent; identify waiter daemons separately from the job they trigger.
 4. **Existing Cloudflare destinations:** verify R2 object authorization/checksum and Vectorize tenant ACL, deletion/rebuild behavior and job consistency; do not unnecessarily retransfer known-good data.
 5. **Host retirement:** stop and observe Debian services after all callers moved; simulate long-period schedules and rare callbacks; run network-deny/power-off smoke; keep recoverable image/data according to retention; remove credentials only after no active consumer can use them.
 
@@ -23,6 +33,7 @@ Complete the remaining migration from Debian-hosted application/runtime dependen
 ## Acceptance
 
 - Every production ingress, egress, schedule, service, worker and storage dependency has a Cloudflare target or approved explicit exception.
+- No unowned or untracked business-background execution remains across any transport, and each bounded operation has a canonical `worker_jobs` record plus outbox intent before its first side effect.
 - Managed DB and all target bindings have real environment proof before calling the production path complete.
 - Full-system `M245.10` has separate Debian retirement evidence; the Redis 14–30 day wait is not reused as a blocker.
 
