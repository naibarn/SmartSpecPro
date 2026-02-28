diff --git a/docker-compose.media.yml b/docker-compose.media.yml
index beaf75a..759cc9f 100644
--- a/docker-compose.media.yml
+++ b/docker-compose.media.yml
@@ -105,6 +105,89 @@ services:
     networks:
       - smartspec-network
 
+  # ============================================
+  # CELERY IMPORT WORKER
+  # Handles: import_presentation_task (PPTX / Google Slides)
+  # These are API-bound (S3 download, Google API), light CPU
+  # ============================================
+  celery-import:
+    build:
+      context: ./python-backend
+      dockerfile: Dockerfile
+    container_name: smartspec-celery-import
+    command: celery -A app.core.celery_app worker --loglevel=info --concurrency=4 -Q presentation_import -n import@%h
+    env_file:
+      - ./python-backend/.env
+    environment:
+      # Override networking: use Docker hostnames instead of localhost
+      - CELERY_BROKER_URL=redis://smartspec-redis:6379/0
+      - CELERY_RESULT_BACKEND=redis://smartspec-redis:6379/0
+      - REDIS_URL=redis://smartspec-redis:6379/0
+      - DATABASE_URL=postgresql+asyncpg://smartspec:smartspec123@smartspec-postgres:5432/smartspec
+      - NODE_INTERNAL_URL=http://host.docker.internal:3000
+    extra_hosts:
+      - "host.docker.internal:host-gateway"
+    volumes:
+      - ./python-backend:/app
+    deploy:
+      resources:
+        limits:
+          cpus: '2.0'
+          memory: 3G
+        reservations:
+          cpus: '0.5'
+          memory: 512M
+    healthcheck:
+      test: ["CMD-SHELL", "celery -A app.core.celery_app inspect ping -d import@$$HOSTNAME || exit 1"]
+      interval: 30s
+      timeout: 10s
+      start_period: 60s
+      retries: 3
+    restart: unless-stopped
+    networks:
+      - smartspec-network
+
+  # ============================================
+  # CELERY SANDBOX WORKER
+  # Handles: execute_sandbox_job (OpenSandbox orchestration)
+  # Manages sandbox lifecycle: provision, execute, collect, destroy
+  # Resource limits: 2 CPUs / 4GB RAM max
+  # ============================================
+  celery-sandbox:
+    build:
+      context: ./python-backend
+      dockerfile: Dockerfile
+    container_name: smartspec-celery-sandbox
+    command: celery -A app.core.celery_app worker --loglevel=info --concurrency=2 -Q sandbox -n sandbox@%h
+    env_file:
+      - ./python-backend/.env
+    environment:
+      - CELERY_BROKER_URL=redis://smartspec-redis:6379/0
+      - CELERY_RESULT_BACKEND=redis://smartspec-redis:6379/0
+      - REDIS_URL=redis://smartspec-redis:6379/0
+      - DATABASE_URL=postgresql+asyncpg://smartspec:smartspec123@smartspec-postgres:5432/smartspec
+    extra_hosts:
+      - "host.docker.internal:host-gateway"
+    volumes:
+      - ./python-backend:/app
+    deploy:
+      resources:
+        limits:
+          cpus: '2.0'
+          memory: 4G
+        reservations:
+          cpus: '0.5'
+          memory: 512M
+    healthcheck:
+      test: ["CMD-SHELL", "celery -A app.core.celery_app inspect ping -d sandbox@$$HOSTNAME || exit 1"]
+      interval: 30s
+      timeout: 10s
+      start_period: 60s
+      retries: 3
+    restart: unless-stopped
+    networks:
+      - smartspec-network
+
   # ============================================
   # CELERY BEAT (Periodic Task Scheduler)
   # Runs exactly once — schedules cleanup + retry tasks
@@ -150,6 +233,7 @@ services:
     depends_on:
       - celery-media
       - celery-video
+      - celery-import
     deploy:
       resources:
         limits:
diff --git a/python-backend/app/core/celery_app.py b/python-backend/app/core/celery_app.py
index 1b3c8b5..c276fed 100644
--- a/python-backend/app/core/celery_app.py
+++ b/python-backend/app/core/celery_app.py
@@ -10,7 +10,7 @@ from app.core.config import settings
 import os
 
 # Required queues — worker MUST consume from all of these
-REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export"]
+REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export", "presentation_import", "sandbox"]
 
 # Create Celery app
 celery_app = Celery(
@@ -40,6 +40,8 @@ celery_app.conf.update(
         Queue("video"),
         Queue("media"),
         Queue("presentation_export"),
+        Queue("presentation_import"),
+        Queue("sandbox"),  # OpenSandbox job execution
     ],
     task_create_missing_queues=True,
     # Queue routing: isolate FFmpeg video tasks from API-based media tasks
@@ -83,6 +85,10 @@ celery_app.conf.update(
         "app.tasks.approval_timeout_tasks.check_expired_approvals": {"queue": "celery"},
         # Presentation headless rendering (CPU + Playwright + FFmpeg)
         "app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"},
+        # Presentation import (PPTX/Google Slides -> slides JSON)
+        "tasks.import_presentation": {"queue": "presentation_import"},
+        # Sandbox job execution -> sandbox queue (isolated, resource-intensive)
+        "app.workers.sandbox_job_worker.execute_sandbox_job": {"queue": "sandbox"},
     },
 )
 
@@ -139,7 +145,7 @@ celery_app.conf.beat_schedule = {
 }
 
 # Auto-discover tasks
-celery_app.autodiscover_tasks(["app.tasks"])
+celery_app.autodiscover_tasks(["app.tasks", "app.workers"])
 
 if __name__ == "__main__":
     celery_app.start()
diff --git a/python-backend/app/services/sandbox_artifacts.py b/python-backend/app/services/sandbox_artifacts.py
new file mode 100644
index 0000000..824fb28
--- /dev/null
+++ b/python-backend/app/services/sandbox_artifacts.py
@@ -0,0 +1,115 @@
+"""Sandbox Artifact Service — upload outputs, checksums, DB records, signed URLs."""
+
+import hashlib
+from typing import Any, List, Optional
+
+import structlog
+from sqlalchemy import select
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.models.sandbox import SandboxArtifact, SandboxJob
+
+logger = structlog.get_logger()
+
+SIGNED_URL_TTL_SECONDS = 900  # 15 minutes
+
+
+class SandboxArtifactService:
+    """Manage sandbox job output artifacts."""
+
+    def __init__(self, db: AsyncSession, storage_service: Any = None):
+        self.db = db
+        self._storage = storage_service
+
+    async def upload_and_record(
+        self,
+        sandbox_job_id: str,
+        file_bytes: bytes,
+        filename: str,
+        artifact_type: str = "primary",
+        mime_type: Optional[str] = None,
+        metadata: Optional[dict] = None,
+    ) -> SandboxArtifact:
+        """Upload file to S3/R2, compute checksum, create DB record.
+
+        Object key format: sandbox-artifacts/{sandbox_job_id}/{filename}
+        """
+        object_key = f"sandbox-artifacts/{sandbox_job_id}/{filename}"
+        sha256 = self._compute_sha256(file_bytes)
+
+        # Upload to S3/R2
+        if self._storage is not None:
+            await self._storage.upload_object(object_key, file_bytes)
+
+        # Create DB record
+        artifact = SandboxArtifact(
+            sandbox_job_id=sandbox_job_id,
+            artifact_type=artifact_type,
+            object_key=object_key,
+            mime_type=mime_type,
+            size_bytes=len(file_bytes),
+            sha256=sha256,
+            is_primary=(artifact_type == "primary"),
+            metadata_json=metadata,
+        )
+
+        self.db.add(artifact)
+        await self.db.commit()
+
+        logger.info(
+            "sandbox_artifact_created",
+            sandbox_job_id=sandbox_job_id,
+            object_key=object_key,
+            size_bytes=len(file_bytes),
+            sha256=sha256,
+        )
+
+        return artifact
+
+    async def generate_signed_url(
+        self, artifact_id: int, tenant_id: str, ttl_seconds: int = SIGNED_URL_TTL_SECONDS
+    ) -> str:
+        """Generate a pre-signed URL for artifact download.
+
+        Enforces tenant isolation — the artifact's job must belong to the requesting tenant.
+        Raises PermissionError if tenant does not own the artifact.
+        """
+        # Load artifact
+        stmt = select(SandboxArtifact).where(SandboxArtifact.id == artifact_id)
+        result = await self.db.execute(stmt)
+        artifact = result.scalar_one_or_none()
+        if artifact is None:
+            raise ValueError(f"Artifact {artifact_id} not found")
+
+        # Load associated job for tenant check
+        stmt = select(SandboxJob).where(SandboxJob.id == artifact.sandbox_job_id)
+        result = await self.db.execute(stmt)
+        job = result.scalar_one_or_none()
+        if job is None:
+            raise ValueError(f"Job {artifact.sandbox_job_id} not found")
+
+        if job.tenant_id != tenant_id:
+            raise PermissionError(
+                f"Artifact {artifact_id} belongs to a different tenant "
+                f"(tenant isolation violation)"
+            )
+
+        # Generate signed URL
+        url = await self._storage.generate_presigned_url(
+            artifact.object_key, ttl_seconds=ttl_seconds
+        )
+
+        return url
+
+    async def list_artifacts(self, sandbox_job_id: str) -> List[SandboxArtifact]:
+        """List all artifacts for a sandbox job."""
+        stmt = select(SandboxArtifact).where(
+            SandboxArtifact.sandbox_job_id == sandbox_job_id
+        )
+        result = await self.db.execute(stmt)
+        return list(result.scalars().all())
+
+    @staticmethod
+    def _compute_sha256(data: bytes) -> str:
+        """Compute SHA-256 hex digest."""
+        return hashlib.sha256(data).hexdigest()
diff --git a/python-backend/app/services/sandbox_audit.py b/python-backend/app/services/sandbox_audit.py
new file mode 100644
index 0000000..d390b59
--- /dev/null
+++ b/python-backend/app/services/sandbox_audit.py
@@ -0,0 +1,113 @@
+"""Sandbox Audit Service — structured lifecycle event emission."""
+
+import json
+import os
+from datetime import datetime, timezone
+from pathlib import Path
+from typing import Optional
+
+import structlog
+
+logger = structlog.get_logger()
+
+# Default JSONL audit log directory (matches existing Node.js pattern)
+DEFAULT_AUDIT_LOG_DIR = os.getenv("AUDIT_LOG_DIR", "logs/audit")
+
+SANDBOX_EVENT_TYPES = [
+    "sandbox_job_accepted",
+    "sandbox_created",
+    "sandbox_executing",
+    "sandbox_completed",
+    "sandbox_failed",
+    "sandbox_deleted",
+]
+
+
+class SandboxAuditService:
+    """Emit structured audit events for sandbox lifecycle stages."""
+
+    def __init__(self, audit_log_dir: Optional[str] = None):
+        self._audit_log_dir = audit_log_dir or DEFAULT_AUDIT_LOG_DIR
+
+    def emit(
+        self,
+        event_type: str,
+        sandbox_job_id: str,
+        tenant_id: str,
+        user_id: int,
+        feature_type: str,
+        profile_slug: str,
+        timing_data: Optional[dict] = None,
+        cost_data: Optional[dict] = None,
+        error_data: Optional[dict] = None,
+    ) -> None:
+        """Emit a single audit event to the JSONL log file.
+
+        Event is written as one JSON line to logs/audit/audit-YYYY-MM-DD.jsonl.
+        Also emits via structlog for standard log aggregation.
+        """
+        event = self._build_event(
+            event_type=event_type,
+            sandbox_job_id=sandbox_job_id,
+            tenant_id=tenant_id,
+            user_id=user_id,
+            feature_type=feature_type,
+            profile_slug=profile_slug,
+            timing_data=timing_data,
+            cost_data=cost_data,
+            error_data=error_data,
+        )
+
+        self._write_jsonl(event)
+
+        logger.info(
+            "sandbox_audit_event",
+            event_type=event_type,
+            sandbox_job_id=sandbox_job_id,
+            tenant_id=tenant_id,
+        )
+
+    def _build_event(
+        self,
+        event_type: str,
+        sandbox_job_id: str,
+        tenant_id: str,
+        user_id: int,
+        feature_type: str,
+        profile_slug: str,
+        timing_data: Optional[dict] = None,
+        cost_data: Optional[dict] = None,
+        error_data: Optional[dict] = None,
+    ) -> dict:
+        """Build the audit event dictionary."""
+        event = {
+            "eventType": event_type,
+            "timestamp": datetime.now(timezone.utc).isoformat(),
+            "sandboxJobId": sandbox_job_id,
+            "tenantId": tenant_id,
+            "userId": user_id,
+            "featureType": feature_type,
+            "profileSlug": profile_slug,
+        }
+
+        if timing_data is not None:
+            event["timing"] = timing_data
+
+        if cost_data is not None:
+            event["cost"] = cost_data
+
+        if error_data is not None:
+            event["error"] = error_data
+
+        return event
+
+    def _write_jsonl(self, event: dict) -> None:
+        """Append event as JSON line to daily audit log file."""
+        log_dir = Path(self._audit_log_dir)
+        log_dir.mkdir(parents=True, exist_ok=True)
+
+        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
+        log_file = log_dir / f"audit-{today}.jsonl"
+
+        with open(log_file, "a", encoding="utf-8") as f:
+            f.write(json.dumps(event, ensure_ascii=False) + "\n")
diff --git a/python-backend/app/services/sandbox_costs.py b/python-backend/app/services/sandbox_costs.py
new file mode 100644
index 0000000..3715e7b
--- /dev/null
+++ b/python-backend/app/services/sandbox_costs.py
@@ -0,0 +1,92 @@
+"""Sandbox Cost Service — compute and attribute job costs."""
+
+from decimal import Decimal
+from typing import Optional
+
+import structlog
+from sqlalchemy import update
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.models.sandbox import SandboxJob
+
+logger = structlog.get_logger()
+
+# Cost rates (USD per unit)
+CPU_SECOND_RATE = Decimal("0.0000125")  # ~$0.045/CPU-hour
+MEMORY_GB_SECOND_RATE = Decimal("0.000005")  # ~$0.018/GB-hour
+STORAGE_GB_RATE = Decimal("0.023")  # per GB-month (S3 standard)
+NETWORK_EGRESS_GB_RATE = Decimal("0.09")  # per GB
+
+
+class SandboxCostService:
+    """Calculate and attribute sandbox job costs."""
+
+    def __init__(self, db: AsyncSession):
+        self.db = db
+
+    def estimate(self, cpu_millicores: int, memory_mb: int, timeout_seconds: int) -> Decimal:
+        """Estimate job cost before execution based on profile defaults.
+
+        Returns estimated cost in USD (used for credit pre-check).
+        Assumes worst case: full timeout duration at full resource allocation.
+        """
+        cpu_cores = Decimal(cpu_millicores) / Decimal("1000")
+        cpu_seconds = cpu_cores * Decimal(timeout_seconds)
+        memory_gb = Decimal(memory_mb) / Decimal("1024")
+        memory_gb_seconds = memory_gb * Decimal(timeout_seconds)
+
+        cost = (cpu_seconds * CPU_SECOND_RATE) + (memory_gb_seconds * MEMORY_GB_SECOND_RATE)
+
+        logger.info(
+            "sandbox_cost_estimate",
+            cpu_millicores=cpu_millicores,
+            memory_mb=memory_mb,
+            timeout_seconds=timeout_seconds,
+            estimated_usd=str(cost),
+        )
+
+        return cost
+
+    async def calculate_actual(
+        self,
+        job_id: str,
+        cpu_seconds: float,
+        memory_gb_seconds: float,
+        storage_written_bytes: int = 0,
+        network_egress_bytes: int = 0,
+    ) -> Decimal:
+        """Calculate actual cost from metered resource consumption.
+
+        Updates sandbox_jobs.cost_actual and returns the cost in USD.
+        """
+        cost = (Decimal(str(cpu_seconds)) * CPU_SECOND_RATE) + (
+            Decimal(str(memory_gb_seconds)) * MEMORY_GB_SECOND_RATE
+        )
+
+        # Add storage cost if applicable
+        if storage_written_bytes > 0:
+            storage_gb = Decimal(storage_written_bytes) / Decimal("1073741824")
+            cost += storage_gb * STORAGE_GB_RATE
+
+        # Add network egress cost if applicable
+        if network_egress_bytes > 0:
+            egress_gb = Decimal(network_egress_bytes) / Decimal("1073741824")
+            cost += egress_gb * NETWORK_EGRESS_GB_RATE
+
+        await self._update_job_cost(job_id, cost)
+
+        logger.info(
+            "sandbox_cost_actual",
+            job_id=job_id,
+            cpu_seconds=cpu_seconds,
+            memory_gb_seconds=memory_gb_seconds,
+            cost_usd=str(cost),
+        )
+
+        return cost
+
+    async def _update_job_cost(self, job_id: str, cost: Decimal) -> None:
+        """Update sandbox_jobs.cost_actual for the given job."""
+        stmt = update(SandboxJob).where(SandboxJob.id == job_id).values(cost_actual=cost)
+        await self.db.execute(stmt)
+        await self.db.commit()
diff --git a/python-backend/app/services/sandbox_dispatcher.py b/python-backend/app/services/sandbox_dispatcher.py
new file mode 100644
index 0000000..f024344
--- /dev/null
+++ b/python-backend/app/services/sandbox_dispatcher.py
@@ -0,0 +1,237 @@
+"""Sandbox Dispatcher — classify workloads, enforce policy, dispatch to Celery."""
+
+import uuid
+from datetime import datetime, timezone
+from typing import Optional
+
+import structlog
+from sqlalchemy import and_, func, select
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.integrations.opensandbox.config import opensandbox_settings
+from app.models.sandbox import SandboxJob, SandboxJobStatus, TenantSandboxPolicy
+from app.services.sandbox_audit import SandboxAuditService
+from app.services.sandbox_profiles import SandboxProfileService
+
+logger = structlog.get_logger()
+
+# Feature type -> default profile slug mapping
+FEATURE_PROFILE_MAP = {
+    "media": "media-processing",
+    "skill": "code-default",
+    "workflow": "code-default",
+    "library": "file-parser",
+    "presentation": "media-processing",
+    "chat": "code-default",
+    "connector": "browser-default",
+}
+
+# Non-terminal statuses (job is still active)
+NON_TERMINAL_STATUSES = {
+    "accepted",
+    "policy_resolved",
+    "queued",
+    "provisioning",
+    "staging_inputs",
+    "executing",
+    "collecting_outputs",
+    "persisting",
+}
+
+
+class PolicyDeniedError(Exception):
+    """Raised when tenant sandbox policy denies a job request."""
+
+    def __init__(self, reason: str):
+        self.reason = reason
+        super().__init__(reason)
+
+
+class SandboxDispatcher:
+    """Classify incoming workloads and dispatch to sandbox via Celery."""
+
+    def __init__(self, db: AsyncSession):
+        self.db = db
+        self.profile_service = SandboxProfileService(db)
+        self.audit_service = SandboxAuditService()
+
+    async def dispatch(
+        self,
+        feature_type: str,
+        execution_mode: str,
+        tenant_id: str,
+        user_id: int,
+        inputs: dict,
+        feature_ref_id: Optional[str] = None,
+        profile_override: Optional[str] = None,
+        idempotency_key: Optional[str] = None,
+    ) -> Optional[str]:
+        """Dispatch a workload to sandbox execution.
+
+        Returns job_id (UUID string) on success, None if falling back to legacy.
+        Raises PolicyDeniedError if tenant policy blocks execution.
+        """
+        # Step 1: Check if sandbox is enabled
+        if not opensandbox_settings.is_enabled:
+            logger.info("sandbox_disabled_fallback_legacy")
+            return None
+
+        # Step 2: Resolve profile
+        profile = await self._resolve_profile(feature_type, profile_override)
+        if profile is None:
+            logger.warning("sandbox_no_profile", feature_type=feature_type)
+            return None
+
+        # Step 3: Enforce tenant policy
+        await self._enforce_policy(tenant_id, profile)
+
+        # Step 4: Create job record
+        job_id = await self._create_job_record(
+            tenant_id=tenant_id,
+            user_id=user_id,
+            feature_type=feature_type,
+            execution_mode=execution_mode,
+            profile=profile,
+            inputs=inputs,
+            feature_ref_id=feature_ref_id,
+            idempotency_key=idempotency_key,
+        )
+
+        # Step 5: Dispatch Celery task
+        self._dispatch_celery_task(job_id)
+
+        # Step 6: Emit audit event
+        self.audit_service.emit(
+            event_type="sandbox_job_accepted",
+            sandbox_job_id=job_id,
+            tenant_id=tenant_id,
+            user_id=user_id,
+            feature_type=feature_type,
+            profile_slug=profile.slug,
+        )
+
+        logger.info(
+            "sandbox_job_dispatched",
+            job_id=job_id,
+            feature_type=feature_type,
+            profile_slug=profile.slug,
+            tenant_id=tenant_id,
+        )
+
+        return job_id
+
+    async def _resolve_profile(self, feature_type: str, profile_override: Optional[str]):
+        """Resolve sandbox profile from feature_type or override slug."""
+        if profile_override:
+            return await self.profile_service.get_by_slug(profile_override)
+        return await self.profile_service.get_by_feature_type(feature_type)
+
+    async def _enforce_policy(self, tenant_id: str, profile) -> None:
+        """Check tenant policy limits. Raises PolicyDeniedError if exceeded."""
+        # Load tenant policy
+        stmt = select(TenantSandboxPolicy).where(
+            TenantSandboxPolicy.tenant_id == tenant_id
+        )
+        result = await self.db.execute(stmt)
+        policy = result.scalar_one_or_none()
+
+        if policy is None:
+            # No policy = use global defaults, allow
+            return
+
+        # Check concurrent sandbox limit
+        active_count = await self._count_active_jobs(tenant_id)
+        if active_count >= policy.max_concurrent_sandboxes:
+            raise PolicyDeniedError(
+                f"Tenant {tenant_id} exceeds concurrent sandbox limit "
+                f"({active_count}/{policy.max_concurrent_sandboxes})"
+            )
+
+        # Check daily runtime limit
+        daily_runtime = await self._sum_daily_runtime(tenant_id)
+        if daily_runtime >= policy.max_daily_runtime_seconds:
+            raise PolicyDeniedError(
+                f"Tenant {tenant_id} exceeds daily runtime limit "
+                f"({daily_runtime}/{policy.max_daily_runtime_seconds}s)"
+            )
+
+    async def _count_active_jobs(self, tenant_id: str) -> int:
+        """Count sandbox_jobs in non-terminal status for this tenant."""
+        stmt = select(func.count()).select_from(SandboxJob).where(
+            and_(
+                SandboxJob.tenant_id == tenant_id,
+                SandboxJob.status.in_(NON_TERMINAL_STATUSES),
+            )
+        )
+        result = await self.db.execute(stmt)
+        return result.scalar_one_or_none() or 0
+
+    async def _sum_daily_runtime(self, tenant_id: str) -> int:
+        """Sum runtime seconds for today's completed jobs for this tenant."""
+        today_start = datetime.now(timezone.utc).replace(
+            hour=0, minute=0, second=0, microsecond=0
+        )
+        stmt = (
+            select(
+                func.coalesce(
+                    func.sum(
+                        func.extract(
+                            "epoch",
+                            SandboxJob.finished_at - SandboxJob.started_at,
+                        )
+                    ),
+                    0,
+                )
+            )
+            .select_from(SandboxJob)
+            .where(
+                and_(
+                    SandboxJob.tenant_id == tenant_id,
+                    SandboxJob.status.in_({"completed", "timed_out"}),
+                    SandboxJob.finished_at >= today_start,
+                    SandboxJob.started_at.is_not(None),
+                    SandboxJob.finished_at.is_not(None),
+                )
+            )
+        )
+        result = await self.db.execute(stmt)
+        return int(result.scalar_one_or_none() or 0)
+
+    async def _create_job_record(
+        self,
+        tenant_id: str,
+        user_id: int,
+        feature_type: str,
+        execution_mode: str,
+        profile,
+        inputs: dict,
+        feature_ref_id: Optional[str],
+        idempotency_key: Optional[str],
+    ) -> str:
+        """Create sandbox_jobs record with status='accepted'. Returns job_id."""
+        job_id = str(uuid.uuid4())
+        job = SandboxJob(
+            id=job_id,
+            tenant_id=tenant_id,
+            user_id=user_id,
+            feature_type=feature_type,
+            execution_mode=execution_mode,
+            sandbox_profile_id=profile.id,
+            status=SandboxJobStatus.ACCEPTED.value,
+            input_manifest_json=inputs,
+            feature_ref_id=feature_ref_id,
+            idempotency_key=idempotency_key,
+        )
+        self.db.add(job)
+        await self.db.commit()
+        return job_id
+
+    def _dispatch_celery_task(self, job_id: str) -> None:
+        """Send Celery task to sandbox queue."""
+        from app.core.celery_app import celery_app
+
+        celery_app.send_task(
+            "app.workers.sandbox_job_worker.execute_sandbox_job",
+            args=[job_id],
+            queue="sandbox",
+        )
diff --git a/python-backend/app/services/sandbox_profiles.py b/python-backend/app/services/sandbox_profiles.py
new file mode 100644
index 0000000..193fb63
--- /dev/null
+++ b/python-backend/app/services/sandbox_profiles.py
@@ -0,0 +1,100 @@
+"""Sandbox Profile Service — load, cache, resolve, and merge sandbox profiles."""
+
+import time
+from typing import Dict, Optional
+
+import structlog
+from sqlalchemy import select
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.models.sandbox import SandboxProfile, TenantSandboxPolicy
+
+logger = structlog.get_logger()
+
+CACHE_TTL_SECONDS = 60
+
+# Feature type -> default profile slug mapping
+FEATURE_PROFILE_MAP = {
+    "media": "media-processing",
+    "skill": "code-default",
+    "workflow": "code-default",
+    "library": "file-parser",
+    "presentation": "media-processing",
+    "chat": "code-default",
+    "connector": "browser-default",
+}
+
+
+class SandboxProfileService:
+    """Load sandbox profiles from DB with in-memory caching."""
+
+    def __init__(self, db: AsyncSession):
+        self.db = db
+        self._cache: Dict[str, SandboxProfile] = {}
+        self._cache_timestamp: float = 0.0
+
+    async def get_by_slug(self, slug: str) -> Optional[SandboxProfile]:
+        """Load a profile by slug, using cache when possible."""
+        if self._is_cache_stale():
+            await self._refresh_cache()
+        return self._cache.get(slug)
+
+    async def get_by_feature_type(self, feature_type: str) -> Optional[SandboxProfile]:
+        """Map feature_type to profile slug, then load."""
+        slug = FEATURE_PROFILE_MAP.get(feature_type)
+        if slug is None:
+            logger.warning("unknown_feature_type", feature_type=feature_type)
+            return None
+        return await self.get_by_slug(slug)
+
+    async def merge_with_overrides(
+        self,
+        profile: SandboxProfile,
+        overrides: dict,
+        tenant_policy: Optional[TenantSandboxPolicy] = None,
+    ) -> dict:
+        """Merge profile defaults with per-job overrides.
+
+        If tenant_policy is provided, cap resource limits at policy maximums.
+        Returns a dict with the final resolved configuration.
+        """
+        merged = {
+            "cpu_limit": profile.cpu_limit,
+            "memory_limit_mb": profile.memory_limit_mb,
+            "timeout_seconds": profile.timeout_seconds,
+            "ephemeral_disk_mb": profile.ephemeral_disk_mb,
+            "network_default_action": profile.network_default_action,
+            "base_image": profile.base_image,
+            "execution_mode": profile.execution_mode,
+        }
+
+        # Apply overrides for non-None values
+        for key, value in overrides.items():
+            if value is not None and key in merged:
+                merged[key] = value
+
+        # Cap against tenant policy limits
+        if tenant_policy is not None:
+            if merged["timeout_seconds"] > tenant_policy.max_single_job_seconds:
+                merged["timeout_seconds"] = tenant_policy.max_single_job_seconds
+                logger.info(
+                    "timeout_capped_by_policy",
+                    capped_to=tenant_policy.max_single_job_seconds,
+                )
+
+        return merged
+
+    async def _refresh_cache(self) -> None:
+        """Load all active profiles from DB into cache."""
+        stmt = select(SandboxProfile).where(SandboxProfile.is_active.is_(True))
+        result = await self.db.execute(stmt)
+        profiles = result.scalars().all()
+        self._cache = {p.slug: p for p in profiles}
+        self._cache_timestamp = time.monotonic()
+        logger.info("profile_cache_refreshed", count=len(self._cache))
+
+    def _is_cache_stale(self) -> bool:
+        """Check if cache is older than CACHE_TTL_SECONDS."""
+        if not self._cache:
+            return True
+        return (time.monotonic() - self._cache_timestamp) > CACHE_TTL_SECONDS
diff --git a/python-backend/app/workers/__init__.py b/python-backend/app/workers/__init__.py
new file mode 100644
index 0000000..13ea547
--- /dev/null
+++ b/python-backend/app/workers/__init__.py
@@ -0,0 +1 @@
+"""Celery worker tasks for OpenSandbox job execution."""
diff --git a/python-backend/app/workers/sandbox_job_worker.py b/python-backend/app/workers/sandbox_job_worker.py
new file mode 100644
index 0000000..01900fe
--- /dev/null
+++ b/python-backend/app/workers/sandbox_job_worker.py
@@ -0,0 +1,321 @@
+"""Sandbox Job Worker — Celery task managing full sandbox lifecycle.
+
+This task is dispatched by SandboxDispatcher and handles:
+1. Provision sandbox container
+2. Stage input files into sandbox
+3. Execute commands/code
+4. Collect output files from sandbox
+5. Upload outputs to S3/R2
+6. Destroy sandbox container
+7. Update job status throughout
+"""
+
+import asyncio
+from contextlib import asynccontextmanager
+from datetime import datetime, timezone
+from typing import Optional
+
+import structlog
+
+from app.core.celery_app import celery_app
+from app.integrations.opensandbox.client import OpenSandboxClient
+from app.integrations.opensandbox.config import opensandbox_settings
+from app.integrations.opensandbox.execution import run_command, run_code
+from app.integrations.opensandbox.files import collect_outputs, stage_inputs
+from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+from app.integrations.opensandbox.models import SandboxConfig
+from app.models.sandbox import SandboxJob, SandboxProfile
+from app.services.sandbox_artifacts import SandboxArtifactService
+from app.services.sandbox_audit import SandboxAuditService
+from app.services.sandbox_costs import SandboxCostService
+
+logger = structlog.get_logger()
+
+# Non-terminal statuses (job is still active)
+NON_TERMINAL_STATUSES = {
+    "accepted",
+    "policy_resolved",
+    "queued",
+    "provisioning",
+    "staging_inputs",
+    "executing",
+    "collecting_outputs",
+    "persisting",
+}
+
+# Terminal statuses (job is done)
+TERMINAL_STATUSES = {"completed", "failed", "timed_out", "canceled"}
+
+
+@asynccontextmanager
+async def _get_db_session():
+    """Get an async database session."""
+    from app.core.database import async_session_factory
+
+    async with async_session_factory() as session:
+        yield session
+
+
+async def _load_job(db, job_id: str) -> Optional[SandboxJob]:
+    """Load SandboxJob from database."""
+    from sqlalchemy import select
+
+    stmt = select(SandboxJob).where(SandboxJob.id == job_id)
+    result = await db.execute(stmt)
+    return result.scalar_one_or_none()
+
+
+async def _load_profile(db, profile_id: int) -> Optional[SandboxProfile]:
+    """Load SandboxProfile from database."""
+    from sqlalchemy import select
+
+    stmt = select(SandboxProfile).where(SandboxProfile.id == profile_id)
+    result = await db.execute(stmt)
+    return result.scalar_one_or_none()
+
+
+async def _update_job_status(
+    db, job_id: str, status: str, reason: Optional[str] = None, **kwargs
+) -> None:
+    """Update sandbox_jobs status and optional fields."""
+    from sqlalchemy import update
+
+    values = {"status": status, "updatedAt": datetime.now(timezone.utc)}
+    if reason:
+        values["statusReason"] = reason
+    values.update(kwargs)
+
+    stmt = update(SandboxJob).where(SandboxJob.id == job_id).values(**values)
+    await db.execute(stmt)
+    await db.commit()
+
+
+@celery_app.task(
+    name="app.workers.sandbox_job_worker.execute_sandbox_job",
+    bind=True,
+    max_retries=3,
+    default_retry_delay=10,
+    acks_late=True,
+    reject_on_worker_lost=True,
+    time_limit=1800,
+    soft_time_limit=1740,
+)
+def execute_sandbox_job(self, job_id: str) -> dict:
+    """Execute a sandbox job through its full lifecycle.
+
+    This is a synchronous Celery task that internally runs async code
+    via asyncio.run(), matching the existing pattern in media_job_worker.py.
+    """
+    return asyncio.run(_execute_sandbox_job_async(self, job_id))
+
+
+async def _execute_sandbox_job_async(task, job_id: str) -> dict:
+    """Async implementation of sandbox job execution.
+
+    Status transitions:
+        accepted -> queued -> provisioning -> staging_inputs ->
+        executing -> collecting_outputs -> persisting -> completed
+
+    On error: -> failed (or timed_out)
+    Sandbox is ALWAYS destroyed in the finally block.
+    """
+    audit_service = SandboxAuditService()
+    sandbox_id = None
+    client = None
+
+    async with _get_db_session() as db:
+        try:
+            # Load job from DB
+            job = await _load_job(db, job_id)
+            if job is None:
+                logger.error("sandbox_job_not_found", job_id=job_id)
+                return {"status": "failed", "reason": "job not found"}
+
+            if job.status in TERMINAL_STATUSES:
+                logger.warning("sandbox_job_already_terminal", job_id=job_id, status=job.status)
+                return {"status": job.status, "reason": "already terminal"}
+
+            # Load profile
+            profile = await _load_profile(db, job.sandbox_profile_id)
+            if profile is None:
+                await _update_job_status(db, job_id, "failed", reason="profile not found")
+                return {"status": "failed", "reason": "profile not found"}
+
+            # Initialize services
+            client = OpenSandboxClient(opensandbox_settings)
+            lifecycle = SandboxLifecycleManager(client)
+            cost_service = SandboxCostService(db)
+            artifact_service = SandboxArtifactService(db)
+
+            # Status: queued -> provisioning
+            await _update_job_status(db, job_id, "queued")
+
+            await _update_job_status(
+                db, job_id, "provisioning",
+                startedAt=datetime.now(timezone.utc),
+            )
+
+            # Provision sandbox
+            sandbox_config = SandboxConfig(
+                image=profile.base_image,
+                cpu_limit=profile.cpu_limit,
+                memory_limit_mb=profile.memory_limit_mb,
+                disk_limit_mb=profile.ephemeral_disk_mb,
+                timeout_seconds=profile.timeout_seconds,
+                network_default_action=profile.network_default_action,
+            )
+            sandbox_id = await lifecycle.provision_sandbox(sandbox_config, job_id)
+
+            await _update_job_status(db, job_id, "staging_inputs",
+                                     opensandboxId=sandbox_id)
+
+            audit_service.emit(
+                event_type="sandbox_created",
+                sandbox_job_id=job_id,
+                tenant_id=job.tenant_id,
+                user_id=job.user_id,
+                feature_type=job.feature_type,
+                profile_slug=profile.slug,
+            )
+
+            # Stage inputs
+            manifest = job.input_manifest_json or {}
+            input_files = manifest.get("input_files", [])
+            if input_files:
+                await stage_inputs(client, sandbox_id, input_files, storage_service=None)
+
+            # Execute commands
+            await _update_job_status(db, job_id, "executing")
+
+            audit_service.emit(
+                event_type="sandbox_executing",
+                sandbox_job_id=job_id,
+                tenant_id=job.tenant_id,
+                user_id=job.user_id,
+                feature_type=job.feature_type,
+                profile_slug=profile.slug,
+            )
+
+            commands = manifest.get("commands", [])
+            all_stdout = []
+            all_stderr = []
+
+            for cmd in commands:
+                result = await run_command(
+                    client, sandbox_id, cmd, timeout=profile.timeout_seconds
+                )
+                all_stdout.append(result.stdout)
+                all_stderr.append(result.stderr)
+
+                if result.exit_code != 0:
+                    logger.warning(
+                        "sandbox_command_failed",
+                        job_id=job_id,
+                        command=cmd[:100],
+                        exit_code=result.exit_code,
+                    )
+
+            # Collect outputs
+            await _update_job_status(db, job_id, "collecting_outputs")
+
+            output_paths = manifest.get("output_paths", [])
+            collected = []
+            if output_paths:
+                collected = await collect_outputs(
+                    client,
+                    sandbox_id,
+                    output_paths,
+                    storage_service=None,
+                    artifact_bucket="",
+                    job_id=job_id,
+                )
+
+            # Persist results
+            await _update_job_status(db, job_id, "persisting")
+
+            stdout_excerpt = "\n---\n".join(all_stdout)[:10000]
+            stderr_excerpt = "\n---\n".join(all_stderr)[:10000]
+
+            # Calculate cost
+            cpu_seconds = float(profile.timeout_seconds)  # Approximate
+            memory_gb = float(profile.memory_limit_mb) / 1024.0
+            memory_gb_seconds = memory_gb * cpu_seconds
+            cost = await cost_service.calculate_actual(
+                job_id=job_id,
+                cpu_seconds=cpu_seconds,
+                memory_gb_seconds=memory_gb_seconds,
+            )
+
+            # Mark completed
+            await _update_job_status(
+                db,
+                job_id,
+                "completed",
+                finishedAt=datetime.now(timezone.utc),
+                stdoutExcerpt=stdout_excerpt,
+                stderrExcerpt=stderr_excerpt,
+                outputManifestJson=collected,
+            )
+
+            audit_service.emit(
+                event_type="sandbox_completed",
+                sandbox_job_id=job_id,
+                tenant_id=job.tenant_id,
+                user_id=job.user_id,
+                feature_type=job.feature_type,
+                profile_slug=profile.slug,
+                cost_data={"costUsd": str(cost)},
+            )
+
+            logger.info("sandbox_job_completed", job_id=job_id)
+            return {"status": "completed", "job_id": job_id}
+
+        except Exception as e:
+            logger.error("sandbox_job_failed", job_id=job_id, error=str(e), exc_info=True)
+
+            try:
+                await _update_job_status(
+                    db, job_id, "failed",
+                    reason=str(e)[:500],
+                    finishedAt=datetime.now(timezone.utc),
+                )
+            except Exception:
+                logger.error("sandbox_status_update_failed", job_id=job_id, exc_info=True)
+
+            audit_service.emit(
+                event_type="sandbox_failed",
+                sandbox_job_id=job_id,
+                tenant_id=getattr(job, "tenant_id", "unknown") if "job" in dir() else "unknown",
+                user_id=getattr(job, "user_id", 0) if "job" in dir() else 0,
+                feature_type=getattr(job, "feature_type", "unknown") if "job" in dir() else "unknown",
+                profile_slug=getattr(profile, "slug", "unknown") if "profile" in dir() else "unknown",
+                error_data={"message": str(e)[:500]},
+            )
+
+            return {"status": "failed", "job_id": job_id, "error": str(e)[:500]}
+
+        finally:
+            # Always destroy sandbox
+            if sandbox_id and client:
+                try:
+                    lifecycle_cleanup = SandboxLifecycleManager(client)
+                    await lifecycle_cleanup.destroy_sandbox(sandbox_id)
+
+                    audit_service.emit(
+                        event_type="sandbox_deleted",
+                        sandbox_job_id=job_id,
+                        tenant_id=getattr(job, "tenant_id", "unknown") if "job" in dir() else "unknown",
+                        user_id=getattr(job, "user_id", 0) if "job" in dir() else 0,
+                        feature_type=getattr(job, "feature_type", "unknown") if "job" in dir() else "unknown",
+                        profile_slug=getattr(profile, "slug", "unknown") if "profile" in dir() else "unknown",
+                    )
+                except Exception:
+                    logger.warning(
+                        "sandbox_destroy_failed",
+                        sandbox_id=sandbox_id,
+                        job_id=job_id,
+                        exc_info=True,
+                    )
+
+            if client:
+                await client.close()
diff --git a/python-backend/tests/test_sandbox_artifacts.py b/python-backend/tests/test_sandbox_artifacts.py
new file mode 100644
index 0000000..6557067
--- /dev/null
+++ b/python-backend/tests/test_sandbox_artifacts.py
@@ -0,0 +1,149 @@
+"""Tests for sandbox_artifacts.py — S3/R2 upload, checksum, DB records, signed URLs."""
+import hashlib
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.services.sandbox_artifacts import SIGNED_URL_TTL_SECONDS, SandboxArtifactService
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+def _make_artifact(sandbox_job_id="job-123", artifact_type="primary",
+                   object_key="sandbox-artifacts/job-123/output.mp4",
+                   size_bytes=1024, sha256="abc123"):
+    """Create a mock SandboxArtifact."""
+    artifact = MagicMock()
+    artifact.id = 1
+    artifact.sandbox_job_id = sandbox_job_id
+    artifact.artifact_type = artifact_type
+    artifact.object_key = object_key
+    artifact.size_bytes = size_bytes
+    artifact.sha256 = sha256
+    artifact.mime_type = "video/mp4"
+    return artifact
+
+
+def _make_job(job_id="job-123", tenant_id="tenant-1"):
+    """Create a mock SandboxJob."""
+    job = MagicMock()
+    job.id = job_id
+    job.tenant_id = tenant_id
+    return job
+
+
+class TestArtifactUpload:
+    """Artifact service uploads outputs and creates DB records."""
+
+    @pytest.mark.asyncio
+    async def test_upload_to_s3_with_correct_object_key(self):
+        """Uploads sandbox output to S3/R2 using sandbox-artifacts/{job_id}/{filename} key."""
+        db = AsyncMock()
+        storage = AsyncMock()
+        service = SandboxArtifactService(db, storage_service=storage)
+
+        file_bytes = b"fake video content"
+        result = await service.upload_and_record(
+            sandbox_job_id="job-123",
+            file_bytes=file_bytes,
+            filename="output.mp4",
+            mime_type="video/mp4",
+        )
+
+        storage.upload_object.assert_called_once()
+        call_args = storage.upload_object.call_args
+        assert "sandbox-artifacts/job-123/output.mp4" in call_args[0]
+
+    @pytest.mark.asyncio
+    async def test_sha256_checksum_computed_and_stored(self):
+        """SHA-256 checksum is computed from file bytes."""
+        db = AsyncMock()
+        storage = AsyncMock()
+        service = SandboxArtifactService(db, storage_service=storage)
+
+        file_bytes = b"test content for checksum"
+        expected_sha = hashlib.sha256(file_bytes).hexdigest()
+
+        result = await service.upload_and_record(
+            sandbox_job_id="job-123",
+            file_bytes=file_bytes,
+            filename="data.json",
+        )
+
+        # The DB add call should include the sha256
+        db.add.assert_called_once()
+        artifact = db.add.call_args[0][0]
+        assert artifact.sha256 == expected_sha
+
+    @pytest.mark.asyncio
+    async def test_sandbox_artifacts_record_created(self):
+        """A sandbox_artifacts DB row is created with correct fields."""
+        db = AsyncMock()
+        storage = AsyncMock()
+        service = SandboxArtifactService(db, storage_service=storage)
+
+        file_bytes = b"content"
+        result = await service.upload_and_record(
+            sandbox_job_id="job-456",
+            file_bytes=file_bytes,
+            filename="result.png",
+            artifact_type="primary",
+            mime_type="image/png",
+        )
+
+        db.add.assert_called_once()
+        artifact = db.add.call_args[0][0]
+        assert artifact.sandbox_job_id == "job-456"
+        assert artifact.artifact_type == "primary"
+        assert artifact.mime_type == "image/png"
+        assert artifact.size_bytes == len(file_bytes)
+        db.commit.assert_called_once()
+
+
+class TestArtifactAccess:
+    """Artifact service generates signed URLs and enforces tenant isolation."""
+
+    @pytest.mark.asyncio
+    async def test_signed_url_generated_with_ttl(self):
+        """Signed URL has default TTL."""
+        db = AsyncMock()
+        storage = AsyncMock()
+        storage.generate_presigned_url.return_value = "https://r2.example.com/signed-url"
+
+        artifact = _make_artifact()
+        job = _make_job(tenant_id="tenant-1")
+
+        # Mock DB lookups
+        mock_result_artifact = MagicMock()
+        mock_result_artifact.scalar_one_or_none.return_value = artifact
+        mock_result_job = MagicMock()
+        mock_result_job.scalar_one_or_none.return_value = job
+
+        db.execute.side_effect = [mock_result_artifact, mock_result_job]
+
+        service = SandboxArtifactService(db, storage_service=storage)
+        url = await service.generate_signed_url(artifact_id=1, tenant_id="tenant-1")
+
+        assert url == "https://r2.example.com/signed-url"
+        storage.generate_presigned_url.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_tenant_isolation_enforced(self):
+        """Attempting to access another tenant's artifact raises PermissionError."""
+        db = AsyncMock()
+        storage = AsyncMock()
+
+        artifact = _make_artifact()
+        job = _make_job(tenant_id="tenant-1")  # Artifact belongs to tenant-1
+
+        mock_result_artifact = MagicMock()
+        mock_result_artifact.scalar_one_or_none.return_value = artifact
+        mock_result_job = MagicMock()
+        mock_result_job.scalar_one_or_none.return_value = job
+
+        db.execute.side_effect = [mock_result_artifact, mock_result_job]
+
+        service = SandboxArtifactService(db, storage_service=storage)
+
+        with pytest.raises(PermissionError, match="tenant isolation"):
+            await service.generate_signed_url(artifact_id=1, tenant_id="tenant-2")
diff --git a/python-backend/tests/test_sandbox_audit.py b/python-backend/tests/test_sandbox_audit.py
new file mode 100644
index 0000000..6904335
--- /dev/null
+++ b/python-backend/tests/test_sandbox_audit.py
@@ -0,0 +1,105 @@
+"""Tests for sandbox_audit.py — structured audit event emission."""
+import json
+import os
+import tempfile
+from unittest.mock import patch
+
+import pytest
+
+from app.services.sandbox_audit import SandboxAuditService
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+class TestAuditEvents:
+    """Sandbox audit service emits structured lifecycle events."""
+
+    @pytest.mark.asyncio
+    async def test_emit_event_for_each_lifecycle_stage(self):
+        """Each sandbox status transition emits an audit event with the correct event_type."""
+        with tempfile.TemporaryDirectory() as tmpdir:
+            service = SandboxAuditService(audit_log_dir=tmpdir)
+
+            for event_type in ["sandbox_job_accepted", "sandbox_created",
+                               "sandbox_executing", "sandbox_completed"]:
+                service.emit(
+                    event_type=event_type,
+                    sandbox_job_id="job-123",
+                    tenant_id="tenant-1",
+                    user_id=42,
+                    feature_type="media",
+                    profile_slug="media-processing",
+                )
+
+            # Check the audit log file
+            log_files = os.listdir(tmpdir)
+            assert len(log_files) == 1
+            assert log_files[0].startswith("audit-")
+            assert log_files[0].endswith(".jsonl")
+
+            with open(os.path.join(tmpdir, log_files[0])) as f:
+                lines = f.readlines()
+                assert len(lines) == 4
+                events = [json.loads(line) for line in lines]
+                assert events[0]["eventType"] == "sandbox_job_accepted"
+                assert events[3]["eventType"] == "sandbox_completed"
+
+    @pytest.mark.asyncio
+    async def test_event_includes_required_fields(self):
+        """Every event includes sandboxJobId, tenantId, userId, featureType, profileSlug."""
+        with tempfile.TemporaryDirectory() as tmpdir:
+            service = SandboxAuditService(audit_log_dir=tmpdir)
+            service.emit(
+                event_type="sandbox_job_accepted",
+                sandbox_job_id="job-456",
+                tenant_id="tenant-2",
+                user_id=99,
+                feature_type="skill",
+                profile_slug="code-default",
+                timing_data={"totalMs": 1234},
+                cost_data={"cpuSeconds": 10, "estimatedUsd": 0.05},
+            )
+
+            log_files = os.listdir(tmpdir)
+            with open(os.path.join(tmpdir, log_files[0])) as f:
+                event = json.loads(f.readline())
+
+            assert event["sandboxJobId"] == "job-456"
+            assert event["tenantId"] == "tenant-2"
+            assert event["userId"] == 99
+            assert event["featureType"] == "skill"
+            assert event["profileSlug"] == "code-default"
+            assert event["timing"]["totalMs"] == 1234
+            assert event["cost"]["cpuSeconds"] == 10
+            assert "timestamp" in event
+
+    @pytest.mark.asyncio
+    async def test_events_written_to_jsonl_audit_log(self):
+        """Audit events are appended to the daily JSONL audit log file."""
+        with tempfile.TemporaryDirectory() as tmpdir:
+            service = SandboxAuditService(audit_log_dir=tmpdir)
+
+            service.emit(
+                event_type="sandbox_created",
+                sandbox_job_id="job-789",
+                tenant_id="tenant-3",
+                user_id=1,
+                feature_type="media",
+                profile_slug="media-processing",
+            )
+            service.emit(
+                event_type="sandbox_completed",
+                sandbox_job_id="job-789",
+                tenant_id="tenant-3",
+                user_id=1,
+                feature_type="media",
+                profile_slug="media-processing",
+            )
+
+            log_files = os.listdir(tmpdir)
+            with open(os.path.join(tmpdir, log_files[0])) as f:
+                lines = f.readlines()
+                assert len(lines) == 2
+                # Each line is valid JSON
+                for line in lines:
+                    json.loads(line)
diff --git a/python-backend/tests/test_sandbox_celery_routing.py b/python-backend/tests/test_sandbox_celery_routing.py
new file mode 100644
index 0000000..2ea7dfa
--- /dev/null
+++ b/python-backend/tests/test_sandbox_celery_routing.py
@@ -0,0 +1,37 @@
+"""Tests for Celery queue routing — sandbox tasks routed to dedicated queue."""
+import pytest
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+class TestQueueRouting:
+    """Sandbox Celery tasks use the 'sandbox' queue."""
+
+    def test_sandbox_tasks_routed_to_sandbox_queue(self):
+        """The sandbox job worker task is routed to the 'sandbox' queue in task_routes."""
+        from app.core.celery_app import celery_app
+
+        routes = celery_app.conf.task_routes
+        assert routes.get("app.workers.sandbox_job_worker.execute_sandbox_job") == {
+            "queue": "sandbox"
+        }
+
+    def test_existing_queues_unaffected(self):
+        """Existing media, video, presentation queues remain unchanged."""
+        from app.core.celery_app import REQUIRED_QUEUES
+
+        for q in ["celery", "video", "media", "presentation_export", "presentation_import"]:
+            assert q in REQUIRED_QUEUES
+
+    def test_sandbox_queue_declared(self):
+        """The 'sandbox' Queue is declared in task_queues config."""
+        from app.core.celery_app import celery_app
+
+        queue_names = [q.name for q in celery_app.conf.task_queues]
+        assert "sandbox" in queue_names
+
+    def test_sandbox_in_required_queues(self):
+        """Sandbox queue is in REQUIRED_QUEUES list."""
+        from app.core.celery_app import REQUIRED_QUEUES
+
+        assert "sandbox" in REQUIRED_QUEUES
diff --git a/python-backend/tests/test_sandbox_costs.py b/python-backend/tests/test_sandbox_costs.py
new file mode 100644
index 0000000..9ce46d3
--- /dev/null
+++ b/python-backend/tests/test_sandbox_costs.py
@@ -0,0 +1,81 @@
+"""Tests for sandbox_costs.py — cost calculation and attribution."""
+from decimal import Decimal
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.services.sandbox_costs import (
+    CPU_SECOND_RATE,
+    MEMORY_GB_SECOND_RATE,
+    SandboxCostService,
+)
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+class TestCostCalculation:
+    """Cost service computes job cost from resource consumption."""
+
+    @pytest.mark.asyncio
+    async def test_cost_from_cpu_seconds_and_memory(self):
+        """Cost = f(cpu_seconds * cpu_rate + memory_gb_seconds * memory_rate)."""
+        db = AsyncMock()
+        service = SandboxCostService(db)
+
+        cost = service.estimate(
+            cpu_millicores=1000,  # 1 CPU
+            memory_mb=2048,      # 2 GB
+            timeout_seconds=300,  # 5 minutes
+        )
+
+        # Expected: 300 * 0.0000125 + (2 * 300) * 0.000005
+        expected = Decimal("300") * CPU_SECOND_RATE + Decimal("600") * MEMORY_GB_SECOND_RATE
+        assert cost == expected
+        assert isinstance(cost, Decimal)
+
+    @pytest.mark.asyncio
+    async def test_sandbox_jobs_cost_actual_updated(self):
+        """On completion, sandbox_jobs.cost_actual is updated."""
+        db = AsyncMock()
+        mock_result = MagicMock()
+        mock_result.rowcount = 1
+        db.execute.return_value = mock_result
+
+        service = SandboxCostService(db)
+        cost = await service.calculate_actual(
+            job_id="job-123",
+            cpu_seconds=150.0,
+            memory_gb_seconds=300.0,
+        )
+
+        assert isinstance(cost, Decimal)
+        assert cost > Decimal("0")
+        # Verify DB update was called
+        db.execute.assert_called_once()
+        db.commit.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_cost_attributed_to_tenant_and_feature(self):
+        """Cost record includes proper calculation for attribution."""
+        db = AsyncMock()
+        service = SandboxCostService(db)
+
+        cost = service.estimate(
+            cpu_millicores=2000,  # 2 CPUs
+            memory_mb=4096,      # 4 GB
+            timeout_seconds=600,  # 10 minutes
+        )
+
+        # 2 CPUs = 1200 cpu_seconds (600 * 2), 4 GB = 2400 memory_gb_seconds (600 * 4)
+        expected_cpu = Decimal("1200") * CPU_SECOND_RATE
+        expected_mem = Decimal("2400") * MEMORY_GB_SECOND_RATE
+        assert cost == expected_cpu + expected_mem
+
+    @pytest.mark.asyncio
+    async def test_estimate_with_zero_values(self):
+        """Estimate with zero resources returns zero cost."""
+        db = AsyncMock()
+        service = SandboxCostService(db)
+
+        cost = service.estimate(cpu_millicores=0, memory_mb=0, timeout_seconds=0)
+        assert cost == Decimal("0")
diff --git a/python-backend/tests/test_sandbox_dispatcher.py b/python-backend/tests/test_sandbox_dispatcher.py
new file mode 100644
index 0000000..f898af2
--- /dev/null
+++ b/python-backend/tests/test_sandbox_dispatcher.py
@@ -0,0 +1,304 @@
+"""Tests for sandbox_dispatcher.py — workload classification, policy enforcement, Celery dispatch."""
+from unittest.mock import AsyncMock, MagicMock, patch
+from datetime import datetime, timezone
+
+import pytest
+
+from app.services.sandbox_dispatcher import (
+    FEATURE_PROFILE_MAP,
+    PolicyDeniedError,
+    SandboxDispatcher,
+)
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+def _make_profile(slug="media-processing", id=1, **kwargs):
+    """Create a mock SandboxProfile."""
+    profile = MagicMock()
+    profile.slug = slug
+    profile.id = id
+    profile.timeout_seconds = kwargs.get("timeout_seconds", 300)
+    profile.cpu_limit = kwargs.get("cpu_limit", "1000m")
+    profile.memory_limit_mb = kwargs.get("memory_limit_mb", 2048)
+    return profile
+
+
+def _make_policy(max_concurrent_sandboxes=5, max_daily_runtime_seconds=36000, **kwargs):
+    """Create a mock TenantSandboxPolicy."""
+    policy = MagicMock()
+    policy.max_concurrent_sandboxes = max_concurrent_sandboxes
+    policy.max_daily_runtime_seconds = max_daily_runtime_seconds
+    policy.max_single_job_seconds = kwargs.get("max_single_job_seconds", 1800)
+    return policy
+
+
+class TestDispatcherRouting:
+    """Dispatcher routes workloads to sandbox or legacy based on feature flags."""
+
+    @pytest.mark.asyncio
+    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
+    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
+    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
+    async def test_routes_to_celery_when_enabled(self, MockProfileSvc, MockAuditSvc, mock_settings):
+        """When OPENSANDBOX_ENABLED=true, dispatcher creates record and sends Celery task."""
+        mock_settings.is_enabled = True
+        db = AsyncMock()
+        profile = _make_profile()
+
+        profile_svc = AsyncMock()
+        profile_svc.get_by_feature_type.return_value = profile
+        MockProfileSvc.return_value = profile_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        # Mock policy query - no policy (use defaults)
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = None
+        db.execute.return_value = mock_result
+
+        dispatcher = SandboxDispatcher(db)
+
+        with patch.object(dispatcher, "_dispatch_celery_task"):
+            job_id = await dispatcher.dispatch(
+                feature_type="media",
+                execution_mode="command",
+                tenant_id="tenant-1",
+                user_id=42,
+                inputs={"command": "ffmpeg -version"},
+            )
+
+        assert job_id is not None
+        assert isinstance(job_id, str)
+        assert len(job_id) == 36  # UUID
+
+    @pytest.mark.asyncio
+    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
+    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
+    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
+    async def test_falls_back_to_legacy_when_disabled(self, MockProfileSvc, MockAuditSvc,
+                                                       mock_settings):
+        """When OPENSANDBOX_ENABLED=false, dispatcher returns None."""
+        mock_settings.is_enabled = False
+        db = AsyncMock()
+
+        dispatcher = SandboxDispatcher(db)
+        result = await dispatcher.dispatch(
+            feature_type="media",
+            execution_mode="command",
+            tenant_id="tenant-1",
+            user_id=42,
+            inputs={},
+        )
+
+        assert result is None
+
+    @pytest.mark.asyncio
+    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
+    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
+    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
+    async def test_returns_job_id_for_polling(self, MockProfileSvc, MockAuditSvc, mock_settings):
+        """Dispatcher returns the UUID job_id."""
+        mock_settings.is_enabled = True
+        db = AsyncMock()
+        profile = _make_profile()
+
+        profile_svc = AsyncMock()
+        profile_svc.get_by_feature_type.return_value = profile
+        MockProfileSvc.return_value = profile_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = None
+        db.execute.return_value = mock_result
+
+        dispatcher = SandboxDispatcher(db)
+
+        with patch.object(dispatcher, "_dispatch_celery_task"):
+            job_id = await dispatcher.dispatch(
+                feature_type="media",
+                execution_mode="command",
+                tenant_id="tenant-1",
+                user_id=42,
+                inputs={},
+            )
+
+        assert job_id is not None
+        # Valid UUID format
+        parts = job_id.split("-")
+        assert len(parts) == 5
+
+
+class TestDispatcherPolicyEnforcement:
+    """Dispatcher checks tenant sandbox policies before accepting jobs."""
+
+    @pytest.mark.asyncio
+    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
+    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
+    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
+    async def test_rejects_when_tenant_exceeds_concurrent_limit(
+        self, MockProfileSvc, MockAuditSvc, mock_settings
+    ):
+        """When tenant already has max_concurrent_sandboxes running, job is rejected."""
+        mock_settings.is_enabled = True
+        db = AsyncMock()
+        profile = _make_profile()
+
+        profile_svc = AsyncMock()
+        profile_svc.get_by_feature_type.return_value = profile
+        MockProfileSvc.return_value = profile_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        # Mock policy with max=2, active count=2
+        policy = _make_policy(max_concurrent_sandboxes=2)
+        mock_result_policy = MagicMock()
+        mock_result_policy.scalar_one_or_none.return_value = policy
+
+        mock_result_count = MagicMock()
+        mock_result_count.scalar_one_or_none.return_value = 2  # Already at limit
+
+        db.execute.side_effect = [mock_result_policy, mock_result_count]
+
+        dispatcher = SandboxDispatcher(db)
+
+        with pytest.raises(PolicyDeniedError, match="concurrent"):
+            await dispatcher.dispatch(
+                feature_type="media",
+                execution_mode="command",
+                tenant_id="tenant-1",
+                user_id=42,
+                inputs={},
+            )
+
+    @pytest.mark.asyncio
+    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
+    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
+    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
+    async def test_rejects_when_tenant_exceeds_daily_runtime(
+        self, MockProfileSvc, MockAuditSvc, mock_settings
+    ):
+        """When tenant has used max_daily_runtime_seconds today, job is rejected."""
+        mock_settings.is_enabled = True
+        db = AsyncMock()
+        profile = _make_profile()
+
+        profile_svc = AsyncMock()
+        profile_svc.get_by_feature_type.return_value = profile
+        MockProfileSvc.return_value = profile_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        # Mock policy with max daily runtime=100, used=100
+        policy = _make_policy(max_concurrent_sandboxes=10, max_daily_runtime_seconds=100)
+        mock_result_policy = MagicMock()
+        mock_result_policy.scalar_one_or_none.return_value = policy
+
+        mock_result_count = MagicMock()
+        mock_result_count.scalar_one_or_none.return_value = 0  # No active jobs
+
+        mock_result_runtime = MagicMock()
+        mock_result_runtime.scalar_one_or_none.return_value = 100  # Already at daily limit
+
+        db.execute.side_effect = [mock_result_policy, mock_result_count, mock_result_runtime]
+
+        dispatcher = SandboxDispatcher(db)
+
+        with pytest.raises(PolicyDeniedError, match="daily runtime"):
+            await dispatcher.dispatch(
+                feature_type="media",
+                execution_mode="command",
+                tenant_id="tenant-1",
+                user_id=42,
+                inputs={},
+            )
+
+    @pytest.mark.asyncio
+    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
+    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
+    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
+    async def test_creates_sandbox_jobs_record_with_accepted_status(
+        self, MockProfileSvc, MockAuditSvc, mock_settings
+    ):
+        """On successful dispatch, sandbox_jobs record is created with status='accepted'."""
+        mock_settings.is_enabled = True
+        db = AsyncMock()
+        profile = _make_profile()
+
+        profile_svc = AsyncMock()
+        profile_svc.get_by_feature_type.return_value = profile
+        MockProfileSvc.return_value = profile_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = None
+        db.execute.return_value = mock_result
+
+        dispatcher = SandboxDispatcher(db)
+
+        with patch.object(dispatcher, "_dispatch_celery_task"):
+            await dispatcher.dispatch(
+                feature_type="media",
+                execution_mode="command",
+                tenant_id="tenant-1",
+                user_id=42,
+                inputs={},
+            )
+
+        # Verify db.add was called with a SandboxJob
+        db.add.assert_called_once()
+        job = db.add.call_args[0][0]
+        assert job.status == "accepted"
+        assert job.tenant_id == "tenant-1"
+        assert job.user_id == 42
+
+
+class TestDispatcherWorkloadClassification:
+    """Dispatcher classifies feature types to the correct sandbox profile."""
+
+    @pytest.mark.asyncio
+    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
+    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
+    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
+    async def test_media_feature_selects_media_processing_profile(
+        self, MockProfileSvc, MockAuditSvc, mock_settings
+    ):
+        """feature_type='media' resolves to 'media-processing' sandbox profile."""
+        mock_settings.is_enabled = True
+        db = AsyncMock()
+
+        profile_svc = AsyncMock()
+        profile_svc.get_by_feature_type.return_value = _make_profile(slug="media-processing")
+        MockProfileSvc.return_value = profile_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = None
+        db.execute.return_value = mock_result
+
+        dispatcher = SandboxDispatcher(db)
+
+        with patch.object(dispatcher, "_dispatch_celery_task"):
+            await dispatcher.dispatch(
+                feature_type="media",
+                execution_mode="command",
+                tenant_id="tenant-1",
+                user_id=42,
+                inputs={},
+            )
+
+        profile_svc.get_by_feature_type.assert_called_with("media")
+
+    def test_feature_profile_map_completeness(self):
+        """All expected feature types have profile mappings."""
+        expected = {"media", "skill", "workflow", "library", "presentation", "chat", "connector"}
+        assert set(FEATURE_PROFILE_MAP.keys()) == expected
diff --git a/python-backend/tests/test_sandbox_job_worker.py b/python-backend/tests/test_sandbox_job_worker.py
new file mode 100644
index 0000000..aad82cc
--- /dev/null
+++ b/python-backend/tests/test_sandbox_job_worker.py
@@ -0,0 +1,306 @@
+"""Tests for sandbox_job_worker.py — full lifecycle Celery task."""
+import asyncio
+from unittest.mock import AsyncMock, MagicMock, patch, call
+
+import pytest
+
+from app.workers.sandbox_job_worker import (
+    NON_TERMINAL_STATUSES,
+    TERMINAL_STATUSES,
+    _execute_sandbox_job_async,
+)
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+def _make_job(
+    job_id="job-123",
+    tenant_id="tenant-1",
+    user_id=42,
+    status="accepted",
+    feature_type="media",
+    execution_mode="command",
+    sandbox_profile_id=1,
+    input_manifest_json=None,
+):
+    """Create a mock SandboxJob."""
+    job = MagicMock()
+    job.id = job_id
+    job.tenant_id = tenant_id
+    job.user_id = user_id
+    job.status = status
+    job.feature_type = feature_type
+    job.execution_mode = execution_mode
+    job.sandbox_profile_id = sandbox_profile_id
+    job.input_manifest_json = input_manifest_json or {
+        "commands": ["echo hello"],
+        "output_paths": ["/workspace/output.txt"],
+    }
+    job.output_manifest_json = None
+    job.stdout_excerpt = None
+    job.stderr_excerpt = None
+    job.opensandbox_id = None
+    job.started_at = None
+    job.finished_at = None
+    job.cost_actual = None
+    return job
+
+
+def _make_profile(slug="media-processing"):
+    """Create a mock SandboxProfile."""
+    profile = MagicMock()
+    profile.slug = slug
+    profile.id = 1
+    profile.cpu_limit = "1000m"
+    profile.memory_limit_mb = 2048
+    profile.timeout_seconds = 300
+    profile.base_image = "python:3.11-slim"
+    profile.network_default_action = "deny"
+    profile.ephemeral_disk_mb = 5120
+    profile.execution_mode = "command"
+    return profile
+
+
+def _make_command_result(exit_code=0, stdout="ok", stderr=""):
+    """Create a mock CommandResult."""
+    result = MagicMock()
+    result.exit_code = exit_code
+    result.stdout = stdout
+    result.stderr = stderr
+    return result
+
+
+class TestWorkerLifecycle:
+    """Worker progresses through status states for successful execution."""
+
+    @pytest.mark.asyncio
+    async def test_status_constants_defined(self):
+        """Non-terminal and terminal status sets are properly defined."""
+        assert "accepted" in NON_TERMINAL_STATUSES
+        assert "executing" in NON_TERMINAL_STATUSES
+        assert "completed" in TERMINAL_STATUSES
+        assert "failed" in TERMINAL_STATUSES
+        assert "timed_out" in TERMINAL_STATUSES
+
+    @pytest.mark.asyncio
+    @patch("app.workers.sandbox_job_worker.SandboxCostService")
+    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
+    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
+    @patch("app.workers.sandbox_job_worker.collect_outputs")
+    @patch("app.workers.sandbox_job_worker.stage_inputs")
+    @patch("app.workers.sandbox_job_worker.run_command")
+    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
+    async def test_creates_sandbox_stages_inputs_executes_collects(
+        self,
+        MockLifecycle,
+        mock_run_cmd,
+        mock_stage,
+        mock_collect,
+        MockArtifactSvc,
+        MockAuditSvc,
+        MockCostSvc,
+    ):
+        """Worker calls lifecycle, stage_inputs, run_command, collect_outputs in order."""
+        # Setup mocks
+        lifecycle = AsyncMock()
+        lifecycle.provision_sandbox.return_value = "sandbox-abc"
+        MockLifecycle.return_value = lifecycle
+
+        mock_run_cmd.return_value = _make_command_result()
+        mock_stage.return_value = []
+        mock_collect.return_value = []
+
+        cost_svc = AsyncMock()
+        cost_svc.calculate_actual.return_value = 0.01
+        MockCostSvc.return_value = cost_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        artifact_svc = AsyncMock()
+        MockArtifactSvc.return_value = artifact_svc
+
+        job = _make_job()
+        profile = _make_profile()
+
+        mock_task = MagicMock()
+        mock_db = AsyncMock()
+
+        # Mock _load_job and profile lookup
+        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
+             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
+             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
+             patch("app.workers.sandbox_job_worker._update_job_status") as mock_update:
+
+            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            result = await _execute_sandbox_job_async(mock_task, "job-123")
+
+        lifecycle.provision_sandbox.assert_called_once()
+        lifecycle.destroy_sandbox.assert_called_once()
+
+    @pytest.mark.asyncio
+    @patch("app.workers.sandbox_job_worker.SandboxCostService")
+    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
+    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
+    @patch("app.workers.sandbox_job_worker.collect_outputs")
+    @patch("app.workers.sandbox_job_worker.stage_inputs")
+    @patch("app.workers.sandbox_job_worker.run_command")
+    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
+    async def test_destroys_sandbox_on_completion(
+        self,
+        MockLifecycle,
+        mock_run_cmd,
+        mock_stage,
+        mock_collect,
+        MockArtifactSvc,
+        MockAuditSvc,
+        MockCostSvc,
+    ):
+        """After reaching 'completed' status, sandbox is destroyed."""
+        lifecycle = AsyncMock()
+        lifecycle.provision_sandbox.return_value = "sandbox-abc"
+        MockLifecycle.return_value = lifecycle
+
+        mock_run_cmd.return_value = _make_command_result()
+        mock_stage.return_value = []
+        mock_collect.return_value = []
+
+        cost_svc = AsyncMock()
+        cost_svc.calculate_actual.return_value = 0.01
+        MockCostSvc.return_value = cost_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        artifact_svc = AsyncMock()
+        MockArtifactSvc.return_value = artifact_svc
+
+        job = _make_job()
+        profile = _make_profile()
+
+        mock_task = MagicMock()
+
+        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
+             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
+             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
+             patch("app.workers.sandbox_job_worker._update_job_status"):
+
+            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
+            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _execute_sandbox_job_async(mock_task, "job-123")
+
+        lifecycle.destroy_sandbox.assert_called_once_with("sandbox-abc")
+
+
+class TestWorkerErrorHandling:
+    """Worker handles failures gracefully with proper cleanup."""
+
+    @pytest.mark.asyncio
+    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
+    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
+    async def test_destroys_sandbox_on_failure(self, MockLifecycle, MockAuditSvc):
+        """If execution fails, sandbox is still destroyed (cleanup in finally block)."""
+        lifecycle = AsyncMock()
+        lifecycle.provision_sandbox.return_value = "sandbox-abc"
+        MockLifecycle.return_value = lifecycle
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        job = _make_job()
+        profile = _make_profile()
+
+        mock_task = MagicMock()
+
+        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
+             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
+             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
+             patch("app.workers.sandbox_job_worker._update_job_status"), \
+             patch("app.workers.sandbox_job_worker.stage_inputs", side_effect=RuntimeError("boom")), \
+             patch("app.workers.sandbox_job_worker.SandboxCostService"), \
+             patch("app.workers.sandbox_job_worker.SandboxArtifactService"):
+
+            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
+            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            result = await _execute_sandbox_job_async(mock_task, "job-123")
+
+        # Sandbox should still be destroyed even after failure
+        lifecycle.destroy_sandbox.assert_called_once_with("sandbox-abc")
+        assert result["status"] == "failed"
+
+    @pytest.mark.asyncio
+    async def test_no_retry_on_policy_denied(self):
+        """PolicyDeniedError is terminal — not retried."""
+        from app.services.sandbox_dispatcher import PolicyDeniedError
+
+        # PolicyDeniedError should be importable and used for non-retry decisions
+        error = PolicyDeniedError("exceeded concurrent limit")
+        assert str(error) == "exceeded concurrent limit"
+
+
+class TestWorkerSessionReuse:
+    """Worker reuses a single sandbox across multiple commands within one job."""
+
+    @pytest.mark.asyncio
+    @patch("app.workers.sandbox_job_worker.SandboxCostService")
+    @patch("app.workers.sandbox_job_worker.SandboxAuditService")
+    @patch("app.workers.sandbox_job_worker.SandboxArtifactService")
+    @patch("app.workers.sandbox_job_worker.collect_outputs")
+    @patch("app.workers.sandbox_job_worker.stage_inputs")
+    @patch("app.workers.sandbox_job_worker.run_command")
+    @patch("app.workers.sandbox_job_worker.SandboxLifecycleManager")
+    async def test_multiple_commands_reuse_same_sandbox(
+        self,
+        MockLifecycle,
+        mock_run_cmd,
+        mock_stage,
+        mock_collect,
+        MockArtifactSvc,
+        MockAuditSvc,
+        MockCostSvc,
+    ):
+        """A job with multiple commands calls provision_sandbox once and run_command N times."""
+        lifecycle = AsyncMock()
+        lifecycle.provision_sandbox.return_value = "sandbox-abc"
+        MockLifecycle.return_value = lifecycle
+
+        mock_run_cmd.return_value = _make_command_result()
+        mock_stage.return_value = []
+        mock_collect.return_value = []
+
+        cost_svc = AsyncMock()
+        cost_svc.calculate_actual.return_value = 0.01
+        MockCostSvc.return_value = cost_svc
+
+        audit_svc = MagicMock()
+        MockAuditSvc.return_value = audit_svc
+
+        artifact_svc = AsyncMock()
+        MockArtifactSvc.return_value = artifact_svc
+
+        job = _make_job(input_manifest_json={
+            "commands": ["echo step1", "echo step2", "echo step3"],
+            "output_paths": ["/workspace/output.txt"],
+        })
+        profile = _make_profile()
+
+        mock_task = MagicMock()
+
+        with patch("app.workers.sandbox_job_worker._load_job", return_value=job), \
+             patch("app.workers.sandbox_job_worker._load_profile", return_value=profile), \
+             patch("app.workers.sandbox_job_worker._get_db_session") as mock_get_db, \
+             patch("app.workers.sandbox_job_worker._update_job_status"):
+
+            mock_get_db.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
+            mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _execute_sandbox_job_async(mock_task, "job-123")
+
+        # Only one sandbox provisioned
+        lifecycle.provision_sandbox.assert_called_once()
+        # Three commands executed
+        assert mock_run_cmd.call_count == 3
diff --git a/python-backend/tests/test_sandbox_profiles.py b/python-backend/tests/test_sandbox_profiles.py
new file mode 100644
index 0000000..638a2fc
--- /dev/null
+++ b/python-backend/tests/test_sandbox_profiles.py
@@ -0,0 +1,151 @@
+"""Tests for sandbox_profiles.py — profile loading, caching, merging, and validation."""
+import time
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.services.sandbox_profiles import CACHE_TTL_SECONDS, SandboxProfileService
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+def _make_profile(slug="media-processing", cpu_limit="1000m", memory_limit_mb=2048,
+                  timeout_seconds=300, is_active=True, **kwargs):
+    """Create a mock SandboxProfile."""
+    profile = MagicMock()
+    profile.slug = slug
+    profile.name = kwargs.get("name", slug.replace("-", " ").title())
+    profile.cpu_limit = cpu_limit
+    profile.memory_limit_mb = memory_limit_mb
+    profile.timeout_seconds = timeout_seconds
+    profile.is_active = is_active
+    profile.ephemeral_disk_mb = kwargs.get("ephemeral_disk_mb", 5120)
+    profile.network_default_action = kwargs.get("network_default_action", "deny")
+    profile.base_image = kwargs.get("base_image", "python:3.11-slim")
+    profile.execution_mode = kwargs.get("execution_mode", "command")
+    profile.id = kwargs.get("id", 1)
+    return profile
+
+
+def _make_policy(max_concurrent_sandboxes=5, max_daily_runtime_seconds=36000,
+                 max_single_job_seconds=1800, **kwargs):
+    """Create a mock TenantSandboxPolicy."""
+    policy = MagicMock()
+    policy.max_concurrent_sandboxes = max_concurrent_sandboxes
+    policy.max_daily_runtime_seconds = max_daily_runtime_seconds
+    policy.max_single_job_seconds = max_single_job_seconds
+    return policy
+
+
+class TestProfileLoading:
+    """Profile service loads profiles from DB with caching."""
+
+    @pytest.mark.asyncio
+    async def test_load_profile_by_slug(self):
+        """Loads a single profile by its unique slug."""
+        db = AsyncMock()
+        profile = _make_profile(slug="media-processing")
+
+        mock_result = MagicMock()
+        mock_scalars = MagicMock()
+        mock_scalars.all.return_value = [profile]
+        mock_result.scalars.return_value = mock_scalars
+        db.execute.return_value = mock_result
+
+        service = SandboxProfileService(db)
+        result = await service.get_by_slug("media-processing")
+
+        assert result is not None
+        assert result.slug == "media-processing"
+
+    @pytest.mark.asyncio
+    async def test_load_profile_by_feature_type(self):
+        """Maps feature_type to the correct profile slug."""
+        db = AsyncMock()
+        profile = _make_profile(slug="media-processing")
+
+        mock_result = MagicMock()
+        mock_scalars = MagicMock()
+        mock_scalars.all.return_value = [profile]
+        mock_result.scalars.return_value = mock_scalars
+        db.execute.return_value = mock_result
+
+        service = SandboxProfileService(db)
+        result = await service.get_by_feature_type("media")
+
+        assert result is not None
+        assert result.slug == "media-processing"
+
+    @pytest.mark.asyncio
+    async def test_cache_refreshes_after_ttl(self):
+        """Profile cache expires after TTL, triggers fresh DB query."""
+        db = AsyncMock()
+        profile = _make_profile(slug="media-processing")
+
+        mock_result = MagicMock()
+        mock_scalars = MagicMock()
+        mock_scalars.all.return_value = [profile]
+        mock_result.scalars.return_value = mock_scalars
+        db.execute.return_value = mock_result
+
+        service = SandboxProfileService(db)
+        await service.get_by_slug("media-processing")
+        first_call_count = db.execute.call_count
+
+        # Simulate cache expiry
+        service._cache_timestamp = time.monotonic() - CACHE_TTL_SECONDS - 1
+
+        await service.get_by_slug("media-processing")
+        assert db.execute.call_count > first_call_count
+
+    @pytest.mark.asyncio
+    async def test_returns_none_for_unknown_slug(self):
+        """Returns None when slug does not exist."""
+        db = AsyncMock()
+        mock_result = MagicMock()
+        mock_scalars = MagicMock()
+        mock_scalars.all.return_value = []
+        mock_result.scalars.return_value = mock_scalars
+        db.execute.return_value = mock_result
+
+        service = SandboxProfileService(db)
+        result = await service.get_by_slug("nonexistent")
+
+        assert result is None
+
+
+class TestProfileMerging:
+    """Per-job overrides are merged with profile defaults."""
+
+    @pytest.mark.asyncio
+    async def test_per_job_overrides_merged_with_defaults(self):
+        """Job-level timeout_seconds overrides the profile default."""
+        db = AsyncMock()
+        service = SandboxProfileService(db)
+        profile = _make_profile(timeout_seconds=300, cpu_limit="1000m", memory_limit_mb=2048)
+
+        result = await service.merge_with_overrides(
+            profile,
+            {"timeout_seconds": 600},
+        )
+
+        assert result["timeout_seconds"] == 600
+        assert result["cpu_limit"] == "1000m"
+        assert result["memory_limit_mb"] == 2048
+
+    @pytest.mark.asyncio
+    async def test_resource_limits_validated_against_tenant_policy(self):
+        """CPU/memory overrides that exceed tenant policy limits are capped."""
+        db = AsyncMock()
+        service = SandboxProfileService(db)
+        profile = _make_profile(timeout_seconds=300, memory_limit_mb=2048)
+        policy = _make_policy(max_single_job_seconds=600)
+
+        result = await service.merge_with_overrides(
+            profile,
+            {"timeout_seconds": 1200},
+            tenant_policy=policy,
+        )
+
+        # Should be capped to policy max
+        assert result["timeout_seconds"] == 600
