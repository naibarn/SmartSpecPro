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
from app.tasks.unified_job_task import run_unified_job

logger = logging.getLogger(__name__)


class PostgresJobWorker:
    def __init__(
        self,
        client: JobControlPlaneClient | None = None,
        *,
        runner_id: str | None = None,
        batch_size: int = 10,
        poll_interval_seconds: float = 1.0,
    ) -> None:
        self.client = client or JobControlPlaneClient()
        self.runner_id = runner_id or f"python-postgres:{socket.gethostname()}:{os.getpid()}"
        self.batch_size = max(1, min(int(batch_size), 100))
        self.poll_interval_seconds = max(0.1, min(float(poll_interval_seconds), 60.0))

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
                logger.warning("postgres_job_control_plane_error", extra={"job_id": ready_job.job_id, "code": error.code})
                outcomes.append({"job_id": ready_job.job_id, "state": "error", "code": error.code})
            except Exception:
                logger.exception("postgres_job_execution_failed", extra={"job_id": ready_job.job_id})
                outcomes.append({"job_id": ready_job.job_id, "state": "error"})
        return outcomes

    def run_forever(self) -> None:
        logger.info("postgres_job_worker_started", extra={"runner_id": self.runner_id})
        while True:
            try:
                outcomes = self.run_once()
                if outcomes:
                    continue
            except JobControlPlaneError as error:
                logger.warning("postgres_job_ready_unavailable", extra={"code": error.code})
            except Exception:
                logger.exception("postgres_job_worker_tick_failed")
            time.sleep(self.poll_interval_seconds)


def main() -> None:
    PostgresJobWorker(
        batch_size=int(os.getenv("FEATURE_186_PYTHON_WORKER_BATCH_SIZE", "10")),
        poll_interval_seconds=float(os.getenv("FEATURE_186_PYTHON_WORKER_POLL_SECONDS", "1")),
    ).run_forever()


if __name__ == "__main__":
    main()
