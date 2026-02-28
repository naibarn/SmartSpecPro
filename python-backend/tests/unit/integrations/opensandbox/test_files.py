"""Tests for OpenSandbox file staging and collection."""
import base64
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxFiles:
    """Tests for stage_inputs, stage_inline_files, and collect_outputs."""

    async def test_stage_inputs_uploads_each_file_from_manifest(self):
        """stage_inputs() downloads each S3 object and uploads into sandbox."""
        from app.integrations.opensandbox.files import stage_inputs

        mock_client = AsyncMock()
        mock_client.write_file = AsyncMock(return_value=None)

        mock_storage = AsyncMock()
        mock_storage.download_object = AsyncMock(return_value=b"file-content")

        manifest = [
            {"object_key": "inputs/a.txt", "sandbox_path": "/workspace/a.txt", "mime_type": "text/plain"},
            {"object_key": "inputs/b.txt", "sandbox_path": "/workspace/b.txt", "mime_type": "text/plain"},
            {"object_key": "inputs/c.txt", "sandbox_path": "/workspace/c.txt", "mime_type": "text/plain"},
        ]

        result = await stage_inputs(mock_client, "sb-1", manifest, mock_storage)
        assert len(result) == 3
        assert mock_client.write_file.call_count == 3

    async def test_stage_inputs_handles_missing_s3_object_gracefully(self):
        """If an S3 object is missing, stage_inputs logs warning and continues."""
        from app.integrations.opensandbox.files import stage_inputs

        mock_client = AsyncMock()
        mock_client.write_file = AsyncMock(return_value=None)

        mock_storage = AsyncMock()
        # First call succeeds, second raises (missing object)
        mock_storage.download_object = AsyncMock(
            side_effect=[b"content", Exception("NoSuchKey"), b"content2"]
        )

        manifest = [
            {"object_key": "inputs/a.txt", "sandbox_path": "/workspace/a.txt", "mime_type": "text/plain"},
            {"object_key": "inputs/missing.txt", "sandbox_path": "/workspace/missing.txt", "mime_type": "text/plain"},
            {"object_key": "inputs/c.txt", "sandbox_path": "/workspace/c.txt", "mime_type": "text/plain"},
        ]

        result = await stage_inputs(mock_client, "sb-1", manifest, mock_storage)
        # Only 2 succeeded
        assert len(result) == 2
        assert mock_client.write_file.call_count == 2

    async def test_collect_outputs_downloads_and_uploads_to_s3(self):
        """collect_outputs() reads files from sandbox and uploads to S3/R2."""
        from app.integrations.opensandbox.files import collect_outputs

        mock_client = AsyncMock()
        mock_client.read_file = AsyncMock(return_value=b"output-data")

        mock_storage = AsyncMock()
        mock_storage.upload_object = AsyncMock(return_value=None)

        output_paths = ["/workspace/output.mp4", "/workspace/log.txt"]

        result = await collect_outputs(
            mock_client, "sb-1", output_paths, mock_storage,
            artifact_bucket="test-bucket", job_id="job-123"
        )
        assert len(result) == 2
        assert mock_client.read_file.call_count == 2
        assert mock_storage.upload_object.call_count == 2

    async def test_collect_outputs_computes_sha256_checksum(self):
        """Each collected output includes SHA-256 checksum."""
        import hashlib

        from app.integrations.opensandbox.files import collect_outputs

        content = b"test file content for checksum"
        expected_hash = hashlib.sha256(content).hexdigest()

        mock_client = AsyncMock()
        mock_client.read_file = AsyncMock(return_value=content)

        mock_storage = AsyncMock()
        mock_storage.upload_object = AsyncMock(return_value=None)

        result = await collect_outputs(
            mock_client, "sb-1", ["/workspace/out.bin"], mock_storage,
            artifact_bucket="test-bucket", job_id="job-sha"
        )
        assert len(result) == 1
        assert result[0]["sha256"] == expected_hash
        # Verify index prefix in object key to prevent filename collisions
        assert result[0]["object_key"].startswith("sandbox-artifacts/job-sha/000-")

    async def test_cleanup_sandbox_files_calls_client(self):
        """cleanup_sandbox_files() removes staged files from sandbox."""
        from app.integrations.opensandbox.files import cleanup_sandbox_files

        mock_client = AsyncMock()
        mock_client.run_command = AsyncMock()

        paths = ["/workspace/a.txt", "/workspace/b.txt"]
        await cleanup_sandbox_files(mock_client, "sb-1", paths)
        # Should call run_command to remove files
        mock_client.run_command.assert_called()

    async def test_stage_inline_files_writes_decoded_content(self):
        """stage_inline_files() decodes base64 and writes each file to sandbox."""
        from app.integrations.opensandbox.files import stage_inline_files

        mock_client = AsyncMock()
        mock_client.write_file = AsyncMock(return_value=None)

        payload = base64.b64encode(b"print('hello')\n").decode("ascii")
        manifest = [{"path": "/workspace/skill/python/skill.py", "content_base64": payload}]

        staged = await stage_inline_files(mock_client, "sb-1", manifest)

        assert len(staged) == 1
        mock_client.write_file.assert_called_once_with(
            "sb-1",
            "/workspace/skill/python/skill.py",
            b"print('hello')\n",
        )

    async def test_stage_inline_files_uses_docker_bridge_on_lifecycle_only(self):
        """When /files API is unavailable, stage_inline_files falls back to docker bridge."""
        from app.integrations.opensandbox.files import stage_inline_files

        mock_client = AsyncMock()
        mock_client.write_file = AsyncMock(side_effect=Exception("lifecycle APIs only"))
        payload = base64.b64encode(b"{}").decode("ascii")
        manifest = [{"path": "/workspace/skill/input.json", "content_base64": payload}]

        with patch(
            "app.integrations.opensandbox.files.write_file_via_docker_bridge",
            new_callable=AsyncMock,
        ) as mock_bridge_write:
            staged = await stage_inline_files(mock_client, "sb-1", manifest)

        assert len(staged) == 1
        mock_bridge_write.assert_called_once_with("sb-1", "/workspace/skill/input.json", b"{}")
