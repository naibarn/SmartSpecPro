"""OneDrive Celery tasks for sync, cleanup, and content indexing.

Uses Microsoft Graph API delta queries for incremental sync.
Mirrors the Google Drive indexing pipeline: extract → chunk → embed → vector store.
"""

import asyncio
import hashlib
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from celery import shared_task

from app.core.celery_app import celery_app
from app.core.sqlalchemy_sync import to_sync_sqlalchemy_url

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Shared sync engine singleton (same pattern as google_drive_tasks.py)
_sync_engine = None
_SyncSession = None


def _get_sync_db_url() -> str:
    """Convert async DB URL to sync for Celery tasks."""
    from app.core.config import settings
    return to_sync_sqlalchemy_url(settings.DATABASE_URL)


@contextmanager
def get_sync_session():
    """Get a sync database session for Celery tasks (reuses engine)."""
    global _sync_engine, _SyncSession
    if _sync_engine is None:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
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


# ── Async runner for Celery ──────────────────────────────────────────────────

def _run_async(coro):
    """Run async coroutine in Celery worker context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


# ── Initial Sync ─────────────────────────────────────────────────────────────

@shared_task(name="onedrive.initial_sync", bind=True, max_retries=3)
def initial_onedrive_sync(self, user_id: int, tenant_id: str = ""):
    """Full initial scan of OneDrive via delta query."""
    _run_async(_initial_sync_async(self, user_id, tenant_id))


async def _initial_sync_async(task, user_id: int, tenant_id: str):
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError
    from app.services.onedrive_sync_service import should_index_file

    async with AsyncSessionLocal() as db:
        try:
            token_svc = MicrosoftTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)
        except (ValueError, InvalidGrantError) as e:
            logger.error("OneDrive sync auth failed for user %d: %s", user_id, e)
            await _update_sync_state(db, user_id, last_error=str(e))
            return

        initial_delta_url = f"{GRAPH_BASE}/me/drive/root/delta"
        params = {"$select": "id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference,deleted"}

        files_total = 0
        files_processed = 0
        delta_link = None
        delta_url: Optional[str] = initial_delta_url
        is_first_page = True

        try:
            async with httpx.AsyncClient() as client:
                while delta_url:
                    resp = await client.get(
                        delta_url,
                        params=params if is_first_page else None,
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=30.0,
                    )
                    is_first_page = False

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning("Graph API throttled, retrying in %ds", retry_after)
                        await asyncio.sleep(min(retry_after, 300))
                        is_first_page = True  # Re-send params on retry
                        continue
                    if resp.status_code != 200:
                        logger.error("Delta query failed: %d %s", resp.status_code, resp.text[:300])
                        await _update_sync_state(db, user_id, last_error=f"Delta query failed: HTTP {resp.status_code}")
                        return

                    data = resp.json()
                    items = data.get("value", [])

                    for item in items:
                        if "deleted" in item:
                            continue
                        if "folder" in item:
                            continue

                        name = item.get("name", "")
                        mime_type = item.get("file", {}).get("mimeType", "")
                        size = item.get("size", 0)

                        if not should_index_file(name, mime_type, size):
                            continue

                        files_total += 1

                        try:
                            item_id = await _upsert_library_item(
                                db,
                                user_id=user_id,
                                tenant_id=tenant_id,
                                drive_item_id=item["id"],
                                name=name,
                                mime_type=mime_type,
                                size=size,
                                web_url=item.get("webUrl", ""),
                                last_modified=item.get("lastModifiedDateTime"),
                            )
                            if item_id:
                                _enqueue_onedrive_index_job(tenant_id, item_id)
                                files_processed += 1
                        except Exception as e:
                            logger.warning("Failed to process file %s: %s", name, e)

                    delta_url = data.get("@odata.nextLink")
                    if not delta_url:
                        delta_link = data.get("@odata.deltaLink")

            await _update_sync_state(
                db, user_id,
                delta_link=delta_link,
                files_total=files_total,
                files_processed=files_processed,
                last_error=None,
            )
            logger.info("OneDrive initial sync complete for user %d: %d/%d files", user_id, files_processed, files_total)

        except Exception as e:
            logger.error("OneDrive initial sync failed for user %d: %s", user_id, e)
            await _update_sync_state(db, user_id, last_error=str(e))


# ── Incremental Change Processing ────────────────────────────────────────────

@shared_task(name="onedrive.process_changes", bind=True, max_retries=3)
def process_onedrive_changes(self, user_id: int, tenant_id: str = ""):
    """Process incremental changes via delta token."""
    _run_async(_process_changes_async(self, user_id, tenant_id))


async def _process_changes_async(task, user_id: int, tenant_id: str):
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError
    from app.services.onedrive_sync_service import should_index_file

    async with AsyncSessionLocal() as db:
        sync_state = await _get_sync_state(db, user_id)
        if not sync_state or not sync_state.get("delta_link"):
            logger.info("No delta link for user %d, running initial sync", user_id)
            initial_onedrive_sync.delay(user_id, tenant_id)
            return

        try:
            token_svc = MicrosoftTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)
        except (ValueError, InvalidGrantError) as e:
            logger.error("OneDrive change processing auth failed for user %d: %s", user_id, e)
            return

        delta_url = sync_state["delta_link"]
        delta_link = None
        changes_processed = 0

        try:
            async with httpx.AsyncClient() as client:
                while delta_url:
                    resp = await client.get(
                        delta_url,
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning("Graph API throttled, retrying in %ds", retry_after)
                        await asyncio.sleep(min(retry_after, 300))
                        continue
                    if resp.status_code == 410:
                        logger.info("Delta token expired for user %d, triggering full resync", user_id)
                        await _update_sync_state(db, user_id, delta_link=None)
                        initial_onedrive_sync.delay(user_id, tenant_id)
                        return

                    if resp.status_code != 200:
                        logger.error("Delta change query failed: %d", resp.status_code)
                        return

                    data = resp.json()
                    items = data.get("value", [])

                    for item in items:
                        if "deleted" in item:
                            await _remove_library_item(db, user_id, tenant_id, item["id"])
                            changes_processed += 1
                            continue

                        if "folder" in item:
                            continue

                        name = item.get("name", "")
                        mime_type = item.get("file", {}).get("mimeType", "")
                        size = item.get("size", 0)

                        if not should_index_file(name, mime_type, size):
                            continue

                        try:
                            item_id = await _upsert_library_item(
                                db,
                                user_id=user_id,
                                tenant_id=tenant_id,
                                drive_item_id=item["id"],
                                name=name,
                                mime_type=mime_type,
                                size=size,
                                web_url=item.get("webUrl", ""),
                                last_modified=item.get("lastModifiedDateTime"),
                            )
                            if item_id:
                                _enqueue_onedrive_index_job(tenant_id, item_id)
                                changes_processed += 1
                        except Exception as e:
                            logger.warning("Failed to process changed file %s: %s", name, e)

                    delta_url = data.get("@odata.nextLink")
                    if not delta_url:
                        delta_link = data.get("@odata.deltaLink")

            if delta_link:
                await _update_sync_state(db, user_id, delta_link=delta_link)

            logger.info("OneDrive changes processed for user %d: %d changes", user_id, changes_processed)

        except Exception as e:
            logger.error("OneDrive change processing failed for user %d: %s", user_id, e)
            await _update_sync_state(db, user_id, last_error=str(e))


# ── Indexing Pipeline (chunk → embed → vector store) ─────────────────────────

async def process_onedrive_index_job(
    db,
    job_id: int,
    *,
    embedding_service=None,
    vector_upsert_fn=None,
) -> dict[str, Any]:
    """Process a OneDrive file index job: extract → chunk → embed → vector upsert.

    Mirrors the Google Drive pipeline in google_drive_tasks.py.
    """
    from sqlalchemy import select, delete, and_
    from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
    from app.services.embedding_service import get_embedding_service
    from app.services.library_indexing_service import chunk_text_content
    from app.services.credit_billing_client import charge_credits_post_deduct

    job = await db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job_id))
    if not job:
        raise LookupError(f"onedrive_index_job_not_found:{job_id}")

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
        drive_item_id = metadata.get("driveItemId")
        mime_type = metadata.get("driveMimeType", "")
        stored_content_hash = metadata.get("contentHash")

        if not drive_item_id:
            raise ValueError("Library item missing driveItemId in metadata")

        # Get access token
        from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError

        token_svc = MicrosoftTokenService(db)
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

        # Download file content from OneDrive
        file_bytes, file_meta = await _download_onedrive_file(access_token, drive_item_id)

        # Compute content hash
        content_hash = hashlib.sha256(file_bytes).hexdigest()

        # Skip if unchanged
        if content_hash == stored_content_hash:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()
            await db.commit()
            logger.info("onedrive_index_unchanged job_id=%d drive_item_id=%s", job.id, drive_item_id)
            return {"job_id": job.id, "status": "completed", "chunks_written": 0, "unchanged": True}

        # Extract text content
        from app.services.onedrive_content_extractor import OneDriveContentExtractor
        extractor = OneDriveContentExtractor()
        extracted = extractor.extract(file_bytes, mime_type, item.title or "")

        extracted_text = extracted.get("text", "")
        if not extracted_text:
            raise ValueError("Content extraction returned empty text")

        # Chunk content
        chunks = chunk_text_content(extracted_text, max_chars=1000, overlap_chars=200)
        if not chunks:
            raise ValueError("Chunking produced no content")

        # Generate embeddings
        embedder = embedding_service or get_embedding_service()
        embeddings = embedder.embed_batch([chunk["content"] for chunk in chunks])

        # Build vector IDs with onedrive: prefix
        tenant_id = job.tenant_id
        vector_ids = [
            f"onedrive:{tenant_id}:{drive_item_id}:{chunk['chunk_index']}"
            for chunk in chunks
        ]

        # Compute allowed_scopes from parent item
        item_scopes = item.allowed_scopes or []

        # Upsert to vector store
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
                        "source": "onedrive",
                        "drive_item_id": drive_item_id,
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
                    allowed_scopes=list(item_scopes),
                    metadata={
                        **(chunk.get("metadata") or {}),
                        "source": "onedrive",
                        "drive_item_id": drive_item_id,
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
        idempotency_key = f"onedrive_index:{tenant_id}:{drive_item_id}:{content_hash}"
        await charge_credits_post_deduct(
            user_id=item.owner_user_id,
            amount=credit_amount,
            service="onedrive.index",
            idempotency_key=idempotency_key,
            metadata={
                "driveItemId": drive_item_id,
                "chunkCount": len(chunks),
            },
            source_type="indexing",
        )
        credits_charged = True

        logger.info(
            "onedrive_index_completed job_id=%d drive_item_id=%s chunks=%d credits=%d",
            job.id, drive_item_id, len(chunks), credit_amount,
        )

        return {
            "job_id": job.id,
            "status": "completed",
            "chunks_written": len(chunks),
            "content_hash": content_hash,
        }

    except Exception as exc:
        error_message = str(exc)
        terminal = isinstance(exc, ValueError) or (job.attempt_count or 0) >= (job.max_attempts or 5)

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
            delay = min(30 * (2 ** max((job.attempt_count or 1) - 1, 0)), 1800)
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
                    service="onedrive.index.refund",
                    idempotency_key=f"onedrive_index_refund:{job.id}",
                    metadata={"reason": "indexing_failed", "original_job_id": job.id},
                    source_type="indexing",
                )
            except Exception as refund_err:
                logger.error("onedrive_index_refund_failed job_id=%d error=%s", job.id, str(refund_err))

        logger.error("onedrive_index_failed job_id=%d error=%s terminal=%s", job.id, error_message, terminal)

        return {
            "job_id": job.id,
            "status": job.status,
            "error": error_message,
        }


async def _process_onedrive_index_async(job_id: int):
    """Async entrypoint for OneDrive index job."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        return await process_onedrive_index_job(db, job_id)


@celery_app.task(name="process_onedrive_index_job", bind=True, max_retries=3)
def process_onedrive_index_job_task(self, job_id: int):
    """Celery task for OneDrive file indexing pipeline."""
    logger.info("process_onedrive_index_started", extra={"job_id": job_id})
    try:
        return _run_async(_process_onedrive_index_async(job_id))
    except Exception as e:
        logger.error("process_onedrive_index_exception", extra={"job_id": job_id, "error": str(e)})
        return {"status": "failed", "error": str(e), "job_id": job_id}


# ── OneDrive File Download ───────────────────────────────────────────────────


async def _graph_request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    max_retries: int = 3,
    **kwargs,
) -> httpx.Response:
    """Execute Graph API request with 429 rate-limit retry."""
    for attempt in range(max_retries + 1):
        resp = await client.request(method, url, **kwargs)
        if resp.status_code == 429 and attempt < max_retries:
            retry_after = int(resp.headers.get("Retry-After", "60"))
            wait = min(retry_after, 300)
            logger.warning(
                "Graph API 429 throttled (attempt %d/%d), retrying in %ds",
                attempt + 1, max_retries, wait,
            )
            await asyncio.sleep(wait)
            continue
        return resp


async def _download_onedrive_file(access_token: str, drive_item_id: str) -> tuple[bytes, dict]:
    """Download file content and metadata from OneDrive via Graph API."""
    async with httpx.AsyncClient() as client:
        # Fetch metadata
        meta_resp = await _graph_request_with_retry(
            client, "GET",
            f"{GRAPH_BASE}/me/drive/items/{drive_item_id}",
            params={"$select": "id,name,file,size,lastModifiedDateTime"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )
        meta_resp.raise_for_status()
        file_meta = meta_resp.json()

        # Download content
        dl_resp = await _graph_request_with_retry(
            client, "GET",
            f"{GRAPH_BASE}/me/drive/items/{drive_item_id}/content",
            headers={"Authorization": f"Bearer {access_token}"},
            follow_redirects=True,
            timeout=60.0,
        )
        dl_resp.raise_for_status()

        return dl_resp.content, file_meta


# ── Subscription Renewal ─────────────────────────────────────────────────────

@shared_task(name="onedrive.renew_subscriptions")
def renew_onedrive_subscriptions():
    """Renew expiring OneDrive webhook subscriptions."""
    _run_async(_renew_subscriptions_async())


async def _renew_subscriptions_async():
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService
    from app.services.onedrive_sync_service import renew_subscription
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                SELECT user_id, subscription_id, subscription_expiry
                FROM onedrive_sync_state
                WHERE subscription_id IS NOT NULL
                AND subscription_expiry < NOW() + INTERVAL '12 hours'
                AND auto_sync_enabled = true
            """)
        )
        rows = result.fetchall()

        for row in rows:
            user_id, subscription_id, _ = row
            try:
                token_svc = MicrosoftTokenService(db)
                access_token = await token_svc.get_valid_access_token(user_id)
                new_expiry = await renew_subscription(access_token, subscription_id)
                if new_expiry:
                    await db.execute(
                        text("""
                            UPDATE onedrive_sync_state
                            SET subscription_expiry = :expiry
                            WHERE user_id = :user_id
                        """),
                        {"expiry": new_expiry, "user_id": user_id},
                    )
                    await db.commit()
            except Exception as e:
                logger.error("Failed to renew subscription for user %d: %s", user_id, e)


# ── Edit Session Cleanup ─────────────────────────────────────────────────────

@shared_task(name="onedrive.cleanup_edit_sessions")
def cleanup_expired_onedrive_edit_sessions():
    """Clean up expired OneDrive edit sessions."""
    _run_async(_cleanup_sessions_async())


async def _cleanup_sessions_async():
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                UPDATE onedrive_edit_sessions
                SET status = 'expired'
                WHERE status = 'active'
                AND "expiresAt" < NOW()
                RETURNING id, "driveItemId"
            """)
        )
        expired = result.fetchall()
        await db.commit()

        if expired:
            logger.info("Expired %d OneDrive edit sessions", len(expired))


# ── Disconnect Cleanup ───────────────────────────────────────────────────────

@shared_task(name="onedrive.disconnect_cleanup")
def disconnect_onedrive_cleanup(user_id: int, tenant_id: str = ""):
    """Clean up after OneDrive disconnect."""
    _run_async(_disconnect_cleanup_async(user_id, tenant_id))


async def _disconnect_cleanup_async(user_id: int, tenant_id: str = ""):
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService
    from sqlalchemy import text

    async with AsyncSessionLocal() as db:
        sync_state = await _get_sync_state(db, user_id)

        if sync_state and sync_state.get("subscription_id"):
            try:
                token_svc = MicrosoftTokenService(db)
                access_token = await token_svc.get_valid_access_token(user_id)

                async with httpx.AsyncClient() as client:
                    await _graph_request_with_retry(
                        client, "DELETE",
                        f"{GRAPH_BASE}/subscriptions/{sync_state['subscription_id']}",
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=10.0,
                    )
            except Exception as e:
                logger.warning("Failed to cancel subscription for user %d: %s", user_id, e)

        # Delete chunks and vectors for OneDrive items
        tenant_filter = "AND tenant_id = :tenant_id" if tenant_id else ""
        items_result = await db.execute(
            text(f"""SELECT id, tenant_id, metadata->>'driveItemId' as drive_item_id
                    FROM library_items
                    WHERE owner_user_id = :user_id AND source = 'onedrive' AND deleted_at IS NULL
                    {tenant_filter}"""),
            {"user_id": user_id, **({"tenant_id": tenant_id} if tenant_id else {})},
        )
        items_to_clean = items_result.fetchall()

        for row in items_to_clean:
            item_id, tenant_id, drive_item_id = row
            # Delete chunks
            await db.execute(
                text("DELETE FROM library_chunks WHERE library_item_id = :item_id"),
                {"item_id": item_id},
            )
            # Delete vectors
            if tenant_id and drive_item_id:
                try:
                    from app.core.vectordb import VectorCollection
                    collection = VectorCollection(f"library_tenant_{tenant_id}")
                    # Delete all vectors for this item
                    collection.delete(where={"item_id": item_id, "source": "onedrive"})
                except Exception as e:
                    logger.warning("Failed to delete vectors for item %d: %s", item_id, e)

        # Delete index jobs
        await db.execute(
            text("""DELETE FROM library_index_jobs
                    WHERE library_item_id IN (
                        SELECT id FROM library_items
                        WHERE owner_user_id = :user_id AND source = 'onedrive'
                    )"""),
            {"user_id": user_id},
        )

        # Delete library items
        await db.execute(
            text("DELETE FROM library_items WHERE owner_user_id = :user_id AND source = 'onedrive'"),
            {"user_id": user_id},
        )

        # Clean up sync state and edit sessions
        await db.execute(
            text('DELETE FROM onedrive_sync_state WHERE user_id = :user_id'),
            {"user_id": user_id},
        )
        await db.execute(
            text('DELETE FROM onedrive_edit_sessions WHERE user_id = :user_id'),
            {"user_id": user_id},
        )
        await db.commit()
        logger.info("OneDrive disconnect cleanup complete for user %d", user_id)


# ── Cost Estimation ──────────────────────────────────────────────────────────

async def _estimate_sync_cost_impl(user_id: int, tenant_id: str) -> dict:
    """Count matching OneDrive files and return estimated credit cost."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError
    from app.services.onedrive_sync_service import should_index_file

    async with AsyncSessionLocal() as db:
        sync_state = await db.execute(
            text("""
                SELECT indexing_mode, folder_selections, file_type_filter, max_file_size_bytes
                FROM onedrive_sync_state
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        row = sync_state.fetchone()
        if not row:
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}

        indexing_mode = row[0]
        max_file_size = row[3] or 52428800

        if indexing_mode == "none":
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}

        try:
            token_svc = MicrosoftTokenService(db)
            access_token = await token_svc.get_valid_access_token(user_id)
        except (ValueError, InvalidGrantError) as e:
            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0, "error": str(e)}

        delta_url = f"{GRAPH_BASE}/me/drive/root/delta"
        params = {"$select": "id,name,file,folder,size,lastModifiedDateTime"}
        file_count = 0
        total_size = 0

        async with httpx.AsyncClient() as client:
            while delta_url:
                resp = await _graph_request_with_retry(
                    client, "GET",
                    delta_url,
                    params=params if "token" not in delta_url else None,
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=30.0,
                )

                if resp.status_code != 200:
                    break

                data = resp.json()
                items = data.get("value", [])

                for item in items:
                    if "deleted" in item or "folder" in item:
                        continue
                    name = item.get("name", "")
                    mime_type = item.get("file", {}).get("mimeType", "")
                    size = item.get("size", 0)

                    if should_index_file(name, mime_type, size, max_file_size=max_file_size):
                        file_count += 1
                        total_size += size

                delta_url = data.get("@odata.nextLink")
                if not delta_url and "@odata.deltaLink" in data:
                    break

        estimated_chars = total_size * 5
        estimated_chunks = max(1, estimated_chars // 1000) if file_count else 0
        estimated_credits = estimated_chunks * 2

        return {
            "file_count": file_count,
            "estimated_credits": estimated_credits,
            "estimated_size_mb": round(total_size / (1024 * 1024), 1),
        }


# ── DB Helpers ────────────────────────────────────────────────────────────────

async def _get_sync_state(db, user_id: int) -> Optional[dict]:
    from sqlalchemy import text
    result = await db.execute(
        text('SELECT delta_link, subscription_id, subscription_expiry, auto_sync_enabled FROM onedrive_sync_state WHERE user_id = :user_id'),
        {"user_id": user_id},
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "delta_link": row[0],
        "subscription_id": row[1],
        "subscription_expiry": row[2],
        "auto_sync_enabled": row[3],
    }


async def _update_sync_state(db, user_id: int, **kwargs):
    from sqlalchemy import text

    set_parts = ['last_sync_at = NOW()']
    params = {"user_id": user_id}

    if "delta_link" in kwargs:
        set_parts.append('delta_link = :delta_link')
        params["delta_link"] = kwargs["delta_link"]
    if "files_total" in kwargs:
        set_parts.append('files_total = :files_total')
        params["files_total"] = kwargs["files_total"]
    if "files_processed" in kwargs:
        set_parts.append('files_processed = :files_processed')
        params["files_processed"] = kwargs["files_processed"]
    if "last_error" in kwargs:
        set_parts.append('last_error = :last_error')
        params["last_error"] = kwargs["last_error"]

    set_clause = ", ".join(set_parts)
    await db.execute(
        text(f'UPDATE onedrive_sync_state SET {set_clause} WHERE user_id = :user_id'),
        params,
    )
    await db.commit()


async def _upsert_library_item(
    db,
    *,
    user_id: int,
    tenant_id: str,
    drive_item_id: str,
    name: str,
    mime_type: str,
    size: int,
    web_url: str,
    last_modified: Optional[str],
) -> Optional[int]:
    """Upsert a library item from OneDrive using correct schema columns.

    Returns the library_item id (for enqueuing indexing), or None if failed.
    """
    from sqlalchemy import text

    # Determine item type from MIME
    item_type = "document"
    if "spreadsheet" in mime_type or "excel" in mime_type or name.endswith((".xlsx", ".xls", ".csv")):
        item_type = "spreadsheet"
    elif "presentation" in mime_type or "powerpoint" in mime_type or name.endswith((".pptx", ".ppt")):
        item_type = "presentation"
    elif mime_type == "application/pdf" or name.endswith(".pdf"):
        item_type = "pdf"
    elif mime_type.startswith("image/"):
        item_type = "image"
    elif mime_type.startswith("text/") or name.endswith((".txt", ".md", ".csv", ".json", ".xml")):
        item_type = "text"

    metadata = json.dumps({
        "driveItemId": drive_item_id,
        "driveMimeType": mime_type,
        "driveModifiedTime": last_modified,
        "driveWebUrl": web_url,
        "fileSize": size,
        "source": "onedrive",
        "syncStatus": "pending",
    })

    # Check if item already exists (scoped to tenant + owner for cross-user isolation)
    existing = await db.execute(
        text("""
            SELECT id FROM library_items
            WHERE tenant_id = :tenant_id AND owner_user_id = :user_id
            AND metadata->>'driveItemId' = :drive_id
            AND source = 'onedrive' AND deleted_at IS NULL
            LIMIT 1
        """),
        {"tenant_id": tenant_id, "user_id": user_id, "drive_id": drive_item_id},
    )
    existing_row = existing.fetchone()

    if existing_row:
        item_id = existing_row[0]
        # Update metadata for re-indexing
        await db.execute(
            text("""
                UPDATE library_items
                SET metadata = jsonb_set(
                    jsonb_set(
                        jsonb_set(metadata, '{driveModifiedTime}', :mod_time::jsonb),
                        '{syncStatus}', '"pending"'::jsonb
                    ),
                    '{driveMimeType}', :mime_val::jsonb
                ),
                title = :title,
                source_url = :web_url,
                status = 'pending',
                updated_at = NOW()
                WHERE id = :id AND owner_user_id = :user_id
            """),
            {
                "mod_time": json.dumps(last_modified),
                "mime_val": json.dumps(mime_type),
                "title": name,
                "web_url": web_url,
                "id": item_id,
                "user_id": user_id,
            },
        )
        await db.commit()
        return item_id

    # Insert new item with initial allowed_scopes so owner can discover via RAG
    initial_scopes = [f"u:{user_id}"]

    result = await db.execute(
        text("""
            INSERT INTO library_items (tenant_id, owner_user_id, title, item_type, source,
                                       source_url, metadata, allowed_scopes, status, created_at, updated_at)
            VALUES (:tenant_id, :user_id, :title, :item_type, 'onedrive',
                    :web_url, :metadata::jsonb, :allowed_scopes::text[], 'pending', NOW(), NOW())
            RETURNING id
        """),
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "title": name,
            "item_type": item_type,
            "web_url": web_url,
            "metadata": metadata,
            "allowed_scopes": initial_scopes,
        },
    )
    row = result.fetchone()
    if row:
        await db.commit()
        return row[0]

    await db.commit()
    return None


def _enqueue_onedrive_index_job(tenant_id: str, item_id: int):
    """Create an index job and enqueue the Celery task."""
    from sqlalchemy import text

    try:
        with get_sync_session() as session:
            # Check if pending/processing job already exists
            existing = session.execute(
                text("""
                    SELECT id FROM library_index_jobs
                    WHERE library_item_id = :item_id AND status IN ('pending', 'processing')
                    LIMIT 1
                """),
                {"item_id": item_id},
            )
            if existing.fetchone():
                return  # Already queued

            result = session.execute(
                text("""
                    INSERT INTO library_index_jobs (tenant_id, library_item_id, job_type, status,
                                                    attempt_count, max_attempts, run_at, created_at, updated_at)
                    VALUES (:tenant_id, :item_id, 'onedrive_index', 'pending',
                            0, 5, NOW(), NOW(), NOW())
                    RETURNING id
                """),
                {"tenant_id": tenant_id, "item_id": item_id},
            )
            row = result.fetchone()
            # Context manager auto-commits on success

            if row:
                process_onedrive_index_job_task.delay(row[0])
                logger.info("Enqueued OneDrive index job %d for item %d", row[0], item_id)

    except Exception as e:
        logger.warning("Failed to enqueue OneDrive index job for item %d: %s", item_id, str(e))


async def _remove_library_item(db, user_id: int, tenant_id: str, drive_item_id: str):
    """Remove a library item and its chunks sourced from OneDrive."""
    from sqlalchemy import text

    # Find the item (filter by tenant_id for multi-tenant safety)
    tenant_filter = "AND tenant_id = :tenant_id" if tenant_id else ""
    result = await db.execute(
        text(f"""
            SELECT id, tenant_id FROM library_items
            WHERE owner_user_id = :user_id AND metadata->>'driveItemId' = :drive_id
            AND source = 'onedrive' AND deleted_at IS NULL
            {tenant_filter}
            LIMIT 1
        """),
        {"user_id": user_id, "drive_id": drive_item_id, **({"tenant_id": tenant_id} if tenant_id else {})},
    )
    row = result.fetchone()
    if not row:
        return

    item_id, item_tenant_id = row

    # Delete chunks
    await db.execute(
        text("DELETE FROM library_chunks WHERE library_item_id = :item_id"),
        {"item_id": item_id},
    )

    # Delete index jobs
    await db.execute(
        text("DELETE FROM library_index_jobs WHERE library_item_id = :item_id"),
        {"item_id": item_id},
    )

    # Soft-delete the library item
    await db.execute(
        text("UPDATE library_items SET deleted_at = NOW() WHERE id = :item_id"),
        {"item_id": item_id},
    )
    await db.commit()

    # Delete vectors
    if item_tenant_id:
        try:
            from app.core.vectordb import VectorCollection
            collection = VectorCollection(f"library_tenant_{item_tenant_id}")
            collection.delete(where={"item_id": item_id, "source": "onedrive"})
        except Exception as e:
            logger.warning("Failed to delete vectors for removed OneDrive item %d: %s", item_id, e)


# ── Periodic Polling Fallback ─────────────────────────────────────────────────

@celery_app.task(name="poll_onedrive_changes")
def poll_onedrive_changes_task():
    """Periodic fallback: process changes for all users with auto-sync enabled."""
    from sqlalchemy import text as sa_text
    try:
        with get_sync_session() as session:
            rows = session.execute(
                sa_text("""
                    SELECT "user_id", "tenant_id" FROM onedrive_sync_state
                    WHERE auto_sync_enabled = true
                    AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '30 minutes')
                    LIMIT 20
                """)
            ).fetchall()
        for row in rows:
            try:
                process_onedrive_changes.delay(row[0], row[1])
            except Exception as e:
                logger.warning("Failed to enqueue OneDrive poll for user %d: %s", row[0], e)
        if rows:
            logger.info("poll_onedrive_changes dispatched %d users", len(rows))
    except Exception as e:
        logger.error("poll_onedrive_changes failed: %s", e)
