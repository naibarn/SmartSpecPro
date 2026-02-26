Now I have all the context I need. Let me generate the section content.

# Section 4: Python Services Layer

## Overview

This section implements the Python service layer that sits between the OpenSandbox SDK client (section-03) and the Celery task execution. It includes the sandbox dispatcher, profile service, artifact service, audit service, cost service, Celery queue routing, and the sandbox job worker.

**Dependencies**: This section requires completion of:
- **section-02-database-schema**: The `sandbox_profiles`, `sandbox_jobs`, `sandbox_artifacts`, and `tenant_sandbox_policies` tables must exist, along with their SQLAlchemy models at `/home/dev/projects/SmartSpecPro/python-backend/app/models/sandbox.py`.
- **section-03-python-sdk-client**: The OpenSandbox integration module at `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/` must provide `config.py`, `models.py`, `client.py`, `lifecycle.py`, `execution.py`, and `files.py`.

**Blocks**: section-06 (media pipeline migration), section-07 (skill/workflow migration).

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_dispatcher.py` | Classify workloads, enforce policy, dispatch to Celery |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_profiles.py` | Load/resolve/merge sandbox profiles |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_artifacts.py` | Upload outputs to S3/R2, create DB records, signed URLs |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_audit.py` | Emit structured audit events for sandbox lifecycle |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_costs.py` | Calculate and attribute sandbox job costs |
| `/home/dev/projects/SmartSpecPro/python-backend/app/workers/__init__.py` | Package init for new workers directory |
| `/home/dev/projects/SmartSpecPro/python-backend/app/workers/sandbox_job_worker.py` | Celery task managing full sandbox lifecycle |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_dispatcher.py` | Tests for dispatcher service |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_profiles.py` | Tests for profile service |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_artifacts.py` | Tests for artifact service |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_audit.py` | Tests for audit service |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_costs.py` | Tests for cost service |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_job_worker.py` | Tests for Celery job worker |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_celery_routing.py` | Tests for queue routing |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | Add `sandbox` queue and routing entries |
| `/home/dev/projects/SmartSpecPro/docker-compose.media.yml` | Add `celery-sandbox` worker service |
| `/home/dev/projects/SmartSpecPro/run-services.sh` | Add sandbox worker startup/management |

---

## Tests FIRST

All test files use the `sandbox` pytest marker. The project uses `pytest-asyncio` with auto mode, SQLite in-memory for unit tests, and the existing `conftest.py` fixtures.

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_dispatcher.py`

```python
"""Tests for sandbox_dispatcher.py — workload classification, policy enforcement, Celery dispatch."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestDispatcherRouting:
    """Dispatcher routes workloads to sandbox or legacy based on feature flags."""

    @pytest.mark.asyncio
    async def test_routes_to_celery_when_enabled(self):
        """When OPENSANDBOX_ENABLED=true, dispatcher creates sandbox_jobs record and sends Celery task."""
        ...

    @pytest.mark.asyncio
    async def test_falls_back_to_legacy_when_disabled(self):
        """When OPENSANDBOX_ENABLED=false, dispatcher returns None so caller uses legacy path."""
        ...

    @pytest.mark.asyncio
    async def test_falls_back_when_optional_and_sandbox_unavailable(self):
        """When DISPATCH_MODE=optional and circuit breaker open, falls back to legacy."""
        ...

    @pytest.mark.asyncio
    async def test_returns_job_id_for_polling(self):
        """Dispatcher returns the UUID job_id from the newly created sandbox_jobs row."""
        ...


class TestDispatcherPolicyEnforcement:
    """Dispatcher checks tenant sandbox policies before accepting jobs."""

    @pytest.mark.asyncio
    async def test_rejects_when_tenant_exceeds_concurrent_limit(self):
        """When tenant already has max_concurrent_sandboxes running, job is rejected immediately."""
        ...

    @pytest.mark.asyncio
    async def test_rejects_when_tenant_exceeds_daily_runtime(self):
        """When tenant has used max_daily_runtime_seconds today, job is rejected."""
        ...

    @pytest.mark.asyncio
    async def test_creates_sandbox_jobs_record_with_accepted_status(self):
        """On successful dispatch, sandbox_jobs record is created with status='accepted'."""
        ...


class TestDispatcherWorkloadClassification:
    """Dispatcher classifies feature types to the correct sandbox profile."""

    @pytest.mark.asyncio
    async def test_media_feature_selects_media_processing_profile(self):
        """feature_type='media' resolves to 'media-processing' sandbox profile."""
        ...

    @pytest.mark.asyncio
    async def test_skill_code_feature_selects_code_default_profile(self):
        """feature_type='skill' with execution_mode='sandbox-code' resolves to 'code-default'."""
        ...

    @pytest.mark.asyncio
    async def test_library_feature_selects_file_parser_profile(self):
        """feature_type='library' resolves to 'file-parser' sandbox profile."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_profiles.py`

```python
"""Tests for sandbox_profiles.py — profile loading, caching, merging, and validation."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestProfileLoading:
    """Profile service loads profiles from DB with caching."""

    @pytest.mark.asyncio
    async def test_load_profile_by_slug(self):
        """Loads a single profile by its unique slug (e.g., 'media-processing')."""
        ...

    @pytest.mark.asyncio
    async def test_load_profile_by_feature_type(self):
        """Maps feature_type to the correct profile slug using the default mapping."""
        ...

    @pytest.mark.asyncio
    async def test_cache_refreshes_after_ttl(self):
        """Profile cache expires after 60 seconds, triggers fresh DB query."""
        ...

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_slug(self):
        """Returns None (not exception) when slug does not exist in DB."""
        ...


class TestProfileMerging:
    """Per-job overrides are merged with profile defaults."""

    @pytest.mark.asyncio
    async def test_per_job_overrides_merged_with_defaults(self):
        """Job-level timeout_seconds overrides the profile default."""
        ...

    @pytest.mark.asyncio
    async def test_resource_limits_validated_against_tenant_policy(self):
        """CPU/memory overrides that exceed tenant policy limits are capped."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_artifacts.py`

```python
"""Tests for sandbox_artifacts.py — S3/R2 upload, checksum, DB records, signed URLs."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestArtifactUpload:
    """Artifact service uploads outputs and creates DB records."""

    @pytest.mark.asyncio
    async def test_upload_to_s3_with_correct_object_key(self):
        """Uploads sandbox output to S3/R2 using sandbox-artifacts/{job_id}/{filename} key."""
        ...

    @pytest.mark.asyncio
    async def test_sha256_checksum_computed_and_stored(self):
        """SHA-256 checksum is computed from file bytes and stored in sandbox_artifacts row."""
        ...

    @pytest.mark.asyncio
    async def test_sandbox_artifacts_record_created(self):
        """A sandbox_artifacts DB row is created with correct job_id, mime_type, size_bytes."""
        ...


class TestArtifactAccess:
    """Artifact service generates signed URLs and enforces tenant isolation."""

    @pytest.mark.asyncio
    async def test_signed_url_generated_with_ttl(self):
        """Signed URL has 15-minute (900s) default TTL."""
        ...

    @pytest.mark.asyncio
    async def test_tenant_isolation_enforced(self):
        """Attempting to access another tenant's artifact raises PermissionError."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_audit.py`

```python
"""Tests for sandbox_audit.py — structured audit event emission."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestAuditEvents:
    """Sandbox audit service emits structured lifecycle events."""

    @pytest.mark.asyncio
    async def test_emit_event_for_each_lifecycle_stage(self):
        """Each sandbox status transition emits an audit event with the correct event_type."""
        ...

    @pytest.mark.asyncio
    async def test_event_includes_required_fields(self):
        """Every event includes sandboxJobId, tenantId, userId, featureType, profileSlug."""
        ...

    @pytest.mark.asyncio
    async def test_events_written_to_jsonl_audit_log(self):
        """Audit events are appended to the daily JSONL audit log file."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_costs.py`

```python
"""Tests for sandbox_costs.py — cost calculation and attribution."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestCostCalculation:
    """Cost service computes job cost from resource consumption."""

    @pytest.mark.asyncio
    async def test_cost_from_cpu_seconds_and_memory(self):
        """Cost = f(cpu_seconds * cpu_rate + memory_gb_seconds * memory_rate)."""
        ...

    @pytest.mark.asyncio
    async def test_sandbox_jobs_cost_actual_updated(self):
        """On completion, sandbox_jobs.cost_actual is updated with the computed cost."""
        ...

    @pytest.mark.asyncio
    async def test_cost_attributed_to_tenant_and_feature(self):
        """Cost record includes tenant_id and feature_type for analytics attribution."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_celery_routing.py`

```python
"""Tests for Celery queue routing — sandbox tasks routed to dedicated queue."""
import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestQueueRouting:
    """Sandbox Celery tasks use the 'sandbox' queue."""

    def test_sandbox_tasks_routed_to_sandbox_queue(self):
        """The sandbox job worker task is routed to the 'sandbox' queue in task_routes."""
        from app.core.celery_app import celery_app
        routes = celery_app.conf.task_routes
        assert routes.get("app.workers.sandbox_job_worker.execute_sandbox_job") == {"queue": "sandbox"}

    def test_existing_queues_unaffected(self):
        """Existing media, video, presentation_export, presentation_import queues remain unchanged."""
        from app.core.celery_app import celery_app, REQUIRED_QUEUES
        for q in ["celery", "video", "media", "presentation_export", "presentation_import"]:
            assert q in REQUIRED_QUEUES

    def test_sandbox_queue_declared(self):
        """The 'sandbox' Queue is declared in task_queues config."""
        from app.core.celery_app import celery_app
        queue_names = [q.name for q in celery_app.conf.task_queues]
        assert "sandbox" in queue_names
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_job_worker.py`

```python
"""Tests for sandbox_job_worker.py — full lifecycle Celery task."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestWorkerLifecycle:
    """Worker progresses through status states for successful execution."""

    @pytest.mark.asyncio
    async def test_progresses_through_all_status_states(self):
        """Job transitions: accepted -> queued -> provisioning -> staging_inputs -> executing
        -> collecting_outputs -> persisting -> completed."""
        ...

    @pytest.mark.asyncio
    async def test_creates_sandbox_stages_inputs_executes_collects(self):
        """Worker calls lifecycle.provision_sandbox, files.stage_inputs,
        execution.run_command, files.collect_outputs in order."""
        ...

    @pytest.mark.asyncio
    async def test_destroys_sandbox_on_completion(self):
        """After reaching 'completed' status, sandbox is destroyed via lifecycle.destroy_sandbox."""
        ...


class TestWorkerErrorHandling:
    """Worker handles failures gracefully with proper cleanup."""

    @pytest.mark.asyncio
    async def test_destroys_sandbox_on_failure(self):
        """If execution fails, sandbox is still destroyed (cleanup in finally block)."""
        ...

    @pytest.mark.asyncio
    async def test_retries_on_transient_creation_failure(self):
        """Sandbox creation failure triggers Celery retry (max 3 attempts)."""
        ...

    @pytest.mark.asyncio
    async def test_no_retry_on_policy_denied(self):
        """Policy denied errors are terminal — no Celery retry, status set to 'failed'."""
        ...

    @pytest.mark.asyncio
    async def test_marks_timed_out_when_timeout_exceeded(self):
        """If execution exceeds timeout, job status becomes 'timed_out'."""
        ...

    @pytest.mark.asyncio
    async def test_collects_partial_outputs_on_timeout(self):
        """On timeout, worker attempts to collect any partial outputs before marking timed_out."""
        ...


class TestWorkerSessionReuse:
    """Worker reuses a single sandbox across multiple commands within one job."""

    @pytest.mark.asyncio
    async def test_multiple_commands_reuse_same_sandbox(self):
        """A job with multiple commands calls provision_sandbox once and run_command N times."""
        ...
```

---

## Implementation Details

### 4.1 Sandbox Dispatcher Service

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_dispatcher.py`

The dispatcher is the central entry point for sandbox workloads. It receives a job request from the Python API layer (or from other services), checks feature flags and tenant policies, creates a database record, and dispatches a Celery task.

**Class signature and key methods**:

```python
"""Sandbox Dispatcher — classify workloads, enforce policy, dispatch to Celery."""

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.integrations.opensandbox.config import get_sandbox_settings
from app.models.sandbox import SandboxJob, TenantSandboxPolicy
from app.services.sandbox_profiles import SandboxProfileService
from app.services.sandbox_audit import SandboxAuditService

logger = structlog.get_logger()

# Feature type -> default profile slug mapping
FEATURE_PROFILE_MAP = {
    "media": "media-processing",
    "skill": "code-default",
    "workflow": "code-default",
    "library": "file-parser",
    "presentation": "media-processing",
    "chat": "code-default",
    "connector": "browser-default",
}


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
        tenant_id: int,
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
        ...

    async def _check_enabled(self, execution_mode: str) -> bool:
        """Check if sandbox is enabled and execution mode requires it."""
        ...

    async def _resolve_profile(self, feature_type: str, profile_override: Optional[str]) -> ...:
        """Resolve sandbox profile from feature_type or override slug."""
        ...

    async def _enforce_policy(self, tenant_id: int, profile: ...) -> None:
        """Check tenant policy limits. Raises PolicyDeniedError if exceeded."""
        ...

    async def _count_active_jobs(self, tenant_id: int) -> int:
        """Count sandbox_jobs in non-terminal status for this tenant."""
        ...

    async def _sum_daily_runtime(self, tenant_id: int) -> int:
        """Sum runtime seconds for today's completed jobs for this tenant."""
        ...

    async def _create_job_record(self, ...) -> str:
        """Create sandbox_jobs record with status='accepted'. Returns job_id."""
        ...

    def _dispatch_celery_task(self, job_id: str) -> None:
        """Send Celery task to sandbox queue."""
        ...
```

**Dispatch flow**:

1. Call `_check_enabled()` -- reads `OPENSANDBOX_ENABLED` from `get_sandbox_settings()`. If disabled and `DISPATCH_MODE=optional`, return `None` so the caller falls through to the legacy path. If disabled and `DISPATCH_MODE=required`, raise an error.
2. Call `_resolve_profile()` -- look up the profile slug from `FEATURE_PROFILE_MAP` (or `profile_override` if provided). Load the full `SandboxProfile` object via `SandboxProfileService`.
3. Call `_enforce_policy()` -- load `TenantSandboxPolicy` for this tenant. Count active (non-terminal) jobs via `_count_active_jobs()`. If count >= `max_concurrent_sandboxes`, raise `PolicyDeniedError`. Sum daily runtime via `_sum_daily_runtime()`. If sum >= `max_daily_runtime_seconds`, raise `PolicyDeniedError`.
4. Call `_create_job_record()` -- generate UUID, create `SandboxJob` row with status `accepted`, commit.
5. Call `_dispatch_celery_task()` -- send `app.workers.sandbox_job_worker.execute_sandbox_job` to the `sandbox` Celery queue with the `job_id` as argument.
6. Emit `sandbox_job_accepted` audit event via `SandboxAuditService`.
7. Return the `job_id`.

**Terminal vs non-terminal statuses** (used for concurrency counting):
- Non-terminal: `accepted`, `policy_resolved`, `queued`, `provisioning`, `staging_inputs`, `executing`, `collecting_outputs`, `persisting`
- Terminal: `completed`, `failed`, `timed_out`, `canceled`

### 4.2 Sandbox Profile Service

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_profiles.py`

```python
"""Sandbox Profile Service — load, cache, resolve, and merge sandbox profiles."""

import time
from typing import Dict, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.sandbox import SandboxProfile, TenantSandboxPolicy

logger = structlog.get_logger()

CACHE_TTL_SECONDS = 60


class SandboxProfileService:
    """Load sandbox profiles from DB with in-memory caching."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._cache: Dict[str, SandboxProfile] = {}
        self._cache_timestamp: float = 0.0

    async def get_by_slug(self, slug: str) -> Optional[SandboxProfile]:
        """Load a profile by slug, using cache when possible."""
        ...

    async def get_by_feature_type(self, feature_type: str) -> Optional[SandboxProfile]:
        """Map feature_type to profile slug, then load."""
        ...

    async def merge_with_overrides(
        self, profile: SandboxProfile, overrides: dict, tenant_policy: Optional[TenantSandboxPolicy] = None
    ) -> dict:
        """Merge profile defaults with per-job overrides.

        If tenant_policy is provided, cap resource limits at policy maximums.
        Returns a dict with the final resolved configuration.
        """
        ...

    async def _refresh_cache(self) -> None:
        """Load all active profiles from DB into cache."""
        ...

    def _is_cache_stale(self) -> bool:
        """Check if cache is older than CACHE_TTL_SECONDS."""
        ...
```

**Key behaviors**:
- `_refresh_cache()` loads all rows from `sandbox_profiles WHERE is_active = true` and indexes them by `slug`.
- `get_by_slug()` checks `_is_cache_stale()` first; if stale, calls `_refresh_cache()`.
- `merge_with_overrides()` starts with profile defaults (`cpu_limit`, `memory_limit_mb`, `timeout_seconds`, etc.), overlays non-None fields from `overrides`, then caps against `tenant_policy` limits if present.

### 4.3 Sandbox Artifact Service

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_artifacts.py`

This service handles the storage layer for sandbox output files. It uses the existing `R2StorageService` pattern from `/home/dev/projects/SmartSpecPro/python-backend/app/services/r2_storage_service.py` for S3/R2 interactions.

```python
"""Sandbox Artifact Service — upload outputs, checksums, DB records, signed URLs."""

import hashlib
from typing import List, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox import SandboxArtifact, SandboxJob

logger = structlog.get_logger()

SIGNED_URL_TTL_SECONDS = 900  # 15 minutes


class SandboxArtifactService:
    """Manage sandbox job output artifacts."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload_and_record(
        self,
        sandbox_job_id: str,
        file_bytes: bytes,
        filename: str,
        artifact_type: str = "primary",
        mime_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SandboxArtifact:
        """Upload file to S3/R2, compute checksum, create DB record.

        Object key format: sandbox-artifacts/{sandbox_job_id}/{filename}
        """
        ...

    async def generate_signed_url(
        self, artifact_id: int, tenant_id: int, ttl_seconds: int = SIGNED_URL_TTL_SECONDS
    ) -> str:
        """Generate a pre-signed URL for artifact download.

        Enforces tenant isolation — the artifact's job must belong to the requesting tenant.
        Raises PermissionError if tenant does not own the artifact.
        """
        ...

    async def list_artifacts(self, sandbox_job_id: str) -> List[SandboxArtifact]:
        """List all artifacts for a sandbox job."""
        ...

    @staticmethod
    def _compute_sha256(data: bytes) -> str:
        """Compute SHA-256 hex digest."""
        return hashlib.sha256(data).hexdigest()
```

**S3/R2 integration**: The artifact service should instantiate or receive an `R2StorageService` instance for the actual S3 upload. The object key pattern is `sandbox-artifacts/{job_id}/{filename}`. The bucket name comes from the `SANDBOX_ARTIFACT_BUCKET` environment variable (default: `smartspec-sandbox-artifacts`).

### 4.4 Sandbox Audit Service

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_audit.py`

This service emits structured audit events to the existing JSONL audit log, following the same pattern as the existing audit infrastructure in the project.

```python
"""Sandbox Audit Service — structured lifecycle event emission."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger()

# JSONL audit log directory (matches existing Node.js pattern)
AUDIT_LOG_DIR = os.getenv("AUDIT_LOG_DIR", "logs/audit")

SANDBOX_EVENT_TYPES = [
    "sandbox_job_accepted",
    "sandbox_created",
    "sandbox_executing",
    "sandbox_completed",
    "sandbox_failed",
    "sandbox_deleted",
]


class SandboxAuditService:
    """Emit structured audit events for sandbox lifecycle stages."""

    def emit(
        self,
        event_type: str,
        sandbox_job_id: str,
        tenant_id: int,
        user_id: int,
        feature_type: str,
        profile_slug: str,
        timing_data: Optional[dict] = None,
        cost_data: Optional[dict] = None,
        error_data: Optional[dict] = None,
    ) -> None:
        """Emit a single audit event to the JSONL log file.

        Event is written as one JSON line to logs/audit/audit-YYYY-MM-DD.jsonl.
        Also emits via structlog for standard log aggregation.
        """
        ...

    def _build_event(self, ...) -> dict:
        """Build the audit event dictionary."""
        ...

    def _write_jsonl(self, event: dict) -> None:
        """Append event as JSON line to daily audit log file."""
        ...
```

**Event structure** (each event is a single JSON line):
```json
{
  "eventType": "sandbox_job_accepted",
  "timestamp": "2026-02-26T12:00:00.000Z",
  "sandboxJobId": "uuid-here",
  "tenantId": 1,
  "userId": 42,
  "featureType": "media",
  "profileSlug": "media-processing",
  "timing": { "totalMs": 1234 },
  "cost": { "cpuSeconds": 10, "estimatedUsd": 0.05 }
}
```

### 4.5 Sandbox Cost Service

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_costs.py`

```python
"""Sandbox Cost Service — compute and attribute job costs."""

from decimal import Decimal
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox import SandboxJob

logger = structlog.get_logger()

# Cost rates (USD per unit)
CPU_SECOND_RATE = Decimal("0.0000125")    # ~$0.045/CPU-hour
MEMORY_GB_SECOND_RATE = Decimal("0.000005")  # ~$0.018/GB-hour
STORAGE_GB_RATE = Decimal("0.023")         # per GB-month (S3 standard)
NETWORK_EGRESS_GB_RATE = Decimal("0.09")   # per GB


class SandboxCostService:
    """Calculate and attribute sandbox job costs."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def estimate(self, cpu_millicores: int, memory_mb: int, timeout_seconds: int) -> Decimal:
        """Estimate job cost before execution based on profile defaults.

        Returns estimated cost in USD (used for credit pre-check).
        Assumes worst case: full timeout duration at full resource allocation.
        """
        ...

    async def calculate_actual(
        self,
        job_id: str,
        cpu_seconds: float,
        memory_gb_seconds: float,
        storage_written_bytes: int = 0,
        network_egress_bytes: int = 0,
    ) -> Decimal:
        """Calculate actual cost from metered resource consumption.

        Updates sandbox_jobs.cost_actual and returns the cost in USD.
        """
        ...

    async def _update_job_cost(self, job_id: str, cost: Decimal) -> None:
        """Update sandbox_jobs.cost_actual for the given job."""
        ...
```

**Cost formula**:
```
cost_usd = (cpu_seconds * CPU_SECOND_RATE) 
         + (memory_gb_seconds * MEMORY_GB_SECOND_RATE) 
         + (storage_gb * STORAGE_GB_RATE / 30 / 86400 * duration_seconds)
         + (network_egress_gb * NETWORK_EGRESS_GB_RATE)
```

The `estimate()` method uses the worst-case scenario: full timeout at full resource allocation. The `calculate_actual()` method uses real metered values from the sandbox execution.

### 4.6 Celery Queue Routing

**File to modify**: `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`

Add the `sandbox` queue to the existing Celery configuration. The changes are minimal and surgical.

**Changes to `REQUIRED_QUEUES`**:
```python
REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export", "presentation_import", "sandbox"]
```

**Changes to `task_queues`** (add one entry):
```python
task_queues=[
    Queue("celery"),
    Queue("video"),
    Queue("media"),
    Queue("presentation_export"),
    Queue("presentation_import"),
    Queue("sandbox"),  # NEW: OpenSandbox job execution
],
```

**Changes to `task_routes`** (add one entry):
```python
# Sandbox job execution -> sandbox queue (isolated, resource-intensive)
"app.workers.sandbox_job_worker.execute_sandbox_job": {"queue": "sandbox"},
```

**Changes to `autodiscover_tasks`**:
```python
celery_app.autodiscover_tasks(["app.tasks", "app.workers"])
```

This ensures the worker directory is scanned for Celery tasks.

### 4.7 Sandbox Job Worker (Celery Task)

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/workers/sandbox_job_worker.py`

This is the core Celery task that manages the full sandbox lifecycle for a single job.

**Critical pattern -- Sandbox Session Reuse**: A single sandbox container is created at job start and reused for ALL commands within that job. For media jobs that chain 10-20 FFmpeg invocations, the sandbox persists across the entire task lifecycle. This avoids the catastrophic latency of creating/destroying a sandbox per command. Expected timing: approximately 3 seconds for one-time sandbox creation, then approximately 50ms per subsequent command.

```python
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
from typing import Optional

import structlog

from app.core.celery_app import celery_app
from app.integrations.opensandbox.lifecycle import provision_sandbox, destroy_sandbox
from app.integrations.opensandbox.execution import run_command, run_code
from app.integrations.opensandbox.files import stage_inputs, collect_outputs
from app.services.sandbox_artifacts import SandboxArtifactService
from app.services.sandbox_audit import SandboxAuditService
from app.services.sandbox_costs import SandboxCostService

logger = structlog.get_logger()

# Non-terminal statuses (job is still active)
NON_TERMINAL_STATUSES = {
    "accepted", "policy_resolved", "queued", "provisioning",
    "staging_inputs", "executing", "collecting_outputs", "persisting",
}

# Terminal statuses (job is done)
TERMINAL_STATUSES = {"completed", "failed", "timed_out", "canceled"}


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
    ...


async def _execute_sandbox_job_async(task, job_id: str) -> dict:
    """Async implementation of sandbox job execution.

    Status transitions:
        accepted -> queued -> provisioning -> staging_inputs ->
        executing -> collecting_outputs -> persisting -> completed

    On error: -> failed (or timed_out)
    Sandbox is ALWAYS destroyed in the finally block.
    """
    ...


async def _update_job_status(db_session, job_id: str, status: str, reason: Optional[str] = None) -> None:
    """Update sandbox_jobs status and optional status_reason."""
    ...


async def _load_job(db_session, job_id: str):
    """Load SandboxJob from database."""
    ...
```

**Worker lifecycle flow** (inside `_execute_sandbox_job_async`):

1. Open async DB session.
2. Load `SandboxJob` record. If not found or already terminal, abort.
3. Load the associated `SandboxProfile`.
4. Update status to `queued`, then `provisioning`.
5. Call `provision_sandbox(profile, job_id)` -- creates the Docker container, polls until ready. If this fails transiently (network error, timeout), raise `self.retry()` for Celery retry.
6. Update status to `staging_inputs`.
7. Parse `input_manifest_json` from the job record. Call `stage_inputs(sandbox_id, manifest)` to upload input files from S3/R2 into the sandbox filesystem.
8. Update status to `executing`.
9. Execute commands based on the job's `execution_mode`:
   - `command`: Call `run_command(sandbox_id, command, timeout)` for each command in the manifest.
   - `code`: Call `run_code(sandbox_id, code, language)`.
   - Multiple commands in a single job reuse the same `sandbox_id` (session reuse pattern).
10. Capture `stdout_excerpt` and `stderr_excerpt` from execution results.
11. Update status to `collecting_outputs`.
12. Call `collect_outputs(sandbox_id, output_paths)` to download output files from sandbox.
13. Upload each output to S3/R2 via `SandboxArtifactService.upload_and_record()`.
14. Update status to `persisting`.
15. Write `output_manifest_json` to the job record.
16. Calculate actual cost via `SandboxCostService.calculate_actual()`.
17. Update status to `completed`, set `finished_at`.
18. **finally**: Call `destroy_sandbox(sandbox_id)` regardless of success/failure.
19. Emit audit events at each stage via `SandboxAuditService.emit()`.

**Error handling**:

| Error Type | Behavior |
|---|---|
| Transient sandbox creation failure (network, 503) | `self.retry(exc=e)` -- Celery retries up to 3 times with exponential backoff |
| `PolicyDeniedError` | Set status to `failed`, set `status_reason`, do NOT retry |
| Execution timeout (`SoftTimeLimitExceeded`) | Attempt to collect partial outputs, set status to `timed_out` |
| Sandbox destruction failure | Log warning, continue (orphan reconciler handles cleanup) |
| Any other exception | Set status to `failed`, destroy sandbox, emit `sandbox_failed` audit event |

### 4.8 Docker Compose -- Sandbox Worker Service

**File to modify**: `/home/dev/projects/SmartSpecPro/docker-compose.media.yml`

Add a new `celery-sandbox` service following the pattern of the existing `celery-video` service.

```yaml
  # ============================================
  # CELERY SANDBOX WORKER
  # Handles: execute_sandbox_job (OpenSandbox orchestration)
  # Manages sandbox lifecycle: provision, execute, collect, destroy
  # Resource limits: 2 CPUs / 4GB RAM max
  # ============================================
  celery-sandbox:
    build:
      context: ./python-backend
      dockerfile: Dockerfile
    container_name: smartspec-celery-sandbox
    command: celery -A app.core.celery_app worker --loglevel=info --concurrency=2 -Q sandbox -n sandbox@%h
    env_file:
      - ./python-backend/.env
    environment:
      - CELERY_BROKER_URL=redis://smartspec-redis:6379/0
      - CELERY_RESULT_BACKEND=redis://smartspec-redis:6379/0
      - REDIS_URL=redis://smartspec-redis:6379/0
      - DATABASE_URL=postgresql+asyncpg://smartspec:smartspec123@smartspec-postgres:5432/smartspec
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./python-backend:/app
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD-SHELL", "celery -A app.core.celery_app inspect ping -d sandbox@$$HOSTNAME || exit 1"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3
    restart: unless-stopped
    networks:
      - smartspec-network
      - opensandbox-network
```

Note the sandbox worker joins both `smartspec-network` (for DB/Redis access) and `opensandbox-network` (to reach the OpenSandbox server API). If using the Docker Compose file from section-01, declare `opensandbox-network` as an external network:

```yaml
networks:
  smartspec-network:
    external: true
  opensandbox-network:
    external: true
```

### 4.9 Workers Package Init

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/workers/__init__.py`

```python
"""Celery worker tasks for OpenSandbox job execution."""
```

### 4.10 run-services.sh Updates

**File to modify**: `/home/dev/projects/SmartSpecPro/run-services.sh`

Add sandbox worker management alongside existing Celery worker management. The specific additions depend on the current structure of the script, but should include:

- A `sandbox-worker-start` command that launches the Celery sandbox worker in a screen session or as a direct process
- A `sandbox-worker-stop` command
- Integration with the existing `start-all` / `stop-all` commands

The sandbox worker uses:
```bash
celery -A app.core.celery_app worker --loglevel=info --concurrency=2 -Q sandbox -n sandbox@%h
```

---

## Background Context

### Existing Patterns to Follow

**Celery task pattern**: The existing `media_job_worker.py` at `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py` is the closest analog. It uses synchronous Celery tasks, Redis for progress reporting, and subprocess for FFmpeg execution. The sandbox job worker follows the same patterns but replaces subprocess calls with OpenSandbox API calls.

**Service layer pattern**: All services in `/home/dev/projects/SmartSpecPro/python-backend/app/services/` follow a common pattern:
- Class with `__init__(self, db: AsyncSession)` constructor
- Async methods for all DB operations
- `structlog` for logging
- SQLAlchemy 2.0 async session usage

**Audit pattern**: The existing `AuditService` at `/home/dev/projects/SmartSpecPro/python-backend/app/services/audit_service.py` writes to a database table. The sandbox audit service writes to JSONL files instead (matching the Node.js audit log pattern), but emits the same structured data.

**Storage pattern**: The `R2StorageService` at `/home/dev/projects/SmartSpecPro/python-backend/app/services/r2_storage_service.py` handles S3/R2 interactions with encrypted settings from the database. The artifact service should use this service for actual file uploads.

**Credit pattern**: The `CreditService` at `/home/dev/projects/SmartSpecPro/python-backend/app/services/credit_service.py` uses the credit system where 1 USD = 1,000 credits with a 15% markup. The sandbox cost service calculates costs in USD, which are then converted to credits by the Node.js side (section-05).

### Database Models (from section-02)

The services in this section depend on SQLAlchemy models at `/home/dev/projects/SmartSpecPro/python-backend/app/models/sandbox.py`:

- `SandboxProfile` -- columns: `id`, `slug`, `name`, `description`, `execution_mode`, `base_image`, `cpu_limit`, `memory_limit_mb`, `timeout_seconds`, `network_default_action`, `is_active`, etc.
- `SandboxJob` -- columns: `id` (UUID), `tenant_id`, `user_id`, `feature_type`, `execution_mode`, `sandbox_profile_id`, `opensandbox_id`, `status`, `status_reason`, `input_manifest_json`, `output_manifest_json`, `stdout_excerpt`, `stderr_excerpt`, `cost_estimate`, `cost_actual`, `idempotency_key`, `started_at`, `finished_at`, etc.
- `SandboxArtifact` -- columns: `id`, `sandbox_job_id`, `artifact_type`, `object_key`, `mime_type`, `size_bytes`, `sha256`, `is_primary`, `metadata_json`, etc.
- `TenantSandboxPolicy` -- columns: `id`, `tenant_id`, `default_profile_id`, `max_concurrent_sandboxes`, `max_daily_runtime_seconds`, `max_single_job_seconds`, etc.

### OpenSandbox SDK (from section-03)

The services in this section call into the OpenSandbox integration module at `/home/dev/projects/SmartSpecPro/python-backend/app/integrations/opensandbox/`:

- `config.get_sandbox_settings()` -- returns Pydantic settings with `OPENSANDBOX_ENABLED`, `OPENSANDBOX_BASE_URL`, etc.
- `lifecycle.provision_sandbox(profile, job_id)` -- creates sandbox container, polls until ready, returns `sandbox_id`
- `lifecycle.destroy_sandbox(sandbox_id)` -- graceful shutdown
- `execution.run_command(sandbox_id, command, timeout)` -- returns `CommandResult(exit_code, stdout, stderr)`
- `execution.run_code(sandbox_id, code, language)` -- returns `CommandResult`
- `files.stage_inputs(sandbox_id, manifest)` -- uploads input files into sandbox
- `files.collect_outputs(sandbox_id, output_paths)` -- downloads output files from sandbox

---

## Implementation Checklist

1. Register `sandbox` pytest marker in `/home/dev/projects/SmartSpecPro/python-backend/pyproject.toml` (add `sandbox` to the markers list)
2. Create `/home/dev/projects/SmartSpecPro/python-backend/app/workers/__init__.py`
3. Write all test files (7 test files listed above)
4. Implement `sandbox_profiles.py` (simplest, no external dependencies beyond DB)
5. Implement `sandbox_audit.py` (no DB dependency, just file writes)
6. Implement `sandbox_costs.py` (depends on DB only)
7. Implement `sandbox_artifacts.py` (depends on DB + R2StorageService)
8. Implement `sandbox_dispatcher.py` (depends on profile service, audit service, and Celery)
9. Implement `sandbox_job_worker.py` (depends on all services + OpenSandbox SDK)
10. Modify `celery_app.py` -- add `sandbox` queue and routing
11. Modify `docker-compose.media.yml` -- add `celery-sandbox` service
12. Modify `run-services.sh` -- add sandbox worker management
13. Run tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest -m sandbox -v`
14. Verify existing tests still pass: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest`

---

## Implementation Notes (Actual)

**Implemented by:** deep-implement session 7212c063
**Date:** 2026-02-26

### Deviations from Plan

1. **run-services.sh not modified** — Deferred to section-09/12. Sandbox worker management will be added when service management is the primary focus.

2. **Code review fixes applied during implementation:**
   - H-1: Worker `_update_job_status` uses snake_case kwargs (plan used camelCase matching DB column names, but SQLAlchemy ORM requires Python attribute names)
   - H-2: Added `SoftTimeLimitExceeded` handler (inherits from `BaseException`, not caught by `except Exception`)
   - H-3: Cost calculation uses actual duration `(finished_at - started_at)` instead of `profile.timeout_seconds`
   - H-4: Dispatcher wraps `_dispatch_celery_task()` in try/except to mark failed jobs (prevents orphans)
   - H-5: Added `opensandbox-network: external: true` to docker-compose.media.yml top-level networks
   - M-1: Dispatcher imports `FEATURE_PROFILE_MAP` from `sandbox_profiles.py` (no duplicate)
   - M-2: Worker initializes `job=None, profile=None, started_at_ts=None` before try block
   - M-5: Worker retries on `SandboxProvisionError` / `RetryableHTTPError` via `task.retry()`
   - M-7: Both dispatcher and worker derive `NON_TERMINAL_STATUSES` from `SandboxJobStatus` enum

3. **Storage service left as optional** — `SandboxArtifactService` accepts `storage_service=None` and skips S3 upload when None. Will be wired in later sections.

### Files Created
- `python-backend/app/workers/__init__.py`
- `python-backend/app/services/sandbox_profiles.py` (100 lines)
- `python-backend/app/services/sandbox_audit.py` (113 lines)
- `python-backend/app/services/sandbox_costs.py` (92 lines)
- `python-backend/app/services/sandbox_artifacts.py` (115 lines)
- `python-backend/app/services/sandbox_dispatcher.py` (234 lines)
- `python-backend/app/workers/sandbox_job_worker.py` (385 lines)
- `python-backend/tests/test_sandbox_profiles.py` (6 tests)
- `python-backend/tests/test_sandbox_audit.py` (3 tests)
- `python-backend/tests/test_sandbox_costs.py` (4 tests)
- `python-backend/tests/test_sandbox_artifacts.py` (5 tests)
- `python-backend/tests/test_sandbox_dispatcher.py` (8 tests)
- `python-backend/tests/test_sandbox_celery_routing.py` (4 tests)
- `python-backend/tests/test_sandbox_job_worker.py` (6 tests)

### Files Modified
- `python-backend/app/core/celery_app.py` — Added sandbox queue, routing, autodiscover
- `docker-compose.media.yml` — Added celery-sandbox service + opensandbox-network

### Test Results
- **36/36 tests passed** (11.05s)
- All section-03 regression tests pass
- 7 harmless warnings (AsyncMock with db.add())