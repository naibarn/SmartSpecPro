"""Tests for sandbox_dispatcher.py — workload classification, policy enforcement, Celery dispatch."""
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

import pytest

from app.services.sandbox_dispatcher import (
    FEATURE_PROFILE_MAP,
    PolicyDeniedError,
    SandboxDispatcher,
)

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


def _make_profile(slug="media-processing", id=1, **kwargs):
    """Create a mock SandboxProfile."""
    profile = MagicMock()
    profile.slug = slug
    profile.id = id
    profile.timeout_seconds = kwargs.get("timeout_seconds", 300)
    profile.cpu_limit = kwargs.get("cpu_limit", "1000m")
    profile.memory_limit_mb = kwargs.get("memory_limit_mb", 2048)
    return profile


def _make_policy(max_concurrent_sandboxes=5, max_daily_runtime_seconds=36000, **kwargs):
    """Create a mock TenantSandboxPolicy."""
    policy = MagicMock()
    policy.max_concurrent_sandboxes = max_concurrent_sandboxes
    policy.max_daily_runtime_seconds = max_daily_runtime_seconds
    policy.max_single_job_seconds = kwargs.get("max_single_job_seconds", 1800)
    return policy


class TestDispatcherRouting:
    """Dispatcher routes workloads to sandbox or legacy based on feature flags."""

    @pytest.mark.asyncio
    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
    async def test_routes_to_celery_when_enabled(self, MockProfileSvc, MockAuditSvc, mock_settings):
        """When OPENSANDBOX_ENABLED=true, dispatcher creates record and sends Celery task."""
        mock_settings.is_enabled = True
        db = AsyncMock()
        profile = _make_profile()

        profile_svc = AsyncMock()
        profile_svc.get_by_feature_type.return_value = profile
        MockProfileSvc.return_value = profile_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        # Mock policy query - no policy (use defaults)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        dispatcher = SandboxDispatcher(db)

        with patch.object(dispatcher, "_dispatch_celery_task"):
            job_id = await dispatcher.dispatch(
                feature_type="media",
                execution_mode="command",
                tenant_id="tenant-1",
                user_id=42,
                inputs={"command": "ffmpeg -version"},
            )

        assert job_id is not None
        assert isinstance(job_id, str)
        assert len(job_id) == 36  # UUID

    @pytest.mark.asyncio
    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
    async def test_falls_back_to_legacy_when_disabled(self, MockProfileSvc, MockAuditSvc,
                                                       mock_settings):
        """When OPENSANDBOX_ENABLED=false, dispatcher returns None."""
        mock_settings.is_enabled = False
        db = AsyncMock()

        dispatcher = SandboxDispatcher(db)
        result = await dispatcher.dispatch(
            feature_type="media",
            execution_mode="command",
            tenant_id="tenant-1",
            user_id=42,
            inputs={},
        )

        assert result is None

    @pytest.mark.asyncio
    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
    async def test_returns_job_id_for_polling(self, MockProfileSvc, MockAuditSvc, mock_settings):
        """Dispatcher returns the UUID job_id."""
        mock_settings.is_enabled = True
        db = AsyncMock()
        profile = _make_profile()

        profile_svc = AsyncMock()
        profile_svc.get_by_feature_type.return_value = profile
        MockProfileSvc.return_value = profile_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        dispatcher = SandboxDispatcher(db)

        with patch.object(dispatcher, "_dispatch_celery_task"):
            job_id = await dispatcher.dispatch(
                feature_type="media",
                execution_mode="command",
                tenant_id="tenant-1",
                user_id=42,
                inputs={},
            )

        assert job_id is not None
        # Valid UUID format
        parts = job_id.split("-")
        assert len(parts) == 5


class TestDispatcherPolicyEnforcement:
    """Dispatcher checks tenant sandbox policies before accepting jobs."""

    @pytest.mark.asyncio
    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
    async def test_rejects_when_tenant_exceeds_concurrent_limit(
        self, MockProfileSvc, MockAuditSvc, mock_settings
    ):
        """When tenant already has max_concurrent_sandboxes running, job is rejected."""
        mock_settings.is_enabled = True
        db = AsyncMock()
        profile = _make_profile()

        profile_svc = AsyncMock()
        profile_svc.get_by_feature_type.return_value = profile
        MockProfileSvc.return_value = profile_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        # Mock policy with max=2, active count=2
        policy = _make_policy(max_concurrent_sandboxes=2)
        mock_result_policy = MagicMock()
        mock_result_policy.scalar_one_or_none.return_value = policy

        mock_result_count = MagicMock()
        mock_result_count.scalar_one_or_none.return_value = 2  # Already at limit

        db.execute.side_effect = [mock_result_policy, mock_result_count]

        dispatcher = SandboxDispatcher(db)

        with pytest.raises(PolicyDeniedError, match="concurrent"):
            await dispatcher.dispatch(
                feature_type="media",
                execution_mode="command",
                tenant_id="tenant-1",
                user_id=42,
                inputs={},
            )

    @pytest.mark.asyncio
    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
    async def test_rejects_when_tenant_exceeds_daily_runtime(
        self, MockProfileSvc, MockAuditSvc, mock_settings
    ):
        """When tenant has used max_daily_runtime_seconds today, job is rejected."""
        mock_settings.is_enabled = True
        db = AsyncMock()
        profile = _make_profile()

        profile_svc = AsyncMock()
        profile_svc.get_by_feature_type.return_value = profile
        MockProfileSvc.return_value = profile_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        # Mock policy with max daily runtime=100, used=100
        policy = _make_policy(max_concurrent_sandboxes=10, max_daily_runtime_seconds=100)
        mock_result_policy = MagicMock()
        mock_result_policy.scalar_one_or_none.return_value = policy

        mock_result_count = MagicMock()
        mock_result_count.scalar_one_or_none.return_value = 0  # No active jobs

        mock_result_runtime = MagicMock()
        mock_result_runtime.scalar_one_or_none.return_value = 100  # Already at daily limit

        db.execute.side_effect = [mock_result_policy, mock_result_count, mock_result_runtime]

        dispatcher = SandboxDispatcher(db)

        with pytest.raises(PolicyDeniedError, match="daily runtime"):
            await dispatcher.dispatch(
                feature_type="media",
                execution_mode="command",
                tenant_id="tenant-1",
                user_id=42,
                inputs={},
            )

    @pytest.mark.asyncio
    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
    async def test_creates_sandbox_jobs_record_with_accepted_status(
        self, MockProfileSvc, MockAuditSvc, mock_settings
    ):
        """On successful dispatch, sandbox_jobs record is created with status='accepted'."""
        mock_settings.is_enabled = True
        db = AsyncMock()
        profile = _make_profile()

        profile_svc = AsyncMock()
        profile_svc.get_by_feature_type.return_value = profile
        MockProfileSvc.return_value = profile_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        dispatcher = SandboxDispatcher(db)

        with patch.object(dispatcher, "_dispatch_celery_task"):
            await dispatcher.dispatch(
                feature_type="media",
                execution_mode="command",
                tenant_id="tenant-1",
                user_id=42,
                inputs={},
            )

        # Verify db.add was called with a SandboxJob
        db.add.assert_called_once()
        job = db.add.call_args[0][0]
        assert job.status == "accepted"
        assert job.tenant_id == "tenant-1"
        assert job.user_id == 42


class TestDispatcherWorkloadClassification:
    """Dispatcher classifies feature types to the correct sandbox profile."""

    @pytest.mark.asyncio
    @patch("app.services.sandbox_dispatcher.opensandbox_settings")
    @patch("app.services.sandbox_dispatcher.SandboxAuditService")
    @patch("app.services.sandbox_dispatcher.SandboxProfileService")
    async def test_media_feature_selects_media_processing_profile(
        self, MockProfileSvc, MockAuditSvc, mock_settings
    ):
        """feature_type='media' resolves to 'media-processing' sandbox profile."""
        mock_settings.is_enabled = True
        db = AsyncMock()

        profile_svc = AsyncMock()
        profile_svc.get_by_feature_type.return_value = _make_profile(slug="media-processing")
        MockProfileSvc.return_value = profile_svc

        audit_svc = MagicMock()
        MockAuditSvc.return_value = audit_svc

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        dispatcher = SandboxDispatcher(db)

        with patch.object(dispatcher, "_dispatch_celery_task"):
            await dispatcher.dispatch(
                feature_type="media",
                execution_mode="command",
                tenant_id="tenant-1",
                user_id=42,
                inputs={},
            )

        profile_svc.get_by_feature_type.assert_called_with("media")

    def test_feature_profile_map_completeness(self):
        """All expected feature types have profile mappings."""
        expected = {"media", "skill", "workflow", "library", "presentation", "chat", "connector"}
        assert set(FEATURE_PROFILE_MAP.keys()) == expected
