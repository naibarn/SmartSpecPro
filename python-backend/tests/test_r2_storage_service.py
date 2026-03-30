from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.r2_storage_service import R2StorageService


pytestmark = [pytest.mark.unit]


@pytest.mark.asyncio
async def test_upload_bytes_falls_back_to_endpoint_when_public_url_prefix_is_null():
    service = R2StorageService()
    service.get_active_settings = AsyncMock(
        return_value={
            "providerType": "r2",
            "bucket": "smartspec",
            "endpoint": "https://example.r2.cloudflarestorage.com",
            "publicUrlPrefix": None,
            "accessKeyId": "key",
            "secretAccessKey": "secret",
        }
    )

    client = MagicMock()
    service._get_s3_client = MagicMock(return_value=client)

    url = await service.upload_bytes(
        key="sandbox-artifacts/job-123/000-layout-spec.json",
        data=b"{}",
        content_type="application/json",
        db_session=AsyncMock(),
    )

    client.put_object.assert_called_once()
    assert url == "https://example.r2.cloudflarestorage.com/smartspec/sandbox-artifacts/job-123/000-layout-spec.json"


@pytest.mark.asyncio
async def test_upload_file_falls_back_to_endpoint_when_public_url_prefix_is_null():
    service = R2StorageService()
    service.get_active_settings = AsyncMock(
        return_value={
            "providerType": "r2",
            "bucket": "smartspec",
            "endpoint": "https://example.r2.cloudflarestorage.com",
            "publicUrlPrefix": None,
            "pathPrefix": "uploads",
            "accessKeyId": "key",
            "secretAccessKey": "secret",
        }
    )

    client = MagicMock()
    service._get_s3_client = MagicMock(return_value=client)

    url = await service.upload_file(
        file_content=b"file-bytes",
        filename="slides.pptx",
        folder="generated",
        content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        db_session=AsyncMock(),
    )

    client.put_object.assert_called_once()
    assert url is not None
    assert url.startswith("https://example.r2.cloudflarestorage.com/smartspec/uploads/generated/")
    assert url.endswith(".pptx")
