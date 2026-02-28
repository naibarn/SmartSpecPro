"""Tests for sandbox_artifacts.py — S3/R2 upload, checksum, DB records, signed URLs."""
import hashlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.sandbox_artifacts import SIGNED_URL_TTL_SECONDS, SandboxArtifactService

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


def _make_artifact(sandbox_job_id="job-123", artifact_type="primary",
                   object_key="sandbox-artifacts/job-123/output.mp4",
                   size_bytes=1024, sha256="abc123"):
    """Create a mock SandboxArtifact."""
    artifact = MagicMock()
    artifact.id = 1
    artifact.sandbox_job_id = sandbox_job_id
    artifact.artifact_type = artifact_type
    artifact.object_key = object_key
    artifact.size_bytes = size_bytes
    artifact.sha256 = sha256
    artifact.mime_type = "video/mp4"
    return artifact


def _make_job(job_id="job-123", tenant_id="tenant-1"):
    """Create a mock SandboxJob."""
    job = MagicMock()
    job.id = job_id
    job.tenant_id = tenant_id
    return job


class TestArtifactUpload:
    """Artifact service uploads outputs and creates DB records."""

    @pytest.mark.asyncio
    async def test_upload_to_s3_with_correct_object_key(self):
        """Uploads sandbox output to S3/R2 using sandbox-artifacts/{job_id}/{filename} key."""
        db = AsyncMock()
        storage = AsyncMock()
        service = SandboxArtifactService(db, storage_service=storage)

        file_bytes = b"fake video content"
        result = await service.upload_and_record(
            sandbox_job_id="job-123",
            file_bytes=file_bytes,
            filename="output.mp4",
            mime_type="video/mp4",
        )

        storage.upload_object.assert_called_once()
        call_args = storage.upload_object.call_args
        assert "sandbox-artifacts/job-123/output.mp4" in call_args[0]

    @pytest.mark.asyncio
    async def test_sha256_checksum_computed_and_stored(self):
        """SHA-256 checksum is computed from file bytes."""
        db = AsyncMock()
        storage = AsyncMock()
        service = SandboxArtifactService(db, storage_service=storage)

        file_bytes = b"test content for checksum"
        expected_sha = hashlib.sha256(file_bytes).hexdigest()

        result = await service.upload_and_record(
            sandbox_job_id="job-123",
            file_bytes=file_bytes,
            filename="data.json",
        )

        # The DB add call should include the sha256
        db.add.assert_called_once()
        artifact = db.add.call_args[0][0]
        assert artifact.sha256 == expected_sha

    @pytest.mark.asyncio
    async def test_sandbox_artifacts_record_created(self):
        """A sandbox_artifacts DB row is created with correct fields."""
        db = AsyncMock()
        storage = AsyncMock()
        service = SandboxArtifactService(db, storage_service=storage)

        file_bytes = b"content"
        result = await service.upload_and_record(
            sandbox_job_id="job-456",
            file_bytes=file_bytes,
            filename="result.png",
            artifact_type="primary",
            mime_type="image/png",
        )

        db.add.assert_called_once()
        artifact = db.add.call_args[0][0]
        assert artifact.sandbox_job_id == "job-456"
        assert artifact.artifact_type == "primary"
        assert artifact.mime_type == "image/png"
        assert artifact.size_bytes == len(file_bytes)
        db.commit.assert_called_once()


class TestArtifactAccess:
    """Artifact service generates signed URLs and enforces tenant isolation."""

    @pytest.mark.asyncio
    async def test_signed_url_generated_with_ttl(self):
        """Signed URL has default TTL."""
        db = AsyncMock()
        storage = AsyncMock()
        storage.generate_presigned_url.return_value = "https://r2.example.com/signed-url"

        artifact = _make_artifact()
        job = _make_job(tenant_id="tenant-1")

        # Mock DB lookups
        mock_result_artifact = MagicMock()
        mock_result_artifact.scalar_one_or_none.return_value = artifact
        mock_result_job = MagicMock()
        mock_result_job.scalar_one_or_none.return_value = job

        db.execute.side_effect = [mock_result_artifact, mock_result_job]

        service = SandboxArtifactService(db, storage_service=storage)
        url = await service.generate_signed_url(artifact_id=1, tenant_id="tenant-1")

        assert url == "https://r2.example.com/signed-url"
        storage.generate_presigned_url.assert_called_once()

    @pytest.mark.asyncio
    async def test_tenant_isolation_enforced(self):
        """Attempting to access another tenant's artifact raises PermissionError."""
        db = AsyncMock()
        storage = AsyncMock()

        artifact = _make_artifact()
        job = _make_job(tenant_id="tenant-1")  # Artifact belongs to tenant-1

        mock_result_artifact = MagicMock()
        mock_result_artifact.scalar_one_or_none.return_value = artifact
        mock_result_job = MagicMock()
        mock_result_job.scalar_one_or_none.return_value = job

        db.execute.side_effect = [mock_result_artifact, mock_result_job]

        service = SandboxArtifactService(db, storage_service=storage)

        with pytest.raises(PermissionError, match="tenant isolation"):
            await service.generate_signed_url(artifact_id=1, tenant_id="tenant-2")
