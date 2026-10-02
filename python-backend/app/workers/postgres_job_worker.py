"""PostgreSQL-pull executor for Feature 186.

This process is the Celery-free execution path for Python control-plane jobs.
The outbox publisher records a ``postgres-pull`` dispatch, this worker polls
the Node ready endpoint, claims the canonical job with a fenced lease, and
uses the same executor/reporting contract as the Celery compatibility task.
"""

from __future__ import annotations

import logging
import os
import socket
import time
from typing import Any

from app.services.job_control_plane import JobControlPlaneClient, JobControlPlaneError
from app.tasks.unified_job_task import assert_postgres_pull_worker_enabled, run_unified_job

logger = logging.getLogger(__name__)


class PostgresJobWorker:
    def __init__(
        self,
        client: JobControlPlaneClient | None = None,
        *,
        runner_id: str | None = None,
        batch_size: int = 10,
        poll_interval_seconds: float = 1.0,
        media_reconcile_interval_seconds: float = 60.0,
    ) -> None:
        self.client = client or JobControlPlaneClient()
        self.runner_id = runner_id or f"python-postgres:{socket.gethostname()}:{os.getpid()}"
        self.batch_size = max(1, min(int(batch_size), 100))
        self.poll_interval_seconds = max(0.1, min(float(poll_interval_seconds), 60.0))
        self.media_reconcile_interval_seconds = max(
            5.0, min(float(media_reconcile_interval_seconds), 3600.0)
        )
        self.media_reconcile_after_user_id: int | None = None
        self._control_plane_unavailable_since: float | None = None
        self._last_control_plane_warning_at: float | None = None

    def run_once(self) -> list[dict[str, Any]]:
        outcomes: list[dict[str, Any]] = []
        for ready_job in self.client.ready(self.batch_size):
            try:
                outcomes.append(run_unified_job(
                    ready_job.job_id,
                    self.runner_id,
                    "postgres-pull",
                    ready_job.attempt_id,
                ))
            except JobControlPlaneError as error:
                # The control plane has already recorded the durable outcome
                # when possible. Continue with other jobs in this bounded tick.
                if error.code == "JOB_CONTROL_PLANE_UNAVAILABLE":
                    # A transport outage blocks every job after this point.
                    # Propagate so run_forever applies outage backoff instead
                    # of spinning through the rest of the ready batch.
                    raise
                logger.warning("postgres_job_control_plane_error", extra={"job_id": ready_job.job_id, "code": error.code})
                outcomes.append({"job_id": ready_job.job_id, "state": "error", "code": error.code})
            except Exception:
                logger.exception("postgres_job_execution_failed", extra={"job_id": ready_job.job_id})
                outcomes.append({"job_id": ready_job.job_id, "state": "error"})
        return outcomes

    def reconcile_unclaimed_media_tasks(self) -> dict[str, Any]:
        """Requeue unclaimed media rows from the canonical worker process."""
        from app.tasks.media_tasks import (
            _recover_unclaimed_pending_image_tasks_async,
            _run_async,
        )

        result = _run_async(
            _recover_unclaimed_pending_image_tasks_async(
                after_user_id=self.media_reconcile_after_user_id
            )
        )
        self.media_reconcile_after_user_id = result.get("next_after_user_id")
        return result

    def run_forever(self) -> None:
        logger.info("postgres_job_worker_started", extra={"runner_id": self.runner_id})
        next_media_reconcile = 0.0
        while True:
            now = time.monotonic()
            if now >= next_media_reconcile:
                try:
                    recovery = self.reconcile_unclaimed_media_tasks()
                    if recovery.get("dispatch_failures"):
                        logger.warning(
                            "postgres_job_media_recovery_partial",
                            extra={
                                "dispatch_failures": recovery["dispatch_failures"],
                                "users_checked": recovery.get("users_checked", 0),
                            },
                        )
                except Exception:
                    logger.exception("postgres_job_media_recovery_failed")
                next_media_reconcile = now + self.media_reconcile_interval_seconds
            try:
                outcomes = self.run_once()
                if self._control_plane_unavailable_since is not None:
                    logger.info(
                        "postgres_job_control_plane_recovered",
                        extra={
                            "runner_id": self.runner_id,
                            "unavailable_seconds": round(time.monotonic() - self._control_plane_unavailable_since, 1),
                        },
                    )
                    self._control_plane_unavailable_since = None
                    self._last_control_plane_warning_at = None
                if outcomes:
                    continue
            except JobControlPlaneError as error:
                failed_at = time.monotonic()
                if self._control_plane_unavailable_since is None:
                    self._control_plane_unavailable_since = failed_at
                if self._last_control_plane_warning_at is None or failed_at - self._last_control_plane_warning_at >= 60:
                    logger.error(
                        "postgres_job_control_plane_unavailable",
                        extra={
                            "runner_id": self.runner_id,
                            "code": error.code,
                            "unavailable_seconds": round(failed_at - self._control_plane_unavailable_since, 1),
                            "action": "retrying_with_bounded_backoff",
                        },
                    )
                    self._last_control_plane_warning_at = failed_at
            except Exception:
                logger.exception("postgres_job_worker_tick_failed")
            if self._control_plane_unavailable_since is not None:
                # Avoid hammering an unhealthy control plane while keeping
                # recovery detection fast. This is transport backoff only;
                # canonical job deadlines/reconciliation remain authoritative.
                outage_seconds = time.monotonic() - self._control_plane_unavailable_since
                time.sleep(min(15.0, self.poll_interval_seconds * (2 ** min(int(outage_seconds // 5), 4))))
            else:
                time.sleep(self.poll_interval_seconds)


def main() -> None:
    assert_postgres_pull_worker_enabled()
    PostgresJobWorker(
        batch_size=int(os.getenv("FEATURE_186_PYTHON_WORKER_BATCH_SIZE", "10")),
        poll_interval_seconds=float(os.getenv("FEATURE_186_PYTHON_WORKER_POLL_SECONDS", "1")),
        media_reconcile_interval_seconds=float(
            os.getenv("FEATURE_186_MEDIA_RECONCILE_SECONDS", "60")
        ),
    ).run_forever()


if __name__ == "__main__":
    main()
