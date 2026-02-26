"""Sandbox Profile Service — load, cache, resolve, and merge sandbox profiles."""

import time
from typing import Dict, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox import SandboxProfile, TenantSandboxPolicy

logger = structlog.get_logger()

CACHE_TTL_SECONDS = 60

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


class SandboxProfileService:
    """Load sandbox profiles from DB with in-memory caching."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._cache: Dict[str, SandboxProfile] = {}
        self._cache_timestamp: float = 0.0

    async def get_by_slug(self, slug: str) -> Optional[SandboxProfile]:
        """Load a profile by slug, using cache when possible."""
        if self._is_cache_stale():
            await self._refresh_cache()
        return self._cache.get(slug)

    async def get_by_feature_type(self, feature_type: str) -> Optional[SandboxProfile]:
        """Map feature_type to profile slug, then load."""
        slug = FEATURE_PROFILE_MAP.get(feature_type)
        if slug is None:
            logger.warning("unknown_feature_type", feature_type=feature_type)
            return None
        return await self.get_by_slug(slug)

    async def merge_with_overrides(
        self,
        profile: SandboxProfile,
        overrides: dict,
        tenant_policy: Optional[TenantSandboxPolicy] = None,
    ) -> dict:
        """Merge profile defaults with per-job overrides.

        If tenant_policy is provided, cap resource limits at policy maximums.
        Returns a dict with the final resolved configuration.
        """
        merged = {
            "cpu_limit": profile.cpu_limit,
            "memory_limit_mb": profile.memory_limit_mb,
            "timeout_seconds": profile.timeout_seconds,
            "ephemeral_disk_mb": profile.ephemeral_disk_mb,
            "network_default_action": profile.network_default_action,
            "base_image": profile.base_image,
            "execution_mode": profile.execution_mode,
        }

        # Apply overrides for non-None values
        for key, value in overrides.items():
            if value is not None and key in merged:
                merged[key] = value

        # Cap against tenant policy limits
        if tenant_policy is not None:
            if merged["timeout_seconds"] > tenant_policy.max_single_job_seconds:
                merged["timeout_seconds"] = tenant_policy.max_single_job_seconds
                logger.info(
                    "timeout_capped_by_policy",
                    capped_to=tenant_policy.max_single_job_seconds,
                )

        return merged

    async def _refresh_cache(self) -> None:
        """Load all active profiles from DB into cache."""
        stmt = select(SandboxProfile).where(SandboxProfile.is_active.is_(True))
        result = await self.db.execute(stmt)
        profiles = result.scalars().all()
        self._cache = {p.slug: p for p in profiles}
        self._cache_timestamp = time.monotonic()
        logger.info("profile_cache_refreshed", count=len(self._cache))

    def _is_cache_stale(self) -> bool:
        """Check if cache is older than CACHE_TTL_SECONDS."""
        if not self._cache:
            return True
        return (time.monotonic() - self._cache_timestamp) > CACHE_TTL_SECONDS
