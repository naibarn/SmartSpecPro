"""
Celery tasks for Google Drive edit session management and content indexing.

Handles auto-expire of stale edit sessions, pre-expiry notifications,
and Google Drive file indexing for RAG search.
"""

import asyncio
import hashlib
import logging
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)

# How long to extend a session when the Drive file was recently modified
EXTENSION_HOURS = 24
# How recently the file must have been modified to trigger an extension
RECENT_MODIFICATION_HOURS = 2
# How close to expiry triggers a notification
NOTIFICATION_WINDOW_HOURS = 2


def _get_sync_db_url() -> str:
    """Convert async DB URL to sync for Celery tasks."""
    url = settings.DATABASE_URL
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "")
    if url.startswith("postgresql+asyncpg"):
        return url.replace("postgresql+asyncpg", "postgresql")
    return url


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
        file_meta = drive_svc.files().get(fileId=drive_file_id, fields="modifiedTime").execute()
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
        drive_svc.files().delete(fileId=drive_file_id).execute()
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
    return drive_svc.files().get(
        fileId=drive_file_id,
        fields="id,name,mimeType,modifiedTime,md5Checksum,size",
    ).execute()


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
