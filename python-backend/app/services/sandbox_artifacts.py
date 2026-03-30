"""Sandbox Artifact Service — upload outputs, checksums, DB records, signed URLs."""

import hashlib
import mimetypes
from typing import Any, List, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox import SandboxArtifact, SandboxJob

logger = structlog.get_logger()

SIGNED_URL_TTL_SECONDS = 900  # 15 minutes


class SandboxArtifactService:
    """Manage sandbox job output artifacts."""

    def __init__(self, db: AsyncSession, storage_service: Any = None):
        self.db = db
        self._storage = storage_service

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
        object_key = f"sandbox-artifacts/{sandbox_job_id}/{filename}"
        sha256 = self._compute_sha256(file_bytes)

        # Upload to S3/R2
        if self._storage is not None:
            await self._storage.upload_object(object_key, file_bytes)

        # Create DB record
        artifact = SandboxArtifact(
            sandbox_job_id=sandbox_job_id,
            artifact_type=artifact_type,
            object_key=object_key,
            mime_type=mime_type,
            size_bytes=len(file_bytes),
            sha256=sha256,
            is_primary=(artifact_type == "primary"),
            metadata_json=metadata,
        )

        self.db.add(artifact)
        await self.db.commit()

        logger.info(
            "sandbox_artifact_created",
            sandbox_job_id=sandbox_job_id,
            object_key=object_key,
            size_bytes=len(file_bytes),
            sha256=sha256,
        )

        return artifact

    async def record_existing(
        self,
        sandbox_job_id: str,
        object_key: str,
        *,
        artifact_type: str = "primary",
        mime_type: Optional[str] = None,
        size_bytes: Optional[int] = None,
        sha256: Optional[str] = None,
        is_primary: Optional[bool] = None,
        metadata: Optional[dict] = None,
    ) -> SandboxArtifact:
        """Create a DB record for an artifact that has already been uploaded."""
        resolved_mime_type = mime_type or self.guess_mime_type(object_key)
        artifact = SandboxArtifact(
            sandbox_job_id=sandbox_job_id,
            artifact_type=artifact_type,
            object_key=object_key,
            mime_type=resolved_mime_type,
            size_bytes=size_bytes,
            sha256=sha256,
            is_primary=(artifact_type == "primary") if is_primary is None else bool(is_primary),
            metadata_json=metadata,
        )

        self.db.add(artifact)
        await self.db.commit()

        logger.info(
            "sandbox_artifact_recorded_existing",
            sandbox_job_id=sandbox_job_id,
            object_key=object_key,
            size_bytes=size_bytes,
            sha256=sha256,
        )

        return artifact

    async def generate_signed_url(
        self, artifact_id: int, tenant_id: str, ttl_seconds: int = SIGNED_URL_TTL_SECONDS
    ) -> str:
        """Generate a pre-signed URL for artifact download.

        Enforces tenant isolation — the artifact's job must belong to the requesting tenant.
        Raises PermissionError if tenant does not own the artifact.
        """
        # Load artifact
        stmt = select(SandboxArtifact).where(SandboxArtifact.id == artifact_id)
        result = await self.db.execute(stmt)
        artifact = result.scalar_one_or_none()
        if artifact is None:
            raise ValueError(f"Artifact {artifact_id} not found")

        # Load associated job for tenant check
        stmt = select(SandboxJob).where(SandboxJob.id == artifact.sandbox_job_id)
        result = await self.db.execute(stmt)
        job = result.scalar_one_or_none()
        if job is None:
            raise ValueError(f"Job {artifact.sandbox_job_id} not found")

        if job.tenant_id != tenant_id:
            raise PermissionError(
                f"Artifact {artifact_id} belongs to a different tenant "
                f"(tenant isolation violation)"
            )

        # Generate signed URL
        url = await self._storage.generate_presigned_url(
            artifact.object_key, ttl_seconds=ttl_seconds
        )

        return url

    async def list_artifacts(self, sandbox_job_id: str) -> List[SandboxArtifact]:
        """List all artifacts for a sandbox job."""
        stmt = select(SandboxArtifact).where(
            SandboxArtifact.sandbox_job_id == sandbox_job_id
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    def _compute_sha256(data: bytes) -> str:
        """Compute SHA-256 hex digest."""
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def guess_mime_type(path: str) -> str:
        """Infer MIME type from object key or filename."""
        mime_type, _ = mimetypes.guess_type(path)
        return mime_type or "application/octet-stream"
# mypy: ignore-errors
# mypy: ignore-errors
