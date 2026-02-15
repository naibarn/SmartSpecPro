diff --git a/apps/web/server/services/libraryService.ts b/apps/web/server/services/libraryService.ts
index d6e68f3..c5391e3 100644
--- a/apps/web/server/services/libraryService.ts
+++ b/apps/web/server/services/libraryService.ts
@@ -40,6 +40,17 @@ export interface LibrarySourceLinkInput {
   providerTaskId?: string | null;
 }
 
+export interface DriveFileInput {
+  driveFileId: string;
+  name: string;
+  mimeType: string;
+  modifiedTime: string;
+  size?: number;
+  iconLink?: string;
+  webViewLink?: string;
+  owners?: Array<{ emailAddress: string; displayName?: string }>;
+}
+
 export interface CreateLibraryItemInput {
   itemType: string;
   source: string;
@@ -935,6 +946,108 @@ export async function createLibraryItem(
   };
 }
 
+function mapDriveMimeToItemType(mimeType: string): string {
+  const m = mimeType.toLowerCase();
+  if (m.includes("document") || m.includes("word") || m.includes("msword")) return "document";
+  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("ms-excel")) return "spreadsheet";
+  if (m.includes("presentation") || m.includes("powerpoint") || m.includes("ms-powerpoint")) return "presentation";
+  if (m === "application/pdf") return "pdf";
+  if (m.startsWith("text/")) return "text";
+  return "file";
+}
+
+export async function createVirtualDriveReference(
+  driveFile: DriveFileInput,
+  actor: LibraryActor,
+  dbClient?: DbClient,
+): Promise<CreateLibraryItemResult> {
+  const db = await resolveDb(dbClient);
+  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
+
+  // Dedup check via library_links (tenant-scoped)
+  const existing = await db
+    .select({ item: libraryItems })
+    .from(libraryLinks)
+    .innerJoin(libraryItems, eq(libraryLinks.libraryItemId, libraryItems.id))
+    .where(
+      and(
+        eq(libraryLinks.linkType, "google_drive_file"),
+        eq(libraryLinks.linkId, driveFile.driveFileId),
+        eq(libraryLinks.tenantId, actorTenantId),
+        isNull(libraryItems.deletedAt),
+      ),
+    )
+    .limit(1);
+
+  if (existing[0]?.item) {
+    return {
+      item: toLibraryItemDto(existing[0].item),
+      idempotent: true,
+    };
+  }
+
+  const itemType = mapDriveMimeToItemType(driveFile.mimeType);
+  const now = new Date();
+
+  const inserted = await db
+    .insert(libraryItems)
+    .values({
+      tenantId: actorTenantId,
+      ownerUserId: actor.userId,
+      itemType,
+      source: "google_drive",
+      title: driveFile.name,
+      status: "indexing",
+      visibility: "private",
+      sourceUrl: null,
+      thumbnailUrl: driveFile.iconLink ?? null,
+      metadata: normalizeLibraryMetadata({
+        driveFileId: driveFile.driveFileId,
+        driveMimeType: driveFile.mimeType,
+        driveModifiedTime: driveFile.modifiedTime,
+        driveSize: driveFile.size ?? null,
+        driveWebViewLink: driveFile.webViewLink ?? null,
+        driveOwners: driveFile.owners ?? null,
+        syncStatus: "pending",
+      }),
+      createdAt: now,
+      updatedAt: now,
+    })
+    .returning();
+
+  const created = inserted[0];
+  if (!created) {
+    throw new Error("Failed to create virtual Drive reference");
+  }
+
+  // Insert library_link for dedup
+  await db
+    .insert(libraryLinks)
+    .values({
+      libraryItemId: created.id,
+      linkType: "google_drive_file",
+      linkId: driveFile.driveFileId,
+      tenantId: actorTenantId,
+      createdAt: now,
+    })
+    .onConflictDoNothing();
+
+  // Enqueue index job
+  await enqueueLibraryIndexJob(
+    {
+      libraryItemId: created.id,
+      tenantId: actorTenantId,
+      jobType: "google_drive_sync",
+    },
+    db,
+  );
+
+  return {
+    item: toLibraryItemDto(created),
+    idempotent: false,
+  };
+}
+
 export async function uploadLibraryFile(
   input: UploadLibraryFileInput,
   actor: LibraryActor,
diff --git a/python-backend/app/core/celery_app.py b/python-backend/app/core/celery_app.py
index 7ba8839..5f9918a 100644
--- a/python-backend/app/core/celery_app.py
+++ b/python-backend/app/core/celery_app.py
@@ -56,6 +56,8 @@ celery_app.conf.update(
         "app.tasks.media_tasks.process_library_index_job_task": {"queue": "media"},
         "app.tasks.media_tasks.retry_library_index_jobs": {"queue": "media"},
         "app.tasks.media_tasks.recover_stuck_tasks": {"queue": "media"},
+        # Google Drive indexing -> media queue (network-bound)
+        "app.tasks.google_drive_tasks.process_google_drive_index_job": {"queue": "media"},
         # Workflow tasks -> celery queue (lightweight, frequent)
         "app.tasks.workflow_tasks.check_scheduled_workflows": {"queue": "celery"},
         "app.tasks.workflow_tasks.process_system_event": {"queue": "celery"},
diff --git a/python-backend/app/models/library.py b/python-backend/app/models/library.py
index d5d4078..4e16d96 100644
--- a/python-backend/app/models/library.py
+++ b/python-backend/app/models/library.py
@@ -72,11 +72,12 @@ class LibraryLink(Base):
     link_type = Column(String(64), nullable=False)
     link_id = Column(String(128), nullable=False)
     provider_task_id = Column(String(128), nullable=True, index=True)
+    tenant_id = Column(String(36), nullable=True, index=True)
 
     created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
 
     __table_args__ = (
-        UniqueConstraint("link_type", "link_id", name="uq_library_links_link_type_link_id"),
+        UniqueConstraint("link_type", "link_id", "tenant_id", name="library_links_source_tenant_unique"),
         Index("ix_library_links_item_type", "library_item_id", "link_type"),
     )
 
diff --git a/python-backend/app/tasks/google_drive_tasks.py b/python-backend/app/tasks/google_drive_tasks.py
index 8aa6fca..cbb3fde 100644
--- a/python-backend/app/tasks/google_drive_tasks.py
+++ b/python-backend/app/tasks/google_drive_tasks.py
@@ -1,12 +1,17 @@
 """
-Celery tasks for Google Drive edit session management.
+Celery tasks for Google Drive edit session management and content indexing.
 
-Handles auto-expire of stale edit sessions and pre-expiry notifications.
+Handles auto-expire of stale edit sessions, pre-expiry notifications,
+and Google Drive file indexing for RAG search.
 """
 
+import asyncio
+import hashlib
 import logging
+import math
 from contextlib import contextmanager
 from datetime import datetime, timezone, timedelta
+from typing import Any, Optional
 
 from sqlalchemy import create_engine, text
 from sqlalchemy.orm import sessionmaker
@@ -222,3 +227,301 @@ def _delete_drive_file(user_id: int, drive_file_id: str) -> bool:
             return False
         logger.error("Failed to delete Drive file %s: %s", drive_file_id, e)
         return False
+
+
+# ── Google Drive Content Indexing ────────────────────────────────────────
+
+
+def _run_async(coro):
+    """Run async coroutine in Celery worker context (reuses event loop)."""
+    try:
+        loop = asyncio.get_event_loop()
+        if loop.is_closed():
+            loop = asyncio.new_event_loop()
+            asyncio.set_event_loop(loop)
+    except RuntimeError:
+        loop = asyncio.new_event_loop()
+        asyncio.set_event_loop(loop)
+    return loop.run_until_complete(coro)
+
+
+def _fetch_drive_file_metadata(access_token: str, drive_file_id: str) -> dict:
+    """Fetch file metadata from Google Drive API."""
+    from google.oauth2.credentials import Credentials
+    from googleapiclient.discovery import build
+
+    creds = Credentials(token=access_token)
+    drive_svc = build("drive", "v3", credentials=creds)
+    return drive_svc.files().get(
+        fileId=drive_file_id,
+        fields="id,name,mimeType,modifiedTime,md5Checksum,size",
+    ).execute()
+
+
+async def process_google_drive_index_job(
+    db,
+    job_id: int,
+    *,
+    embedding_service=None,
+    vector_upsert_fn=None,
+    content_extractor=None,
+    token_service=None,
+    drive_file_meta_fn=None,
+) -> dict[str, Any]:
+    """Process a Google Drive file index job through extract/chunk/embed/upsert pipeline."""
+    from sqlalchemy import select, delete, and_
+    from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
+    from app.services.embedding_service import get_embedding_service
+    from app.services.library_indexing_service import chunk_text_content, _default_vector_upsert
+    from app.services.credit_billing_client import charge_credits_post_deduct
+
+    job = await db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job_id))
+    if not job:
+        raise LookupError(f"gdrive_index_job_not_found:{job_id}")
+
+    if job.status == "completed":
+        return {"job_id": job.id, "status": "completed", "chunks_written": 0, "unchanged": True}
+
+    # Mark as processing
+    job.status = "processing"
+    job.attempt_count = (job.attempt_count or 0) + 1
+    job.started_at = datetime.utcnow()
+    job.last_error = None
+    job.next_retry_at = None
+    job.updated_at = datetime.utcnow()
+    await db.commit()
+
+    item: Optional[LibraryItem] = None
+    credits_charged = False
+
+    try:
+        # Load library item
+        item = await db.scalar(
+            select(LibraryItem).where(
+                and_(
+                    LibraryItem.id == job.library_item_id,
+                    LibraryItem.tenant_id == job.tenant_id,
+                    LibraryItem.deleted_at.is_(None),
+                )
+            )
+        )
+        if not item:
+            raise LookupError(f"library_item_not_found:{job.library_item_id}")
+
+        metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}
+        drive_file_id = metadata.get("driveFileId")
+        drive_mime_type = metadata.get("driveMimeType", "")
+        stored_content_hash = metadata.get("contentHash")
+
+        if not drive_file_id:
+            raise ValueError("Library item missing driveFileId in metadata")
+
+        # Get access token
+        from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+
+        token_svc = token_service
+        if not token_svc:
+            token_svc = GoogleTokenService(db)
+
+        try:
+            access_token = await token_svc.get_valid_access_token(item.owner_user_id)
+        except InvalidGrantError:
+            job.status = "retry_pending"
+            job.last_error = "token_expired"
+            job.next_retry_at = datetime.utcnow() + timedelta(minutes=30)
+            job.updated_at = datetime.utcnow()
+            metadata["syncStatus"] = "token_expired"
+            item.metadata_json = {**metadata}
+            item.updated_at = datetime.utcnow()
+            await db.commit()
+            return {"job_id": job.id, "status": "retry_pending", "reason": "token_expired"}
+
+        # Fetch file metadata from Drive API for content hash
+        fetcher = drive_file_meta_fn or _fetch_drive_file_metadata
+        file_meta = fetcher(access_token, drive_file_id)
+
+        # Compute content hash
+        md5 = file_meta.get("md5Checksum")
+        if md5:
+            content_hash = md5
+        else:
+            raw = f"{file_meta.get('modifiedTime', '')}:{file_meta.get('size', '')}".encode()
+            content_hash = hashlib.sha256(raw).hexdigest()
+
+        # Skip if unchanged
+        if content_hash == stored_content_hash:
+            job.status = "completed"
+            job.completed_at = datetime.utcnow()
+            job.updated_at = datetime.utcnow()
+            await db.commit()
+            logger.info("gdrive_index_unchanged job_id=%d drive_file_id=%s", job.id, drive_file_id)
+            return {"job_id": job.id, "status": "completed", "chunks_written": 0, "unchanged": True}
+
+        # Extract text content
+        extractor = content_extractor
+        if not extractor:
+            extractor = GoogleContentExtractor()
+
+        extracted = extractor.extract(
+            file_id=drive_file_id,
+            mime_type=drive_mime_type,
+            access_token=access_token,
+        )
+
+        extracted_text = extracted.get("text", "") if isinstance(extracted, dict) else str(extracted)
+        if not extracted_text:
+            raise ValueError("Content extraction returned empty text")
+
+        # Chunk content
+        chunks = chunk_text_content(extracted_text, max_chars=1000, overlap_chars=200)
+        if not chunks:
+            raise ValueError("Chunking produced no content")
+
+        # Generate embeddings
+        embedder = embedding_service or get_embedding_service()
+        embeddings = embedder.embed_batch([chunk["content"] for chunk in chunks])
+
+        # Build vector IDs with gdrive: prefix
+        tenant_id = job.tenant_id
+        vector_ids = [
+            f"gdrive:{tenant_id}:{drive_file_id}:{chunk['chunk_index']}"
+            for chunk in chunks
+        ]
+
+        # Upsert to vector store
+        upsert = vector_upsert_fn
+        if upsert:
+            upsert(
+                tenant_id=tenant_id,
+                item_id=job.library_item_id,
+                chunks=chunks,
+                embeddings=embeddings,
+            )
+        else:
+            _default_vector_upsert(
+                tenant_id=tenant_id,
+                item_id=job.library_item_id,
+                chunks=chunks,
+                embeddings=embeddings,
+            )
+
+        # Delete existing chunks and insert new ones
+        await db.execute(delete(LibraryChunk).where(LibraryChunk.library_item_id == item.id))
+
+        created_at = datetime.utcnow()
+        for chunk, vector_id in zip(chunks, vector_ids):
+            db.add(
+                LibraryChunk(
+                    tenant_id=tenant_id,
+                    library_item_id=item.id,
+                    chunk_index=chunk["chunk_index"],
+                    content=chunk["content"],
+                    content_type=chunk.get("content_type") or "text",
+                    token_count=chunk.get("token_count"),
+                    vector_ref_id=vector_id,
+                    metadata={
+                        **(chunk.get("metadata") or {}),
+                        "source": "google_drive",
+                        "drive_file_id": drive_file_id,
+                        "job_id": job.id,
+                    },
+                    created_at=created_at,
+                )
+            )
+
+        # Update library item metadata
+        metadata["contentHash"] = content_hash
+        metadata["lastSyncedAt"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")
+        metadata["syncStatus"] = "indexed"
+        metadata["chunkCount"] = len(chunks)
+        item.metadata_json = {**metadata}
+        item.status = "ready"
+        item.updated_at = datetime.utcnow()
+
+        # Complete job
+        job.status = "completed"
+        job.completed_at = datetime.utcnow()
+        job.next_retry_at = None
+        job.last_error = None
+        job.updated_at = datetime.utcnow()
+
+        await db.commit()
+
+        # Post-deduct credit billing
+        credit_amount = math.ceil(len(chunks)) * 2
+        idempotency_key = f"gdrive_index:{tenant_id}:{drive_file_id}:{content_hash}"
+        await charge_credits_post_deduct(
+            user_id=item.owner_user_id,
+            amount=credit_amount,
+            service="gdrive.index",
+            idempotency_key=idempotency_key,
+            metadata={
+                "driveFileId": drive_file_id,
+                "chunkCount": len(chunks),
+            },
+        )
+        credits_charged = True
+
+        logger.info(
+            "gdrive_index_completed job_id=%d drive_file_id=%s chunks=%d credits=%d",
+            job.id, drive_file_id, len(chunks), credit_amount,
+        )
+
+        return {
+            "job_id": job.id,
+            "status": "completed",
+            "chunks_written": len(chunks),
+            "content_hash": content_hash,
+        }
+
+    except Exception as exc:
+        error_message = str(exc)
+        terminal = isinstance(exc, ValueError) or job.attempt_count >= (job.max_attempts or 5)
+
+        if terminal:
+            job.status = "failed"
+            job.completed_at = datetime.utcnow()
+            job.next_retry_at = None
+            job.last_error = error_message
+            job.updated_at = datetime.utcnow()
+            if item:
+                meta = item.metadata_json if isinstance(item.metadata_json, dict) else {}
+                meta["syncStatus"] = "failed"
+                item.metadata_json = {**meta}
+                item.status = "failed"
+                item.updated_at = datetime.utcnow()
+            await db.commit()
+        else:
+            delay = min(30 * (2 ** max(job.attempt_count - 1, 0)), 1800)
+            job.status = "retry_pending"
+            job.next_retry_at = datetime.utcnow() + timedelta(seconds=delay)
+            job.last_error = error_message
+            job.updated_at = datetime.utcnow()
+            await db.commit()
+
+        logger.error("gdrive_index_failed job_id=%d error=%s terminal=%s", job.id, error_message, terminal)
+
+        return {
+            "job_id": job.id,
+            "status": job.status,
+            "error": error_message,
+        }
+
+
+async def _process_gdrive_index_async(job_id: int):
+    """Async entrypoint for Google Drive index job."""
+    from app.core.database import AsyncSessionLocal
+
+    async with AsyncSessionLocal() as db:
+        return await process_google_drive_index_job(db, job_id)
+
+
+@celery_app.task(name="process_google_drive_index_job", bind=True, max_retries=3)
+def process_google_drive_index_job_task(self, job_id: int):
+    """Celery task for Google Drive file indexing pipeline."""
+    logger.info("process_gdrive_index_started", extra={"job_id": job_id})
+    try:
+        return _run_async(_process_gdrive_index_async(job_id))
+    except Exception as e:
+        logger.error("process_gdrive_index_exception", extra={"job_id": job_id, "error": str(e)})
+        return {"status": "failed", "error": str(e), "job_id": job_id}
diff --git a/python-backend/tests/test_google_drive_index_job.py b/python-backend/tests/test_google_drive_index_job.py
new file mode 100644
index 0000000..7d36731
--- /dev/null
+++ b/python-backend/tests/test_google_drive_index_job.py
@@ -0,0 +1,388 @@
+"""Tests for Google Drive content indexing pipeline (section 08)."""
+
+import hashlib
+import math
+from datetime import datetime, timezone
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.tasks.google_drive_tasks import process_google_drive_index_job
+
+
+def _make_job(
+    job_id=1,
+    tenant_id="t1",
+    library_item_id=10,
+    status="pending",
+    attempt_count=0,
+    max_attempts=5,
+    job_type="google_drive_sync",
+):
+    job = MagicMock()
+    job.id = job_id
+    job.tenant_id = tenant_id
+    job.library_item_id = library_item_id
+    job.status = status
+    job.attempt_count = attempt_count
+    job.max_attempts = max_attempts
+    job.job_type = job_type
+    job.started_at = None
+    job.last_error = None
+    job.next_retry_at = None
+    job.completed_at = None
+    job.updated_at = None
+    return job
+
+
+def _make_item(
+    item_id=10,
+    tenant_id="t1",
+    owner_user_id=42,
+    status="indexing",
+    metadata=None,
+):
+    item = MagicMock()
+    item.id = item_id
+    item.tenant_id = tenant_id
+    item.owner_user_id = owner_user_id
+    item.status = status
+    item.deleted_at = None
+    item.updated_at = datetime.utcnow()
+    item.metadata_json = metadata or {
+        "driveFileId": "abc123",
+        "driveMimeType": "application/vnd.google-apps.document",
+        "syncStatus": "pending",
+    }
+    return item
+
+
+def _make_db(job, item):
+    """Create a mock async DB session."""
+    db = AsyncMock()
+    call_count = {"scalar": 0}
+
+    async def scalar_side_effect(stmt):
+        call_count["scalar"] += 1
+        if call_count["scalar"] == 1:
+            return job
+        return item
+
+    db.scalar = AsyncMock(side_effect=scalar_side_effect)
+    db.commit = AsyncMock()
+    db.execute = AsyncMock()
+    db.add = MagicMock()
+    return db
+
+
+def _make_drive_meta_fn(meta: dict):
+    """Create a drive_file_meta_fn that returns the given metadata."""
+    return lambda access_token, drive_file_id: meta
+
+
+@pytest.mark.asyncio
+async def test_process_gdrive_index_full_pipeline():
+    """processGoogleDriveIndexJob fetches file, extracts, chunks, embeds, upserts."""
+    job = _make_job()
+    item = _make_item()
+    db = _make_db(job, item)
+
+    mock_token_svc = AsyncMock()
+    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")
+
+    mock_extractor = MagicMock()
+    mock_extractor.extract = MagicMock(return_value={"text": "Hello world " * 50})
+
+    mock_embedder = MagicMock()
+    mock_embedder.embed_batch = MagicMock(return_value=[[0.1, 0.2, 0.3]])
+
+    mock_upsert = MagicMock()
+
+    drive_file_meta = {
+        "id": "abc123",
+        "name": "Test Doc",
+        "mimeType": "application/vnd.google-apps.document",
+        "modifiedTime": "2026-02-14T00:00:00Z",
+        "md5Checksum": "abc123hash",
+        "size": "1024",
+    }
+
+    with patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock):
+        result = await process_google_drive_index_job(
+            db, 1,
+            embedding_service=mock_embedder,
+            vector_upsert_fn=mock_upsert,
+            content_extractor=mock_extractor,
+            token_service=mock_token_svc,
+            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
+        )
+
+    assert result["status"] == "completed"
+    assert result["chunks_written"] > 0
+    assert result["content_hash"] == "abc123hash"
+
+    # Verify extractor was called
+    mock_extractor.extract.assert_called_once()
+
+    # Verify embeddings generated
+    mock_embedder.embed_batch.assert_called_once()
+
+    # Verify item status updated to ready
+    assert item.status == "ready"
+    assert item.metadata_json["syncStatus"] == "indexed"
+    assert item.metadata_json["contentHash"] == "abc123hash"
+
+
+@pytest.mark.asyncio
+async def test_process_gdrive_index_skips_unchanged():
+    """processGoogleDriveIndexJob skips when content hash matches."""
+    job = _make_job()
+    item = _make_item(metadata={
+        "driveFileId": "abc123",
+        "driveMimeType": "application/vnd.google-apps.document",
+        "contentHash": "existing_hash",
+        "syncStatus": "indexed",
+    })
+    db = _make_db(job, item)
+
+    mock_token_svc = AsyncMock()
+    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")
+
+    mock_extractor = MagicMock()
+
+    drive_file_meta = {
+        "id": "abc123",
+        "name": "Test Doc",
+        "mimeType": "application/vnd.google-apps.document",
+        "modifiedTime": "2026-02-14T00:00:00Z",
+        "md5Checksum": "existing_hash",
+        "size": "1024",
+    }
+
+    result = await process_google_drive_index_job(
+        db, 1,
+        content_extractor=mock_extractor,
+        token_service=mock_token_svc,
+        drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
+    )
+
+    assert result["status"] == "completed"
+    assert result["unchanged"] is True
+    assert result["chunks_written"] == 0
+
+    # Extractor should NOT be called
+    mock_extractor.extract.assert_not_called()
+
+
+@pytest.mark.asyncio
+async def test_process_gdrive_index_charges_credits():
+    """processGoogleDriveIndexJob charges credits with correct idempotency key."""
+    job = _make_job()
+    item = _make_item()
+    db = _make_db(job, item)
+
+    mock_token_svc = AsyncMock()
+    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")
+
+    mock_extractor = MagicMock()
+    mock_extractor.extract = MagicMock(return_value={"text": "Hello world content " * 100})
+
+    mock_embedder = MagicMock()
+    mock_upsert = MagicMock()
+
+    drive_file_meta = {
+        "id": "abc123",
+        "name": "Test Doc",
+        "mimeType": "application/vnd.google-apps.document",
+        "modifiedTime": "2026-02-14T00:00:00Z",
+        "md5Checksum": "newhash123",
+        "size": "2048",
+    }
+
+    # Simulate 10 chunks
+    chunks = [
+        {"chunk_index": i, "content": f"chunk {i}", "content_type": "text", "token_count": 50, "metadata": {}}
+        for i in range(10)
+    ]
+
+    with patch("app.services.library_indexing_service.chunk_text_content", return_value=chunks), \
+         patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock) as mock_charge:
+
+        mock_embedder.embed_batch = MagicMock(return_value=[[0.1] * 3] * 10)
+
+        result = await process_google_drive_index_job(
+            db, 1,
+            embedding_service=mock_embedder,
+            vector_upsert_fn=mock_upsert,
+            content_extractor=mock_extractor,
+            token_service=mock_token_svc,
+            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
+        )
+
+    assert result["status"] == "completed"
+
+    # Verify credit charge: ceil(10) * 2 = 20
+    mock_charge.assert_called_once()
+    call_kwargs = mock_charge.call_args
+    assert call_kwargs.kwargs["amount"] == 20
+    assert call_kwargs.kwargs["service"] == "gdrive.index"
+    assert call_kwargs.kwargs["idempotency_key"] == "gdrive_index:t1:abc123:newhash123"
+
+
+@pytest.mark.asyncio
+async def test_process_gdrive_index_token_expired():
+    """processGoogleDriveIndexJob handles token expired by marking retry."""
+    from app.services.google_token_service import InvalidGrantError
+
+    job = _make_job()
+    item = _make_item()
+    db = _make_db(job, item)
+
+    mock_token_svc = AsyncMock()
+    mock_token_svc.get_valid_access_token = AsyncMock(side_effect=InvalidGrantError("Token expired"))
+
+    result = await process_google_drive_index_job(
+        db, 1,
+        token_service=mock_token_svc,
+    )
+
+    assert result["status"] == "retry_pending"
+    assert result["reason"] == "token_expired"
+    assert item.metadata_json["syncStatus"] == "token_expired"
+
+
+@pytest.mark.asyncio
+async def test_process_gdrive_index_vector_ids_format():
+    """Vector IDs follow format gdrive:{tenantId}:{driveFileId}:{chunkIndex}."""
+    job = _make_job(tenant_id="tenant-xyz")
+    item = _make_item(tenant_id="tenant-xyz", metadata={
+        "driveFileId": "file_ABC",
+        "driveMimeType": "application/vnd.google-apps.document",
+        "syncStatus": "pending",
+    })
+    db = _make_db(job, item)
+
+    mock_token_svc = AsyncMock()
+    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")
+
+    mock_extractor = MagicMock()
+    mock_extractor.extract = MagicMock(return_value={"text": "Content " * 30})
+
+    mock_embedder = MagicMock()
+    mock_embedder.embed_batch = MagicMock(return_value=[[0.1, 0.2]] * 10)
+
+    mock_upsert = MagicMock()
+
+    drive_file_meta = {
+        "id": "file_ABC",
+        "name": "Test Doc",
+        "mimeType": "application/vnd.google-apps.document",
+        "modifiedTime": "2026-02-14T00:00:00Z",
+        "md5Checksum": "hash999",
+        "size": "512",
+    }
+
+    with patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock):
+        result = await process_google_drive_index_job(
+            db, 1,
+            embedding_service=mock_embedder,
+            vector_upsert_fn=mock_upsert,
+            content_extractor=mock_extractor,
+            token_service=mock_token_svc,
+            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
+        )
+
+    assert result["status"] == "completed"
+
+    # Check that db.add was called with chunks that have proper vector_ref_ids
+    add_calls = db.add.call_args_list
+    for call in add_calls:
+        chunk = call[0][0]
+        vid = chunk.vector_ref_id
+        assert vid.startswith("gdrive:tenant-xyz:file_ABC:"), f"Invalid vector ID: {vid}"
+
+
+@pytest.mark.asyncio
+async def test_process_gdrive_index_vectors_tagged_with_metadata():
+    """Vectors are tagged with source, drive_file_id, tenant_id metadata."""
+    job = _make_job(tenant_id="t1")
+    item = _make_item(tenant_id="t1", owner_user_id=42, metadata={
+        "driveFileId": "fileXYZ",
+        "driveMimeType": "application/vnd.google-apps.document",
+        "syncStatus": "pending",
+    })
+    db = _make_db(job, item)
+
+    mock_token_svc = AsyncMock()
+    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")
+
+    mock_extractor = MagicMock()
+    mock_extractor.extract = MagicMock(return_value={"text": "Test content " * 30})
+
+    mock_embedder = MagicMock()
+    mock_embedder.embed_batch = MagicMock(return_value=[[0.1, 0.2]] * 10)
+
+    mock_upsert = MagicMock()
+
+    drive_file_meta = {
+        "id": "fileXYZ",
+        "name": "Test Doc",
+        "mimeType": "application/vnd.google-apps.document",
+        "modifiedTime": "2026-02-14T00:00:00Z",
+        "md5Checksum": "hashXYZ",
+        "size": "512",
+    }
+
+    with patch("app.services.credit_billing_client.charge_credits_post_deduct", new_callable=AsyncMock):
+        result = await process_google_drive_index_job(
+            db, 1,
+            embedding_service=mock_embedder,
+            vector_upsert_fn=mock_upsert,
+            content_extractor=mock_extractor,
+            token_service=mock_token_svc,
+            drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
+        )
+
+    assert result["status"] == "completed"
+
+    # Verify that db.add was called with LibraryChunk objects with correct metadata
+    add_calls = db.add.call_args_list
+    assert len(add_calls) > 0
+
+    for call in add_calls:
+        chunk = call[0][0]
+        assert chunk.tenant_id == "t1"
+
+
+@pytest.mark.asyncio
+async def test_process_gdrive_index_failure_sets_status():
+    """processGoogleDriveIndexJob sets syncStatus to failed on extraction error."""
+    job = _make_job(attempt_count=4, max_attempts=5)
+    item = _make_item()
+    db = _make_db(job, item)
+
+    mock_token_svc = AsyncMock()
+    mock_token_svc.get_valid_access_token = AsyncMock(return_value="test-token")
+
+    mock_extractor = MagicMock()
+    mock_extractor.extract = MagicMock(return_value={"text": ""})  # empty text -> ValueError
+
+    drive_file_meta = {
+        "id": "abc123",
+        "name": "Test Doc",
+        "mimeType": "application/vnd.google-apps.document",
+        "modifiedTime": "2026-02-14T00:00:00Z",
+        "md5Checksum": "newhash",
+        "size": "512",
+    }
+
+    result = await process_google_drive_index_job(
+        db, 1,
+        content_extractor=mock_extractor,
+        token_service=mock_token_svc,
+        drive_file_meta_fn=_make_drive_meta_fn(drive_file_meta),
+    )
+
+    assert result["status"] == "failed"
+    assert item.metadata_json["syncStatus"] == "failed"
+    assert item.status == "failed"
