"""
Unit tests for the Python R2 storage abstraction.
Tests that both the DB-backed and env-var-based R2 clients
can perform standard operations and that Cloud Run env var
fallback works correctly in R2Config.
"""

import os
from unittest.mock import MagicMock, patch

import pytest


class TestR2ConfigEnvFallback:
    """Tests for R2Config Cloud Run env var fallback."""

    def test_from_env_uses_cloudflare_vars_when_available(self):
        """Prefers CLOUDFLARE_R2_* vars over R2_* vars."""
        from app.core.r2_config import R2Config

        env = {
            "CLOUDFLARE_R2_ACCESS_KEY_ID": "cf-access",
            "CLOUDFLARE_R2_SECRET_ACCESS_KEY": "cf-secret",
            "CLOUDFLARE_R2_BUCKET_NAME": "cf-bucket",
            "CLOUDFLARE_R2_ENDPOINT": "https://cf-endpoint.r2.cloudflarestorage.com",
            "CLOUDFLARE_R2_PUBLIC_URL": "https://pub.example.com",
            "R2_ACCESS_KEY": "run-access",
            "R2_SECRET_KEY": "run-secret",
        }
        with patch.dict(os.environ, env, clear=False):
            config = R2Config.from_env()
            assert config.access_key_id == "cf-access"
            assert config.secret_access_key == "cf-secret"
            assert config.bucket_name == "cf-bucket"

    def test_from_env_falls_back_to_r2_vars_for_cloud_run(self):
        """Falls back to R2_* vars when CLOUDFLARE_R2_* are not set."""
        from app.core.r2_config import R2Config

        env = {
            "R2_ACCESS_KEY": "run-access",
            "R2_SECRET_KEY": "run-secret",
            "R2_BUCKET_NAME": "run-bucket",
            "R2_ACCOUNT_ID": "acct-123",
        }
        # Clear CLOUDFLARE_R2_* vars
        cleared = {
            "CLOUDFLARE_R2_ACCESS_KEY_ID": "",
            "CLOUDFLARE_R2_SECRET_ACCESS_KEY": "",
            "CLOUDFLARE_R2_BUCKET_NAME": "",
            "CLOUDFLARE_R2_ENDPOINT": "",
        }
        with patch.dict(os.environ, {**env, **cleared}, clear=False):
            config = R2Config.from_env()
            assert config.access_key_id == "run-access"
            assert config.secret_access_key == "run-secret"
            assert config.bucket_name == "run-bucket"
            assert config.endpoint_url == "https://acct-123.r2.cloudflarestorage.com"

    def test_from_env_constructs_endpoint_from_account_id(self):
        """Constructs the R2 endpoint URL from R2_ACCOUNT_ID."""
        from app.core.r2_config import R2Config

        env = {
            "R2_ACCESS_KEY": "key",
            "R2_SECRET_KEY": "secret",
            "R2_ACCOUNT_ID": "abc123def456",
        }
        cleared = {
            "CLOUDFLARE_R2_ACCESS_KEY_ID": "",
            "CLOUDFLARE_R2_SECRET_ACCESS_KEY": "",
            "CLOUDFLARE_R2_ENDPOINT": "",
        }
        with patch.dict(os.environ, {**env, **cleared}, clear=False):
            config = R2Config.from_env()
            assert config.endpoint_url == "https://abc123def456.r2.cloudflarestorage.com"


class TestR2ClientOperations:
    """Tests for R2Client boto3 operations."""

    def test_upload_file_calls_boto3(self):
        """Upload file via boto3 client."""
        from app.core.r2_config import R2Client, R2Config

        config = R2Config(
            access_key_id="key",
            secret_access_key="secret",
            bucket_name="test-bucket",
            endpoint_url="https://test.r2.cloudflarestorage.com",
            public_url="https://pub.example.com",
        )
        client = R2Client(config)
        mock_s3 = MagicMock()
        client._client = mock_s3

        client.upload_file("/tmp/test.png", "temp/raw/u1/j1/image.png", content_type="image/png")

        mock_s3.upload_file.assert_called_once_with(
            "/tmp/test.png",
            "test-bucket",
            "temp/raw/u1/j1/image.png",
            ExtraArgs={"ContentType": "image/png"},
        )

    def test_file_exists_head_object_true(self):
        """Check file existence returns True when head_object succeeds."""
        from app.core.r2_config import R2Client, R2Config

        config = R2Config(
            access_key_id="key",
            secret_access_key="secret",
            bucket_name="test-bucket",
            endpoint_url="https://test.r2.cloudflarestorage.com",
            public_url="https://pub.example.com",
        )
        client = R2Client(config)
        mock_s3 = MagicMock()
        client._client = mock_s3

        assert client.file_exists("temp/raw/u1/j1/image.png") is True
        mock_s3.head_object.assert_called_once_with(
            Bucket="test-bucket", Key="temp/raw/u1/j1/image.png"
        )

    def test_file_exists_head_object_false(self):
        """Check file existence returns False when head_object raises."""
        from app.core.r2_config import R2Client, R2Config

        config = R2Config(
            access_key_id="key",
            secret_access_key="secret",
            bucket_name="test-bucket",
            endpoint_url="https://test.r2.cloudflarestorage.com",
            public_url="https://pub.example.com",
        )
        client = R2Client(config)
        mock_s3 = MagicMock()
        mock_s3.head_object.side_effect = Exception("404 Not Found")
        client._client = mock_s3

        assert client.file_exists("nonexistent.png") is False

    def test_presigned_url_generation(self):
        """Generate presigned GET URL with correct params."""
        from app.core.r2_config import R2Client, R2Config

        config = R2Config(
            access_key_id="key",
            secret_access_key="secret",
            bucket_name="test-bucket",
            endpoint_url="https://test.r2.cloudflarestorage.com",
            public_url="https://pub.example.com",
        )
        client = R2Client(config)
        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = "https://signed-url"
        client._client = mock_s3

        url = client.generate_presigned_url("my-file.png", expires_in=7200)

        assert url == "https://signed-url"
        mock_s3.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "test-bucket", "Key": "my-file.png"},
            ExpiresIn=7200,
        )


class TestStoragePathProduction:
    """Tests for production prefix paths in StoragePath."""

    def test_media_raw_path(self):
        """media_raw uses temp/raw/ prefix."""
        from app.services.generation.r2_storage import StoragePath

        path = StoragePath.media_raw("user1", "job1")
        assert path == "temp/raw/user1/job1/result.png"

    def test_media_thumbnail_path(self):
        """media_thumbnail uses temp/raw/ prefix."""
        from app.services.generation.r2_storage import StoragePath

        path = StoragePath.media_thumbnail("user1", "job1")
        assert path == "temp/raw/user1/job1/thumbnail.jpg"

    def test_render_preview_path(self):
        """render_preview uses renders/preview/ prefix."""
        from app.services.generation.r2_storage import StoragePath

        path = StoragePath.render_preview("hash123")
        assert path == "renders/preview/hash123.mp4"

    def test_render_final_path(self):
        """render_final uses renders/final/ prefix."""
        from app.services.generation.r2_storage import StoragePath

        path = StoragePath.render_final("hash123")
        assert path == "renders/final/hash123.mp4"

    def test_gallery_item_path(self):
        """gallery_item uses gallery/ prefix."""
        from app.services.generation.r2_storage import StoragePath

        path = StoragePath.gallery_item("g1", "item1")
        assert path == "gallery/g1/item1.png"

    def test_work_artifact_path(self):
        """work_artifact uses temp/work/ prefix."""
        from app.services.generation.r2_storage import StoragePath

        path = StoragePath.work_artifact("hash123", "proxy")
        assert path == "temp/work/hash123_proxy.mp4"
