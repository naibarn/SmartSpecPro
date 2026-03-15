# Implementation Plan: Feature 044 — Multimodal Chat Memory

## 1. Background & Motivation

SmartSpecPro's chat memory system (`memoryService.ts`) uses a three-tier architecture: buffer (20 recent messages), summary (LLM-generated), and entity (persistent facts). All three tiers are **text-only**. Images uploaded by users are stored as JSON attachments on the `messages` table, but they are never analyzed, embedded, or sent back to the LLM in subsequent context windows.

This means a user who uploads 5 house photos and asks "เอา 4 รูปล่าสุด เลือกอันที่ดู modern ที่สุด" gets no meaningful response — the model has zero visual context. The feature closes this gap by making images first-class memory objects: analyzed, embedded, searchable, and recallable across messages and sessions.

### Key Stakeholder Decisions

- **Embedding**: Gemini Embedding 2 Preview at 768 dimensions (primary), Cloudflare bge-base + LLaVA (fallback)
- **Vision analysis**: Gemini 2.5 Flash via async Celery task immediately after upload
- **Scale**: <10K images/month — pgvector single table, no partitioning
- **Reference resolution**: LLM-based (supports Thai natural language)
- **Cross-session**: Project-scoped image memory
- **NSFW**: Block from visual memory entirely
- **LLM input**: Adaptive — send actual images to vision-capable models, text descriptions to others
- **Credits**: Deducted from user at ~0.5x multiplier per image
- **Deletion**: User can remove images from memory via UI button or chat command
- **Chat UI**: Expandable image gallery when LLM references past images

---

## 2. Existing Architecture (What We Build On)

### Memory System

The context assembly pipeline in `buildChatContext()` (`memoryService.ts:670`) follows this order:
1. Resolve persona
2. System prompt (never trimmed)
3. Entity memories — rules always included, others ranked by relevance (40% budget)
4. Summaries — capped at 60% budget
5. Buffer messages — fills remaining budget, newest-first

The `ChatContext` interface (`memoryService.ts:658`) currently has: `systemPrompt`, `entityContext`, `summaryContext`, `bufferMessages`, `totalTokenEstimate`. We extend this with `visualMemoryContext` and `imageAssets`.

### Attachment Storage

`messages.attachments` is a JSON column (`schema.ts:1372`) storing `Array<{type, url, key?, name?, size?, mimeType?, thumbnail?}>`. The upload flow: user uploads → S3/R2 → URL stored → message saved. No analysis or indexing happens.

### Vector Infrastructure

- `vectorProvider.ts` (992 lines) — Provider abstraction supporting Cloudflare Vectorize, pgvector, ChromaDB. Config from `systemSettings` table with 5-second TTL cache.
- `vectorize.ts` — Cloudflare text embedding (bge-base-en-v1.5, 768-dim) + LLaVA image description
- `vectorize-search.ts` — Two indexes (`docs-index-prod`, `images-index-prod`), tenant isolation, min relevance 0.5
- Python `embedding_service.py` — Built but not integrated (ChromaDB + OpenAI providers)

### Async Task Infrastructure

Celery workers handle media generation tasks. BullMQ handles Node.js side orchestration. Both are well-established patterns in the codebase.

### Credit System

`creditService.ts` tracks per-user credit consumption. `provider_usage_log` records all LLM/API costs with traceId. We add vision analysis and embedding costs to this pipeline.

---

## 3. Database Schema

### 3.1 New Table: `media_assets`

Canonical registry for all uploaded images.

**Columns**: `id` (bigserial PK), `tenantId` (varchar 36), `userId` (int, FK users), `projectId` (varchar 100), `conversationId` (int, FK conversations), `messageId` (int, FK messages), `sourceType` (varchar 32, default 'chat_attachment'), `status` (varchar 32, default 'pending' — values: `pending`, `analyzing`, `analyzed`, `failed`, `nsfw_blocked`), `storageKey` (text, not null), `originalUrl` (text), `thumbnailUrl` (text), `mimeType` (varchar 100, not null), `width` (int), `height` (int), `fileSize` (bigint), `checksumSha256` (varchar 64), `perceptualHash` (varchar 128), `createdAt` (timestamptz), `updatedAt` (timestamptz)

**Indexes**: `(userId)`, `(conversationId)`, `(tenantId, projectId)`, `(checksumSha256)` for dedup lookups

### 3.2 New Table: `media_asset_analysis`

Vision enrichment results.

**Columns**: `id` (bigserial PK), `mediaAssetId` (bigint, FK media_assets CASCADE), `provider` (varchar 64), `model` (varchar 128), `shortCaption` (text), `detailedCaption` (text), `ocrText` (text), `objects` (jsonb), `styles` (jsonb), `materials` (jsonb), `colors` (jsonb), `rooms` (jsonb), `architectureTags` (jsonb), `aestheticScore` (numeric 4,3), `safetyLabels` (jsonb), `extractedJson` (jsonb), `createdAt` (timestamptz)

**Indexes**: `(mediaAssetId)`

### 3.3 New Table: `multimodal_memory_items`

Retrievable memory entries bridging images and text.

**Columns**: `id` (bigserial PK), `tenantId`, `userId` (FK users), `projectId`, `conversationId` (FK conversations), `messageId`, `mediaAssetId` (FK media_assets CASCADE), `memoryKind` (varchar 32: 'image'|'text'|'image_text'|'group'), `title` (text), `summary` (text), `searchableText` (text, not null), `sourceRole` (varchar 16), `salience` (numeric, default 0.500), `confidence` (numeric, default 0.800), `lastAccessedAt` (timestamptz), `accessCount` (int, default 0), `createdAt`, `updatedAt`

**Indexes**: `(userId, projectId)`, `(conversationId)`, `(mediaAssetId)`

### 3.4 New Table: `multimodal_memory_vectors`

pgvector embeddings for multimodal retrieval.

**Columns**: `id` (bigserial PK), `memoryItemId` (bigint, FK multimodal_memory_items CASCADE), `provider` (varchar 64), `model` (varchar 128), `modality` (varchar 16: 'image'|'text'|'fused'), `embedding` (vector(768)), `embeddingVersion` (varchar 32), `createdAt`

**Indexes**: `(memoryItemId)`, HNSW on `embedding` with `vector_cosine_ops` (`m=16, ef_construction=128`)

**Prerequisite**: `CREATE EXTENSION IF NOT EXISTS vector;`

### 3.5 New Table: `conversation_visual_state`

Per-conversation working set.

**Columns**: `conversationId` (int PK, FK conversations CASCADE), `recentAssetIds` (jsonb, default []), `activeAssetIds` (jsonb, default []), `comparedAssetIds` (jsonb, default []), `namedSets` (jsonb, default {}), `updatedAt`

### 3.6 New Table: `multimodal_memory_links`

Relationships between memory items.

**Columns**: `id` (bigserial PK), `fromMemoryItemId` (bigint, FK CASCADE), `toMemoryItemId` (bigint, FK CASCADE), `relationType` (varchar 32: 'same_topic'|'derived_from'|'generated_from'|'comparison_set'), `weight` (numeric, default 1.000), `createdAt`

### 3.7 Schema Change: `messages.attachments`

Add optional `assetId?: number` to the TypeScript type definition. This is backward compatible — existing rows without `assetId` continue to work.

### Migration Strategy

All tables are additive. No existing table modifications (except the TypeScript type annotation for attachments). Use Drizzle's `pgTable` definitions in `schema.ts`, then generate + run migration with `pnpm db:push`.

---

## 4. Service Layer

### 4.1 `mediaAssetService.ts`

**Location**: `apps/web/server/services/mediaAssetService.ts`

**Responsibilities**:
- `createAssetFromAttachment(attachment, context)` — Takes an attachment object (from message upload) + context (userId, tenantId, conversationId, messageId, projectId), creates a `media_assets` row, returns the `assetId`. Also computes dimensions from the image if possible (via sharp or image-size).
- `fetchAsset(assetId, tenantId)` — Retrieves asset with tenant isolation check. Returns asset row + signed URL.
- `generateSignedUrl(storageKey, expirySeconds=3600)` — Generates time-limited S3/R2 signed URL. Reuse existing S3 client from the upload flow.
- `computePerceptualHash(imageBuffer)` — Generates a perceptual hash (pHash or dHash) for near-duplicate detection. Uses `sharp` (resize to 8x8 grayscale → pixel comparison). **Note**: `sharp` must be added to `apps/web/package.json` — it is not currently installed (`pnpm add sharp && pnpm add -D @types/sharp`).
- `findSimilarAssets(hash, tenantId, threshold)` — Query media_assets for Hamming distance below threshold. Returns potential duplicates.
- `deleteAsset(assetId, userId, tenantId)` — Soft-delete or hard-delete asset + cascade to analysis, memory items, vectors.

**Idempotency**: Before creating an asset, check `checksumSha256` — if an identical asset already exists for the same user/tenant, return the existing `assetId` instead of creating a duplicate.

**Image validation**: Before dispatching to vision pipeline, validate: supported format (JPEG, PNG, WebP, GIF — reject SVG, HEIC), max 20MB file size, resize if either dimension >4096px (using sharp).

**Key pattern**: Every query includes `tenantId` filter for isolation. Follow the existing service pattern in `memoryService.ts` for DB access via Drizzle.

### 4.2 `visionMemoryService.ts`

**Location**: `apps/web/server/services/visionMemoryService.ts`

**Responsibilities**:
- `analyzeImage(assetId)` — Dispatches a Celery task to Python backend for vision analysis. The Python task calls Gemini 2.5 Flash with the image URL and a structured output prompt requesting: shortCaption, detailedCaption, ocrText, objects, styles, materials, colors, architectureTags, aestheticScore, safetyLabels. Stores result in `media_asset_analysis`.
- `checkSafety(analysis)` — Inspects `safetyLabels` from analysis. If NSFW detected, returns `blocked: true` and the memory pipeline stops for this image.
- `buildSearchableText(analysis)` — Concatenates caption + tags + objects + materials + colors + OCR into a single indexable string: `"shortCaption | object1 object2 | style: modern | materials: glass, wood | ocr: ..."`.
- `createMemoryItemFromAsset(assetId, analysis, context)` — Creates a `multimodal_memory_items` row with the searchable text, then dispatches embedding generation.
- `updateSalience(itemId, delta)` — Adjusts salience score based on user interaction (referencing, pinning). Caps at 0.0–1.0.
- `deleteFromMemory(assetId, userId, tenantId)` — Removes memory item + vector + links for an asset. Called when user requests memory deletion.

**Vision analysis Celery task** (Python side):

New task in `python-backend/app/tasks/vision_tasks.py`:
- `analyze_image_task(asset_id, image_url, tenant_id, user_id)` — Calls Gemini 2.5 Flash vision API with structured JSON output prompt. **Writes results directly to PostgreSQL** via SQLAlchemy models (new models for `media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors`). This follows the existing `media_tasks.py` pattern where Python writes task results to shared PostgreSQL tables. Deducts credits via credit tracking.
- **Idempotency**: Before analyzing, check if `media_asset_analysis` row already exists for this `asset_id`. If yes, skip.
- **Retry policy**: 3 retries with exponential backoff (30s, 120s, 480s). On final failure, update `media_assets.status` to `failed`. The image remains usable as a normal attachment — only memory features are affected.
- **Status tracking**: Updates `media_assets.status` through the pipeline: `pending` → `analyzing` → `analyzed` (or `failed` / `nsfw_blocked`).

### 4.3 `multimodalEmbeddingProvider.ts`

**Location**: `apps/web/server/services/multimodalEmbeddingProvider.ts`

**Interface**:

```typescript
interface MultimodalEmbeddingProvider {
  embedImage(input: { fileUrl: string }): Promise<number[]>;
  embedText(input: { text: string }): Promise<number[]>;
  getDimension(): number;
  getProviderName(): string;
  getModelName(): string;
}
```

**Implementations**:

1. **GeminiEmbeddingProvider** — Calls `gemini-embedding-2-preview` API for both image and text embedding. Uses 768-dimension output. Input: image URL or text string. Authentication: Gemini API key from system settings (encrypted). Handles rate limiting and retries.

2. **CloudflareFallbackProvider** — For text: calls existing `vectorize.ts` bge-base embedding (768-dim). For images: calls existing LLaVA `generateImageDescription()` to get text, then embeds the text. Same dimension space as Gemini (768), but not truly multimodal (image→text→embed vs. native image embed).

**Provider selection**: Check system settings for `multimodal_embedding_provider` config. Default to Gemini if API key is configured, fallback to Cloudflare if not. Follow the existing `vectorProvider.ts` pattern for provider abstraction.

**Provider isolation**: Vectors from different providers are NOT comparable (different embedding spaces even at the same dimension). The `multimodal_memory_vectors.provider` column tracks which provider generated each vector. **Retrieval queries must filter by the current active provider.** If the provider is switched, existing vectors need re-embedding (provide a migration script for this).

### 4.4 `multimodalRetrievalService.ts`

**Location**: `apps/web/server/services/multimodalRetrievalService.ts`

**Responsibilities**:

- `resolveVisualReferences(userMessage, conversationId, userId, tenantId)` — Core reference resolution. Uses LLM-based approach: sends the user message + recent image metadata (from conversation_visual_state) to a lightweight LLM call (Gemini Flash or similar) asking it to identify which images the user is referring to. Returns array of resolved `assetId`s. The LLM prompt includes:
  - User's message text
  - List of recent images with: assetId, shortCaption, position in conversation, timestamp
  - Instructions to output JSON array of matched assetIds

- `retrieveRelevantAssets(query, scope)` — Hybrid retrieval combining:
  1. Explicit references (from `resolveVisualReferences`) — weight 0.35
  2. Vector similarity (embed query text → search `multimodal_memory_vectors`) — weight 0.25
  3. Recency (from `conversation_visual_state.recent_asset_ids`) — weight 0.20
  4. Metadata match (tag/style keyword matching against `media_asset_analysis`) — weight 0.10
  5. Project scope bonus — weight 0.05
  6. Salience (from `multimodal_memory_items.salience`) — weight 0.05

  When explicit references are detected, they dominate and bypass vector search for speed.

- `buildImageContext(resolvedAssets, modelCapabilities, budget)` — Packs resolved assets into the context:
  - If model supports vision: include actual signed image URLs (max 5)
  - If text-only model: include text descriptions from analysis
  - If over budget: compress to memory cards (JSON with assetId, label, summary, tags, salientAttributes)

### 4.5 `visualStateService.ts`

**Location**: `apps/web/server/services/visualStateService.ts`

**Responsibilities**:
- `getOrCreateState(conversationId)` — Returns current visual state or creates empty one.
- `addRecentAsset(conversationId, assetId)` — Pushes to `recentAssetIds` (FIFO, max 12). If list exceeds 12, evict oldest. **Concurrency**: Use PostgreSQL `jsonb_insert` / array operations in a single UPDATE statement to avoid lost-update from concurrent read-modify-write cycles.
- `setActiveAssets(conversationId, assetIds)` — Updates `activeAssetIds` (max 5). Called when images are resolved from user message.
- `setComparedAssets(conversationId, assetIds)` — Marks images as being compared.
- `createNamedSet(conversationId, name, assetIds)` — Saves user-defined group in `namedSets` JSON.
- `resolveNamedSet(conversationId, name)` — Retrieves asset IDs from named set.
- `removeAssetFromState(conversationId, assetId)` — Removes an asset from all lists (for deletion flow).

---

## 5. Integration with `buildChatContext()`

### 5.1 Extended ChatContext Interface

Add two new fields to the existing `ChatContext` interface:

```typescript
visualMemoryContext: string | null;  // text summaries of visual memory
imageAssets: Array<{
  assetId: number;
  fileUrl: string;   // signed URL
  caption?: string;
  role: 'memory' | 'current';
}>;
```

### 5.2 New Step in Context Assembly

After the existing step 4 (buffer messages), insert step 4.5: Visual Memory Assembly.

1. Check if current user message has image references (explicit text like "รูปก่อนหน้า" or semantic references)
2. Call `resolveVisualReferences()` with the user message and conversation state
3. If references found, fetch assets via `mediaAssetService.fetchAsset()`
4. Get model capabilities from the current conversation's model config
5. Call `buildImageContext()` with model capabilities and remaining budget
6. Set `imageAssets` for vision-capable models, `visualMemoryContext` for text-only models

### 5.3 Budget Allocation (Adaptive)

Images count against a separate **image slot budget** (max 5 per request), not the text token budget.

**When visual context exists** (images in conversation_visual_state or references resolved):
- Entity context: 20%
- Visual memory context: 15%
- Summary context: 25%
- Buffer messages: 40%

**When NO visual context exists** (no images in scope):
- Entity context: 40% (original)
- Summary context: 60% (original)
- Buffer messages: fills remaining (original)

This adaptive approach ensures non-visual conversations are **never degraded**. The check is a simple boolean: does the conversation have any images in its visual state? If not, the existing budget logic runs unchanged.

### 5.4 Extending `contextToMessages()` — Type Migration

`contextToMessages()` at `memoryService.ts:842` converts `ChatContext` to a message array. Currently returns `Array<{ role: string; content: string }>` — the `content` field is `string` only.

**Breaking change required**: To support multimodal content, the return type must change to:

```typescript
type MessageContent = string | Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
>;

Array<{ role: "system" | "user" | "assistant"; content: MessageContent }>
```

**Migration approach**:
1. Define a `MessageContent` type alias as a union of `string` and content parts array
2. Update `contextToMessages()` return type
3. **Audit all callers** — every function that reads `.content` as a string must be updated to handle the union. Key callers to check:
   - `chat.ts` — formats messages for LLM API (already needs multimodal support)
   - `memoryService.ts` — summarization functions that concatenate content
   - Any logging/audit that stringifies message content
4. For callers that only need text, add a helper `getTextContent(content: MessageContent): string` that extracts the text part from either format
5. When `imageAssets` is non-empty and model is vision-capable, format the last user message as a content parts array with image_url blocks
6. If `visualMemoryContext` is set, inject as a system message before the buffer messages

### 5.5 Image-Aware System Instructions

When visual context is present, append to system prompt:
- "When the user refers to images, use ONLY the provided image references and memory cards."
- "Do NOT claim to remember images that are not in your current context."
- "When comparing images, cite specific visual differences from the provided analysis."
- "When referencing a specific image in your response, use the marker format `[image:assetId:NNN]` where NNN is the assetId from the provided image context."

The `[image:assetId:NNN]` markers are consumed by the frontend (Section 11) to render inline image preview chips in assistant messages.

---

## 6. Ingestion Pipeline Integration

### 6.1 Upload Hook

Modify the existing message creation flow in the chat router (`chat.ts:865`):

After the message is saved with attachments:
1. For each image attachment, call `mediaAssetService.createAssetFromAttachment()`
2. Update the attachment JSON with the returned `assetId`
3. Call `visualStateService.addRecentAsset()` for each new asset
4. Dispatch async vision analysis: HTTP call to Python backend endpoint which enqueues the Celery task

### 6.2 Python Backend Endpoint

New FastAPI endpoint: `POST /api/v1/vision/analyze`

**Authentication**: Protected by `x-proxy-token` header (existing `SMARTSPEC_WEB_GATEWAY_TOKEN` pattern). Not exposed publicly — only callable from the Node.js backend.

**Request**: `{ asset_id: int, image_url: str, tenant_id: str, user_id: int }`

This endpoint enqueues a Celery task that:
1. Downloads the image from the signed URL
2. Calls Gemini 2.5 Flash with structured output prompt
3. Checks safety labels — if NSFW, marks the analysis and returns (no memory creation)
4. Stores analysis result in `media_asset_analysis`
5. Generates multimodal embedding via Gemini Embedding 2 (or fallback)
6. Stores embedding in `multimodal_memory_vectors`
7. Creates `multimodal_memory_items` entry with searchable text
8. Records credit deduction for the user

### 6.3 Backfill Existing Attachments

Phase 0 includes a one-time backfill script that:
1. Queries all `messages` with non-empty `attachments` JSON where type is 'image'
2. For each, creates a `media_assets` row
3. Updates the attachment JSON with `assetId`
4. Optionally queues async vision analysis (gated by feature flag)

This should be a standalone script (Node.js) that can be run manually, not part of the migration. Process in batches of 100 with rate limiting for API calls.

**Credit handling for backfill**: Backfill vision analysis is treated as **system cost** (not deducted from user credits). This prevents surprising users with unexpected credit charges for historical images. Backfill is opt-in via an admin dashboard trigger.

---

## 7. Reference Resolution Detail

### 7.1 LLM-Based Resolver

The resolver sends a structured prompt to a lightweight LLM (Gemini Flash) with:

**Input context**:
- User's message text
- List of recent images from `conversation_visual_state` (up to 12), each with: `assetId`, `shortCaption`, `position` (1-indexed from most recent), `timestamp`, `tags[]`
- For cross-session requests: also query project-scoped images from `multimodal_memory_items`

**Expected output**: JSON array of `{ assetId: number, confidence: number, reason: string }`

**Prompt template** (summarized):
- "Given the user's message and the list of available images, determine which images the user is referring to."
- "Return only images you are confident about. If unsure, return empty array."
- "Support Thai and English references: ordinal (รูปแรก, first), recency (ล่าสุด, latest), semantic (บ้านสีขาว), sets (3 รูปล่าสุด)."

### 7.2 Performance Optimization

- Cache conversation visual state in Redis (30-second TTL) to avoid DB reads on every message
- Skip resolution if message contains no image-related keywords (fast regex pre-filter)
- The LLM call uses the cheapest available model (Gemini Flash) to minimize latency and cost

---

## 8. Credit Tracking

### 8.1 Cost Breakdown

| Operation | Estimated Cost | Credit Multiplier |
|-----------|---------------|-------------------|
| Vision analysis (Gemini Flash) | ~$0.0003/image | 0.3x |
| Embedding generation (Gemini Embedding 2) | ~$0.00012/image | 0.1x |
| Reference resolution (Gemini Flash) | ~$0.0001/call | 0.1x |
| **Total per image upload** | ~$0.00042 | **~0.5x** |

### 8.2 Integration

Use existing `creditService.ts` patterns:
1. Before dispatching vision analysis, check user has sufficient credits
2. After each API call, record in `provider_usage_log` with appropriate `traceId`
3. Deduct credits via `deductCredits()` with operation type `'vision_analysis'` or `'embedding_generation'`

---

## 9. Safety & Security

### 9.1 NSFW Blocking

When vision analysis returns safety labels indicating NSFW content:
1. Mark `media_asset_analysis.safetyLabels` with the flags
2. Do NOT create `multimodal_memory_items` or vectors
3. The image remains as a normal attachment but does not enter visual memory
4. Log the event for admin audit trail

### 9.2 Tenant Isolation

Every DB query for memory items, vectors, and assets MUST include `tenantId` in the WHERE clause. The service layer enforces this — never expose raw asset IDs without tenant verification.

### 9.3 Signed URLs

All image URLs sent to LLM context must be time-limited signed URLs (1-hour expiry). Never send raw storage keys or permanent URLs.

### 9.4 OCR PII Redaction

OCR text from vision analysis is passed through the existing `piiFilter.ts` before being stored in `searchableText` or sent to LLM context.

---

## 10. User Controls

### 10.1 Delete from Memory

**UI button**: On each image in the expandable gallery, show a "Remove from memory" icon button. Calls a tRPC mutation that:
1. Deletes `multimodal_memory_items` + cascading vectors and links
2. Removes asset from `conversation_visual_state` lists
3. Optionally deletes the `media_assets` row (or mark as `memoryDeleted: true`)

**Chat command**: When user types "ลบรูปนี้ออกจาก memory" or similar, the reference resolver identifies the target image, then calls the same deletion service.

### 10.2 Pin to Memory

UI action on image messages that sets `salience = 1.0` on the corresponding memory item, ensuring it's always included in retrieval results.

---

## 11. Chat UI — Expandable Image Gallery

### 11.1 Gallery Panel

When the LLM response references past images (detected by `assetId` markers in the response):
- Display an expandable side panel showing referenced images as a gallery
- Each image shows: thumbnail, short caption, tags
- Click to expand full-size with detailed caption
- "Remove from memory" action button

### 11.2 Visual Context Badge

In the chat header or message input area, show a badge: "🖼 3 images in context" indicating how many images are in the current visual working set.

### 11.3 Image Chips

When assistant text references specific images, render inline preview chips (small thumbnail + caption) that link to the gallery panel.

---

## 12. Phased Rollout

### Phase 0 — Foundation

**Scope**: Schema only, no retrieval changes.
- Add all 6 new tables via Drizzle migration
- Enable pgvector extension
- `mediaAssetService.ts` — basic CRUD
- Modify chat upload flow to create `media_assets` rows
- Add `assetId` to attachments JSON
- Backfill script for existing attachments
- Feature flag: `MULTIMODAL_MEMORY_ENABLED` (default false, tenant-scoped via `featureFlags.ts`)
  - Gate locations: chat.ts upload hook, buildChatContext() visual assembly, Python vision endpoint, retrieval service
- Note: HNSW index on `multimodal_memory_vectors` should be created **after** backfill data load, not in the initial migration (avoids table lock during bulk insert)

### Phase 1 — Recall & Discuss (MVP)

**Scope**: Full ingestion + basic retrieval within conversation.
- `visionMemoryService.ts` — vision analysis pipeline
- Python Celery task for Gemini Flash analysis
- NSFW safety filtering
- `multimodalEmbeddingProvider.ts` — Gemini + Cloudflare fallback
- `visualStateService.ts` — working set management
- `multimodalRetrievalService.ts` — reference resolution + retrieval
- Extend `buildChatContext()` with visual memory
- Adaptive LLM input (images for vision models, text for others)
- Credit deduction
- User deletion (tRPC mutation)
- Feature flag gates all new code paths

### Phase 2 — Cross-Session & Compare

**Scope**: Project-scoped retrieval + UI.
- Project-scoped vector search in retrieval service
- Named sets in visual state
- Expandable image gallery panel (React component)
- Visual context badge
- Image chips in assistant messages
- Semantic search ("รูปบ้าน modern")

### Phase 3 — Multi-Reference Generation

**Scope**: Integration with image generation pipeline.
- Composition brief builder
- `multimodal_memory_links` for `generated_from` lineage
- Reference image forwarding to existing media generation tasks
- Generation history UI

---

## 13. File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/web/server/services/mediaAssetService.ts` | Asset CRUD, signed URLs, hashing |
| `apps/web/server/services/visionMemoryService.ts` | Vision analysis, memory creation, safety |
| `apps/web/server/services/multimodalEmbeddingProvider.ts` | Embedding abstraction (Gemini + Cloudflare) |
| `apps/web/server/services/multimodalRetrievalService.ts` | Reference resolution, retrieval, context packing |
| `apps/web/server/services/visualStateService.ts` | Conversation visual working set |
| `python-backend/app/tasks/vision_tasks.py` | Celery task for Gemini Flash vision analysis |
| `python-backend/app/api/vision.py` | FastAPI endpoint for vision analysis dispatch |
| `apps/web/client/src/components/chat/ImageGalleryPanel.tsx` | Expandable image gallery (Phase 2) |
| `apps/web/client/src/components/chat/VisualContextBadge.tsx` | Image count badge (Phase 2) |

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/drizzle/schema.ts` | Add 6 new table definitions, update attachments type |
| `apps/web/server/services/memoryService.ts` | Extend `ChatContext`, `buildChatContext()`, `contextToMessages()` |
| `apps/web/server/routers/chat.ts` | Hook asset creation into message upload, format image context for LLM |
| `apps/web/server/routers/memory.ts` | Add tRPC mutations for image memory deletion, pin |
| `apps/web/shared/featureFlags.ts` | Add `MULTIMODAL_MEMORY_ENABLED` flag |
| `apps/web/server/services/creditService.ts` | Add vision/embedding cost types |
| `python-backend/app/core/celery_app.py` | Register vision task queue |
| `python-backend/app/main.py` | Mount vision API router |

---

## 14. Dependencies & Prerequisites

- **pgvector extension**: Must be installed on PostgreSQL. Run `CREATE EXTENSION IF NOT EXISTS vector;` before migration.
- **Gemini API key**: Must be configured in system settings for both embedding and vision analysis.
- **sharp or image-size**: Node.js library for extracting image dimensions during asset creation.
- **Drizzle pgvector support**: Use `drizzle-orm/pg-core` with custom column type for vector. May need `pgvector` Drizzle plugin.

---

## 15. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gemini Embedding 2 leaves preview | Medium | Medium | Cloudflare fallback ready; 768-dim matches both |
| Vision analysis latency spikes | Low | Low | Async pipeline — chat not blocked |
| pgvector HNSW build time on backfill | Low | Low | <10K images — build time negligible |
| LLM resolver returns wrong images | Medium | Medium | Confidence threshold; user can correct |
| Credit consumption surprise for users | Low | Medium | Clear UI indication of image memory cost |

---

## 16. Success Criteria

1. Upload 5 images → "เอา 4 รูปล่าสุด เลือกอันที่ดู modern ที่สุด" → grounded comparison with actual images in context
2. New chat, same project → "รูปบ้านที่ส่งเมื่อวาน" → correct retrieval from project memory
3. "เอา 3 รูปก่อนหน้ารวมกัน สร้างรูปใหม่" → 3 reference images sent to generation pipeline
4. NSFW images never enter visual memory
5. User can delete images from memory via UI or chat command
6. All operations respect tenant/user/project isolation
7. Vision analysis completes within 3-8 seconds async
8. Reference resolution < 150ms for ordinal/recency references
