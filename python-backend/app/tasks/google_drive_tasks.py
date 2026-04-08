"""
Celery tasks for Google Drive edit session management and content indexing.

Handles auto-expire of stale edit sessions, pre-expiry notifications,
and Google Drive file indexing for RAG search.
"""

import asyncio
import hashlib
import logging
import time
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.sqlalchemy_sync import to_sync_sqlalchemy_url

logger = logging.getLogger(__name__)


def _execute_with_retry(request, max_retries: int = 3):
    """Execute a Google API request with 429 rate-limit retry.

    Uses exponential backoff + Retry-After header from the response.
    """
    for attempt in range(max_retries + 1):
        try:
            return request.execute()
        except Exception as e:
            status = getattr(e, "status_code", None)
            if status is None and hasattr(e, "resp"):
                status = int(e.resp.get("status", 0))
            if status == 429 and attempt < max_retries:
                retry_after = 60
                if hasattr(e, "resp") and "retry-after" in (e.resp or {}):
                    try:
                        retry_after = int(e.resp["retry-after"])
                    except (ValueError, TypeError):
                        pass
                wait = min(retry_after, 300)
                logger.warning(
                    "Google API 429 throttled (attempt %d/%d), retrying in %ds",
                    attempt + 1, max_retries, wait,
                )
                time.sleep(wait)
                continue
            raise

# How long to extend a session when the Drive file was recently modified
EXTENSION_HOURS = 24
# How recently the file must have been modified to trigger an extension
RECENT_MODIFICATION_HOURS = 2
# How close to expiry triggers a notification
NOTIFICATION_WINDOW_HOURS = 2


def _get_sync_db_url() -> str:
    """Convert async DB URL to sync for Celery tasks."""
    return to_sync_sqlalchemy_url(settings.DATABASE_URL)


_sync_engine = None
_SyncSession = None


@contextmanager
def get_sync_session():
    """Get a sync database session for Celery tasks."""
    global _sync_engine, _SyncSession
    if _sync_engine is None:
        _sync_engine = create_engine(_get_sync_db_url(), pool_pre_ping=True, pool_size=3)
        _SyncSession = sessionmaker(bind=_sync_engine)
    session = _SyncSession()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@celery_app.task(name="cleanup_expired_edit_sessions", bind=True, max_retries=2)
def cleanup_expired_edit_sessions(self):
    """
    Periodic task to clean up expired Google Drive edit sessions.

    Runs every 30 minutes via Celery beat. For each expired session:
    - If the Drive file was recently modified, extend the session
    - Otherwise, delete the temp Drive file and mark the session as expired

    Also sends notifications for sessions expiring soon.
    """

    now = datetime.now(timezone.utc)

    try:
        with get_sync_session() as db:
            # 1. Find expired active sessions
            expired_rows = db.execute(
                text("""
                    SELECT id, user_id, drive_file_id, expires_at, tenant_id
                    FROM google_drive_edit_sessions
                    WHERE status = 'active' AND expires_at < :now
                """),
                {"now": now},
            ).fetchall()

            for row in expired_rows:
                session_id = row[0]
                user_id = row[1]
                drive_file_id = row[2]
                tenant_id = row[4]

                try:
                    _handle_expired_session(db, session_id, user_id, drive_file_id, now)
                except Exception as e:
                    logger.error("Failed to handle expired session %d: %s", session_id, e)

            # 2. Find sessions expiring soon (within NOTIFICATION_WINDOW_HOURS)
            soon_threshold = now + timedelta(hours=NOTIFICATION_WINDOW_HOURS)
            soon_rows = db.execute(
                text("""
                    SELECT id, user_id, expires_at, drive_file_id
                    FROM google_drive_edit_sessions
                    WHERE status = 'active'
                      AND expires_at > :now
                      AND expires_at < :soon
                """),
                {"now": now, "soon": soon_threshold},
            ).fetchall()

            for row in soon_rows:
                session_id = row[0]
                user_id = row[1]
                logger.info("Session %d expiring soon, user %d should be notified", session_id, user_id)

            db.commit()
            logger.info(
                "Edit session cleanup: %d expired, %d expiring soon",
                len(expired_rows),
                len(soon_rows),
            )

    except Exception as e:
        logger.error("cleanup_expired_edit_sessions failed: %s", e)
        raise self.retry(exc=e, countdown=60)


def _handle_expired_session(db, session_id: int, user_id: int, drive_file_id: str, now: datetime):
    """Handle a single expired edit session."""
    # Try to check if the Drive file was recently modified
    recently_modified = _check_recently_modified(user_id, drive_file_id)

    if recently_modified:
        # Extend the session
        new_expires = now + timedelta(hours=EXTENSION_HOURS)
        db.execute(
            text("""
                UPDATE google_drive_edit_sessions
                SET expires_at = :new_expires, updated_at = :now
                WHERE id = :id
            """),
            {"new_expires": new_expires, "now": now, "id": session_id},
        )
        logger.info("Extended session %d because Drive file was recently modified", session_id)
    else:
        # Delete temp Drive file and expire the session
        deleted = _delete_drive_file(user_id, drive_file_id)
        status_val = "expired"
        db.execute(
            text("""
                UPDATE google_drive_edit_sessions
                SET status = :status, updated_at = :now
                WHERE id = :id
            """),
            {"status": status_val, "now": now, "id": session_id},
        )
        if deleted:
            logger.info("Expired session %d and deleted Drive file %s", session_id, drive_file_id)
        else:
            logger.warning("Expired session %d but could not delete Drive file %s", session_id, drive_file_id)


def _check_recently_modified(user_id: int, drive_file_id: str) -> bool:
    """Check if a Drive file was modified within the last RECENT_MODIFICATION_HOURS."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        with get_sync_session() as db:
            # Get sync-compatible token (simplified -- in production use async)
            from sqlalchemy import text
            result = db.execute(
                text("SELECT access_token FROM oauth_connections WHERE user_id = :uid AND provider = 'google'"),
                {"uid": user_id},
            ).fetchone()
            if not result:
                return False
            access_token = result[0]

        creds = Credentials(token=access_token)
        drive_svc = build("drive", "v3", credentials=creds)
        file_meta = _execute_with_retry(drive_svc.files().get(fileId=drive_file_id, fields="modifiedTime"))
        modified_time = datetime.fromisoformat(file_meta["modifiedTime"].replace("Z", "+00:00"))
        threshold = datetime.now(timezone.utc) - timedelta(hours=RECENT_MODIFICATION_HOURS)
        return modified_time > threshold

    except Exception as e:
        logger.warning("Could not check Drive file modification time: %s", e)
        return False


def _delete_drive_file(user_id: int, drive_file_id: str) -> bool:
    """Delete a temporary Drive file. Returns True if deleted or already gone."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        with get_sync_session() as db:
            from sqlalchemy import text
            result = db.execute(
                text("SELECT access_token FROM oauth_connections WHERE user_id = :uid AND provider = 'google'"),
                {"uid": user_id},
            ).fetchone()
            if not result:
                logger.warning("No Google token for user %d, cannot delete Drive file", user_id)
                return False
            access_token = result[0]

        creds = Credentials(token=access_token)
        drive_svc = build("drive", "v3", credentials=creds)
        _execute_with_retry(drive_svc.files().delete(fileId=drive_file_id))
        return True

    except Exception as e:
        # 404 means already deleted
        http_status = getattr(e, "status_code", None)
        if http_status is None and hasattr(e, "resp"):
            http_status = int(e.resp.get("status", 0))
        if http_status == 404:
            return True
        # 401 means token expired -- can't delete, but mark as expired
        if http_status == 401:
            logger.warning("Token expired for user %d, cannot delete Drive file %s", user_id, drive_file_id)
            return False
        logger.error("Failed to delete Drive file %s: %s", drive_file_id, e)
        return False


# ── Google Drive Content Indexing ────────────────────────────────────────


def _run_async(coro):
    """Run async coroutine in Celery worker context (reuses event loop)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def _fetch_drive_file_metadata(access_token: str, drive_file_id: str) -> dict:
    """Fetch file metadata from Google Drive API."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(token=access_token)
    drive_svc = build("drive", "v3", credentials=creds)
    return _execute_with_retry(drive_svc.files().get(
        fileId=drive_file_id,
        fields="id,name,mimeType,modifiedTime,md5Checksum,size",
    ))


async def process_google_drive_index_job(
    db,
    job_id: int,
    *,
    embedding_service=None,
    vector_upsert_fn=None,
    content_extractor=None,
    token_service=None,
    drive_file_meta_fn=None,
) -> dict[str, Any]:
    """Process a Google Drive file index job through extract/chunk/embed/upsert pipeline."""
    from sqlalchemy import select, delete, and_
    from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
    from app.services.embedding_service import get_embedding_service
    from app.services.library_indexing_service import chunk_text_content
    from app.services.credit_billing_client import charge_credits_post_deduct

    job = await db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job_id))
    if not job:
        raise LookupError(f"gdrive_index_job_not_found:{job_id}")

    if job.status == "completed":
        return {"job_id": job.id, "status": "completed", "chunks_written": 0, "unchanged": True}

    # Mark as processing
    job.status = "processing"
    job.attempt_count = (job.attempt_count or 0) + 1
    job.started_at = datetime.utcnow()
    job.last_error = None
    job.next_retry_at = None
    job.updated_at = datetime.utcnow()
    await db.commit()

    item: Optional[LibraryItem] = None
    credits_charged = False
    credit_amount = 0

    try:
        # Load library item
        item = await db.scalar(
            select(LibraryItem).where(
                and_(
                    LibraryItem.id == job.library_item_id,
                    LibraryItem.tenant_id == job.tenant_id,
                    LibraryItem.deleted_at.is_(None),
                )
            )
        )
        if not item:
            raise LookupError(f"library_item_not_found:{job.library_item_id}")

        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
        drive_file_id = metadata.get("driveFileId")
        drive_mime_type = metadata.get("driveMimeType", "")
        stored_content_hash = metadata.get("contentHash")

        if not drive_file_id:
            raise ValueError("Library item missing driveFileId in metadata")

        # Get access token
        from app.services.google_token_service import GoogleTokenService, InvalidGrantError

        token_svc = token_service
        if not token_svc:
            token_svc = GoogleTokenService(db)

        try:
            access_token = await token_svc.get_valid_access_token(item.owner_user_id)
        except InvalidGrantError:
            job.status = "retry_pending"
            job.last_error = "token_expired"
            job.next_retry_at = datetime.utcnow() + timedelta(minutes=30)
            job.updated_at = datetime.utcnow()
            metadata["syncStatus"] = "token_expired"
            item.metadata_json = {**metadata}
            item.updated_at = datetime.utcnow()
            await db.commit()
            return {"job_id": job.id, "status": "retry_pending", "reason": "token_expired"}

        # Fetch file metadata from Drive API for content hash
        fetcher = drive_file_meta_fn or _fetch_drive_file_metadata
        file_meta = fetcher(access_token, drive_file_id)

        # Compute content hash
        md5 = file_meta.get("md5Checksum")
        if md5:
            content_hash = md5
        else:
            raw = f"{file_meta.get('modifiedTime', '')}:{file_meta.get('size', '')}".encode()
            content_hash = hashlib.sha256(raw).hexdigest()

        # Skip if unchanged
        if content_hash == stored_content_hash:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()
            await db.commit()
            logger.info("gdrive_index_unchanged job_id=%d drive_file_id=%s", job.id, drive_file_id)
            return {"job_id": job.id, "status": "completed", "chunks_written": 0, "unchanged": True}

        # Extract text content
        extractor = content_extractor
        if not extractor:
            from app.services.google_content_extractor import GoogleContentExtractor
            extractor = GoogleContentExtractor(access_token=access_token)

        extracted = extractor.extract(
            file_id=drive_file_id,
            mime_type=drive_mime_type,
        )

        extracted_text = extracted.get("text", "") if isinstance(extracted, dict) else getattr(extracted, "text", str(extracted))
        if not extracted_text:
            raise ValueError("Content extraction returned empty text")

        # Chunk content
        chunks = chunk_text_content(extracted_text, max_chars=1000, overlap_chars=200)
        if not chunks:
            raise ValueError("Chunking produced no content")

        # Generate embeddings
        embedder = embedding_service or get_embedding_service()
        embeddings = embedder.embed_batch([chunk["content"] for chunk in chunks])

        # Build vector IDs with gdrive: prefix
        tenant_id = job.tenant_id
        vector_ids = [
            f"gdrive:{tenant_id}:{drive_file_id}:{chunk['chunk_index']}"
            for chunk in chunks
        ]

        # Upsert to vector store with gdrive: prefix IDs
        if vector_upsert_fn:
            vector_upsert_fn(
                tenant_id=tenant_id,
                item_id=job.library_item_id,
                chunks=chunks,
                embeddings=embeddings,
            )
        else:
            from app.core.vectordb import VectorCollection
            collection_name = f"library_tenant_{tenant_id}"
            collection = VectorCollection(collection_name)
            # Delete ALL old vectors for this item (handles chunk count changes)
            try:
                collection.delete(where={"item_id": job.library_item_id})
            except Exception:
                # Fallback: delete by current IDs only
                collection.delete(ids=vector_ids)
            collection.add(
                ids=vector_ids,
                documents=[chunk["content"] for chunk in chunks],
                embeddings=embeddings,
                metadatas=[
                    {
                        "tenant_id": tenant_id,
                        "item_id": job.library_item_id,
                        "user_id": item.owner_user_id,
                        "chunk_index": chunk["chunk_index"],
                        "token_count": chunk.get("token_count") or 0,
                        "content_type": chunk.get("content_type") or "text",
                        "source": "google_drive",
                        "drive_file_id": drive_file_id,
                    }
                    for chunk in chunks
                ],
            )

        # Delete existing chunks and insert new ones
        await db.execute(delete(LibraryChunk).where(LibraryChunk.library_item_id == item.id))

        # Inherit allowed_scopes from parent item for permission-based RAG filtering
        item_scopes = item.allowed_scopes or []

        created_at = datetime.utcnow()
        for chunk, vector_id in zip(chunks, vector_ids):
            db.add(
                LibraryChunk(
                    tenant_id=tenant_id,
                    library_item_id=item.id,
                    chunk_index=chunk["chunk_index"],
                    content=chunk["content"],
                    content_type=chunk.get("content_type") or "text",
                    token_count=chunk.get("token_count"),
                    vector_ref_id=vector_id,
                    allowed_scopes=list(item_scopes),
                    metadata={
                        **(chunk.get("metadata") or {}),
                        "source": "google_drive",
                        "drive_file_id": drive_file_id,
                        "job_id": job.id,
                        "user_id": item.owner_user_id,
                        "item_id": item.id,
                    },
                    created_at=created_at,
                )
            )

        # Update library item metadata
        metadata["contentHash"] = content_hash
        metadata["lastSyncedAt"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        metadata["syncStatus"] = "indexed"
        metadata["chunkCount"] = len(chunks)
        item.metadata_json = {**metadata}
        item.status = "ready"
        item.updated_at = datetime.utcnow()

        # Complete job
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        job.next_retry_at = None
        job.last_error = None
        job.updated_at = datetime.utcnow()

        await db.commit()

        # Post-deduct credit billing
        credit_amount = len(chunks) * 2
        idempotency_key = f"gdrive_index:{tenant_id}:{drive_file_id}:{content_hash}"
        await charge_credits_post_deduct(
            user_id=item.owner_user_id,
            amount=credit_amount,
            service="gdrive.index",
            idempotency_key=idempotency_key,
            metadata={
                "driveFileId": drive_file_id,
                "chunkCount": len(chunks),
            },
            source_type="indexing",
        )
        credits_charged = True

        logger.info(
            "gdrive_index_completed job_id=%d drive_file_id=%s chunks=%d credits=%d",
            job.id, drive_file_id, len(chunks), credit_amount,
        )

        return {
            "job_id": job.id,
            "status": "completed",
            "chunks_written": len(chunks),
            "content_hash": content_hash,
        }

    except Exception as exc:
        error_message = str(exc)
        terminal = isinstance(exc, ValueError) or job.attempt_count >= (job.max_attempts or 5)

        # Rollback any partial writes before updating error status
        await db.rollback()

        if terminal:
            job.status = "failed"
            job.completed_at = datetime.utcnow()
            job.next_retry_at = None
            job.last_error = error_message
            job.updated_at = datetime.utcnow()
            if item:
                meta = item.metadata_json if isinstance(item.metadata_json, dict) else {}
                meta["syncStatus"] = "failed"
                item.metadata_json = {**meta}
                item.status = "failed"
                item.updated_at = datetime.utcnow()
            await db.commit()
        else:
            delay = min(30 * (2 ** max(job.attempt_count - 1, 0)), 1800)
            job.status = "retry_pending"
            job.next_retry_at = datetime.utcnow() + timedelta(seconds=delay)
            job.last_error = error_message
            job.updated_at = datetime.utcnow()
            await db.commit()

        # Refund credits if already charged
        if credits_charged:
            try:
                await charge_credits_post_deduct(
                    user_id=item.owner_user_id if item else 0,
                    amount=-credit_amount,
                    service="gdrive.index.refund",
                    idempotency_key=f"gdrive_index_refund:{job.id}",
                    metadata={"reason": "indexing_failed", "original_job_id": job.id},
                    source_type="indexing",
                )
            except Exception as refund_err:
                logger.error("gdrive_index_refund_failed job_id=%d error=%s", job.id, str(refund_err))

        logger.error("gdrive_index_failed job_id=%d error=%s terminal=%s", job.id, error_message, terminal)

        return {
            "job_id": job.id,
            "status": job.status,
            "error": error_message,
        }


async def _process_gdrive_index_async(job_id: int):
    """Async entrypoint for Google Drive index job."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        return await process_google_drive_index_job(db, job_id)


@celery_app.task(name="process_google_drive_index_job", bind=True, max_retries=3)
def process_google_drive_index_job_task(self, job_id: int):
    """Celery task for Google Drive file indexing pipeline."""
    logger.info("process_gdrive_index_started", extra={"job_id": job_id})
    try:
        return _run_async(_process_gdrive_index_async(job_id))
    except Exception as e:
        logger.error("process_gdrive_index_exception", extra={"job_id": job_id, "error": str(e)})
        return {"status": "failed", "error": str(e), "job_id": job_id}


# ── Incremental Sync Tasks ────────────────────────────────────────────────


@celery_app.task(name="initial_drive_sync", bind=True, max_retries=3, default_retry_delay=60)
def initial_drive_sync(self, user_id: int, tenant_id: str):
    """Perform initial sync of a user's Google Drive.

    Lists all files matching sync settings, creates virtual references,
    and sets up a webhook channel for real-time updates.
    """
    logger.info("initial_drive_sync_started user_id=%d tenant_id=%s", user_id, tenant_id)
    try:
        return _run_async(_initial_drive_sync_async(user_id, tenant_id))
    except Exception as e:
        logger.error("initial_drive_sync_failed user_id=%d error=%s", user_id, str(e))
        raise self.retry(exc=e, countdown=60)


@celery_app.task(name="process_drive_changes", bind=True, max_retries=3, default_retry_delay=30)
def process_drive_changes(self, user_id: int, tenant_id: str):
    """Fetch and process changes from Google Drive Changes API.

    Called after a webhook notification or periodic polling.
    """
    logger.info("process_drive_changes_started user_id=%d tenant_id=%s", user_id, tenant_id)
    try:
        return _run_async(_process_drive_changes_async(user_id, tenant_id))
    except Exception as e:
        logger.error("process_drive_changes_failed user_id=%d error=%s", user_id, str(e))
        raise self.retry(exc=e, countdown=30)


@celery_app.task(name="renew_drive_watch_channels")
def renew_drive_watch_channels():
    """Periodic task to renew expiring Drive webhook channels.

    Runs every 6 hours via Celery Beat. Renews channels expiring within 24h.
    """
    logger.info("renew_drive_watch_channels_started")
    try:
        return _run_async(_renew_drive_watch_channels_async())
    except Exception as e:
        logger.error("renew_drive_watch_channels_failed error=%s", str(e))
        return {"error": str(e)}


# ── Async Implementations ─────────────────────────────────────────────────


async def _initial_drive_sync_async(user_id: int, tenant_id: str) -> dict:
    """Async implementation of initial Drive sync."""
    from app.core.database import AsyncSessionLocal
    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
    from app.services.google_drive_sync_service import should_index_file, setup_watch_channel

    async with AsyncSessionLocal() as db:
        # Load sync state
        sync_state = await db.execute(
            text("""
                SELECT id, indexing_mode, folder_selections, file_type_filter,
                       max_file_size_bytes, auto_sync_enabled
                FROM google_drive_sync_state
                WHERE tenant_id = :tenant_id AND user_id = :user_id
            """),
            {"tenant_id": tenant_id, "user_id": user_id},
        )
        row = sync_state.fetchone()
        if not row:
            return {"error": "no_sync_state", "user_id": user_id}

        sync_id = row[0]
        indexing_mode = row[1]
        folder_selections = row[2] or []
        file_type_filter = row[3] or []
        max_file_size_bytes = row[4] or 52428800
        auto_sync_enabled = row[5]

        if indexing_mode == "none":
            return {"status": "skipped", "reason": "indexing_mode_none"}

        # Get access token
        token_svc = GoogleTokenService(db)
        try:
            access_token = await token_svc.get_valid_access_token(user_id)
        except InvalidGrantError:
            await db.execute(
                text("""
                    UPDATE google_drive_sync_state
                    SET last_error = 'token_expired', auto_sync_enabled = false, updated_at = NOW()
                    WHERE id = :id
                """),
                {"id": sync_id},
            )
            await db.commit()
            return {"error": "token_expired"}

        # Build Drive service
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials(token=access_token)
        drive = build("drive", "v3", credentials=creds)

        # Build sync settings dict for should_index_file
        sync_settings = {
            "indexing_mode": indexing_mode,
            "file_type_filter": file_type_filter,
            "folder_selections": folder_selections,
            "max_file_size_bytes": max_file_size_bytes,
        }

        # List all files (paginated)
        all_files = []
        page_token = None

        while True:
            params = {
                "q": "trashed = false",
                "pageSize": 100,
                "fields": "files(id,name,mimeType,size,modifiedTime,parents),nextPageToken",
                "orderBy": "modifiedTime desc",
            }
            if page_token:
                params["pageToken"] = page_token

            result = _execute_with_retry(drive.files().list(**params))
            files = result.get("files", [])
            all_files.extend(files)
            page_token = result.get("nextPageToken")
            if not page_token:
                break

        # Filter files
        matching_files = [f for f in all_files if should_index_file(f, sync_settings)]

        # Update files_total
        await db.execute(
            text("""
                UPDATE google_drive_sync_state
                SET files_total = :total, files_processed = 0, last_error = NULL, updated_at = NOW()
                WHERE id = :id
            """),
            {"total": len(matching_files), "id": sync_id},
        )
        await db.commit()

        # Create virtual references for matching files and enqueue indexing
        files_processed = 0
        failed_files = []

        for file_meta in matching_files:
            try:
                await _create_virtual_reference(db, tenant_id, user_id, file_meta)
                files_processed += 1
            except Exception as e:
                failed_files.append(file_meta.get("id", "unknown"))
                logger.warning("Failed to create reference for %s: %s", file_meta.get("id"), str(e))

            # Update progress every 10 files
            total_done = files_processed + len(failed_files)
            if total_done % 10 == 0:
                await db.execute(
                    text("UPDATE google_drive_sync_state SET files_processed = :n, updated_at = NOW() WHERE id = :id"),
                    {"n": total_done, "id": sync_id},
                )
                await db.commit()

        # Final progress update
        total_done = files_processed + len(failed_files)
        last_error = None
        if failed_files:
            last_error = f"{len(failed_files)} files failed: {failed_files[:5]}"

        # Set up webhook channel if auto_sync_enabled
        channel_info = {}
        if auto_sync_enabled:
            try:
                channel_info = await setup_watch_channel(user_id, tenant_id, access_token)
                token_hash = hashlib.sha256(channel_info["channel_token"].encode()).hexdigest()
                await db.execute(
                    text("""
                        UPDATE google_drive_sync_state
                        SET channel_id = :channel_id, resource_id = :resource_id,
                            channel_token_hash = :token_hash, channel_expiry = :expiry,
                            page_token = :page_token, updated_at = NOW()
                        WHERE id = :id
                    """),
                    {
                        "channel_id": channel_info["channel_id"],
                        "resource_id": channel_info["resource_id"],
                        "token_hash": token_hash,
                        "expiry": channel_info["channel_expiry"],
                        "page_token": channel_info["page_token"],
                        "id": sync_id,
                    },
                )
            except Exception as e:
                logger.error("Failed to set up watch channel: %s", str(e))

        # Finalize sync state
        await db.execute(
            text("""
                UPDATE google_drive_sync_state
                SET files_processed = :n, last_sync_at = NOW(), last_error = :error, updated_at = NOW()
                WHERE id = :id
            """),
            {"n": total_done, "error": last_error, "id": sync_id},
        )
        await db.commit()

        logger.info(
            "initial_drive_sync_completed user_id=%d files=%d/%d failed=%d",
            user_id, files_processed, len(matching_files), len(failed_files),
        )
        return {
            "status": "completed",
            "files_total": len(matching_files),
            "files_processed": files_processed,
            "failed": len(failed_files),
        }


async def _create_virtual_reference(db, tenant_id: str, user_id: int, file_meta: dict):
    """Create or update a library_items record for a Drive file and enqueue indexing."""
    drive_file_id = file_meta.get("id", "")
    name = file_meta.get("name", "Untitled")
    mime_type = file_meta.get("mimeType", "")
    modified_time = file_meta.get("modifiedTime")

    import json

    # Check if already exists (scoped to tenant + owner for cross-user isolation)
    existing = await db.execute(
        text("""
            SELECT id FROM library_items
            WHERE tenant_id = :tenant_id AND owner_user_id = :user_id
            AND metadata->>'driveFileId' = :drive_id
            AND deleted_at IS NULL
            LIMIT 1
        """),
        {"tenant_id": tenant_id, "user_id": user_id, "drive_id": drive_file_id},
    )
    existing_row = existing.fetchone()

    if existing_row:
        # Update metadata for re-indexing (file may have been modified)
        item_id = existing_row[0]
        await db.execute(
            text("""
                UPDATE library_items
                SET metadata = jsonb_set(
                    jsonb_set(metadata, '{driveModifiedTime}', :mod_time::jsonb),
                    '{syncStatus}', '"pending"'::jsonb
                ), status = 'pending', updated_at = NOW()
                WHERE id = :id AND owner_user_id = :user_id
            """),
            {"mod_time": json.dumps(modified_time), "id": item_id, "user_id": user_id},
        )
        await db.commit()
        # Enqueue re-indexing
        _enqueue_index_job(db, tenant_id, item_id)
        return

    # Determine item type from MIME
    item_type = "document"
    if "spreadsheet" in mime_type or "excel" in mime_type:
        item_type = "spreadsheet"
    elif "presentation" in mime_type or "powerpoint" in mime_type:
        item_type = "presentation"
    elif mime_type == "application/pdf":
        item_type = "pdf"
    elif mime_type.startswith("image/"):
        item_type = "image"
    elif mime_type.startswith("text/"):
        item_type = "text"

    metadata = json.dumps({
        "driveFileId": drive_file_id,
        "driveMimeType": mime_type,
        "driveModifiedTime": modified_time,
        "source": "google_drive",
        "syncStatus": "pending",
    })

    # Set initial allowed_scopes so owner can discover via RAG
    initial_scopes = [f"u:{user_id}"]

    result = await db.execute(
        text("""
            INSERT INTO library_items (tenant_id, owner_user_id, title, item_type, source,
                                        metadata, allowed_scopes, status, created_at, updated_at)
            VALUES (:tenant_id, :user_id, :title, :item_type, 'google_drive',
                    :metadata::jsonb, :allowed_scopes::text[], 'pending', NOW(), NOW())
            ON CONFLICT DO NOTHING
            RETURNING id
        """),
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "title": name,
            "item_type": item_type,
            "metadata": metadata,
            "allowed_scopes": initial_scopes,
        },
    )
    row = result.fetchone()
    if row:
        await db.commit()
        _enqueue_index_job(db, tenant_id, row[0])


def _enqueue_index_job(db, tenant_id: str, item_id: int):
    """Create an index job record and enqueue the Celery task."""
    from sqlalchemy import text as sa_text

    try:
        with get_sync_session() as session:
            # Check if pending/processing job already exists
            existing = session.execute(
                sa_text("""
                    SELECT id FROM library_index_jobs
                    WHERE library_item_id = :item_id AND status IN ('pending', 'processing')
                    LIMIT 1
                """),
                {"item_id": item_id},
            )
            if existing.fetchone():
                return  # Already queued

            result = session.execute(
                sa_text("""
                    INSERT INTO library_index_jobs (tenant_id, library_item_id, job_type, status,
                                                    attempt_count, max_attempts, run_at, created_at, updated_at)
                    VALUES (:tenant_id, :item_id, 'gdrive_index', 'pending',
                            0, 5, NOW(), NOW(), NOW())
                    RETURNING id
                """),
                {"tenant_id": tenant_id, "item_id": item_id},
            )
            row = result.fetchone()
            if row:
                process_google_drive_index_job_task.delay(row[0])
                logger.info("Enqueued GDrive index job %d for item %d", row[0], item_id)
    except Exception as e:
        logger.warning("Failed to enqueue GDrive index job for item %d: %s", item_id, str(e))


async def _process_drive_changes_async(user_id: int, tenant_id: str) -> dict:
    """Async implementation of Drive change processing."""
    from app.core.database import AsyncSessionLocal
    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
    from app.services.google_drive_sync_service import should_index_file

    async with AsyncSessionLocal() as db:
        # Load sync state
        sync_state = await db.execute(
            text("""
                SELECT id, page_token, indexing_mode, folder_selections,
                       file_type_filter, max_file_size_bytes
                FROM google_drive_sync_state
                WHERE tenant_id = :tenant_id AND user_id = :user_id
            """),
            {"tenant_id": tenant_id, "user_id": user_id},
        )
        row = sync_state.fetchone()
        if not row:
            return {"error": "no_sync_state"}

        sync_id = row[0]
        page_token = row[1]
        if not page_token:
            return {"error": "no_page_token"}

        sync_settings = {
            "indexing_mode": row[2],
            "file_type_filter": row[4] or [],
            "folder_selections": row[3] or [],
            "max_file_size_bytes": row[5] or 52428800,
        }

        # Get access token
        token_svc = GoogleTokenService(db)
        try:
            access_token = await token_svc.get_valid_access_token(user_id)
        except InvalidGrantError:
            await db.execute(
                text("""
                    UPDATE google_drive_sync_state
                    SET last_error = 'token_expired', auto_sync_enabled = false, updated_at = NOW()
                    WHERE id = :id
                """),
                {"id": sync_id},
            )
            await db.commit()
            return {"error": "token_expired"}

        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials(token=access_token)
        drive = build("drive", "v3", credentials=creds)

        changes_processed = 0
        new_page_token = page_token

        while True:
            result = _execute_with_retry(drive.changes().list(
                pageToken=new_page_token,
                fields="changes(fileId,removed,file(id,name,mimeType,size,modifiedTime,parents)),newStartPageToken,nextPageToken",
                pageSize=100,
            ))

            changes = result.get("changes", [])

            for change in changes:
                file_id = change.get("fileId")
                removed = change.get("removed", False)

                if removed:
                    # Mark virtual reference as deleted
                    await db.execute(
                        text("""
                            UPDATE library_items
                            SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
                            WHERE tenant_id = :tenant_id
                              AND metadata->>'driveFileId' = :file_id
                              AND deleted_at IS NULL
                        """),
                        {"tenant_id": tenant_id, "file_id": file_id},
                    )
                    changes_processed += 1
                    continue

                file_meta = change.get("file")
                if file_meta and should_index_file(file_meta, sync_settings):
                    await _create_virtual_reference(db, tenant_id, user_id, file_meta)
                    changes_processed += 1

            # Update page token
            if result.get("newStartPageToken"):
                new_page_token = result["newStartPageToken"]
                break
            elif result.get("nextPageToken"):
                new_page_token = result["nextPageToken"]
            else:
                break

        # Save new page token and last_sync_at
        await db.execute(
            text("""
                UPDATE google_drive_sync_state
                SET page_token = :token, last_sync_at = NOW(), updated_at = NOW()
                WHERE id = :id
            """),
            {"token": new_page_token, "id": sync_id},
        )
        await db.commit()

        logger.info(
            "process_drive_changes_completed user_id=%d changes=%d",
            user_id, changes_processed,
        )
        return {"status": "completed", "changes_processed": changes_processed}


async def _renew_drive_watch_channels_async() -> dict:
    """Async implementation of channel renewal."""
    from app.core.database import AsyncSessionLocal
    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
    from app.services.google_drive_sync_service import setup_watch_channel

    renewed = 0
    failed = 0

    async with AsyncSessionLocal() as db:
        # Find channels expiring within 24 hours
        rows = await db.execute(
            text("""
                SELECT id, user_id, tenant_id, channel_id, resource_id
                FROM google_drive_sync_state
                WHERE auto_sync_enabled = true
                  AND channel_id IS NOT NULL
                  AND channel_expiry IS NOT NULL
                  AND channel_expiry < NOW() + INTERVAL '24 hours'
            """)
        )
        expiring = rows.fetchall()

        for row in expiring:
            sync_id, uid, tid, old_channel_id, old_resource_id = row

            try:
                token_svc = GoogleTokenService(db)
                access_token = await token_svc.get_valid_access_token(uid)

                # Stop old channel
                from google.oauth2.credentials import Credentials
                from googleapiclient.discovery import build

                creds = Credentials(token=access_token)
                drive = build("drive", "v3", credentials=creds)

                try:
                    _execute_with_retry(drive.channels().stop(body={
                        "id": old_channel_id,
                        "resourceId": old_resource_id,
                    }))
                except Exception:
                    pass  # Old channel may already be expired

                # Create new channel
                channel_info = await setup_watch_channel(uid, tid, access_token)
                token_hash = hashlib.sha256(channel_info["channel_token"].encode()).hexdigest()

                await db.execute(
                    text("""
                        UPDATE google_drive_sync_state
                        SET channel_id = :channel_id, resource_id = :resource_id,
                            channel_token_hash = :token_hash, channel_expiry = :expiry,
                            page_token = :page_token, updated_at = NOW()
                        WHERE id = :id
                    """),
                    {
                        "channel_id": channel_info["channel_id"],
                        "resource_id": channel_info["resource_id"],
                        "token_hash": token_hash,
                        "expiry": channel_info["channel_expiry"],
                        "page_token": channel_info["page_token"],
                        "id": sync_id,
                    },
                )
                await db.commit()
                renewed += 1

            except InvalidGrantError:
                # Token expired -- disable auto-sync
                await db.execute(
                    text("""
                        UPDATE google_drive_sync_state
                        SET auto_sync_enabled = false, last_error = 'token_expired', updated_at = NOW()
                        WHERE id = :id
                    """),
                    {"id": sync_id},
                )
                await db.execute(
                    text("""
                        UPDATE oauth_connections
                        SET status = 'expired', updated_at = NOW()
                        WHERE user_id = :uid AND provider = 'google'
                    """),
                    {"uid": uid},
                )
                await db.commit()
                failed += 1
                logger.warning("Channel renewal failed for user %d: token expired", uid)

            except Exception as e:
                failed += 1
                logger.error("Channel renewal failed for user %d: %s", uid, str(e))

    logger.info("renew_drive_watch_channels_completed renewed=%d failed=%d", renewed, failed)
    return {"renewed": renewed, "failed": failed}


async def _estimate_sync_cost_impl(user_id: int, tenant_id: str) -> dict:
    """Count matching files and return estimated credit cost."""
    from app.core.database import AsyncSessionLocal
    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
    from app.services.google_drive_sync_service import should_index_file

    async with AsyncSessionLocal() as db:
        sync_state = await db.execute(
            text("""
                SELECT indexing_mode, folder_selections, file_type_filter, max_file_size_bytes
                FROM google_drive_sync_state
                WHERE tenant_id = :tenant_id AND user_id = :user_id
            """),
            {"tenant_id": tenant_id, "user_id": user_id},
        )
        row = sync_state.fetchone()
        if not row:
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}

        sync_settings = {
            "indexing_mode": row[0],
            "file_type_filter": row[2] or [],
            "folder_selections": row[1] or [],
            "max_file_size_bytes": row[3] or 52428800,
        }

        if sync_settings["indexing_mode"] == "none":
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}

        token_svc = GoogleTokenService(db)
        try:
            access_token = await token_svc.get_valid_access_token(user_id)
        except InvalidGrantError:
            logger.warning("estimate_sync_cost_token_expired user_id=%d", user_id)
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0, "error": "token_expired"}

        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials(token=access_token)
        drive = build("drive", "v3", credentials=creds)

        all_files = []
        page_token = None
        total_size = 0

        while True:
            params = {
                "q": "trashed = false",
                "pageSize": 100,
                "fields": "files(id,name,mimeType,size,modifiedTime,parents),nextPageToken",
            }
            if page_token:
                params["pageToken"] = page_token
            result = _execute_with_retry(drive.files().list(**params))
            files = result.get("files", [])
            for f in files:
                if should_index_file(f, sync_settings):
                    all_files.append(f)
                    total_size += int(f.get("size", 0) or 0)
            page_token = result.get("nextPageToken")
            if not page_token:
                break

        # Estimate: ~2 credits per chunk, ~1 chunk per 1000 chars, ~5 chars/byte
        estimated_chars = total_size * 5
        estimated_chunks = max(1, estimated_chars // 1000) if all_files else 0
        estimated_credits = estimated_chunks * 2

        return {
            "file_count": len(all_files),
            "estimated_credits": estimated_credits,
            "estimated_size_mb": round(total_size / (1024 * 1024), 1),
        }


# ── Webhook Fallback: Periodic Polling ─────────────────────────────────────


@celery_app.task(name="poll_drive_changes")
def poll_drive_changes():
    """Periodic fallback task for users whose webhook channel is down.

    Runs every 15 minutes via Celery Beat. Finds users with auto_sync_enabled
    but no active webhook channel, and polls the Changes API for them.
    Attempts to re-establish the webhook channel on each run.
    """
    logger.info("poll_drive_changes_started")
    try:
        return _run_async(_poll_drive_changes_async())
    except Exception as e:
        logger.error("poll_drive_changes_failed error=%s", str(e))
        return {"error": str(e)}


async def _poll_drive_changes_async() -> dict:
    """Async implementation of polling fallback."""
    from app.core.database import AsyncSessionLocal

    polled = 0
    failed = 0

    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            text("""
                SELECT user_id, tenant_id
                FROM google_drive_sync_state
                WHERE auto_sync_enabled = true
                  AND channel_id IS NULL
                  AND page_token IS NOT NULL
            """)
        )
        candidates = rows.fetchall()

        for row in candidates:
            uid, tid = row[0], row[1]
            try:
                result = await _process_drive_changes_async(uid, tid)
                if result.get("error"):
                    failed += 1
                else:
                    polled += 1

                # Attempt to re-establish webhook
                await _try_reestablish_webhook(uid, tid)

            except Exception as e:
                failed += 1
                logger.warning("poll_drive_changes user_id=%d error=%s", uid, str(e))

    logger.info("poll_drive_changes_completed polled=%d failed=%d", polled, failed)
    return {"polled": polled, "failed": failed}


async def _try_reestablish_webhook(user_id: int, tenant_id: str):
    """Attempt to re-establish a webhook channel for a user."""
    from app.core.database import AsyncSessionLocal
    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
    from app.services.google_drive_sync_service import setup_watch_channel

    try:
        async with AsyncSessionLocal() as db:
            token_svc = GoogleTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)

            channel_info = await setup_watch_channel(user_id, tenant_id, access_token)
            token_hash = hashlib.sha256(channel_info["channel_token"].encode()).hexdigest()

            await db.execute(
                text("""
                    UPDATE google_drive_sync_state
                    SET channel_id = :channel_id, resource_id = :resource_id,
                        channel_token_hash = :token_hash, channel_expiry = :expiry,
                        page_token = :page_token, updated_at = NOW()
                    WHERE tenant_id = :tenant_id AND user_id = :user_id
                """),
                {
                    "channel_id": channel_info["channel_id"],
                    "resource_id": channel_info["resource_id"],
                    "token_hash": token_hash,
                    "expiry": channel_info["channel_expiry"],
                    "page_token": channel_info["page_token"],
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                },
            )
            await db.commit()
            logger.info("webhook_reestablished user_id=%d", user_id)
    except InvalidGrantError:
        logger.warning("webhook_reestablish_token_expired user_id=%d", user_id)
    except Exception as e:
        logger.warning("webhook_reestablish_failed user_id=%d error=%s", user_id, str(e))


# ── Disconnect & Cleanup ────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def disconnect_google_drive_cleanup(self, user_id: int, tenant_id: str):
    """Complete cleanup when user disconnects Google Drive.

    Phase 1: Google API operations (require valid token)
      - Delete temp Drive files from active edit sessions
      - Stop webhook channel
      - Revoke access token

    Phase 2: Local data cleanup (via Node.js internal endpoint)
      - Delete edit sessions, sync state, library items (cascades chunks + links)
      - Delete oauth_connection record
    """
    logger.info("disconnect_cleanup_started user_id=%d tenant_id=%s", user_id, tenant_id)
    try:
        result = _run_async(_disconnect_cleanup_async(user_id, tenant_id))
        logger.info("disconnect_cleanup_completed user_id=%d result=%s", user_id, result)
        return result
    except Exception as e:
        logger.error("disconnect_cleanup_failed user_id=%d error=%s", user_id, str(e))
        try:
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            logger.error("disconnect_cleanup_max_retries user_id=%d", user_id)
            return {"error": str(e), "phase": "unknown"}


async def _disconnect_cleanup_async(user_id: int, tenant_id: str) -> dict:
    """Async implementation of the disconnect cleanup flow."""
    from app.core.database import AsyncSessionLocal
    from app.services.google_token_service import GoogleTokenService, InvalidGrantError

    result = {
        "temp_files_deleted": 0,
        "webhook_stopped": False,
        "token_revoked": False,
        "local_cleanup": False,
        "oauth_deleted": False,
    }

    # ── Phase 1: Google API operations (require valid token) ──

    access_token = None
    try:
        async with AsyncSessionLocal() as db:
            token_svc = GoogleTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)
    except (ValueError, InvalidGrantError) as e:
        logger.warning(
            "disconnect_no_valid_token user_id=%d error=%s (skipping Phase 1 Drive API ops)",
            user_id, str(e),
        )

    if access_token:
        # Step 1: Delete temp Drive files from active edit sessions
        result["temp_files_deleted"] = await _delete_temp_drive_files(user_id, tenant_id, access_token)

        # Step 2: Stop webhook channel
        result["webhook_stopped"] = await _stop_webhook_channel(user_id, tenant_id, access_token)

    # Step 3: Revoke access token
    try:
        async with AsyncSessionLocal() as db:
            token_svc = GoogleTokenService(db)
            result["token_revoked"] = await token_svc.revoke_token(user_id)
    except Exception as e:
        logger.warning("disconnect_revoke_failed user_id=%d error=%s", user_id, str(e))

    # ── Phase 2: Local data cleanup ──

    # Check if user reconnected during cleanup (new active connection)
    async with AsyncSessionLocal() as db:
        check = await db.execute(
            text("""
                SELECT status FROM oauth_connections
                WHERE user_id = :user_id AND provider = 'google' AND status = 'active'
            """),
            {"user_id": user_id},
        )
        if check.fetchone():
            logger.warning("disconnect_aborted_reconnected user_id=%d", user_id)
            return {**result, "aborted": True, "reason": "user_reconnected"}

    # Step 4-9: Call Node.js internal endpoint for DB cleanup
    result["local_cleanup"] = await _call_node_cleanup(user_id, tenant_id)

    # Step 10: Delete oauth_connection
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("""
                    DELETE FROM oauth_connections
                    WHERE user_id = :user_id AND provider = 'google'
                      AND status = 'revoked'
                """),
                {"user_id": user_id},
            )
            await db.commit()
            result["oauth_deleted"] = True
    except Exception as e:
        logger.error("disconnect_oauth_delete_failed user_id=%d error=%s", user_id, str(e))

    return result


async def _delete_temp_drive_files(user_id: int, tenant_id: str, access_token: str) -> int:
    """Delete temporary Drive files created by edit sessions."""
    deleted = 0
    with get_sync_session() as session:
        rows = session.execute(
            text("""
                SELECT drive_file_id FROM google_drive_edit_sessions
                WHERE user_id = :user_id AND tenant_id = :tenant_id
                  AND status = 'active' AND drive_file_id IS NOT NULL
            """),
            {"user_id": user_id, "tenant_id": tenant_id},
        )
        file_ids = [r[0] for r in rows.fetchall()]

    if not file_ids:
        return 0

    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(token=access_token)
    drive = build("drive", "v3", credentials=creds)

    for fid in file_ids:
        try:
            _execute_with_retry(drive.files().delete(fileId=fid))
            deleted += 1
        except Exception as e:
            logger.warning("disconnect_delete_file_failed file_id=%s error=%s", fid, str(e))

    return deleted


async def _stop_webhook_channel(user_id: int, tenant_id: str, access_token: str) -> bool:
    """Stop the webhook channel for this user."""
    with get_sync_session() as session:
        row = session.execute(
            text("""
                SELECT channel_id, resource_id FROM google_drive_sync_state
                WHERE user_id = :user_id AND tenant_id = :tenant_id
                  AND channel_id IS NOT NULL
            """),
            {"user_id": user_id, "tenant_id": tenant_id},
        ).fetchone()

    if not row or not row[0]:
        return False

    channel_id, resource_id = row[0], row[1]

    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    try:
        creds = Credentials(token=access_token)
        drive = build("drive", "v3", credentials=creds)
        _execute_with_retry(drive.channels().stop(body={"id": channel_id, "resourceId": resource_id}))
        return True
    except Exception as e:
        logger.warning("disconnect_stop_channel_failed user_id=%d error=%s", user_id, str(e))
        return False


async def _call_node_cleanup(user_id: int, tenant_id: str) -> bool:
    """Call Node.js internal endpoint to clean up Drizzle-managed tables."""
    import httpx

    base_url = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").rstrip("/")
    token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN or ""

    if not base_url or not token:
        logger.warning("disconnect_node_cleanup_skipped: gateway URL or token not configured")
        return False

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{base_url}/api/internal/google-drive/cleanup",
                json={"userId": user_id, "tenantId": tenant_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            data = resp.json()
            logger.info(
                "disconnect_node_cleanup_ok user_id=%d items=%d",
                user_id, data.get("itemsDeleted", 0),
            )
            return True
        else:
            logger.warning(
                "disconnect_node_cleanup_failed user_id=%d status=%d body=%s",
                user_id, resp.status_code, resp.text[:200],
            )
            return False
    except Exception as e:
        logger.error("disconnect_node_cleanup_error user_id=%d error=%s", user_id, str(e))
        return False
