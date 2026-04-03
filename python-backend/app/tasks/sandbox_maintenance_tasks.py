"""Celery tasks for sandbox maintenance: retention, orphan cleanup, stuck detection."""
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.sqlalchemy_sync import to_sync_sqlalchemy_url
from app.services.sandbox_metrics import (
    emit_concurrent_gauge,
    emit_hetzner_health,
    emit_metric,
)

logger = logging.getLogger(__name__)

_sync_engine = None
_SyncSession = None


def _get_sync_db_url() -> str:
    """Convert async DB URL to sync for Celery tasks."""
    return to_sync_sqlalchemy_url(settings.DATABASE_URL)


@contextmanager
def get_sync_session():
    """Get a sync database session for Celery tasks."""
    global _sync_engine, _SyncSession
    if _sync_engine is None:
        _sync_engine = create_engine(_get_sync_db_url(), pool_pre_ping=True, pool_size=3)
        _SyncSession = sessionmaker(bind=_sync_engine)
    session = _SyncSession()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _is_sandbox_enabled() -> bool:
    """Check if OpenSandbox is enabled."""
    try:
        from app.integrations.opensandbox.config import opensandbox_settings
        return opensandbox_settings.is_enabled
    except Exception:
        return False


@celery_app.task(name="app.tasks.sandbox_maintenance_tasks.cleanup_expired_sandbox_jobs")
def cleanup_expired_sandbox_jobs() -> dict:
    """Delete sandbox_jobs older than 30 days and their artifacts.

    Schedule: Daily at 4:00 AM UTC.
    """

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    debug_cutoff = datetime.now(timezone.utc) - timedelta(days=3)
    primary_cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    deleted_jobs = 0
    deleted_artifacts = 0

    try:
        with get_sync_session() as session:
            # Find expired terminal jobs
            from sqlalchemy import text

            # Delete artifacts for expired jobs first (FK safety)
            result = session.execute(
                text("""
                    DELETE FROM sandbox_artifacts
                    WHERE "sandboxJobId" IN (
                        SELECT id FROM sandbox_jobs
                        WHERE status IN ('completed', 'failed', 'timed_out', 'canceled')
                        AND "finishedAt" < :cutoff
                    )
                """),
                {"cutoff": cutoff},
            )
            deleted_artifacts = result.rowcount or 0

            # Delete expired jobs
            result = session.execute(
                text("""
                    DELETE FROM sandbox_jobs
                    WHERE status IN ('completed', 'failed', 'timed_out', 'canceled')
                    AND "finishedAt" < :cutoff
                """),
                {"cutoff": cutoff},
            )
            deleted_jobs = result.rowcount or 0
            session.commit()

    except Exception as e:
        logger.error("sandbox_cleanup_failed", extra={"error": str(e)})
        return {"error": str(e)}

    logger.info(
        "sandbox_cleanup_completed",
        extra={
            "event": "sandbox_cleanup_completed",
            "deleted_jobs": deleted_jobs,
            "deleted_artifacts": deleted_artifacts,
        },
    )

    return {"deleted_jobs": deleted_jobs, "deleted_artifacts": deleted_artifacts}


@celery_app.task(name="app.tasks.sandbox_maintenance_tasks.cleanup_orphan_sandboxes")
def cleanup_orphan_sandboxes() -> dict:
    """Destroy sandboxes without active jobs.

    Schedule: Every 10 minutes.
    """
    if not _is_sandbox_enabled():
        return {"skipped": True, "reason": "opensandbox_disabled"}

    destroyed_count = 0
    health_ok = True

    try:
        from app.integrations.opensandbox.client import get_sandbox_client
        import asyncio

        client = get_sandbox_client()

        # Get active sandboxes from OpenSandbox API
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        # Health check piggybacked on this task
        try:
            active_sandboxes = loop.run_until_complete(client.list_sandboxes())
            health_ok = True
        except Exception as e:
            logger.warning(
                "opensandbox_api_unreachable",
                extra={"error": str(e)},
            )
            emit_hetzner_health(False)
            return {"error": "api_unreachable", "detail": str(e)}

        emit_hetzner_health(health_ok)

        if not active_sandboxes:
            return {"destroyed_count": 0}

        # Check which sandboxes have active jobs
        from sqlalchemy import text

        grace_period = datetime.now(timezone.utc) - timedelta(minutes=15)

        with get_sync_session() as session:
            # Get all active (non-terminal) job sandbox IDs
            result = session.execute(
                text("""
                    SELECT "opensandboxId" FROM sandbox_jobs
                    WHERE status NOT IN ('completed', 'failed', 'timed_out', 'canceled')
                    AND "opensandboxId" IS NOT NULL
                """)
            )
            active_job_sandbox_ids = {row[0] for row in result.fetchall()}

        for sandbox in active_sandboxes:
            sandbox_id = sandbox.get("id") or sandbox.get("sandbox_id")
            created_at_str = sandbox.get("created_at")

            if sandbox_id in active_job_sandbox_ids:
                continue

            # Grace period: skip recently created sandboxes
            if created_at_str:
                try:
                    created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                    if created_at > grace_period:
                        continue
                except (ValueError, TypeError):
                    pass

            # Destroy orphan
            try:
                loop.run_until_complete(client.destroy_sandbox(sandbox_id))
                destroyed_count += 1
            except Exception as e:
                logger.warning(
                    "orphan_sandbox_destroy_failed",
                    extra={"sandbox_id": sandbox_id, "error": str(e)},
                )

    except Exception as e:
        logger.error("orphan_cleanup_failed", extra={"error": str(e)})
        return {"error": str(e)}

    logger.info(
        "orphan_sandbox_cleanup",
        extra={
            "event": "orphan_sandbox_cleanup",
            "destroyed_count": destroyed_count,
        },
    )

    return {"destroyed_count": destroyed_count}


@celery_app.task(name="app.tasks.sandbox_maintenance_tasks.detect_stuck_sandbox_jobs")
def detect_stuck_sandbox_jobs() -> dict:
    """Mark jobs stuck past their timeout as timed_out/failed.

    Schedule: Every 5 minutes.
    """
    if not _is_sandbox_enabled():
        return {"skipped": True, "reason": "opensandbox_disabled"}

    detected_count = 0
    resolved_count = 0

    try:
        from sqlalchemy import text

        now = datetime.now(timezone.utc)

        with get_sync_session() as session:
            # Find non-terminal jobs that are past their timeout
            result = session.execute(
                text("""
                    SELECT j.id, j.status, j."createdAt", j."startedAt",
                           j."opensandboxId",
                           COALESCE(p."timeoutSeconds", 300) as timeout_seconds
                    FROM sandbox_jobs j
                    LEFT JOIN sandbox_profiles p ON j."sandboxProfileId" = p.id
                    WHERE j.status NOT IN ('completed', 'failed', 'timed_out', 'canceled')
                """)
            )
            stuck_candidates = result.fetchall()

            # Emit concurrent active gauge
            emit_concurrent_gauge(len(stuck_candidates))

            for row in stuck_candidates:
                job_id, status, created_at, started_at, sandbox_id, timeout_secs = row

                is_stuck = False
                if status in ("provisioning", "staging_inputs"):
                    # Stuck if created_at is older than 2x create timeout (default 240s)
                    if created_at and (now - created_at).total_seconds() > timeout_secs * 2:
                        is_stuck = True
                elif status == "executing":
                    # Stuck if started_at is older than timeout + 60s buffer
                    ref_time = started_at or created_at
                    if ref_time and (now - ref_time).total_seconds() > timeout_secs + 60:
                        is_stuck = True
                elif status in ("collecting_outputs", "persisting"):
                    # Stuck if past timeout + 300s buffer
                    ref_time = started_at or created_at
                    if ref_time and (now - ref_time).total_seconds() > timeout_secs + 300:
                        is_stuck = True

                if not is_stuck:
                    continue

                detected_count += 1
                new_status = "timed_out" if status == "executing" else "failed"
                duration = (now - (started_at or created_at)).total_seconds() if (started_at or created_at) else 0

                # Mark job as timed_out/failed
                session.execute(
                    text("""
                        UPDATE sandbox_jobs
                        SET status = :new_status,
                            "statusReason" = 'stuck_detected',
                            "finishedAt" = :now
                        WHERE id = :job_id
                        AND status NOT IN ('completed', 'failed', 'timed_out', 'canceled')
                    """),
                    {"new_status": new_status, "now": now, "job_id": job_id},
                )
                resolved_count += 1

                logger.info(
                    "stuck_job_detected",
                    extra={
                        "event": "stuck_job_detected",
                        "job_id": str(job_id),
                        "previous_status": status,
                        "new_status": new_status,
                        "duration_seconds": duration,
                    },
                )

                # Attempt to destroy associated sandbox
                if sandbox_id:
                    try:
                        from app.integrations.opensandbox.client import get_sandbox_client
                        import asyncio

                        client = get_sandbox_client()
                        try:
                            loop = asyncio.get_event_loop()
                        except RuntimeError:
                            loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(loop)
                        loop.run_until_complete(client.destroy_sandbox(sandbox_id))
                    except Exception as e:
                        logger.warning(
                            "stuck_sandbox_destroy_failed",
                            extra={"sandbox_id": sandbox_id, "error": str(e)},
                        )

            session.commit()

    except Exception as e:
        logger.error("stuck_job_sweep_failed", extra={"error": str(e)})
        return {"error": str(e)}

    logger.info(
        "stuck_job_sweep",
        extra={
            "event": "stuck_job_sweep",
            "detected_count": detected_count,
            "resolved_count": resolved_count,
        },
    )

    return {"detected_count": detected_count, "resolved_count": resolved_count}
