# Feature 044: Multimodal Chat Memory — Image Memory That Actually Remembers

## Overview

Extend SmartSpecPro's chat memory system to treat images as first-class memory objects — not just file attachments. The system must remember uploaded images across messages and sessions, understand their visual content, resolve natural-language image references ("รูปก่อนหน้า", "3 รูปล่าสุด", "รูปบ้านสีขาว"), and feed both text summaries and actual image data back into the LLM as grounded multimodal context.

## Problem Statement

The current memory system is **text-only**:

| Layer | Current Behavior | Limitation |
|-------|-----------------|------------|
| `messages.attachments` | Stores image URLs as flat JSON array | No canonical registry, no analysis, no searchability |
| `buildChatContext()` | Packs only `systemPrompt + entityContext + summaryContext + bufferMessages` | **Images are never sent back to the model** |
| `conversation_summaries` | LLM-generated text summaries | Image context is lost during summarization |
| `entity_memories` | Text-only facts (keyword extraction) | Cannot store visual facts or image references |
| Buffer messages | Returns only `m.content` (text) | Attachment data is stripped from context |

**Result**: The system "knows it has images" but cannot "remember what they look like" or "recall them when asked." A user who uploads 5 house photos and says "เอา 4 รูปล่าสุด เลือกอันที่ดู modern ที่สุด" gets no meaningful response because the model has no visual context.

## Goals

### 1. Canonical Media Asset Registry

Normalize all image attachments into a `media_assets` table with:
- Stable `assetId` for cross-reference
- File metadata (mime, dimensions, size, checksums)
- Perceptual hash for near-duplicate detection
- Backward-compatible: existing `messages.attachments` JSON still works, augmented with `assetId`

### 2. Vision Enrichment Pipeline

Automatically analyze every uploaded image to extract:
- Short caption (1 sentence)
- Detailed caption (2-3 sentences with composition, style, materials)
- OCR text
- Structured tags: objects, styles, materials, colors, architecture, room types
- Optional aesthetic/quality score
- Safety labels

### 3. Multimodal Embedding & Retrieval

Generate vector embeddings for both images and their text descriptions using a unified multimodal embedding model (Gemini Embedding or equivalent). Enable:
- **Text → Image retrieval**: "รูปบ้าน modern" finds modern house images
- **Image → Text retrieval**: An uploaded image finds related text memories
- **Hybrid ranking**: Combine explicit references, recency, vector similarity, metadata match

### 4. Visual Working Set

Maintain a per-conversation "visual working set" of actively-discussed images (max 5):
- `recent_asset_ids` — last 12 images uploaded/referenced
- `active_asset_ids` — currently being discussed (max 5)
- `compared_asset_ids` — images in active comparison
- `named_sets` — user-created groups ("3 รูปบ้าน modern")

### 5. Natural Language Image Reference Resolution

Resolve Thai and English image references without requiring explicit IDs:

| Reference Type | Examples |
|---------------|----------|
| Ordinal | "รูปแรก", "รูปที่สอง", "the third image" |
| Recency | "รูปก่อนหน้า", "รูปล่าสุด", "รูปที่เพิ่งส่ง" |
| Semantic | "รูปบ้านสีขาว", "รูปที่ดูหรู", "the modern one" |
| Cross-session | "รูปที่คุยกันเมื่อวาน", "รูปจากแชทก่อนหน้า" |
| Set | "ทั้ง 3 รูปก่อนหน้า", "กลุ่มรูปที่เทียบกัน" |

### 6. Multimodal Context Packing

Extend `buildChatContext()` to include visual context:
- Actual image references (signed URLs or base64) for multimodal models
- Memory cards (compressed text summaries) for images that exceed context limits
- Image-aware system instructions for grounded responses

### 7. Multi-Reference Image Generation

When a user says "เอารูปก่อนหน้าทั้ง 3 รูปรวมกัน แล้วสร้างรูปใหม่ให้ทีI":
- Resolve referenced images
- Extract composition notes from each
- Build a composition brief
- Send reference images + brief to image generation pipeline
- Track `generated_from` lineage links

## Existing Code to Build On

### Memory System
- `apps/web/server/services/memoryService.ts` — Three-tier memory (buffer/summary/entity), `buildChatContext()` at line 670, `ChatContext` interface at line 658
- `apps/web/server/services/chatService.ts` — `buildChatContext()` wrapper at line 655 (simpler version)
- `apps/web/server/routers/memory.ts` — tRPC router for memory operations
- `apps/web/server/routers/chat.ts:865` — calls `buildChatContext()` for LLM requests

### Attachment Handling
- `apps/web/drizzle/schema.ts:1372-1380` — `messages.attachments` JSON column (type, url, key, name, size, mimeType, thumbnail)
- Chat router handles file uploads and stores URLs in attachments array

### Vector Infrastructure (Already Built)
- `apps/web/server/services/vectorProvider.ts` — Provider abstraction (Cloudflare Vectorize, pgvector, ChromaDB)
- `apps/web/server/services/vectorize.ts` — Cloudflare Workers AI: text embedding (768-dim bge-base-en-v1.5) + image description (LLaVA)
- `apps/web/server/services/vectorize-search.ts` — Semantic search with tenant isolation, existing `images-index`
- `apps/web/server/services/vectorize-indexing.ts` — Index upsert/delete operations

### Embedding Service (Python, Built but Not Integrated)
- `python-backend/app/services/embedding_service.py` — EmbeddingService with ChromaDB + OpenAI providers

### LLM Providers with Vision
- Google Gemini (gemini-1.5-pro, gemini-1.5-flash) — multimodal, configured
- OpenAI GPT-4o — vision capable
- Anthropic Claude 3 — vision capable

### Schema
- `apps/web/drizzle/schema.ts:1432-1460` — `conversationSummaries` table
- `apps/web/drizzle/schema.ts:1466-1507` — `entityMemories` table (11 entity types, importance, PII filter)

## Data Model Changes

### New Table: `media_assets`

Canonical registry for all uploaded images/files.

```sql
CREATE TABLE media_assets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(36),
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id VARCHAR(100),
  conversation_id INTEGER REFERENCES conversations(id),
  message_id INTEGER REFERENCES messages(id),
  source_type VARCHAR(32) NOT NULL DEFAULT 'chat_attachment',
  -- Storage
  storage_key TEXT NOT NULL,
  original_url TEXT,
  thumbnail_url TEXT,
  mime_type VARCHAR(100) NOT NULL,
  width INTEGER,
  height INTEGER,
  file_size BIGINT,
  -- Dedup
  checksum_sha256 VARCHAR(64),
  perceptual_hash VARCHAR(128),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_assets_user ON media_assets(user_id);
CREATE INDEX idx_media_assets_conversation ON media_assets(conversation_id);
CREATE INDEX idx_media_assets_project ON media_assets(tenant_id, project_id);
```

### New Table: `media_asset_analysis`

Vision enrichment results per image.

```sql
CREATE TABLE media_asset_analysis (
  id BIGSERIAL PRIMARY KEY,
  media_asset_id BIGINT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(128) NOT NULL,
  short_caption TEXT,
  detailed_caption TEXT,
  ocr_text TEXT,
  objects JSONB DEFAULT '[]',
  styles JSONB DEFAULT '[]',
  materials JSONB DEFAULT '[]',
  colors JSONB DEFAULT '[]',
  rooms JSONB DEFAULT '[]',
  architecture_tags JSONB DEFAULT '[]',
  aesthetic_score NUMERIC(4,3),
  safety_labels JSONB DEFAULT '[]',
  extracted_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_analysis_asset ON media_asset_analysis(media_asset_id);
```

### New Table: `multimodal_memory_items`

Retrievable memory entries that bridge images and text.

```sql
CREATE TABLE multimodal_memory_items (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(36),
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id VARCHAR(100),
  conversation_id INTEGER REFERENCES conversations(id),
  message_id INTEGER,
  media_asset_id BIGINT REFERENCES media_assets(id) ON DELETE CASCADE,
  memory_kind VARCHAR(32) NOT NULL, -- 'image' | 'text' | 'image_text' | 'group'
  title TEXT,
  summary TEXT,
  searchable_text TEXT NOT NULL,
  source_role VARCHAR(16), -- 'user' | 'assistant' | 'system'
  salience NUMERIC(4,3) DEFAULT 0.500,
  confidence NUMERIC(4,3) DEFAULT 0.800,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mmemory_user_project ON multimodal_memory_items(user_id, project_id);
CREATE INDEX idx_mmemory_conversation ON multimodal_memory_items(conversation_id);
CREATE INDEX idx_mmemory_asset ON multimodal_memory_items(media_asset_id);
```

### New Table: `multimodal_memory_vectors`

Embedding vectors for multimodal retrieval.

```sql
CREATE TABLE multimodal_memory_vectors (
  id BIGSERIAL PRIMARY KEY,
  memory_item_id BIGINT NOT NULL REFERENCES multimodal_memory_items(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(128) NOT NULL,
  modality VARCHAR(16) NOT NULL, -- 'image' | 'text' | 'fused'
  embedding vector(3072),       -- dimension is config-driven
  embedding_version VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mmvec_item ON multimodal_memory_vectors(memory_item_id);
-- HNSW index for vector similarity search
CREATE INDEX idx_mmvec_embedding ON multimodal_memory_vectors
  USING hnsw (embedding vector_cosine_ops);
```

> Requires `pgvector` extension: `CREATE EXTENSION IF NOT EXISTS vector;`

### New Table: `conversation_visual_state`

Per-conversation working set of active images.

```sql
CREATE TABLE conversation_visual_state (
  conversation_id INTEGER PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  recent_asset_ids JSONB NOT NULL DEFAULT '[]',    -- last 12 images
  active_asset_ids JSONB NOT NULL DEFAULT '[]',    -- currently discussed (max 5)
  compared_asset_ids JSONB NOT NULL DEFAULT '[]',  -- in active comparison
  named_sets JSONB NOT NULL DEFAULT '{}',          -- user-created groups
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### New Table: `multimodal_memory_links`

Relationships between memory items (same topic, derived from, comparison set).

```sql
CREATE TABLE multimodal_memory_links (
  id BIGSERIAL PRIMARY KEY,
  from_memory_item_id BIGINT NOT NULL REFERENCES multimodal_memory_items(id) ON DELETE CASCADE,
  to_memory_item_id BIGINT NOT NULL REFERENCES multimodal_memory_items(id) ON DELETE CASCADE,
  relation_type VARCHAR(32) NOT NULL, -- 'same_topic' | 'derived_from' | 'generated_from' | 'comparison_set'
  weight NUMERIC(4,3) DEFAULT 1.000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Schema Change: `messages.attachments`

Add optional `assetId` field to existing attachment JSON (backward compatible):

```typescript
attachments: json("attachments").$type<Array<{
  type: "image" | "file" | "audio" | "video";
  url: string;
  key?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
  assetId?: number;  // ← NEW: link to media_assets
}>>().default([]),
```

## New Services

### `mediaAssetService.ts`
- `createAssetFromAttachment(attachment, context)` — Normalize attachment → `media_assets` row
- `fetchAsset(assetId)` — Get asset with signed URL
- `generateSignedUrl(storageKey)` — Time-limited access URL
- `computePerceptualHash(imageBuffer)` — For near-duplicate detection
- `findSimilarAssets(hash, threshold)` — Dedup check

### `visionMemoryService.ts`
- `analyzeImage(assetId)` — Call vision model → structured analysis → `media_asset_analysis`
- `buildSearchableText(analysis)` — Combine caption + tags + OCR into indexable text
- `createMemoryItemFromAsset(assetId, context)` — Asset + analysis → `multimodal_memory_items`
- `updateSalience(itemId, delta)` — Adjust importance based on user interaction

### `multimodalRetrievalService.ts`
- `resolveVisualReferences(userMessage, conversationId)` — Parse "รูปก่อนหน้า", "3 รูปล่าสุด" etc.
- `retrieveRelevantAssets(query, scope)` — Hybrid retrieval (explicit + recency + vector + metadata)
- `rerankCandidates(candidates, intent)` — Rerank by user intent (compare/select/edit/generate)
- `buildImageContext(assets, budget)` — Pack images + memory cards within token budget

### `visualStateService.ts`
- `addRecentAsset(conversationId, assetId)` — Push to recent list (FIFO, max 12)
- `setActiveAssets(conversationId, assetIds)` — Update active set (max 5)
- `setComparedAssets(conversationId, assetIds)` — Mark comparison set
- `createNamedSet(conversationId, name, assetIds)` — Save user-defined group
- `resolveNamedSet(conversationId, name)` — Retrieve named group

### `multimodalEmbeddingProvider.ts`

Abstract interface for embedding generation:

```typescript
interface MultimodalEmbeddingProvider {
  embedImage(input: { fileUrl: string }): Promise<number[]>;
  embedText(input: { text: string }): Promise<number[]>;
  embedMixed?(input: { text?: string; fileUrl?: string }): Promise<number[]>;
  getDimension(): number;
  getProviderName(): string;
  getModelName(): string;
}
```

Initial implementation: Gemini Embedding API (unified text+image space, 3072 dimensions).
Fallback: Cloudflare Workers AI text embedding + LLaVA description (existing infrastructure).

## Ingestion Pipeline

```
User uploads image(s) in chat
  │
  ├─ 1. Store file (existing S3/R2 upload)
  ├─ 2. Create media_assets row ← NEW
  ├─ 3. Add assetId to messages.attachments JSON ← NEW
  ├─ 4. Update conversation_visual_state.recent_asset_ids ← NEW
  │
  └─ Async (Celery/BullMQ):
      ├─ 5. Vision enrichment → media_asset_analysis ← NEW
      ├─ 6. Generate embeddings → multimodal_memory_vectors ← NEW
      └─ 7. Create multimodal_memory_items ← NEW
```

## Retrieval & Ranking

### Ranking Formula

```
final_score =
  0.35 × explicit_reference_score +   // "รูปแรก", "3 รูปล่าสุด"
  0.25 × vector_similarity_score +    // semantic match via embeddings
  0.20 × recency_score +              // newer = higher
  0.10 × metadata_match_score +       // tag/style/material match
  0.05 × project_scope_score +        // same project bonus
  0.05 × salience_score               // user-pinned or frequently accessed
```

When explicit references are detected (ordinal/recency keywords), `explicit_reference_score` dominates and bypasses vector search for speed.

### Memory Cards

When images exceed context budget, compress to text-only "memory cards":

```json
{
  "assetId": 1204,
  "label": "modern-white-house-01",
  "summary": "Modern minimalist two-story white house with flat roof and full-height glass.",
  "tags": ["modern", "minimalist", "glass facade"],
  "salientAttributes": ["flat roof", "white exterior", "wood accents", "luxury landscape"]
}
```

## Context Packing Changes

### Extended ChatContext Interface

```typescript
interface ChatContext {
  systemPrompt?: string;
  entityContext: string | null;
  summaryContext: string | null;
  visualMemoryContext: string | null;       // ← NEW: text summaries of visual memory
  imageAssets: Array<{                      // ← NEW: actual images for multimodal models
    assetId: number;
    fileUrl: string;
    caption?: string;
    role: 'memory' | 'current';
  }>;
  bufferMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  totalTokenEstimate: number;
}
```

### Context Budget Allocation

| Component | Budget Share | Notes |
|-----------|-------------|-------|
| System prompt + persona | Uncapped | Always included |
| Rules (entity_memories) | Uncapped | Always included |
| Entity context | 20% | Relevance-ranked |
| Visual memory context | 15% | Top-K images + memory cards |
| Summary context | 25% | Conversation summaries |
| Buffer messages | 40% | Recent messages (text only) |

Images count against a separate **image slot budget** (max 5 images per request) rather than text token budget.

### Image-Aware System Instructions

Add to system prompt when visual context is present:

```
When the user refers to images, use ONLY the provided image references and memory cards.
Do NOT claim to remember images that are not in your current context.
When comparing multiple images, cite specific visual differences from evidence.
When asked to create new images from references, summarize the composition elements from each reference.
```

## Integration with Existing Memory

### Keep Unchanged
- Buffer memory (20 recent text messages)
- Summary memory (text summaries of old conversations)
- Entity memory (text facts with PII filtering)

### Add Alongside
- Visual memory retrieval in `buildChatContext()`
- Image reference resolution before LLM call
- Visual state tracking after each message

### Integration Point in `buildChatContext()`

After step 4 (buffer messages), add:

```
Step 4.5: Visual Memory Assembly
  a. Resolve explicit image references from current user message
  b. Get conversation_visual_state.active_asset_ids
  c. If references found → fetch actual assets + captions
  d. If budget allows → include as imageAssets
  e. If over budget → compress to memory cards in visualMemoryContext
```

## Performance Requirements

| Metric | Target |
|--------|--------|
| Image analysis (async) | Complete within 3-8 seconds |
| Embedding generation (async) | Complete within 2-5 seconds |
| Visual reference resolution | < 150ms for recent/ordinal references |
| Vector retrieval | < 500ms (warm index) |
| Context packing overhead | < 100ms |
| Working set update | < 50ms |

## Reliability Rules

1. **Never hallucinate visual memory** — If no asset reference or memory card can be retrieved, respond honestly: "ฉันไม่พบรูปที่คุณอ้างถึง"
2. **Always prefer actual images over text summaries** — Send real images to multimodal models when budget allows
3. **Keep last 5 active images conversationally addressable** — Without requiring vector search
4. **Fallback gracefully** — If vision analysis fails, still create the memory item with basic metadata (filename, size, mime type)
5. **Project scope isolation** — Never return images from a different project/tenant

## Security & Privacy

- All image URLs must use time-limited signed URLs (max 1 hour expiry)
- Vector rows must include `tenant_id` + `user_id` filtering in every query
- OCR text must pass through PII redaction before storage (reuse existing `piiFilter.ts`)
- Safety labels from vision analysis must be checked before sending images to LLM context
- Cross-tenant image access is blocked at the service layer

## UI/UX Requirements (Phase 2)

### Chat UI
- Badge showing number of images in "current visual context"
- Mini preview chips when assistant references specific images
- "Pin to memory" action on image messages
- "Select these images" gesture for comparison/generation

### Memory Panel
- New "Visual Memory" tab alongside existing text memory
- Each item shows: thumbnail, short caption, tags, project scope, last accessed, pin state
- "Saved Sets" sub-tab for named image groups

## Rollout Plan

### Phase 0 — Foundation (Low Risk)
- Add new tables (`media_assets`, `media_asset_analysis`, `conversation_visual_state`)
- Normalize new uploads → `media_assets` (write path only)
- Backfill existing `messages.attachments` → `media_assets`
- No retrieval changes yet

### Phase 1 — Recall & Discuss (MVP)
- Vision enrichment pipeline (async)
- Multimodal embedding generation
- Visual reference resolution (ordinal + recency)
- Extend `buildChatContext()` with image assets
- `conversation_visual_state` management
- **Acceptance**: User uploads 5 images, asks about "4 รูปล่าสุด", system responds with actual images in context

### Phase 2 — Cross-Session & Compare
- Project-scoped visual retrieval
- Semantic image search ("รูปบ้าน modern")
- Named sets
- Compare/select UI
- **Acceptance**: User opens new chat in same project, asks "รูปบ้านที่ส่งเมื่อวาน", system retrieves from project memory

### Phase 3 — Multi-Reference Generation
- Composition brief pipeline
- `generated_from` lineage links
- Reference image forwarding to image generation providers
- **Acceptance**: User says "เอา 3 รูปก่อนหน้ารวมกัน สร้างรูปใหม่", system sends all 3 as references to generator

## Embedding Provider Decision

| Option | Dimension | Image Support | Status |
|--------|-----------|---------------|--------|
| **Gemini Embedding** | 3072 | Native image+text | Recommended — unified space |
| Cloudflare Workers AI | 768 | Text only (image→description→embed) | Existing infra, fallback |
| OpenAI text-embedding-3 | 1536-3072 | Text only | Available but not multimodal |

**Decision**: Use Gemini Embedding as primary (unified multimodal space). Fall back to Cloudflare text embedding + LLaVA description if Gemini is unavailable. Embedding dimension is config-driven in the schema, not hardcoded.

## Test Plan

### Unit Tests
- Reference resolver: "รูปแรก" → asset[0], "3 รูปล่าสุด" → last 3 assets, "รูปบ้านสีขาว" → semantic match
- Ranking formula: explicit reference beats semantic when both match
- Visual state FIFO: adding 13th image evicts oldest from recent list
- Project scope isolation: user A cannot retrieve user B's images
- Memory card compression: over-budget images produce valid JSON cards

### Integration Tests
- Upload 5 images → ask "4 รูปล่าสุด" → correct 4 assets in LLM context
- Upload 3 images → "รวม 3 รูป" → generator receives 3 reference images
- New conversation in same project → ask about prior images → retrieval works
- Vision analysis failure → memory item created with basic metadata only

### Eval Scenarios
1. **Reference accuracy**: "รูปก่อนหน้า" correct >98% within session
2. **Set resolution**: "สามรูปแรก" / "4 รูปล่าสุด" correct >95%
3. **Cross-session recall**: Project images retrieved >90%
4. **Grounded responses**: Descriptions cite real visual attributes from analysis
5. **No false memory**: System never claims to see images it hasn't been given

## Constraints

- No breaking changes to existing `messages.attachments` JSON structure
- No mandatory schema migration for existing tables — all new tables are additive
- Backward compatible: conversations without images work exactly as before
- pgvector extension required for vector similarity search (already supported in vectorProvider)
- Vision analysis is async — chat response is not blocked by it
- Embedding costs must be tracked in `provider_usage_log`
- Maximum 5 actual images per LLM request (model-dependent limit)

## Success Criteria

1. User uploads 5 images, asks "เอา 4 รูปล่าสุด เลือกอันที่ดู modern ที่สุด" → system responds with grounded comparison using actual images
2. User opens new chat in same project, asks "รูปบ้านที่ส่งไปเมื่อวาน" → system retrieves correct images from project memory
3. User says "เอารูปก่อนหน้าทั้ง 3 รูปรวมกัน แล้วสร้างรูปใหม่" → system sends 3 reference images to generation pipeline
4. System can explain visual differences between multiple images using evidence from actual analysis
5. System never hallucinates image descriptions when no asset reference or memory card is available
6. All image operations respect tenant/user/project scope isolation
