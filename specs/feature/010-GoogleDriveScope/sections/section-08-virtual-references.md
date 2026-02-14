Good -- those files are new and need to be created. Now I have all the context needed. Let me produce the section content.

# Section 8: Virtual Document References and Indexing

## Overview

This section creates virtual references in the document library for Google Drive files and indexes their content for RAG search, without duplicating the actual files. A virtual reference is a `library_items` record with `source: "google_drive"` and no `sourceUrl` (the file lives on Drive, not in S3/R2). When created, an indexing job is enqueued that extracts text from the Drive file, chunks it, generates embeddings, and upserts them into the vector store alongside regular library content.

**Dependencies (must be completed first):**
- **Section 04 (Credit Billing):** Provides `deductCredits()` with `idempotencyKey` support, service tags, and the post-deduct/refund pattern.
- **Section 06 (Content Extraction):** Provides `GoogleContentExtractor` in `python-backend/app/services/google_content_extractor.py` for text extraction from Drive files.
- **Section 02 (Database Schema):** Provides the updated `library_links` table with `tenant_id` column and `(linkType, linkId, tenant_id)` unique index.
- **Section 03 (OAuth Consent):** Provides `GoogleTokenService` in `python-backend/app/services/google_token_service.py` for obtaining valid access tokens.

**Blocks:**
- Section 10 (Federated Search), Section 11 (Sync/Webhooks), Section 14 (Disconnect/Cleanup) all depend on virtual references.

---

## Tests FIRST

### Vitest Tests: `apps/web/server/services/libraryService.test.ts`

These tests cover the `createVirtualDriveReference` function added to the library service.

```
# Test: createVirtualDriveReference creates library_items with source="google_drive"
#   - Call createVirtualDriveReference with a driveFile fixture and actor
#   - Verify the returned item has source="google_drive", sourceUrl=null
#   - Verify metadata includes driveFileId, driveMimeType, driveModifiedTime

# Test: createVirtualDriveReference creates library_links with tenant_id
#   - Call createVirtualDriveReference
#   - Query library_links and verify link_type="google_drive_file",
#     link_id=driveFileId, tenant_id=actor.tenantId

# Test: createVirtualDriveReference deduplicates within same tenant (upsert/skip)
#   - Call createVirtualDriveReference twice with the same driveFileId and same tenant
#   - Second call returns idempotent=true and the same item ID
#   - Only 1 library_items record exists

# Test: createVirtualDriveReference allows same driveFileId across different tenants
#   - Call createVirtualDriveReference with driveFileId="ABC" for tenant "t1"
#   - Call createVirtualDriveReference with driveFileId="ABC" for tenant "t2"
#   - Both succeed, creating 2 separate library_items records

# Test: createVirtualDriveReference enqueues index job
#   - Call createVirtualDriveReference
#   - Verify a library_index_jobs record is created with
#     jobType="google_drive_sync", status="pending",
#     libraryItemId matching the created item
```

### pytest Tests: `python-backend/tests/test_google_drive_index_job.py`

These tests cover the `processGoogleDriveIndexJob` Celery task.

```
# Test: processGoogleDriveIndexJob fetches file, extracts, chunks, embeds, upserts
#   - Mock GoogleTokenService.get_valid_access_token to return a token
#   - Mock Drive API files.get to return file metadata
#   - Mock GoogleContentExtractor.extract to return sample text
#   - Mock embedding_service.embed_batch to return dummy vectors
#   - Mock vector_upsert_fn
#   - Verify the pipeline runs end-to-end: extract -> chunk -> embed -> upsert
#   - Verify library_items.metadata is updated with contentHash, lastSyncedAt, syncStatus="indexed"
#   - Verify library_chunks are upserted in PostgreSQL

# Test: processGoogleDriveIndexJob skips unchanged files (content hash match)
#   - Set library_items.metadata.contentHash to a known hash
#   - Mock Drive API to return file with matching content hash
#   - Verify extractor is NOT called
#   - Verify no credits are charged

# Test: processGoogleDriveIndexJob charges credits post-deduct with idempotency key
#   - Run the job to completion with 10 chunks produced
#   - Verify credit charge of ceil(10) * 2 = 20 credits
#   - Verify idempotency key format: "gdrive_index:{tenantId}:{driveFileId}:{contentHash}"
#   - Verify metadata.service = "gdrive.index"

# Test: processGoogleDriveIndexJob refunds on failure
#   - Mock vector_upsert_fn to raise an exception AFTER credits were charged
#   - Verify a refund transaction is created with type="refund"
#   - Verify library_items.metadata.syncStatus is set to "failed"

# Test: processGoogleDriveIndexJob handles token expired (marks item for retry)
#   - Mock GoogleTokenService.get_valid_access_token to raise InvalidGrantError
#   - Verify job status is set to "retry_pending" (not "failed")
#   - Verify library_items.metadata.syncStatus = "token_expired"

# Test: vector IDs follow format gdrive:{tenantId}:{driveFileId}:{chunkIndex}
#   - Run a successful job
#   - Capture the vector IDs passed to vector_upsert_fn
#   - Verify each follows the pattern gdrive:{tenantId}:{driveFileId}:{N}

# Test: vectors tagged with source, drive_file_id, tenant_id, user_id metadata
#   - Run a successful job
#   - Capture the metadata dicts passed to vector_upsert_fn
#   - Verify each contains source="google_drive", drive_file_id, tenant_id, user_id
```

---

## Implementation Details

### Part A: Extend `libraryService.ts` with `createVirtualDriveReference`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

Add a new exported function `createVirtualDriveReference` that creates a library item and link for a Google Drive file. The function follows the same patterns already used by `createLibraryItem` in this file.

**New interface (add near the top with other interfaces):**

```typescript
export interface DriveFileInput {
  driveFileId: string;
  name: string;
  mimeType: string;
  modifiedTime: string;      // ISO 8601 from Google Drive API
  size?: number;
  iconLink?: string;
  webViewLink?: string;
  owners?: Array<{ emailAddress: string; displayName?: string }>;
}
```

**Function signature and behavior:**

```typescript
export async function createVirtualDriveReference(
  driveFile: DriveFileInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<CreateLibraryItemResult>
```

Implementation steps:

1. **Dedup check via `library_links`:** Query `library_links` joined with `library_items` where `linkType = "google_drive_file"`, `linkId = driveFile.driveFileId`, and `tenant_id = actor.tenantId` (after Section 02 adds `tenant_id` to `library_links`). If a non-deleted match exists, return `{ item, idempotent: true }`.

2. **Determine `itemType`:** Map the Drive `mimeType` to a library `itemType`:
   - `application/vnd.google-apps.document` or `.docx` variants -> `"document"`
   - `application/vnd.google-apps.spreadsheet` or `.xlsx` variants -> `"spreadsheet"`
   - `application/vnd.google-apps.presentation` or `.pptx` variants -> `"presentation"`
   - `application/pdf` -> `"pdf"`
   - `text/*` -> `"text"`
   - Fallback -> `"file"`

3. **Insert `library_items`:** Use the existing Drizzle insert pattern:
   - `tenantId`: from `actor.tenantId`
   - `ownerUserId`: from `actor.userId`
   - `itemType`: from the mapping above
   - `source`: `"google_drive"`
   - `title`: `driveFile.name`
   - `status`: `"indexing"` (will become `"ready"` after indexing completes)
   - `visibility`: `"private"`
   - `sourceUrl`: `null` (file lives on Drive, not S3/R2)
   - `thumbnailUrl`: `driveFile.iconLink ?? null`
   - `metadata`: JSON object with:
     - `driveFileId`: the Drive file ID
     - `driveMimeType`: the Drive MIME type
     - `driveModifiedTime`: the ISO timestamp
     - `driveSize`: file size if available
     - `driveWebViewLink`: link to open in Google
     - `driveOwners`: owner info array
     - `syncStatus`: `"pending"`

4. **Insert `library_links`:** Insert with `linkType = "google_drive_file"`, `linkId = driveFile.driveFileId`, `tenant_id = actor.tenantId`. Use `onConflictDoNothing()` for safety.

5. **Enqueue index job:** Insert into `libraryIndexJobs` with:
   - `tenantId`: from actor
   - `libraryItemId`: the newly created item's ID
   - `jobType`: `"google_drive_sync"`
   - `status`: `"pending"`

6. **Return** the created item DTO with `idempotent: false`.

**Note on `library_links.tenant_id`:** Section 02 (Database Schema) adds a `tenant_id` column to `library_links` and changes the unique index from `(linkType, linkId)` to `(linkType, linkId, tenant_id)`. This function depends on that change being applied. If implementing before Section 02 is complete, the dedup check must use only `(linkType, linkId)` without tenant scoping.

---

### Part B: Create `processGoogleDriveIndexJob` Celery Task

**New file:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py`

This file defines a Celery task that processes a `library_index_jobs` record with `jobType = "google_drive_sync"`. It follows the same async-in-Celery pattern used by `process_library_index_job_task` in `python-backend/app/tasks/media_tasks.py`.

**Task registration:**

```python
@celery_app.task(name="process_google_drive_index_job", bind=True, max_retries=3)
def process_google_drive_index_job_task(self, job_id: int):
    """Process a Google Drive file index job."""
    # Uses _run_async helper to run the async pipeline in sync Celery context
```

**Core pipeline function (async):**

```python
async def process_google_drive_index_job(
    db: AsyncSession,
    job_id: int,
    *,
    embedding_service: Optional[EmbeddingService] = None,
    vector_upsert_fn: Optional[VectorUpsertFn] = None,
    content_extractor: Optional[GoogleContentExtractor] = None,
    token_service: Optional[GoogleTokenService] = None,
) -> dict[str, Any]:
    """Process a single Google Drive index job through the extract/chunk/embed/upsert pipeline."""
```

**Pipeline steps (inside the async function):**

1. **Load job record** from `library_index_jobs` by `job_id`. If not found or already `completed`, return early.

2. **Mark job as processing:** Set `status = "processing"`, increment `attempt_count`, set `started_at`.

3. **Load library item:** Query `library_items` by `job.library_item_id` and `job.tenant_id`. Verify it exists and is not deleted.

4. **Extract Drive metadata from item:** Read `driveFileId`, `driveMimeType`, and existing `contentHash` from `library_items.metadata` JSON.

5. **Get valid access token:** Call `GoogleTokenService.get_valid_access_token(user_id)` where `user_id` comes from `library_items.owner_user_id`. If `InvalidGrantError` is raised, set job to `retry_pending`, update item `syncStatus` to `"token_expired"`, and return.

6. **Fetch current file metadata from Drive API:** Call `files.get(fileId=driveFileId, fields="id,name,mimeType,modifiedTime,md5Checksum,size")` using the access token. Use the `md5Checksum` (or compute a hash from `modifiedTime + size` if md5 unavailable) as the `contentHash`.

7. **Content hash comparison:** If the new `contentHash` matches the stored `contentHash` in `library_items.metadata`, the file has not changed. Mark job as `completed` with `chunks_written: 0, unchanged: True`. Do NOT charge credits.

8. **Extract text content:** Call `GoogleContentExtractor.extract(file_id=driveFileId, mime_type=driveMimeType, access_token=access_token)`. This returns the full text content using structure-aware extraction (Docs API for Google Docs, Sheets API for Sheets, etc.). The content extractor is defined in Section 06.

9. **Chunk the content:** Use the Google Drive specific chunking parameters (200-500 token chunks with 50-100 token overlap) rather than the default library chunking (500 char/80 char overlap). The content extractor from Section 06 provides structure-aware chunking that splits by headings, sheet groups, or slides.

   If using the generic chunker from `library_indexing_service.py` as a fallback:
   ```python
   chunks = chunk_text_content(extracted_text, max_chars=1000, overlap_chars=200)
   ```
   But prefer the structure-aware chunker from the content extractor when available.

10. **Generate embeddings:** Use the existing `EmbeddingService.embed_batch()` from `python-backend/app/services/embedding_service.py`. Same service used by regular library indexing.

11. **Upsert to vector store:** Use the vector upsert function from `get_vector_upsert_fn()` (supports Chroma, pgvector, Cloudflare Vectorize). Vector IDs use the format `gdrive:{tenantId}:{driveFileId}:{chunkIndex}` (distinct from regular library vectors which use `lib:{tenantId}:{itemId}:{chunkIndex}`).

    Metadata per vector must include:
    - `source`: `"google_drive"`
    - `drive_file_id`: the Drive file ID
    - `tenant_id`: from the job
    - `user_id`: from the library item's `owner_user_id`
    - `item_id`: the `library_item_id`
    - `chunk_index`, `token_count`, `content_type`: standard chunk metadata

12. **Upsert `library_chunks` in PostgreSQL:** Delete existing chunks for this `library_item_id`, then insert new ones. Each chunk record stores `content`, `chunkIndex`, `vectorRefId` (the vector ID from step 11), and metadata. Follow the same pattern as `process_library_index_job` in `library_indexing_service.py`.

13. **Update library item metadata:** Set `contentHash`, `lastSyncedAt` (ISO timestamp), `syncStatus` to `"indexed"`, and `chunkCount` in the `metadata` JSON field of `library_items`. Also update `status` to `"ready"`.

14. **Charge credits (post-deduct):** Call the Node.js credit billing endpoint (or use a Python credit charging helper if one exists from Section 04). Charge `ceil(chunk_count) * 2` credits with:
    - `service`: `"gdrive.index"`
    - `idempotencyKey`: `"gdrive_index:{tenantId}:{driveFileId}:{contentHash}"`
    - `description`: `"Google Drive file indexing: {file_name}"`

    If the credit charge fails, log the error but do NOT roll back the indexing (the content is already indexed; the user still consumed resources).

15. **Mark job as completed:** Set `status = "completed"`, `completed_at = now`.

16. **Error handling (catch block):** If any step after step 6 fails:
    - If credits were already charged, create a refund transaction.
    - Set `library_items.metadata.syncStatus = "failed"`.
    - If `attempt_count < max_attempts`, set job `status = "retry_pending"` with exponential backoff delay.
    - Otherwise set job `status = "failed"` with `last_error`.

---

### Part C: Register the Celery Task

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py`

At the top of the file, add an import for the new task module so Celery discovers it:

```python
import app.tasks.google_drive_tasks  # noqa: F401  # register tasks
```

Alternatively, ensure `google_drive_tasks` is listed in the Celery `include` configuration in `python-backend/app/core/celery_app.py` so the task is auto-discovered.

---

### Part D: Enqueue Drive Index Jobs from Node.js

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts` (or `googleDrive.ts` if created by Section 03)

When `createVirtualDriveReference` returns `idempotent: false` (a new reference was created), the calling code must trigger the Celery indexing task. This is done the same way existing library upload indexing works: either by calling the Python backend via HTTP to enqueue the Celery task, or by inserting a job into `library_index_jobs` and letting the Python task poller pick it up.

The recommended approach (matching existing patterns): the `createVirtualDriveReference` function already inserts the `library_index_jobs` record with `status = "pending"`. The Python backend's periodic retry task (`retry_library_index_jobs`) already processes pending jobs. To trigger immediate processing, call the Python backend's internal API:

```
POST /api/internal/library/index-job
Body: { "job_id": <the_job_id> }
```

Or dispatch a Celery task directly if Redis is accessible from Node.js (via BullMQ or direct Redis publish, following the pattern in `apps/web/server/services/scheduler.ts`).

---

### Part E: Vector ID Format and Deduplication

Vector IDs for Google Drive content use the format `gdrive:{tenantId}:{driveFileId}:{chunkIndex}`. This is deliberately different from regular library vectors (`lib:{tenantId}:{itemId}:{chunkIndex}`) because:

1. **Re-indexing stability:** When a Drive file is re-indexed, the same vector IDs are generated, enabling deterministic overwrite (delete old + insert new).
2. **Cross-reference:** The `driveFileId` in the vector ID allows federated search (Section 10) to link vector results back to Drive files.
3. **Cleanup:** When disconnecting (Section 14), vectors can be deleted by prefix `gdrive:{tenantId}:`.

The vector upsert function must delete existing vectors with the same ID prefix before inserting new ones (same pattern as `_default_vector_upsert` in `library_indexing_service.py`).

---

### Part F: Credit Billing Integration

The billing for Drive indexing follows the post-deduct pattern from Section 04:

- **Formula:** `ceil(chunk_count) * 2` credits per file indexed
- **Service tag:** `"gdrive.index"` (for re-indexing: `"gdrive.reindex"`)
- **Idempotency key:** `"gdrive_index:{tenantId}:{driveFileId}:{contentHash}"` ensures the same file version is never double-charged. If the content hash changes (file was modified), a new idempotency key is generated and the re-index is charged normally.
- **Refund on failure:** If indexing fails after a credit charge was recorded, create a `type: "refund"` transaction with the same amount and a reference to the original transaction.

The credit charge is made via an HTTP call to the Node.js backend from the Python Celery task:

```
POST /api/internal/credits/deduct
Body: {
  "userId": <owner_user_id>,
  "amount": <calculated_credits>,
  "description": "Google Drive file indexing: <filename>",
  "metadata": { "service": "gdrive.index", "driveFileId": "<id>", "chunkCount": <n> },
  "idempotencyKey": "gdrive_index:<tenantId>:<driveFileId>:<contentHash>"
}
```

If Section 04's `deductCredits()` is not yet extended with `idempotencyKey`, the task should still work but without dedup protection -- add a TODO comment noting the dependency.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` | Modify | Add `DriveFileInput` interface and `createVirtualDriveReference()` function |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` | Create | New Celery task `process_google_drive_index_job_task` and async pipeline |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_google_drive_index_job.py` | Create | pytest tests for the indexing pipeline |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.test.ts` | Modify | Add Vitest tests for `createVirtualDriveReference` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | Modify | Add `app.tasks.google_drive_tasks` to Celery `include` list |

---

## Key Schemas and Types Reference

**`library_items` table** (from `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 1504):
- `id`: serial PK
- `tenantId`: varchar(36), FK to tenants.id
- `ownerUserId`: integer, FK to users.id
- `itemType`: varchar(32) -- use values like `"document"`, `"spreadsheet"`, `"pdf"`
- `source`: varchar(64) -- use `"google_drive"` for virtual refs
- `metadata`: json -- stores Drive-specific fields as described above
- `sourceUrl`: text, nullable -- `null` for virtual Drive references
- `status`: enum -- set to `"indexing"` on create, `"ready"` after index completes

**`library_links` table** (line 1534, after Section 02 modifications):
- `linkType`: varchar(64) -- use `"google_drive_file"`
- `linkId`: varchar(128) -- use the Google Drive file ID
- `tenant_id`: varchar(36) -- added by Section 02
- Unique index on `(linkType, linkId, tenant_id)` -- enables per-tenant dedup

**`library_index_jobs` table** (line 1616):
- `jobType`: varchar(64) -- use `"google_drive_sync"`
- `status`: enum -- `pending` -> `processing` -> `completed`/`failed`/`retry_pending`

**`library_chunks` table** (line 1550):
- `vectorRefId`: varchar(128) -- stores the vector ID `gdrive:{tenantId}:{driveFileId}:{chunkIndex}`
- `metadata`: json -- includes `source: "google_drive"`, `drive_file_id`, heading hierarchy

**Existing vector ID format** for reference (from `library_indexing_service.py` line 155):
```python
vector_ids = [f"lib:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]
```

**Google Drive vector ID format** (new):
```python
vector_ids = [f"gdrive:{tenant_id}:{drive_file_id}:{chunk['chunk_index']}" for chunk in chunks]
```