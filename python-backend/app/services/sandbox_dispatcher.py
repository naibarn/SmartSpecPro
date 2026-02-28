"""Sandbox Dispatcher — classify workloads, enforce policy, dispatch to Celery."""

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.opensandbox.config import opensandbox_settings
from app.models.sandbox import SandboxJob, SandboxJobStatus, TenantSandboxPolicy
from app.services.sandbox_audit import SandboxAuditService
from app.services.sandbox_profiles import SandboxProfileService

logger = structlog.get_logger()

# Re-export for tests that check the mapping
from app.services.sandbox_profiles import FEATURE_PROFILE_MAP  # noqa: F401

# Non-terminal statuses derived from enum (single source of truth)
_TERMINAL = {"completed", "failed", "timed_out", "canceled"}
NON_TERMINAL_STATUSES = {s.value for s in SandboxJobStatus if s.value not in _TERMINAL}


class PolicyDeniedError(Exception):
    """Raised when tenant sandbox policy denies a job request."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class SandboxDispatcher:
    """Classify incoming workloads and dispatch to sandbox via Celery."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.profile_service = SandboxProfileService(db)
        self.audit_service = SandboxAuditService()

    async def dispatch(
        self,
        feature_type: str,
        execution_mode: str,
        tenant_id: str,
        user_id: int,
        inputs: dict,
        feature_ref_id: Optional[str] = None,
        profile_override: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Optional[str]:
        """Dispatch a workload to sandbox execution.

        Returns job_id (UUID string) on success, None if falling back to legacy.
        Raises PolicyDeniedError if tenant policy blocks execution.
        """
        # Step 1: Check if sandbox is enabled
        if not opensandbox_settings.is_enabled:
            logger.info("sandbox_disabled_fallback_legacy")
            return None

        # Step 2: Resolve profile
        profile = await self._resolve_profile(feature_type, profile_override)
        if profile is None:
            logger.warning("sandbox_no_profile", feature_type=feature_type)
            return None

        # Step 3: Enforce tenant policy
        await self._enforce_policy(tenant_id, profile)

        # Step 4: Create job record
        job_id = await self._create_job_record(
            tenant_id=tenant_id,
            user_id=user_id,
            feature_type=feature_type,
            execution_mode=execution_mode,
            profile=profile,
            inputs=inputs,
            feature_ref_id=feature_ref_id,
            idempotency_key=idempotency_key,
        )

        # Step 5: Dispatch Celery task (with error handling for orphan prevention)
        try:
            self._dispatch_celery_task(job_id)
        except Exception as dispatch_err:
            logger.error("sandbox_celery_dispatch_failed", job_id=job_id, error=str(dispatch_err))
            # Mark job as failed so it doesn't become an orphan
            from sqlalchemy import update as sa_update

            stmt = sa_update(SandboxJob).where(SandboxJob.id == job_id).values(
                status="failed",
                status_reason=f"Celery dispatch failed: {str(dispatch_err)[:200]}",
            )
            await self.db.execute(stmt)
            await self.db.commit()
            raise

        # Step 6: Emit audit event
        self.audit_service.emit(
            event_type="sandbox_job_accepted",
            sandbox_job_id=job_id,
            tenant_id=tenant_id,
            user_id=user_id,
            feature_type=feature_type,
            profile_slug=profile.slug,
        )

        logger.info(
            "sandbox_job_dispatched",
            job_id=job_id,
            feature_type=feature_type,
            profile_slug=profile.slug,
            tenant_id=tenant_id,
        )

        return job_id

    async def _resolve_profile(self, feature_type: str, profile_override: Optional[str]):
        """Resolve sandbox profile from feature_type or override slug."""
        if profile_override:
            return await self.profile_service.get_by_slug(profile_override)
        return await self.profile_service.get_by_feature_type(feature_type)

    async def _enforce_policy(self, tenant_id: str, profile) -> None:
        """Check tenant policy limits. Raises PolicyDeniedError if exceeded."""
        # Load tenant policy
        stmt = select(TenantSandboxPolicy).where(
            TenantSandboxPolicy.tenant_id == tenant_id
        )
        result = await self.db.execute(stmt)
        policy = result.scalar_one_or_none()

        if policy is None:
            # No policy = use global defaults, allow
            return

        # Check concurrent sandbox limit
        active_count = await self._count_active_jobs(tenant_id)
        if active_count >= policy.max_concurrent_sandboxes:
            raise PolicyDeniedError(
                f"Tenant {tenant_id} exceeds concurrent sandbox limit "
                f"({active_count}/{policy.max_concurrent_sandboxes})"
            )

        # Check daily runtime limit
        daily_runtime = await self._sum_daily_runtime(tenant_id)
        if daily_runtime >= policy.max_daily_runtime_seconds:
            raise PolicyDeniedError(
                f"Tenant {tenant_id} exceeds daily runtime limit "
                f"({daily_runtime}/{policy.max_daily_runtime_seconds}s)"
            )

    async def _count_active_jobs(self, tenant_id: str) -> int:
        """Count sandbox_jobs in non-terminal status for this tenant."""
        stmt = select(func.count()).select_from(SandboxJob).where(
            and_(
                SandboxJob.tenant_id == tenant_id,
                SandboxJob.status.in_(NON_TERMINAL_STATUSES),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() or 0

    async def _sum_daily_runtime(self, tenant_id: str) -> int:
        """Sum runtime seconds for today's completed jobs for this tenant."""
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        stmt = (
            select(
                func.coalesce(
                    func.sum(
                        func.extract(
                            "epoch",
                            SandboxJob.finished_at - SandboxJob.started_at,
                        )
                    ),
                    0,
                )
            )
            .select_from(SandboxJob)
            .where(
                and_(
                    SandboxJob.tenant_id == tenant_id,
                    SandboxJob.status.in_({"completed", "timed_out"}),
                    SandboxJob.finished_at >= today_start,
                    SandboxJob.started_at.is_not(None),
                    SandboxJob.finished_at.is_not(None),
                )
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar_one_or_none() or 0)

    async def _create_job_record(
        self,
        tenant_id: str,
        user_id: int,
        feature_type: str,
        execution_mode: str,
        profile,
        inputs: dict,
        feature_ref_id: Optional[str],
        idempotency_key: Optional[str],
    ) -> str:
        """Create sandbox_jobs record with status='accepted'. Returns job_id."""
        job_id = str(uuid.uuid4())
        job = SandboxJob(
            id=job_id,
            tenant_id=tenant_id,
            user_id=user_id,
            feature_type=feature_type,
            execution_mode=execution_mode,
            sandbox_profile_id=profile.id,
            status=SandboxJobStatus.ACCEPTED.value,
            input_manifest_json=inputs,
            feature_ref_id=feature_ref_id,
            idempotency_key=idempotency_key,
        )
        self.db.add(job)
        await self.db.commit()
        return job_id

    def _dispatch_celery_task(self, job_id: str) -> None:
        """Send Celery task to sandbox queue."""
        from app.core.celery_app import celery_app

        celery_app.send_task(
            "app.workers.sandbox_job_worker.execute_sandbox_job",
            args=[job_id],
            queue="sandbox",
        )
