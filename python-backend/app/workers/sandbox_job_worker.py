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
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import structlog
from celery.exceptions import SoftTimeLimitExceeded

from app.core.celery_app import celery_app
from app.integrations.opensandbox.client import (
    OpenSandboxClient,
    RetryableHTTPError,
    SandboxAPIError,
    SandboxProvisionError,
)
from app.integrations.opensandbox.config import opensandbox_settings
from app.integrations.opensandbox.execution import run_command
from app.integrations.opensandbox.files import collect_outputs, stage_inline_files, stage_inputs
from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
from app.integrations.opensandbox.models import SandboxConfig
from app.integrations.opensandbox.docker_command_bridge import run_command_via_docker_bridge
from app.models.sandbox import SandboxJob, SandboxJobStatus, SandboxProfile
from app.services.r2_storage_service import get_r2_storage_service
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

# Reuse one event loop per Celery worker process to avoid asyncpg objects
# crossing different loops when tasks are executed sequentially.
_WORKER_EVENT_LOOP: asyncio.AbstractEventLoop | None = None
_SANDBOX_TRACE_FILE = "/tmp/smartspec-debug/sandbox-job-trace.jsonl"


def _write_sandbox_trace(event: str, **payload) -> None:
    """Write a lightweight debug trace for sandbox artifact flow investigation."""
    try:
        os.makedirs(os.path.dirname(_SANDBOX_TRACE_FILE), exist_ok=True)
        with open(_SANDBOX_TRACE_FILE, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({
                "ts": datetime.now(timezone.utc).isoformat(),
                "event": event,
                **payload,
            }, ensure_ascii=True) + "\n")
    except Exception:
        logger.warning("sandbox_trace_write_failed", event=event, exc_info=True)


class _SandboxArtifactStorageAdapter:
    """Adapter exposing collect_outputs()'s storage interface via R2 storage."""

    def __init__(self, db_session):
        self._db = db_session
        self._storage = get_r2_storage_service()

    async def upload_object(self, object_key: str, file_bytes: bytes, bucket: str | None = None) -> None:
        content_type = SandboxArtifactService.guess_mime_type(object_key)
        _write_sandbox_trace(
            "artifact_upload_begin",
            object_key=object_key,
            size_bytes=len(file_bytes),
            content_type=content_type,
        )
        await self._storage.upload_bytes(
            key=object_key,
            data=file_bytes,
            content_type=content_type,
            db_session=self._db,
        )
        _write_sandbox_trace(
            "artifact_upload_complete",
            object_key=object_key,
            size_bytes=len(file_bytes),
            content_type=content_type,
        )


def _classify_artifact(sandbox_path: str) -> tuple[str, bool]:
    """Map sandbox output paths to artifact type and primary flag."""
    filename = os.path.basename(sandbox_path).lower()
    if filename == "manifest.json":
        return ("debug", False)
    if filename.endswith(".log"):
        return ("log", False)
    if filename.endswith((".png", ".jpg", ".jpeg", ".webp")):
        return ("screenshot", False)
    return ("primary", True)


def _resolve_runtime_timeout_seconds(manifest: dict, profile) -> int:
    """Return the effective timeout for this job, capped by the profile limit."""
    metadata = manifest.get("metadata") if isinstance(manifest, dict) else {}
    runtime_overrides = metadata.get("runtimeOverrides") if isinstance(metadata, dict) else {}
    timeout_value = runtime_overrides.get("timeoutSeconds") if isinstance(runtime_overrides, dict) else None
    if timeout_value is None:
        return profile.timeout_seconds

    try:
        requested = int(timeout_value)
    except (TypeError, ValueError):
        return profile.timeout_seconds

    if requested <= 0:
        return profile.timeout_seconds
    return min(requested, profile.timeout_seconds)


@asynccontextmanager
async def _get_db_session():
    """Get an async database session."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
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


def _is_lifecycle_only_error(exc: Exception) -> bool:
    """Return True when OpenSandbox server does not expose command/code APIs."""
    return isinstance(exc, SandboxAPIError) and "lifecycle APIs only" in str(exc)


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
    _write_sandbox_trace(
        "job_status_update",
        job_id=job_id,
        status=status,
        reason=reason,
        extra_keys=sorted(kwargs.keys()),
    )

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

    This is a synchronous Celery task that internally runs async code on a
    persistent per-process event loop. Using asyncio.run() per task can create
    cross-loop issues with async DB drivers in long-lived worker processes.
    """
    global _WORKER_EVENT_LOOP
    if _WORKER_EVENT_LOOP is None or _WORKER_EVENT_LOOP.is_closed():
        _WORKER_EVENT_LOOP = asyncio.new_event_loop()
        asyncio.set_event_loop(_WORKER_EVENT_LOOP)
    return _WORKER_EVENT_LOOP.run_until_complete(_execute_sandbox_job_async(self, job_id))


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
            _write_sandbox_trace("job_begin", job_id=job_id)
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
            artifact_storage = _SandboxArtifactStorageAdapter(db)
            artifact_service = SandboxArtifactService(db)
            manifest = job.input_manifest_json or {}
            effective_timeout_seconds = _resolve_runtime_timeout_seconds(manifest, profile)

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
                timeout_seconds=effective_timeout_seconds,
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
            input_files = manifest.get("input_files", [])
            if input_files:
                await stage_inputs(client, sandbox_id, input_files, storage_service=None)
            inline_files = manifest.get("inline_files", [])
            if inline_files:
                await stage_inline_files(client, sandbox_id, inline_files)

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
            docker_bridge_execution = False

            for cmd_index, cmd in enumerate(commands):
                if docker_bridge_execution:
                        result = await run_command_via_docker_bridge(
                            sandbox_id=sandbox_id,
                            command=cmd,
                            timeout_seconds=effective_timeout_seconds,
                        )
                else:
                    try:
                        result = await run_command(
                            client, sandbox_id, cmd, timeout=effective_timeout_seconds
                        )
                    except Exception as exc:
                        if not _is_lifecycle_only_error(exc):
                            raise

                        docker_bridge_execution = True
                        logger.warning(
                            "sandbox_commands_api_unavailable_using_docker_bridge",
                            job_id=job_id,
                            command_index=cmd_index,
                        )
                        result = await run_command_via_docker_bridge(
                            sandbox_id=sandbox_id,
                            command=cmd,
                            timeout_seconds=effective_timeout_seconds,
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
                    stderr_excerpt = (result.stderr or "").strip()
                    stdout_excerpt = (result.stdout or "").strip()
                    detail = stderr_excerpt or stdout_excerpt or "No stderr/stdout captured"
                    raise RuntimeError(
                        f"Sandbox command failed (exit {result.exit_code}) at step {cmd_index + 1}: {detail[:500]}"
                    )

            # Collect outputs
            await _update_job_status(db, job_id, "collecting_outputs")

            output_paths = manifest.get("output_paths", [])
            collected = []
            if output_paths:
                _write_sandbox_trace("collect_outputs_begin", job_id=job_id, output_paths=output_paths)
                collected = await collect_outputs(
                    client,
                    sandbox_id,
                    output_paths,
                    storage_service=artifact_storage,
                    artifact_bucket="",
                    job_id=job_id,
                )
                _write_sandbox_trace("collect_outputs_complete", job_id=job_id, collected=collected)

            # Persist results
            await _update_job_status(db, job_id, "persisting")

            for artifact in collected:
                artifact_type, is_primary = _classify_artifact(artifact.get("sandbox_path", ""))
                _write_sandbox_trace(
                    "artifact_record_begin",
                    job_id=job_id,
                    object_key=artifact.get("object_key"),
                    artifact_type=artifact_type,
                    is_primary=is_primary,
                    sandbox_path=artifact.get("sandbox_path"),
                )
                await artifact_service.record_existing(
                    sandbox_job_id=job_id,
                    object_key=artifact["object_key"],
                    artifact_type=artifact_type,
                    mime_type=SandboxArtifactService.guess_mime_type(artifact["object_key"]),
                    size_bytes=artifact.get("size_bytes"),
                    sha256=artifact.get("sha256"),
                    is_primary=is_primary,
                    metadata={
                        "sandboxPath": artifact.get("sandbox_path"),
                        "stored": artifact.get("stored", False),
                    },
                )
                _write_sandbox_trace(
                    "artifact_record_complete",
                    job_id=job_id,
                    object_key=artifact.get("object_key"),
                )

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
            _write_sandbox_trace("job_complete", job_id=job_id)
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
            _write_sandbox_trace("job_failed", job_id=job_id, error=str(e))

            try:
                await db.rollback()
            except Exception:
                logger.warning("sandbox_job_rollback_failed", job_id=job_id, exc_info=True)

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
