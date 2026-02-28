"""Sandbox Job Worker — Celery task managing full sandbox lifecycle.

This task is dispatched by SandboxDispatcher and handles:
1. Provision sandbox container
2. Stage input files into sandbox
3. Execute commands/code
4. Collect output files from sandbox
5. Upload outputs to S3/R2
6. Destroy sandbox container
7. Update job status throughout
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import structlog
from celery.exceptions import SoftTimeLimitExceeded

from app.core.celery_app import celery_app
from app.integrations.opensandbox.client import (
    OpenSandboxClient,
    RetryableHTTPError,
    SandboxProvisionError,
)
from app.integrations.opensandbox.config import opensandbox_settings
from app.integrations.opensandbox.execution import run_command, run_code
from app.integrations.opensandbox.files import collect_outputs, stage_inputs
from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
from app.integrations.opensandbox.models import SandboxConfig
from app.models.sandbox import SandboxJob, SandboxJobStatus, SandboxProfile
from app.services.sandbox_artifacts import SandboxArtifactService
from app.services.sandbox_audit import SandboxAuditService
from app.services.sandbox_costs import SandboxCostService

logger = structlog.get_logger()

# Non-terminal statuses (job is still active)
NON_TERMINAL_STATUSES = {s.value for s in SandboxJobStatus if s.value not in {
    "completed", "failed", "timed_out", "canceled"
}}

# Terminal statuses (job is done)
TERMINAL_STATUSES = {"completed", "failed", "timed_out", "canceled"}


@asynccontextmanager
async def _get_db_session():
    """Get an async database session."""
    from app.core.database import async_session_factory

    async with async_session_factory() as session:
        yield session


async def _load_job(db, job_id: str) -> Optional[SandboxJob]:
    """Load SandboxJob from database."""
    from sqlalchemy import select

    stmt = select(SandboxJob).where(SandboxJob.id == job_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _load_profile(db, profile_id: int) -> Optional[SandboxProfile]:
    """Load SandboxProfile from database."""
    from sqlalchemy import select

    stmt = select(SandboxProfile).where(SandboxProfile.id == profile_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _update_job_status(
    db, job_id: str, status: str, reason: Optional[str] = None, **kwargs
) -> None:
    """Update sandbox_jobs status and optional fields.

    All kwargs must use snake_case Python attribute names (not camelCase column names).
    """
    from sqlalchemy import update

    values = {"status": status, "updated_at": datetime.now(timezone.utc)}
    if reason:
        values["status_reason"] = reason
    values.update(kwargs)

    stmt = update(SandboxJob).where(SandboxJob.id == job_id).values(**values)
    await db.execute(stmt)
    await db.commit()


@celery_app.task(
    name="app.workers.sandbox_job_worker.execute_sandbox_job",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
    reject_on_worker_lost=True,
    time_limit=1800,
    soft_time_limit=1740,
)
def execute_sandbox_job(self, job_id: str) -> dict:
    """Execute a sandbox job through its full lifecycle.

    This is a synchronous Celery task that internally runs async code
    via asyncio.run(), matching the existing pattern in media_job_worker.py.
    """
    return asyncio.run(_execute_sandbox_job_async(self, job_id))


async def _execute_sandbox_job_async(task, job_id: str) -> dict:
    """Async implementation of sandbox job execution.

    Status transitions:
        accepted -> queued -> provisioning -> staging_inputs ->
        executing -> collecting_outputs -> persisting -> completed

    On error: -> failed (or timed_out)
    Sandbox is ALWAYS destroyed in the finally block.
    """
    audit_service = SandboxAuditService()
    sandbox_id = None
    client = None
    job = None
    profile = None
    started_at_ts = None

    async with _get_db_session() as db:
        try:
            # Load job from DB
            job = await _load_job(db, job_id)
            if job is None:
                logger.error("sandbox_job_not_found", job_id=job_id)
                return {"status": "failed", "reason": "job not found"}

            if job.status in TERMINAL_STATUSES:
                logger.warning("sandbox_job_already_terminal", job_id=job_id, status=job.status)
                return {"status": job.status, "reason": "already terminal"}

            # Load profile
            profile = await _load_profile(db, job.sandbox_profile_id)
            if profile is None:
                await _update_job_status(db, job_id, "failed", reason="profile not found")
                return {"status": "failed", "reason": "profile not found"}

            # Initialize services
            client = OpenSandboxClient(opensandbox_settings)
            lifecycle = SandboxLifecycleManager(client)
            cost_service = SandboxCostService(db)
            artifact_service = SandboxArtifactService(db)

            # Status: queued -> provisioning
            await _update_job_status(db, job_id, "queued")

            started_at_ts = datetime.now(timezone.utc)
            await _update_job_status(
                db, job_id, "provisioning",
                started_at=started_at_ts,
            )

            # Provision sandbox (retryable on transient failures)
            sandbox_config = SandboxConfig(
                image=profile.base_image,
                cpu_limit=profile.cpu_limit,
                memory_limit_mb=profile.memory_limit_mb,
                disk_limit_mb=profile.ephemeral_disk_mb,
                timeout_seconds=profile.timeout_seconds,
                network_default_action=profile.network_default_action,
            )
            try:
                sandbox_id = await lifecycle.provision_sandbox(sandbox_config, job_id)
            except (SandboxProvisionError, RetryableHTTPError) as prov_err:
                # Transient failure — retry via Celery
                logger.warning(
                    "sandbox_provision_retry",
                    job_id=job_id,
                    error=str(prov_err),
                    retry_count=task.request.retries,
                )
                raise task.retry(exc=prov_err)

            await _update_job_status(db, job_id, "staging_inputs",
                                     opensandbox_id=sandbox_id)

            audit_service.emit(
                event_type="sandbox_created",
                sandbox_job_id=job_id,
                tenant_id=job.tenant_id,
                user_id=job.user_id,
                feature_type=job.feature_type,
                profile_slug=profile.slug,
            )

            # Stage inputs
            manifest = job.input_manifest_json or {}
            input_files = manifest.get("input_files", [])
            if input_files:
                await stage_inputs(client, sandbox_id, input_files, storage_service=None)

            # Execute commands
            await _update_job_status(db, job_id, "executing")

            audit_service.emit(
                event_type="sandbox_executing",
                sandbox_job_id=job_id,
                tenant_id=job.tenant_id,
                user_id=job.user_id,
                feature_type=job.feature_type,
                profile_slug=profile.slug,
            )

            commands = manifest.get("commands", [])
            all_stdout = []
            all_stderr = []

            for cmd in commands:
                result = await run_command(
                    client, sandbox_id, cmd, timeout=profile.timeout_seconds
                )
                all_stdout.append(result.stdout)
                all_stderr.append(result.stderr)

                if result.exit_code != 0:
                    logger.warning(
                        "sandbox_command_failed",
                        job_id=job_id,
                        command=cmd[:100],
                        exit_code=result.exit_code,
                    )

            # Collect outputs
            await _update_job_status(db, job_id, "collecting_outputs")

            output_paths = manifest.get("output_paths", [])
            collected = []
            if output_paths:
                collected = await collect_outputs(
                    client,
                    sandbox_id,
                    output_paths,
                    storage_service=None,
                    artifact_bucket="",
                    job_id=job_id,
                )

            # Persist results
            await _update_job_status(db, job_id, "persisting")

            stdout_excerpt = "\n---\n".join(all_stdout)[:10000]
            stderr_excerpt = "\n---\n".join(all_stderr)[:10000]

            # Calculate cost using actual duration
            finished_at_ts = datetime.now(timezone.utc)
            actual_seconds = (finished_at_ts - started_at_ts).total_seconds()
            cpu_cores = float(profile.cpu_limit.rstrip("m")) / 1000.0 if profile.cpu_limit.endswith("m") else 1.0
            cpu_seconds = actual_seconds * cpu_cores
            memory_gb = float(profile.memory_limit_mb) / 1024.0
            memory_gb_seconds = memory_gb * actual_seconds
            cost = await cost_service.calculate_actual(
                job_id=job_id,
                cpu_seconds=cpu_seconds,
                memory_gb_seconds=memory_gb_seconds,
            )

            # Mark completed
            await _update_job_status(
                db,
                job_id,
                "completed",
                finished_at=finished_at_ts,
                stdout_excerpt=stdout_excerpt,
                stderr_excerpt=stderr_excerpt,
                output_manifest_json=collected,
            )

            audit_service.emit(
                event_type="sandbox_completed",
                sandbox_job_id=job_id,
                tenant_id=job.tenant_id,
                user_id=job.user_id,
                feature_type=job.feature_type,
                profile_slug=profile.slug,
                cost_data={"costUsd": str(cost)},
            )

            logger.info("sandbox_job_completed", job_id=job_id)
            return {"status": "completed", "job_id": job_id}

        except SoftTimeLimitExceeded:
            # Celery soft timeout — attempt partial output collection
            logger.warning("sandbox_job_timed_out", job_id=job_id)

            try:
                if sandbox_id and client:
                    manifest = getattr(job, "input_manifest_json", None) or {}
                    output_paths = manifest.get("output_paths", [])
                    if output_paths:
                        await collect_outputs(
                            client, sandbox_id, output_paths,
                            storage_service=None, artifact_bucket="", job_id=job_id,
                        )
            except Exception:
                logger.warning("sandbox_partial_collect_failed", job_id=job_id, exc_info=True)

            try:
                await _update_job_status(
                    db, job_id, "timed_out",
                    reason="Celery soft time limit exceeded",
                    finished_at=datetime.now(timezone.utc),
                )
            except Exception:
                logger.error("sandbox_timeout_status_update_failed", job_id=job_id, exc_info=True)

            _emit_failure_audit(
                audit_service, job_id, job, profile,
                error_data={"message": "Soft time limit exceeded"},
            )

            return {"status": "timed_out", "job_id": job_id}

        except Exception as e:
            logger.error("sandbox_job_failed", job_id=job_id, error=str(e), exc_info=True)

            try:
                await _update_job_status(
                    db, job_id, "failed",
                    reason=str(e)[:500],
                    finished_at=datetime.now(timezone.utc),
                )
            except Exception:
                logger.error("sandbox_status_update_failed", job_id=job_id, exc_info=True)

            _emit_failure_audit(
                audit_service, job_id, job, profile,
                error_data={"message": str(e)[:500]},
            )

            return {"status": "failed", "job_id": job_id, "error": str(e)[:500]}

        finally:
            # Always destroy sandbox
            if sandbox_id and client:
                try:
                    lifecycle_cleanup = SandboxLifecycleManager(client)
                    await lifecycle_cleanup.destroy_sandbox(sandbox_id)

                    audit_service.emit(
                        event_type="sandbox_deleted",
                        sandbox_job_id=job_id,
                        tenant_id=job.tenant_id if job else "unknown",
                        user_id=job.user_id if job else 0,
                        feature_type=job.feature_type if job else "unknown",
                        profile_slug=profile.slug if profile else "unknown",
                    )
                except Exception:
                    logger.warning(
                        "sandbox_destroy_failed",
                        sandbox_id=sandbox_id,
                        job_id=job_id,
                        exc_info=True,
                    )

            if client:
                await client.close()


def _emit_failure_audit(
    audit_service: SandboxAuditService,
    job_id: str,
    job: Optional[SandboxJob],
    profile: Optional[SandboxProfile],
    error_data: Optional[dict] = None,
) -> None:
    """Helper to emit sandbox_failed audit event with safe attribute access."""
    audit_service.emit(
        event_type="sandbox_failed",
        sandbox_job_id=job_id,
        tenant_id=job.tenant_id if job else "unknown",
        user_id=job.user_id if job else 0,
        feature_type=job.feature_type if job else "unknown",
        profile_slug=profile.slug if profile else "unknown",
        error_data=error_data,
    )
