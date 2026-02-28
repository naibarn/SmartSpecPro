"""Tests for sandbox_profiles.py — profile loading, caching, merging, and validation."""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.sandbox_profiles import CACHE_TTL_SECONDS, SandboxProfileService

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


def _make_profile(slug="media-processing", cpu_limit="1000m", memory_limit_mb=2048,
                  timeout_seconds=300, is_active=True, **kwargs):
    """Create a mock SandboxProfile."""
    profile = MagicMock()
    profile.slug = slug
    profile.name = kwargs.get("name", slug.replace("-", " ").title())
    profile.cpu_limit = cpu_limit
    profile.memory_limit_mb = memory_limit_mb
    profile.timeout_seconds = timeout_seconds
    profile.is_active = is_active
    profile.ephemeral_disk_mb = kwargs.get("ephemeral_disk_mb", 5120)
    profile.network_default_action = kwargs.get("network_default_action", "deny")
    profile.base_image = kwargs.get("base_image", "python:3.11-slim")
    profile.execution_mode = kwargs.get("execution_mode", "command")
    profile.id = kwargs.get("id", 1)
    return profile


def _make_policy(max_concurrent_sandboxes=5, max_daily_runtime_seconds=36000,
                 max_single_job_seconds=1800, **kwargs):
    """Create a mock TenantSandboxPolicy."""
    policy = MagicMock()
    policy.max_concurrent_sandboxes = max_concurrent_sandboxes
    policy.max_daily_runtime_seconds = max_daily_runtime_seconds
    policy.max_single_job_seconds = max_single_job_seconds
    return policy


class TestProfileLoading:
    """Profile service loads profiles from DB with caching."""

    @pytest.mark.asyncio
    async def test_load_profile_by_slug(self):
        """Loads a single profile by its unique slug."""
        db = AsyncMock()
        profile = _make_profile(slug="media-processing")

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [profile]
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        service = SandboxProfileService(db)
        result = await service.get_by_slug("media-processing")

        assert result is not None
        assert result.slug == "media-processing"

    @pytest.mark.asyncio
    async def test_load_profile_by_feature_type(self):
        """Maps feature_type to the correct profile slug."""
        db = AsyncMock()
        profile = _make_profile(slug="media-processing")

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [profile]
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        service = SandboxProfileService(db)
        result = await service.get_by_feature_type("media")

        assert result is not None
        assert result.slug == "media-processing"

    @pytest.mark.asyncio
    async def test_cache_refreshes_after_ttl(self):
        """Profile cache expires after TTL, triggers fresh DB query."""
        db = AsyncMock()
        profile = _make_profile(slug="media-processing")

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [profile]
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        service = SandboxProfileService(db)
        await service.get_by_slug("media-processing")
        first_call_count = db.execute.call_count

        # Simulate cache expiry
        service._cache_timestamp = time.monotonic() - CACHE_TTL_SECONDS - 1

        await service.get_by_slug("media-processing")
        assert db.execute.call_count > first_call_count

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_slug(self):
        """Returns None when slug does not exist."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        service = SandboxProfileService(db)
        result = await service.get_by_slug("nonexistent")

        assert result is None


class TestProfileMerging:
    """Per-job overrides are merged with profile defaults."""

    @pytest.mark.asyncio
    async def test_per_job_overrides_merged_with_defaults(self):
        """Job-level timeout_seconds overrides the profile default."""
        db = AsyncMock()
        service = SandboxProfileService(db)
        profile = _make_profile(timeout_seconds=300, cpu_limit="1000m", memory_limit_mb=2048)

        result = await service.merge_with_overrides(
            profile,
            {"timeout_seconds": 600},
        )

        assert result["timeout_seconds"] == 600
        assert result["cpu_limit"] == "1000m"
        assert result["memory_limit_mb"] == 2048

    @pytest.mark.asyncio
    async def test_resource_limits_validated_against_tenant_policy(self):
        """CPU/memory overrides that exceed tenant policy limits are capped."""
        db = AsyncMock()
        service = SandboxProfileService(db)
        profile = _make_profile(timeout_seconds=300, memory_limit_mb=2048)
        policy = _make_policy(max_single_job_seconds=600)

        result = await service.merge_with_overrides(
            profile,
            {"timeout_seconds": 1200},
            tenant_policy=policy,
        )

        # Should be capped to policy max
        assert result["timeout_seconds"] == 600
