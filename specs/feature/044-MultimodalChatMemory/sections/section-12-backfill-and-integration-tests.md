# Section 12: Backfill Script and Integration Tests

## Overview

This section covers two distinct deliverables that finalize the Multimodal Chat Memory feature:

1. **Backfill Script** -- A standalone Node.js script that retroactively processes existing image attachments from the `messages` table, creating `media_assets` rows and optionally dispatching vision analysis. This runs as a one-time admin-triggered operation.

2. **HNSW Index Creation** -- After the backfill populates `multimodal_memory_vectors`, create the HNSW vector index for efficient similarity search. This is deferred from the initial migration (section 01) to avoid table locks during bulk inserts.

3. **End-to-End Integration Tests** -- Tests that verify the full pipeline from image upload through analysis, embedding, retrieval, and context assembly. These tests exercise the cross-service interactions that unit tests in previous sections cannot cover.

## Dependencies

- **All prior sections (01 through 11)** must be implemented. This section is the final step and assumes every service, schema table, feature flag, and UI component is in place.
- Key services used: `mediaAssetService.ts` (section 02), `visionMemoryService.ts` (section 03/08), `multimodalEmbeddingProvider.ts` (section 04), `visualStateService.ts` (section 05), `multimodalRetrievalService.ts` (section 06), `buildChatContext()` extensions (section 07), and the feature flag `MULTIMODAL_MEMORY_ENABLED` (section 09).

## Relevant Existing Code

- **Messages schema** (`/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, line 1366): The `messages` table has an `attachments` JSON column typed as `Array<{type, url, key?, name?, size?, mimeType?, thumbnail?}>`. Image attachments have `type: "image"`.
- **Existing script pattern** (`/home/dev/projects/SmartSpecPro/apps/web/scripts/migrate-memory.ts`): Standalone scripts use the `postgres` library directly for raw SQL, connect via `DATABASE_URL`, and run as `npx tsx scripts/scriptname.ts`.
- **Feature flags** (`/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts`): The `TenantFeatureFlags` interface and `ALLOWED_FEATURE_FLAGS` set. The `MULTIMODAL_MEMORY_ENABLED` flag (added in section 09) gates whether vision analysis is dispatched during backfill.

---

## Tests

Write tests BEFORE implementing. All backfill tests use Vitest. Integration tests span both Vitest (Node.js services) and pytest (Python vision pipeline).

### Backfill Script Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/scripts/__tests__/backfill-media-assets.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("backfill-media-assets", () => {
  // Test: processes existing image attachments in batches of 100
  it("should query messages with image attachments in batches of 100", async () => {
    // Mock DB to return 250 messages with image attachments across 3 batches
    // Verify batch offset increments correctly (0, 100, 200)
    // Verify all 250 are processed
  });

  // Test: creates media_assets row for each image attachment
  it("should create a media_assets row per image attachment", async () => {
    // Given a message with 2 image attachments
    // Expect 2 media_assets rows inserted
    // Verify fields: storageKey from attachment.key or parsed from url,
    //   mimeType from attachment.mimeType, status = 'pending',
    //   conversationId, messageId, userId, tenantId from message/conversation
  });

  // Test: updates attachment JSON with assetId (backward compatible)
  it("should update the message attachment JSON with the new assetId", async () => {
    // After creating media_assets row with id=42
    // Verify the attachment object now includes assetId: 42
    // Verify other attachment fields are preserved unchanged
  });

  // Test: skips already-processed attachments (idempotent)
  it("should skip attachments that already have an assetId", async () => {
    // Given attachment with existing assetId field
    // Expect no new media_assets row created
    // Expect no UPDATE to the attachment JSON
  });

  // Test: does not charge user credits
  it("should not deduct user credits during backfill", async () => {
    // Verify creditService.deductCredits is never called
    // Or verify the vision analysis dispatch uses systemCost flag
  });

  // Test: optionally dispatches vision analysis when flag enabled
  it("should dispatch vision analysis only when MULTIMODAL_MEMORY_ENABLED is true", async () => {
    // When flag is on: verify HTTP call to Python /api/v1/vision/analyze
    // When flag is off: verify no vision dispatch occurs
  });

  // Test: handles messages with no image attachments gracefully
  it("should skip messages with only file/audio/video attachments", async () => {
    // Given message with attachments [{type:'file', ...}, {type:'audio', ...}]
    // Expect zero media_assets rows created
  });

  // Test: handles null/empty attachments column
  it("should skip messages with null or empty attachments", async () => {
    // Given message with attachments = null or []
    // Expect no errors, no rows created
  });

  // Test: logs progress every batch
  it("should log progress after each batch", async () => {
    // Verify console.log called with batch number and cumulative count
  });

  // Test: checksumSha256 dedup prevents duplicate assets
  it("should reuse existing media_assets row when checksumSha256 matches", async () => {
    // Given two attachments with same URL/key (same image uploaded twice)
    // Expect only one media_assets row; second attachment gets same assetId
  });
});
```

### HNSW Index Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/scripts/__tests__/create-hnsw-index.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

describe("create-hnsw-index", () => {
  // Test: creates HNSW index on multimodal_memory_vectors.embedding
  it("should execute CREATE INDEX with correct HNSW parameters", async () => {
    // Verify SQL: CREATE INDEX CONCURRENTLY IF NOT EXISTS
    //   idx_multimodal_memory_vectors_embedding
    //   ON multimodal_memory_vectors USING hnsw (embedding vector_cosine_ops)
    //   WITH (m = 16, ef_construction = 128)
  });

  // Test: uses CONCURRENTLY to avoid table lock
  it("should use CONCURRENTLY to avoid blocking writes", async () => {
    // Verify the SQL string contains 'CONCURRENTLY'
  });

  // Test: idempotent — IF NOT EXISTS prevents error on re-run
  it("should not fail if index already exists", async () => {
    // Verify IF NOT EXISTS clause
  });
});
```

### End-to-End Integration Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/multimodalMemoryIntegration.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Multimodal Memory Integration", () => {
  // Full pipeline: upload -> asset creation -> analysis -> embedding -> retrieval -> context

  describe("upload-to-retrieval pipeline", () => {
    // Test: image upload creates media_asset and dispatches analysis
    it("should create media_asset row when image is attached to message", async () => {
      // Mock: message creation with image attachment
      // Verify: mediaAssetService.createAssetFromAttachment called
      // Verify: media_assets row exists with status='pending'
      // Verify: attachment JSON updated with assetId
      // Verify: visualStateService.addRecentAsset called
    });

    // Test: analysis completion creates memory item and embedding
    it("should create memory item and vector after vision analysis completes", async () => {
      // Given: media_asset with status='analyzed', analysis result in media_asset_analysis
      // Mock: visionMemoryService processes the analysis callback
      // Verify: multimodal_memory_items row created with searchableText
      // Verify: multimodal_memory_vectors row created with 768-dim embedding
      // Verify: media_assets.status updated to 'analyzed'
    });

    // Test: retrieval finds uploaded image by semantic query
    it("should retrieve an analyzed image by semantic text query", async () => {
      // Given: fully processed image (asset + analysis + memory item + vector)
      // When: multimodalRetrievalService.retrieveRelevantAssets called with matching query
      // Verify: returns the correct asset with similarity score > 0.5
    });

    // Test: retrieval finds image by Thai natural language reference
    it("should resolve Thai reference 'รูปก่อนหน้า' to the last uploaded image", async () => {
      // Given: 3 images uploaded in sequence, visual state has all 3 in recentAssetIds
      // When: resolveVisualReferences called with "ดูรูปก่อนหน้า"
      // Verify: returns the second-most-recent assetId
    });
  });

  describe("context assembly with visual memory", () => {
    // Test: buildChatContext includes visual memory when images exist
    it("should include imageAssets in context for vision-capable models", async () => {
      // Given: conversation with analyzed images in visual state
      // When: buildChatContext called with vision-capable model config
      // Verify: result.imageAssets is non-empty
      // Verify: imageAssets contain signed URLs (not raw storage keys)
    });

    // Test: buildChatContext uses text fallback for non-vision models
    it("should include visualMemoryContext text for text-only models", async () => {
      // Given: same conversation as above
      // When: buildChatContext called with text-only model config
      // Verify: result.visualMemoryContext is a non-empty string
      // Verify: result.imageAssets is empty
    });

    // Test: buildChatContext is unaffected when no images exist
    it("should not change budget allocation when conversation has no images", async () => {
      // Given: conversation with zero images
      // When: buildChatContext called
      // Verify: result.visualMemoryContext is null
      // Verify: result.imageAssets is empty array
      // Verify: budget allocation matches original ratios (40% entity, 60% summary)
    });
  });

  describe("NSFW blocking pipeline", () => {
    // Test: NSFW image does not enter memory
    it("should block NSFW image from memory while keeping attachment", async () => {
      // Given: image uploaded, analysis returns safetyLabels with NSFW flag
      // Verify: media_assets.status = 'nsfw_blocked'
      // Verify: no multimodal_memory_items row created
      // Verify: no multimodal_memory_vectors row created
      // Verify: original message attachment is untouched (image still accessible)
    });
  });

  describe("deletion cascade", () => {
    // Test: deleting from memory removes all related records
    it("should cascade delete memory item, vectors, links, and visual state entries", async () => {
      // Given: fully processed image with memory item, vector, and visual state entry
      // When: visionMemoryService.deleteFromMemory called
      // Verify: multimodal_memory_items row deleted
      // Verify: multimodal_memory_vectors row deleted (via CASCADE)
      // Verify: multimodal_memory_links rows deleted (via CASCADE)
      // Verify: asset removed from conversation_visual_state.recentAssetIds
      // Verify: media_assets row is retained (or status set to memoryDeleted)
    });
  });

  describe("feature flag gating", () => {
    // Test: entire pipeline is gated by feature flag
    it("should skip all multimodal processing when MULTIMODAL_MEMORY_ENABLED is false", async () => {
      // Given: feature flag off for the tenant
      // When: message created with image attachment
      // Verify: no media_assets row created
      // Verify: no vision analysis dispatched
      // Verify: buildChatContext returns no visual context
    });
  });

  describe("tenant isolation", () => {
    // Test: cross-tenant retrieval is blocked
    it("should not return assets from a different tenant", async () => {
      // Given: tenant-A has image assets; tenant-B has none
      // When: retrieveRelevantAssets called with tenant-B context
      // Verify: returns empty results (no tenant-A leakage)
    });
  });

  describe("credit tracking", () => {
    // Test: vision analysis records costs
    it("should record provider_usage_log entries for vision and embedding", async () => {
      // Given: image uploaded and analyzed
      // Verify: provider_usage_log has entry with operation 'vision_analysis'
      // Verify: provider_usage_log has entry with operation 'embedding_generation'
      // Verify: user credits deducted at ~0.5x multiplier
    });
  });
});
```

### Python Integration Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_vision_pipeline.py`

```python
import pytest
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
class TestVisionPipelineIntegration:
    """End-to-end tests for the Python vision analysis pipeline."""

    async def test_analyze_endpoint_enqueues_celery_task(self):
        """POST /api/v1/vision/analyze should enqueue analyze_image_task."""
        # Mock Celery delay, verify task enqueued with correct args
        # Verify response status 202 (accepted)

    async def test_analyze_task_writes_analysis_to_db(self):
        """Celery task should write structured analysis to media_asset_analysis."""
        # Mock Gemini Flash API response with structured output
        # Run task synchronously
        # Verify media_asset_analysis row created with expected fields

    async def test_analyze_task_updates_asset_status(self):
        """Celery task should update media_assets.status through lifecycle."""
        # Verify status transitions: pending -> analyzing -> analyzed

    async def test_analyze_task_blocks_nsfw(self):
        """Celery task should set status to nsfw_blocked for NSFW images."""
        # Mock Gemini response with safetyLabels containing NSFW
        # Verify media_assets.status = 'nsfw_blocked'
        # Verify no multimodal_memory_items created

    async def test_analyze_endpoint_rejects_without_proxy_token(self):
        """Endpoint should return 401 without valid x-proxy-token."""
        # Send request without header
        # Verify 401 response

    async def test_analyze_endpoint_rejects_when_flag_off(self):
        """Endpoint should return 403 when MULTIMODAL_MEMORY_ENABLED is off."""
        # Mock feature flag check to return False
        # Verify 403 response
```

---

## Implementation Details

### 1. Backfill Script

**File**: `/home/dev/projects/SmartSpecPro/apps/web/scripts/backfill-media-assets.ts`

This is a standalone Node.js script run manually by an admin. It follows the pattern established by `/home/dev/projects/SmartSpecPro/apps/web/scripts/migrate-memory.ts`.

**Execution**: `cd /home/dev/projects/SmartSpecPro/apps/web && npx tsx scripts/backfill-media-assets.ts`

**Optional flags** (via environment variables):
- `BACKFILL_DISPATCH_VISION=true` -- Also dispatch vision analysis for each backfilled asset (default: false, only creates `media_assets` rows)
- `BACKFILL_BATCH_SIZE=100` -- Number of messages to process per batch (default: 100)
- `BACKFILL_DRY_RUN=true` -- Log what would be done without writing (default: false)

**Algorithm**:

1. Connect to PostgreSQL via `DATABASE_URL` using the `postgres` library (raw SQL for performance and to avoid importing the full app context).
2. Query messages in batches: `SELECT m.id, m."conversationId", m.attachments, c."userId", c."tenantId", c."projectId" FROM messages m JOIN conversations c ON m."conversationId" = c.id WHERE m.attachments IS NOT NULL AND m.attachments != '[]'::json ORDER BY m.id ASC LIMIT $batchSize OFFSET $offset`.
3. For each message, iterate its `attachments` array. For each attachment where `type === 'image'`:
   - **Skip** if the attachment already has an `assetId` field (idempotency).
   - Extract `storageKey` from `attachment.key` (preferred) or parse from `attachment.url`.
   - Insert into `media_assets`: `INSERT INTO media_assets ("tenantId", "userId", "projectId", "conversationId", "messageId", "sourceType", status, "storageKey", "originalUrl", "thumbnailUrl", "mimeType", "createdAt", "updatedAt") VALUES (...) RETURNING id`.
   - Update the attachment JSON in-place with the returned `assetId`.
4. After processing all attachments for a message, write the updated `attachments` JSON back: `UPDATE messages SET attachments = $1 WHERE id = $2`.
5. Log progress every batch: `"Batch N: processed M messages (total: T assets created)"`.
6. If `BACKFILL_DISPATCH_VISION=true`, for each newly created asset, send an HTTP POST to the Python backend at `http://localhost:8000/api/v1/vision/analyze` with `x-proxy-token` auth. Include a system flag to skip credit deduction (backfill is system cost).
7. After all batches complete, print summary: total messages scanned, total assets created, total skipped (already had assetId).

**Credit handling**: Backfill does NOT deduct user credits. When `BACKFILL_DISPATCH_VISION=true`, the vision analysis request includes `"systemCost": true` in the payload body. The Python endpoint checks this flag and skips credit deduction for system-initiated backfill. This prevents surprising users with unexpected charges.

**Error handling**: If an individual message fails (e.g., malformed JSON), log the error with the message ID and continue to the next message. Do not abort the entire batch.

### 2. HNSW Index Creation Script

**File**: `/home/dev/projects/SmartSpecPro/apps/web/scripts/create-hnsw-index.ts`

This is a separate script run **after** the backfill completes. Creating the HNSW index during bulk inserts is significantly slower due to index maintenance overhead. Running it post-backfill is faster and avoids table locks.

**Execution**: `cd /home/dev/projects/SmartSpecPro/apps/web && npx tsx scripts/create-hnsw-index.ts`

**SQL executed**:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_multimodal_memory_vectors_embedding
  ON multimodal_memory_vectors
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
```

Key points:
- `CONCURRENTLY` ensures the table remains writable during index creation.
- `IF NOT EXISTS` makes the script idempotent -- safe to run multiple times.
- `m = 16` and `ef_construction = 128` are tuned for the expected scale (<10K images/month). These parameters balance recall quality vs. index build time.
- The script should log timing: `"HNSW index created in X seconds"`.

Note: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. The script must ensure it does not wrap this statement in `BEGIN/COMMIT`.

### 3. End-to-End Integration Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/multimodalMemoryIntegration.test.ts`

These tests mock the database and external APIs (Gemini, S3) but exercise the real service-to-service call chains. They verify that:

- The ingestion hook in `chat.ts` correctly calls `mediaAssetService`, `visualStateService`, and dispatches to Python.
- The analysis callback flow updates status and creates memory items.
- The retrieval service finds images through both explicit reference resolution and vector similarity.
- The context packer correctly formats images for vision-capable vs text-only models.
- NSFW images are blocked at the right stage.
- Deletion cascades through all related tables.
- The feature flag gates all new code paths.
- Tenant isolation is enforced end-to-end.

**Mocking strategy**:
- **Database**: Use `vi.mock()` to mock Drizzle queries. Return realistic data structures matching the schema.
- **Redis**: Mock the Redis client for visual state caching.
- **HTTP calls to Python**: Mock `fetch` or the HTTP client used to call `/api/v1/vision/analyze`.
- **S3 signed URLs**: Mock `generateSignedUrl` to return deterministic test URLs.
- **Gemini API**: Mock the embedding provider and LLM resolver to return controlled responses.
- **Credit service**: Mock `deductCredits` and `checkCredits` to verify they are called with correct parameters.

**Python-side integration tests** (`/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_vision_pipeline.py`) use pytest with `AsyncMock` for the Gemini client and SQLAlchemy test sessions for database verification.

### 4. Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/scripts/backfill-media-assets.ts` | **Create** | Backfill existing image attachments into `media_assets` |
| `apps/web/scripts/create-hnsw-index.ts` | **Create** | Post-backfill HNSW index creation |
| `apps/web/scripts/__tests__/backfill-media-assets.test.ts` | **Create** | Backfill script unit tests |
| `apps/web/scripts/__tests__/create-hnsw-index.test.ts` | **Create** | HNSW index script unit tests |
| `apps/web/server/services/__tests__/multimodalMemoryIntegration.test.ts` | **Create** | E2E integration tests (Node.js side) |
| `python-backend/tests/integration/test_vision_pipeline.py` | **Create** | E2E integration tests (Python side) |

### 5. Operational Runbook

The backfill and index creation should be executed in this order:

1. Verify all prior sections are deployed and the feature flag `MULTIMODAL_MEMORY_ENABLED` is configured (can be off -- the backfill script works independently of the flag for asset creation).
2. Run the backfill script in dry-run mode first: `BACKFILL_DRY_RUN=true npx tsx scripts/backfill-media-assets.ts`.
3. Review the dry-run output. Confirm the number of messages and attachments looks correct.
4. Run the backfill for real: `npx tsx scripts/backfill-media-assets.ts`.
5. Optionally, if vision analysis is desired for historical images: `BACKFILL_DISPATCH_VISION=true npx tsx scripts/backfill-media-assets.ts`. This will queue Celery tasks and may take time depending on image count. Rate-limit by adding a delay between dispatches (e.g., 200ms between each HTTP call).
6. After backfill completes, run the HNSW index script: `npx tsx scripts/create-hnsw-index.ts`.
7. Verify the index was created: `psql "$DATABASE_URL" -c "\di idx_multimodal_memory_vectors_embedding"`.
8. Enable the feature flag for test tenants and verify the full pipeline works end-to-end.
9. Run the integration test suite: `cd apps/web && pnpm test server/services/__tests__/multimodalMemoryIntegration.test.ts` and `cd python-backend && pytest tests/integration/test_vision_pipeline.py -v`.

### 6. Observability and Monitoring

After deploying the multimodal memory feature, the following observability measures should be in place to monitor production health. These are not separate files to create — they are structured logging patterns and audit queries that should be included in the services implemented in prior sections.

#### Structured Log Events

All multimodal memory services should emit structured log events using the existing `logger.*` pattern. Key events:

| Event | Service | Log Level | Fields |
|-------|---------|-----------|--------|
| `multimodal_upload` | `chat.ts` (ingestion hook) | `info` | `assetId`, `conversationId`, `tenantId`, `mimeType`, `fileSize` |
| `vision_analysis_start` | `vision_tasks.py` | `info` | `assetId`, `tenantId`, `provider`, `model` |
| `vision_analysis_complete` | `vision_tasks.py` | `info` | `assetId`, `tenantId`, `durationMs`, `objectCount`, `aestheticScore` |
| `vision_analysis_failed` | `vision_tasks.py` | `error` | `assetId`, `tenantId`, `error`, `retryCount` |
| `nsfw_blocked` | `vision_tasks.py` / `visionMemoryService.ts` | `warn` | `assetId`, `tenantId`, `categories[]` |
| `embedding_generated` | `vision_tasks.py` | `info` | `assetId`, `provider`, `model`, `dimension`, `durationMs` |
| `reference_resolved` | `multimodalRetrievalService.ts` | `info` | `conversationId`, `resolvedCount`, `durationMs`, `model` |
| `retrieval_hit` | `multimodalRetrievalService.ts` | `info` | `conversationId`, `queryLength`, `resultCount`, `topScore`, `durationMs` |
| `memory_deleted` | `visionMemoryService.ts` | `info` | `assetId`, `tenantId`, `deletedItemCount` |
| `memory_pinned` | `visionMemoryService.ts` | `info` | `assetId`, `tenantId` |

**Rules**: Never log image URLs, file paths, or user content in production logs. Log only IDs, counts, scores, and durations.

#### Audit Queries for Cost Monitoring

Use the existing `provider_usage_log` table to monitor multimodal memory costs:

```sql
-- Daily vision analysis cost by tenant
SELECT "tenantId", DATE("createdAt") as day,
  COUNT(*) as analysis_count,
  SUM("costUsd") as total_cost
FROM provider_usage_log
WHERE "requestType" IN ('vision_analysis', 'embedding_generation', 'reference_resolution')
  AND "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY "tenantId", DATE("createdAt")
ORDER BY total_cost DESC;

-- Vision analysis failure rate
SELECT DATE("createdAt") as day,
  COUNT(*) FILTER (WHERE status = 'analyzed') as success,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'nsfw_blocked') as blocked,
  ROUND(COUNT(*) FILTER (WHERE status = 'failed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as failure_pct
FROM media_assets
WHERE "createdAt" > NOW() - INTERVAL '7 days'
  AND status != 'pending'
GROUP BY DATE("createdAt")
ORDER BY day DESC;

-- Average vision analysis latency (from provider_usage_log timing)
SELECT DATE("createdAt") as day,
  ROUND(AVG(("timing"->>'totalMs')::numeric), 0) as avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ("timing"->>'totalMs')::numeric), 0) as p95_latency_ms
FROM provider_usage_log
WHERE "requestType" = 'vision_analysis'
  AND "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY DATE("createdAt")
ORDER BY day DESC;
```

#### Health Check Criteria

After enabling the feature flag for a tenant, verify these health indicators:

| Metric | Healthy Range | Alert If |
|--------|--------------|----------|
| Vision analysis success rate | > 95% | Below 90% for 1 hour |
| Vision analysis P95 latency | < 8 seconds | Above 15 seconds |
| Embedding generation success rate | > 98% | Below 95% |
| Reference resolution P95 latency | < 200ms | Above 500ms |
| NSFW block rate | < 5% (expected) | Above 20% (may indicate spam) |
| Daily per-tenant image count | < 500 (expected) | Above 1000 (review credit policy) |

These thresholds are guidelines for initial monitoring. Adjust based on real usage patterns after rollout.