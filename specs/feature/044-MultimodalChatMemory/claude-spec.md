# Synthesized Specification: Feature 044 — Multimodal Chat Memory

## Executive Summary

Extend SmartSpecPro's chat memory system so that images become first-class memory objects — analyzed, embedded, searchable, and recalled across messages and sessions. The current system stores image attachments but strips them from LLM context; this feature closes that gap.

---

## 1. Problem

The three-tier memory system (`memoryService.ts`) is text-only:

- **Buffer**: Returns only `m.content` (text) — attachment data is stripped
- **Summary**: LLM-generated text summaries — image context is lost
- **Entity**: Text-only keyword facts — cannot store visual references

`buildChatContext()` at `memoryService.ts:670` assembles `systemPrompt + entityContext + summaryContext + bufferMessages` — no visual data. Users who upload images and ask "เอา 4 รูปล่าสุด เลือกอันที่ดู modern ที่สุด" get no meaningful response because the model has zero visual context.

## 2. Solution Architecture

### 2.1 Canonical Media Asset Registry

Normalize all image attachments into a `media_assets` table with stable `assetId`, file metadata, perceptual hash for dedup. Backward-compatible: existing `messages.attachments` JSON augmented with optional `assetId` field.

### 2.2 Vision Enrichment Pipeline

**Provider**: Gemini 2.5 Flash (best cost/quality at ~$0.0003/image)
**Timing**: Async Celery task immediately after upload
**Safety**: NSFW images blocked from visual memory entirely (flagged, not stored in memory system)
**Output**: Structured JSON — shortCaption, detailedCaption, ocrText, objects, styles, materials, colors, architectureTags, aestheticScore, safetyFlags
**Fallback**: Cloudflare LLaVA for basic description if Gemini unavailable

### 2.3 Multimodal Embedding & Retrieval

**Primary**: `gemini-embedding-2-preview` at **768 dimensions** (Google's recommended sweet spot for quality/storage)
**Fallback**: Cloudflare bge-base-en-v1.5 (768-dim text) + LLaVA image→text→embed
**Storage**: pgvector with HNSW index — single table (sufficient for <10K images/month)
  - HNSW config: `m=16, ef_construction=128, ef_search=100`
  - halfvec quantization for 50% storage savings at <1% recall loss
  - Tenant isolation via `WHERE tenant_id = ?` in queries

**Retrieval ranking formula:**
```
final_score =
  0.35 × explicit_reference_score +
  0.25 × vector_similarity_score +
  0.20 × recency_score +
  0.10 × metadata_match_score +
  0.05 × project_scope_score +
  0.05 × salience_score
```

### 2.4 Natural Language Image Reference Resolution

**Method**: LLM-based resolver — send reference text + recent images metadata to LLM to determine which images the user means. Supports Thai and English natural language references (ordinal, recency, semantic, cross-session, set references).

### 2.5 Visual Working Set

Per-conversation state tracking:
- `recent_asset_ids` — last 12 images (FIFO)
- `active_asset_ids` — currently discussed (max 5)
- `compared_asset_ids` — in active comparison
- `named_sets` — user-created groups

### 2.6 Context Packing Extension

Extended `ChatContext` interface adds `visualMemoryContext` (text) and `imageAssets` (actual images).

**LLM input mode**: Adaptive per model capability
- Vision-capable models (Gemini, GPT-4o, Claude 3) → send actual image URLs
- Text-only models → send text descriptions/memory cards

**Budget allocation**: Images count against a separate image slot budget (max 5 per request), not text token budget. Visual memory context gets 15% of text budget.

### 2.7 Cross-Session Memory

**Scope**: Project-scoped — images accessible across conversations within the same project (matching existing entity memory behavior).

### 2.8 User Controls

- **Deletion**: Users can remove images from visual memory via UI button or chat command ("ลบรูปนี้ออกจาก memory") — deletes embeddings + metadata
- **Pin to memory**: Action on image messages to explicitly mark as important

### 2.9 Credit Consumption

Vision analysis + embedding deducted from user credits at ~0.5x multiplier per image, tracked via existing `creditService.ts` and `provider_usage_log`.

### 2.10 Chat UI

**Expandable image gallery**: When LLM references past images, display as an expandable gallery panel on the side. Badge showing number of images in current visual context. Mini preview chips when assistant cites specific images.

## 3. Data Model

### New Tables

1. **`media_assets`** — Canonical registry for uploaded images (storage_key, dimensions, checksums, perceptual hash)
2. **`media_asset_analysis`** — Vision enrichment results (captions, tags, objects, safety labels)
3. **`multimodal_memory_items`** — Retrievable memory entries bridging images and text (searchable_text, salience, confidence)
4. **`multimodal_memory_vectors`** — pgvector embeddings (768-dim, HNSW indexed)
5. **`conversation_visual_state`** — Per-conversation working set (recent, active, compared, named sets)
6. **`multimodal_memory_links`** — Relationships between memory items (same_topic, derived_from, generated_from)

### Schema Changes

- `messages.attachments` JSON: add optional `assetId?: number` field (backward compatible)
- Requires `pgvector` extension: `CREATE EXTENSION IF NOT EXISTS vector;`

## 4. New Services

| Service | Responsibility |
|---------|---------------|
| `mediaAssetService.ts` | Asset CRUD, signed URLs, perceptual hashing, dedup |
| `visionMemoryService.ts` | Vision analysis dispatch, searchable text building, memory item creation |
| `multimodalRetrievalService.ts` | Reference resolution, hybrid retrieval, reranking, context packing |
| `visualStateService.ts` | Working set management (recent/active/compared/named) |
| `multimodalEmbeddingProvider.ts` | Abstract embedding interface — Gemini primary, Cloudflare fallback |

## 5. Ingestion Pipeline

```
User uploads image(s) in chat
  ├─ 1. Store file (existing S3/R2 upload)
  ├─ 2. Create media_assets row
  ├─ 3. Add assetId to messages.attachments JSON
  ├─ 4. Update conversation_visual_state.recent_asset_ids
  └─ Async (Celery):
      ├─ 5. Safety check → if NSFW, flag and skip memory
      ├─ 6. Vision enrichment → media_asset_analysis
      ├─ 7. Generate embedding → multimodal_memory_vectors
      ├─ 8. Create multimodal_memory_items
      └─ 9. Deduct user credits (vision + embedding)
```

## 6. Integration Points

### `buildChatContext()` (memoryService.ts:670)

After step 4 (buffer messages), add Step 4.5: Visual Memory Assembly:
1. Resolve explicit image references from current user message (LLM-based)
2. Get conversation_visual_state.active_asset_ids
3. Fetch assets + captions for resolved references
4. If model supports vision → include as imageAssets (actual URLs)
5. If text-only model → include as text descriptions in visualMemoryContext
6. If over budget → compress to memory cards

### `contextToMessages()` (memoryService.ts:842)

Extend to include image content blocks for multimodal models.

### Chat router (chat.ts:865)

After `buildChatContext()`, format image assets as multimodal message content for the LLM API.

## 7. Security & Privacy

- Signed URLs with max 1-hour expiry for all image access
- Tenant + user + project isolation on every vector query
- OCR text passed through existing `piiFilter.ts` before storage
- NSFW images blocked from memory system entirely
- Cross-tenant access blocked at service layer
- Embedding costs tracked in `provider_usage_log`

## 8. Performance Targets

| Metric | Target |
|--------|--------|
| Vision analysis (async) | 3-8 seconds |
| Embedding generation (async) | 2-5 seconds |
| Reference resolution (ordinal/recency) | < 150ms |
| Vector retrieval | < 500ms |
| Context packing overhead | < 100ms |
| Working set update | < 50ms |

## 9. Phased Rollout

### Phase 0 — Foundation
- New tables (media_assets, media_asset_analysis, conversation_visual_state)
- Normalize new uploads → media_assets
- Backfill existing attachments

### Phase 1 — Recall & Discuss (MVP)
- Vision enrichment pipeline (async Celery)
- Multimodal embedding generation (Gemini Embedding 2)
- Visual reference resolution (LLM-based)
- Extend `buildChatContext()` with adaptive image input
- Visual state management
- NSFW filtering (block from memory)
- Credit deduction for vision + embedding
- User deletion (UI + chat command)

### Phase 2 — Cross-Session & Compare
- Project-scoped retrieval across conversations
- Semantic search ("รูปบ้าน modern")
- Named sets
- Expandable image gallery UI

### Phase 3 — Multi-Reference Generation
- Composition brief pipeline
- `generated_from` lineage links
- Reference image forwarding to generation providers

## 10. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding model | gemini-embedding-2-preview @ 768-dim | Unified multimodal space, Google-recommended sweet spot |
| Embedding fallback | Cloudflare bge-base + LLaVA | Already deployed, 768-dim compatible |
| Vision model | Gemini 2.5 Flash | Best cost/quality ($0.0003/image) |
| Vector storage | pgvector HNSW single table | Co-located with metadata, sufficient for <10K/month |
| Reference resolution | LLM-based | Handles Thai + English, ambiguous references |
| Cross-session scope | Project-scoped | Matches existing entity memory pattern |
| LLM input mode | Adaptive per model capability | Send images to vision models, text to others |
| NSFW handling | Block from memory | NSFW images not stored in visual memory |
| Cost model | User credits @ 0.5x/image | Uses existing creditService.ts |
| Chat UI | Expandable gallery panel | Rich display when LLM references past images |
| Deletion | UI button + chat command | User control over memory |

## 11. Success Criteria

1. Upload 5 images → "เอา 4 รูปล่าสุด เลือกอันที่ดู modern ที่สุด" → grounded comparison using actual images
2. New chat in same project → "รูปบ้านที่ส่งไปเมื่อวาน" → correct retrieval from project memory
3. "เอารูปก่อนหน้าทั้ง 3 รูปรวมกัน สร้างรูปใหม่" → 3 reference images sent to generator
4. System explains visual differences citing evidence from analysis
5. Never hallucinates image descriptions without asset reference
6. All operations respect tenant/user/project scope isolation
7. NSFW images never enter visual memory
8. User can delete images from memory via UI or chat command

## 12. Existing Infrastructure to Leverage

| Component | File | What It Provides |
|-----------|------|-----------------|
| Vector provider abstraction | `vectorProvider.ts` | Multi-provider support (Cloudflare, pgvector, ChromaDB) |
| Text embedding | `vectorize.ts` | Cloudflare 768-dim text embedding |
| Image description | `vectorize.ts` | LLaVA image→text |
| Semantic search | `vectorize-search.ts` | Tenant-isolated search with min relevance 0.5 |
| Credit tracking | `creditService.ts` | Per-user credit deduction and logging |
| PII filter | `piiFilter.ts` | Text redaction for OCR output |
| Celery tasks | `python-backend/app/tasks/` | Async task infrastructure |
| S3/R2 storage | Existing upload flow | File storage with signed URLs |
| Entity memory | `memoryService.ts` | Project-scoped cross-session memory pattern |

## 13. Constraints

- No breaking changes to `messages.attachments` JSON
- All new tables are additive — no mandatory migration of existing tables
- Conversations without images work exactly as before
- Vision analysis is async — chat response not blocked
- Maximum 5 images per LLM request
- pgvector extension required
