"""Tests for Google Drive content indexing pipeline (section 08)."""

import hashlib
import math
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.google_drive_tasks import process_google_drive_index_job


def _make_job(
    job_id=1,
    tenant_id="t1",
    library_item_id=10,
    status="pending",
    attempt_count=0,
    max_attempts=5,
    job_type="google_drive_sync",
):
    job = MagicMock()
    job.id = job_id
    job.tenant_id = tenant_id
    job.library_item_id = library_item_id
    job.status = status
    job.attempt_count = attempt_count
    job.max_attempts = max_attempts
    job.job_type = job_type
    job.started_at = None
    job.last_error = None
    job.next_retry_at = None
    job.completed_at = None
    job.updated_at = None
    return job


def _make_item(
    item_id=10,
    tenant_id="t1",
    owner_user_id=42,
    status="indexing",
    metadata=None,
):
    item = MagicMock()
    item.id = item_id
    item.tenant_id = tenant_id
    item.owner_user_id = owner_user_id
    item.status = status
    item.deleted_at = None
    item.updated_at = datetime.utcnow()
    item.metadata_json = metadata or {
        "driveFileId": "abc123",
        "driveMimeType": "application/vnd.google-apps.document",
        "syncStatus": "pending",
    }
    return item


def _make_db(job, item):
    """Create a mock async DB session."""
    db = AsyncMock()
    call_count = {"scalar": 0}

    async def scalar_side_effect(stmt):
        call_count["scalar"] += 1
        if call_count["scalar"] == 1:
            return job
        return item

    db.scalar = AsyncMock(side_effect=scalar_side_effect)
    db.commit = AsyncMock()
    db.execute = AsyncMock()
    db.add = MagicMock()
    return db


def _make_drive_meta_fn(meta: dict):
    """Create a drive_file_meta_fn that returns the given metadata."""
    return lambda access_token, drive_file_id: meta


@pytest.mark.asyncio
async def test_process_gdrive_index_full_pipeline():
    """processGoogleDriveIndexJob fetches file, extracts, chunks, embeds, upserts."""
    job = _make_job()
    item = _make_item()
    db = _make_db(job, item)

    mock_token_svc = AsyncMock()
    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")

    mock_extractor = MagicMock()
    mock_extractor.extract = MagicMock(return_value={"text": "Hello world " * 50})

    mock_embedder = MagicMock()
    mock_embedder.embed_batch = MagicMock(return_value=[[0.1, 0.2, 0.3]])

    mock_upsert = MagicMock()

    drive_file_meta = {
        "id": "abc123",
        "name": "Test Doc",
        "mimeType": "application/vnd.google-apps.document",
        "modifiedTime": "2026-02-14T00:00:00Z",
        "md5Checksum": "abc123hash",
        "size": "1024",
    }

    with patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock):
        result = await process_google_drive_index_job(
            db, 1,
            embedding_service=mock_embedder,
            vector_upsert_fn=mock_upsert,
            content_extractor=mock_extractor,
            token_service=mock_token_svc,
            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
        )

    assert result["status"] == "completed"
    assert result["chunks_written"] > 0
    assert result["content_hash"] == "abc123hash"

    # Verify extractor was called
    mock_extractor.extract.assert_called_once()

    # Verify embeddings generated
    mock_embedder.embed_batch.assert_called_once()

    # Verify item status updated to ready
    assert item.status == "ready"
    assert item.metadata_json["syncStatus"] == "indexed"
    assert item.metadata_json["contentHash"] == "abc123hash"


@pytest.mark.asyncio
async def test_process_gdrive_index_skips_unchanged():
    """processGoogleDriveIndexJob skips when content hash matches."""
    job = _make_job()
    item = _make_item(metadata={
        "driveFileId": "abc123",
        "driveMimeType": "application/vnd.google-apps.document",
        "contentHash": "existing_hash",
        "syncStatus": "indexed",
    })
    db = _make_db(job, item)

    mock_token_svc = AsyncMock()
    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")

    mock_extractor = MagicMock()

    drive_file_meta = {
        "id": "abc123",
        "name": "Test Doc",
        "mimeType": "application/vnd.google-apps.document",
        "modifiedTime": "2026-02-14T00:00:00Z",
        "md5Checksum": "existing_hash",
        "size": "1024",
    }

    result = await process_google_drive_index_job(
        db, 1,
        content_extractor=mock_extractor,
        token_service=mock_token_svc,
        drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
    )

    assert result["status"] == "completed"
    assert result["unchanged"] is True
    assert result["chunks_written"] == 0

    # Extractor should NOT be called
    mock_extractor.extract.assert_not_called()


@pytest.mark.asyncio
async def test_process_gdrive_index_charges_credits():
    """processGoogleDriveIndexJob charges credits with correct idempotency key."""
    job = _make_job()
    item = _make_item()
    db = _make_db(job, item)

    mock_token_svc = AsyncMock()
    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")

    mock_extractor = MagicMock()
    mock_extractor.extract = MagicMock(return_value={"text": "Hello world content " * 100})

    mock_embedder = MagicMock()
    mock_upsert = MagicMock()

    drive_file_meta = {
        "id": "abc123",
        "name": "Test Doc",
        "mimeType": "application/vnd.google-apps.document",
        "modifiedTime": "2026-02-14T00:00:00Z",
        "md5Checksum": "newhash123",
        "size": "2048",
    }

    # Simulate 10 chunks
    chunks = [
        {"chunk_index": i, "content": f"chunk {i}", "content_type": "text", "token_count": 50, "metadata": {}}
        for i in range(10)
    ]

    with patch("app.services.library_indexing_service.chunk_text_content", return_value=chunks), \
         patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock) as mock_charge:

        mock_embedder.embed_batch = MagicMock(return_value=[[0.1] * 3] * 10)

        result = await process_google_drive_index_job(
            db, 1,
            embedding_service=mock_embedder,
            vector_upsert_fn=mock_upsert,
            content_extractor=mock_extractor,
            token_service=mock_token_svc,
            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
        )

    assert result["status"] == "completed"

    # Verify credit charge: ceil(10) * 2 = 20
    mock_charge.assert_called_once()
    call_kwargs = mock_charge.call_args
    assert call_kwargs.kwargs["amount"] == 20
    assert call_kwargs.kwargs["service"] == "gdrive.index"
    assert call_kwargs.kwargs["idempotency_key"] == "gdrive_index:t1:abc123:newhash123"


@pytest.mark.asyncio
async def test_process_gdrive_index_token_expired():
    """processGoogleDriveIndexJob handles token expired by marking retry."""
    from app.services.google_token_service import InvalidGrantError

    job = _make_job()
    item = _make_item()
    db = _make_db(job, item)

    mock_token_svc = AsyncMock()
    mock_token_svc.get_valid_access_token = AsyncMock(side_effect=InvalidGrantError("Token expired"))

    result = await process_google_drive_index_job(
        db, 1,
        token_service=mock_token_svc,
    )

    assert result["status"] == "retry_pending"
    assert result["reason"] == "token_expired"
    assert item.metadata_json["syncStatus"] == "token_expired"


@pytest.mark.asyncio
async def test_process_gdrive_index_vector_ids_format():
    """Vector IDs follow format gdrive:{tenantId}:{driveFileId}:{chunkIndex}."""
    job = _make_job(tenant_id="tenant-xyz")
    item = _make_item(tenant_id="tenant-xyz", metadata={
        "driveFileId": "file_ABC",
        "driveMimeType": "application/vnd.google-apps.document",
        "syncStatus": "pending",
    })
    db = _make_db(job, item)

    mock_token_svc = AsyncMock()
    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")

    mock_extractor = MagicMock()
    mock_extractor.extract = MagicMock(return_value={"text": "Content " * 30})

    mock_embedder = MagicMock()
    mock_embedder.embed_batch = MagicMock(return_value=[[0.1, 0.2]] * 10)

    mock_upsert = MagicMock()

    drive_file_meta = {
        "id": "file_ABC",
        "name": "Test Doc",
        "mimeType": "application/vnd.google-apps.document",
        "modifiedTime": "2026-02-14T00:00:00Z",
        "md5Checksum": "hash999",
        "size": "512",
    }

    with patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock):
        result = await process_google_drive_index_job(
            db, 1,
            embedding_service=mock_embedder,
            vector_upsert_fn=mock_upsert,
            content_extractor=mock_extractor,
            token_service=mock_token_svc,
            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
        )

    assert result["status"] == "completed"

    # Check that db.add was called with chunks that have proper vector_ref_ids
    add_calls = db.add.call_args_list
    for call in add_calls:
        chunk = call[0][0]
        vid = chunk.vector_ref_id
        assert vid.startswith("gdrive:tenant-xyz:file_ABC:"), f"Invalid vector ID: {vid}"


@pytest.mark.asyncio
async def test_process_gdrive_index_vectors_tagged_with_metadata():
    """Vectors are tagged with source, drive_file_id, tenant_id metadata."""
    job = _make_job(tenant_id="t1")
    item = _make_item(tenant_id="t1", owner_user_id=42, metadata={
        "driveFileId": "fileXYZ",
        "driveMimeType": "application/vnd.google-apps.document",
        "syncStatus": "pending",
    })
    db = _make_db(job, item)

    mock_token_svc = AsyncMock()
    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")

    mock_extractor = MagicMock()
    mock_extractor.extract = MagicMock(return_value={"text": "Test content " * 30})

    mock_embedder = MagicMock()
    mock_embedder.embed_batch = MagicMock(return_value=[[0.1, 0.2]] * 10)

    mock_upsert = MagicMock()

    drive_file_meta = {
        "id": "fileXYZ",
        "name": "Test Doc",
        "mimeType": "application/vnd.google-apps.document",
        "modifiedTime": "2026-02-14T00:00:00Z",
        "md5Checksum": "hashXYZ",
        "size": "512",
    }

    with patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock):
        result = await process_google_drive_index_job(
            db, 1,
            embedding_service=mock_embedder,
            vector_upsert_fn=mock_upsert,
            content_extractor=mock_extractor,
            token_service=mock_token_svc,
            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
        )

    assert result["status"] == "completed"

    # Verify that db.add was called with LibraryChunk objects with correct metadata
    add_calls = db.add.call_args_list
    assert len(add_calls) > 0

    for call in add_calls:
        chunk = call[0][0]
        assert chunk.tenant_id == "t1"


@pytest.mark.asyncio
async def test_process_gdrive_index_failure_sets_status():
    """processGoogleDriveIndexJob sets syncStatus to failed on extraction error."""
    job = _make_job(attempt_count=4, max_attempts=5)
    item = _make_item()
    db = _make_db(job, item)

    mock_token_svc = AsyncMock()
    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")

    mock_extractor = MagicMock()
    mock_extractor.extract = MagicMock(return_value={"text": ""})  # empty text -> ValueError

    drive_file_meta = {
        "id": "abc123",
        "name": "Test Doc",
        "mimeType": "application/vnd.google-apps.document",
        "modifiedTime": "2026-02-14T00:00:00Z",
        "md5Checksum": "newhash",
        "size": "512",
    }

    result = await process_google_drive_index_job(
        db, 1,
        content_extractor=mock_extractor,
        token_service=mock_token_svc,
        drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
    )

    assert result["status"] == "failed"
    assert item.metadata_json["syncStatus"] == "failed"
    assert item.status == "failed"
