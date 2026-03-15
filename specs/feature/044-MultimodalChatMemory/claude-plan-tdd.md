# TDD Plan: Feature 044 — Multimodal Chat Memory

Mirrors `claude-plan.md` structure. Each section lists test stubs to write BEFORE implementing.

**Testing frameworks**: Vitest (TypeScript), pytest (Python)
**Conventions**: `vi.mock()` for Redis/DB, `describe/it/expect`, `@pytest.mark.asyncio`, 80% coverage minimum (Python)

---

## 3. Database Schema

### Tests (Vitest)

```typescript
// Test: media_assets table exists after migration
// Test: media_asset_analysis cascades on media_assets delete
// Test: multimodal_memory_items cascades on media_assets delete
// Test: multimodal_memory_vectors cascades on multimodal_memory_items delete
// Test: conversation_visual_state cascades on conversations delete
// Test: multimodal_memory_links cascades on both from/to memory item delete
// Test: messages.attachments accepts assetId field (backward compatible)
// Test: messages.attachments without assetId still works
// Test: media_assets.status defaults to 'pending'
// Test: checksumSha256 index enables efficient dedup lookup
```

---

## 4. Service Layer

### 4.1 `mediaAssetService.ts`

```typescript
// Test: createAssetFromAttachment creates media_assets row with correct fields
// Test: createAssetFromAttachment returns existing assetId when checksumSha256 matches (idempotency)
// Test: createAssetFromAttachment sets status to 'pending'
// Test: fetchAsset returns asset with signed URL
// Test: fetchAsset rejects request with wrong tenantId (tenant isolation)
// Test: generateSignedUrl returns time-limited URL with 1h expiry
// Test: computePerceptualHash returns consistent hash for same image
// Test: findSimilarAssets returns matches below Hamming distance threshold
// Test: deleteAsset cascades to analysis, memory items, vectors
// Test: deleteAsset rejects when userId/tenantId don't match
// Test: image validation rejects SVG, HEIC formats
// Test: image validation rejects files > 20MB
// Test: image validation passes JPEG, PNG, WebP, GIF
```

### 4.2 `visionMemoryService.ts`

```typescript
// Test: analyzeImage dispatches Celery task via Python API
// Test: analyzeImage updates status to 'analyzing'
// Test: checkSafety returns blocked:true when safetyLabels contain NSFW
// Test: checkSafety returns blocked:false for clean analysis
// Test: buildSearchableText concatenates caption + tags + objects + materials + colors
// Test: buildSearchableText handles empty/null fields gracefully
// Test: createMemoryItemFromAsset creates multimodal_memory_items row
// Test: createMemoryItemFromAsset skips when NSFW blocked
// Test: updateSalience caps at 0.0 and 1.0
// Test: updateSalience increments access_count
// Test: deleteFromMemory removes memory item + vector + links
// Test: deleteFromMemory removes asset from conversation visual state
```

### 4.2b Python Vision Task (pytest)

```python
# Test: analyze_image_task calls Gemini Flash with correct prompt structure
# Test: analyze_image_task stores result in media_asset_analysis
# Test: analyze_image_task updates media_assets.status to 'analyzed'
# Test: analyze_image_task updates status to 'nsfw_blocked' when safety labels detected
# Test: analyze_image_task updates status to 'failed' on Gemini API error
# Test: analyze_image_task is idempotent — skips if analysis already exists
# Test: analyze_image_task retries 3 times with exponential backoff on transient failure
# Test: analyze_image_task deducts user credits via credit tracking
# Test: analyze_image_task requires x-proxy-token authentication
# Test: analyze_image_task rejects request without valid auth token
```

### 4.3 `multimodalEmbeddingProvider.ts`

```typescript
// Test: GeminiEmbeddingProvider.embedImage returns 768-dim vector
// Test: GeminiEmbeddingProvider.embedText returns 768-dim vector
// Test: GeminiEmbeddingProvider handles API errors gracefully
// Test: CloudflareFallbackProvider.embedImage calls LLaVA then text embedding
// Test: CloudflareFallbackProvider.embedText returns 768-dim vector
// Test: provider selection defaults to Gemini when API key configured
// Test: provider selection falls back to Cloudflare when Gemini unavailable
// Test: getDimension returns 768 for both providers
```

### 4.4 `multimodalRetrievalService.ts`

```typescript
// Test: resolveVisualReferences returns empty array when no image keywords in message
// Test: resolveVisualReferences calls LLM with recent image metadata
// Test: resolveVisualReferences resolves "รูปก่อนหน้า" to last uploaded image
// Test: resolveVisualReferences resolves "3 รูปล่าสุด" to last 3 images
// Test: resolveVisualReferences resolves cross-session reference within same project
// Test: resolveVisualReferences returns empty array for conversation with no images
// Test: retrieveRelevantAssets applies explicit reference weight 0.35
// Test: retrieveRelevantAssets bypasses vector search when explicit references found
// Test: retrieveRelevantAssets includes vector similarity for semantic queries
// Test: retrieveRelevantAssets filters by tenantId (isolation)
// Test: retrieveRelevantAssets filters vectors by current active provider
// Test: buildImageContext includes signed URLs for vision-capable models
// Test: buildImageContext includes text descriptions for text-only models
// Test: buildImageContext caps at 5 images maximum
// Test: buildImageContext produces memory cards when over budget
// Test: memory card format includes assetId, label, summary, tags
```

### 4.5 `visualStateService.ts`

```typescript
// Test: getOrCreateState returns empty state for new conversation
// Test: getOrCreateState returns existing state for known conversation
// Test: addRecentAsset appends to recentAssetIds
// Test: addRecentAsset evicts oldest when list exceeds 12
// Test: addRecentAsset handles concurrent calls (no lost update)
// Test: setActiveAssets caps at 5 items
// Test: setComparedAssets updates compared list
// Test: createNamedSet stores in namedSets JSON
// Test: resolveNamedSet retrieves correct asset IDs
// Test: removeAssetFromState removes from all lists (recent, active, compared)
```

---

## 5. Integration with `buildChatContext()`

```typescript
// Test: ChatContext interface includes visualMemoryContext and imageAssets fields
// Test: buildChatContext returns original budget allocation when no visual context
// Test: buildChatContext allocates 15% to visual when images exist
// Test: buildChatContext calls resolveVisualReferences with user message
// Test: buildChatContext includes imageAssets for vision-capable models
// Test: buildChatContext includes visualMemoryContext for text-only models
// Test: buildChatContext adds image-aware system instructions when visual context present
// Test: buildChatContext does NOT add image instructions when no visual context
// Test: contextToMessages handles string content (backward compatible)
// Test: contextToMessages handles content parts array with image_url blocks
// Test: getTextContent helper extracts text from both string and parts array
```

---

## 6. Ingestion Pipeline Integration

```typescript
// Test: message creation with image attachment creates media_assets row
// Test: message creation updates attachment JSON with assetId
// Test: message creation calls addRecentAsset on visual state
// Test: message creation dispatches vision analysis to Python backend
// Test: message creation is gated by MULTIMODAL_MEMORY_ENABLED feature flag
// Test: message creation without images does not trigger asset pipeline
// Test: backfill script processes existing attachments in batches of 100
// Test: backfill script does not charge user credits
// Test: backfill script skips already-processed attachments (idempotent)
```

---

## 7. Reference Resolution Detail

```typescript
// Test: LLM resolver prompt includes user message and recent image metadata
// Test: LLM resolver prompt includes position and timestamp for each image
// Test: LLM resolver returns parsed JSON array of assetIds with confidence
// Test: LLM resolver handles Thai ordinal references (รูปแรก, รูปที่สอง)
// Test: LLM resolver handles Thai recency references (ล่าสุด, ก่อนหน้า)
// Test: LLM resolver handles English references (first, latest, previous)
// Test: keyword pre-filter skips LLM call when no image keywords present
// Test: keyword pre-filter catches: รูป, ภาพ, image, photo, picture
// Test: Redis cache for visual state has 30-second TTL
```

---

## 8. Credit Tracking

```typescript
// Test: vision analysis records cost in provider_usage_log
// Test: embedding generation records cost in provider_usage_log
// Test: reference resolution records cost in provider_usage_log
// Test: credit check blocks analysis when user has insufficient credits
// Test: credit multiplier ~0.5x per image total
```

---

## 9. Safety & Security

```typescript
// Test: NSFW image does not create multimodal_memory_items
// Test: NSFW image does not create multimodal_memory_vectors
// Test: NSFW image still saved as normal attachment
// Test: media_assets.status set to 'nsfw_blocked' for NSFW images
// Test: tenant isolation — user A cannot fetch user B's assets
// Test: project isolation — assets scoped to project in cross-session search
// Test: signed URLs expire after 1 hour
// Test: OCR text passes through piiFilter before storage
```

---

## 10. User Controls

```typescript
// Test: delete mutation removes memory item, vectors, and links
// Test: delete mutation removes asset from visual state lists
// Test: delete mutation requires matching userId and tenantId
// Test: pin mutation sets salience to 1.0
// Test: chat command "ลบรูปนี้ออกจาก memory" triggers deletion via resolver
```

---

## 11. Chat UI — Expandable Image Gallery (Phase 2)

```typescript
// Test: ImageGalleryPanel renders thumbnails for referenced images
// Test: ImageGalleryPanel expands to full-size on click
// Test: ImageGalleryPanel shows caption and tags
// Test: ImageGalleryPanel includes "Remove from memory" button
// Test: VisualContextBadge shows correct image count
// Test: VisualContextBadge hidden when no images in context
// Test: image chips render inline in assistant message
```

---

## 12. Feature Flag Gating

```typescript
// Test: MULTIMODAL_MEMORY_ENABLED flag exists in featureFlags.ts
// Test: flag is tenant-scoped (different tenants can have different settings)
// Test: upload hook skips asset creation when flag is off
// Test: buildChatContext skips visual assembly when flag is off
// Test: retrieval service returns empty when flag is off
```

```python
# Test: Python vision endpoint rejects request when flag is off
# Test: Python vision endpoint accepts request when flag is on
```
