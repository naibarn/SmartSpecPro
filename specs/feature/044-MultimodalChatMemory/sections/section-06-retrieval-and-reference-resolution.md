# Section 06: Retrieval and Reference Resolution

## Overview

This section implements `multimodalRetrievalService.ts`, the core service that resolves user references to images (in Thai and English), performs hybrid retrieval across multiple ranking signals, and packs image context for the LLM. It is the bridge between the vision pipeline (section 03), embedding provider (section 04), and visual state service (section 05), producing retrieval results consumed by the context packing integration (section 07).

**File to create**: `apps/web/server/services/multimodalRetrievalService.ts`
**Test file to create**: `apps/web/server/services/__tests__/multimodalRetrievalService.test.ts`

## Dependencies

This section requires the following from prior sections (must be implemented first):

- **Section 01 (Schema)**: Tables `media_assets`, `media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors`, `conversation_visual_state` must exist in `drizzle/schema.ts` with their Drizzle ORM definitions.
- **Section 03 (Vision Pipeline)**: `media_asset_analysis` rows are populated by the Python Celery task. The `shortCaption`, `detailedCaption`, `objects`, `styles`, `materials`, `colors`, `architectureTags` fields are used by the metadata matcher and context builder.
- **Section 04 (Embedding Provider)**: The `MultimodalEmbeddingProvider` interface and its implementations (`GeminiEmbeddingProvider`, `CloudflareFallbackProvider`) must exist at `apps/web/server/services/multimodalEmbeddingProvider.ts`. The service calls `embedText()` to generate a query vector for semantic search.
- **Section 05 (Visual State Service)**: `visualStateService.ts` must provide `getOrCreateState(conversationId)` which returns the `conversation_visual_state` row with `recentAssetIds`, `activeAssetIds`, `comparedAssetIds`, and `namedSets`.

## Background Context

### How Reference Resolution Works

When a user writes something like "เอา 4 รูปล่าสุด เลือกอันที่ดู modern ที่สุด" (take the last 4 images, pick the most modern one), the system must:

1. Detect that the message references images (keyword pre-filter)
2. Resolve which specific images the user means (LLM-based resolver)
3. Rank all candidate assets using a hybrid scoring formula
4. Pack the resolved assets into a format the LLM can consume

The resolver supports both Thai and English natural language references: ordinal ("รูปแรก" / "first image"), recency ("ล่าสุด" / "latest"), semantic ("บ้านสีขาว" / "white house"), and sets ("3 รูปล่าสุด" / "last 3 images").

### Existing Patterns Used

- **LLM structured calls**: The service uses `callLLMStructured()` from `apps/web/server/services/callLLMStructured.ts` for the reference resolution LLM call. This function accepts a `zodSchema` for type-safe output parsing, handles retries, and records costs. It uses `executeWithFallback` for provider routing.
- **Vector search**: The service queries `multimodal_memory_vectors` using pgvector cosine distance (`<=>` operator) directly via Drizzle SQL. It must filter vectors by the current active embedding provider (vectors from different providers are in different embedding spaces and not comparable).
- **Redis caching**: The visual state is cached in Redis with a 30-second TTL to avoid DB reads on every message. Use the Redis client pattern from `apps/web/server/services/redis.ts`.

---

## Tests (Write First)

Create the test file at `apps/web/server/services/__tests__/multimodalRetrievalService.test.ts`.

All database access, Redis, the embedding provider, and `callLLMStructured` should be mocked. The tests verify logic, not I/O.

```typescript
// apps/web/server/services/__tests__/multimodalRetrievalService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("../../services/callLLMStructured");
vi.mock("../../services/multimodalEmbeddingProvider");
vi.mock("../../services/visualStateService");
vi.mock("../../services/redis");

describe("multimodalRetrievalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Keyword Pre-Filter ──────────────────────────────────────

  describe("hasImageReferenceKeywords", () => {
    // Test: returns false for plain text message with no image keywords
    // Test: returns true for Thai keywords: รูป, ภาพ, โฟโต้
    // Test: returns true for English keywords: image, photo, picture
    // Test: is case-insensitive for English keywords
    // Test: catches "รูปก่อนหน้า" (previous image)
    // Test: catches "ล่าสุด" (latest) only in image-related context
  });

  // ── LLM Reference Resolver ─────────────────────────────────

  describe("resolveVisualReferences", () => {
    // Test: returns empty array when no image keywords in message
    // Test: calls LLM with recent image metadata from visual state
    // Test: resolves "รูปก่อนหน้า" to last uploaded image
    // Test: resolves "3 รูปล่าสุด" to last 3 images
    // Test: resolves cross-session reference within same project
    // Test: returns empty array for conversation with no images
    // Test: LLM prompt includes position and timestamp for each image
    // Test: LLM resolver returns parsed JSON array of assetIds with confidence
    // Test: handles Thai ordinal references (รูปแรก, รูปที่สอง)
    // Test: handles English references (first, latest, previous)
    // Test: Redis cache for visual state has 30-second TTL
    // Test: filters out low-confidence results (below threshold)
  });

  // ── Hybrid Retrieval ────────────────────────────────────────

  describe("retrieveRelevantAssets", () => {
    // Test: applies explicit reference weight 0.35
    // Test: bypasses vector search when explicit references found
    // Test: includes vector similarity for semantic queries
    // Test: applies recency weight 0.20 based on visual state
    // Test: applies metadata match weight 0.10
    // Test: applies project scope bonus 0.05
    // Test: applies salience weight 0.05
    // Test: filters by tenantId (isolation)
    // Test: filters vectors by current active embedding provider
    // Test: returns results sorted by combined score descending
    // Test: limits results to requested count
  });

  // ── Context Building ───────────────────────────────────────

  describe("buildImageContext", () => {
    // Test: includes signed URLs for vision-capable models
    // Test: includes text descriptions for text-only models
    // Test: caps at 5 images maximum
    // Test: produces memory cards when over budget
    // Test: memory card format includes assetId, label, summary, tags
    // Test: returns empty context when no assets resolved
  });
});
```

---

## Implementation Details

### File: `apps/web/server/services/multimodalRetrievalService.ts`

The service exports three main functions and one helper.

### 1. `hasImageReferenceKeywords(message: string): boolean`

A fast regex pre-filter that determines whether a user message is likely referencing images. If this returns `false`, the expensive LLM resolution call is skipped entirely.

**Keyword patterns to match** (case-insensitive where applicable):
- Thai: `รูป`, `ภาพ`, `โฟโต้`, `ล่าสุด` (in image context), `ก่อนหน้า`, `เปรียบเทียบ`
- English: `image`, `photo`, `picture`, `pic`, `screenshot`, `latest image`, `previous`, `compare`

Implementation: compile a single `RegExp` from the keyword list, test against the message. This is a heuristic -- false positives are acceptable (they just trigger a cheap LLM call), false negatives mean missed references.

### 2. `resolveVisualReferences(userMessage, conversationId, userId, tenantId, projectId?)`

**Returns**: `Promise<Array<{ assetId: number; confidence: number; reason: string }>>`

**Steps**:

1. Call `hasImageReferenceKeywords(userMessage)`. If false, return `[]` immediately.

2. Fetch the conversation visual state. Check Redis first (`visual_state:{conversationId}` key, 30-second TTL). On cache miss, call `visualStateService.getOrCreateState(conversationId)` and cache the result.

3. Collect recent image metadata: query `media_assets` joined with `media_asset_analysis` for the asset IDs in `recentAssetIds` (up to 12). For each, extract: `assetId`, `shortCaption`, position (1-indexed from most recent), `createdAt` timestamp, top 3 tags from `architectureTags` or `styles`.

4. If `projectId` is provided and the message seems cross-session (heuristic: references like "เมื่อวาน" / "yesterday"), also query `multimodal_memory_items` with `projectId` scope for additional candidates beyond the current conversation.

5. Build the LLM prompt and call `callLLMStructured()`:

   **System prompt** (summarized):
   ```
   You are a visual reference resolver. Given a user message and a list of
   available images, determine which images the user is referring to.
   Return ONLY the images you are confident about. If unsure, return [].
   Support Thai and English references:
   - Ordinal: รูปแรก (first), รูปที่สอง (second)
   - Recency: ล่าสุด (latest), ก่อนหน้า (previous)
   - Semantic: บ้านสีขาว (white house), ห้องนอน modern
   - Sets: 3 รูปล่าสุด (last 3 images)
   ```

   **User message**: The user's actual message text plus a formatted list of available images.

   **Zod schema** for output:
   ```typescript
   z.array(z.object({
     assetId: z.number(),
     confidence: z.number().min(0).max(1),
     reason: z.string(),
   }))
   ```

   **Model**: Use the cheapest available model (Gemini Flash or equivalent) to minimize latency and cost. Specify via `model` parameter to `callLLMStructured`.

6. Filter results by confidence threshold (0.5 minimum). Return the filtered array.

### 3. `retrieveRelevantAssets(query, scope)`

**Parameters**:
```typescript
interface RetrievalScope {
  userId: number;
  tenantId: string;
  conversationId: number;
  projectId?: string;
  explicitRefs?: Array<{ assetId: number; confidence: number }>;
  limit?: number; // default 8
}
```

**Returns**: `Promise<Array<{ assetId: number; score: number; source: string }>>`

**Hybrid ranking formula** -- six weighted signals combined into a final score:

| Signal | Weight | Source |
|--------|--------|--------|
| Explicit references | 0.35 | From `resolveVisualReferences()` |
| Vector similarity | 0.25 | Cosine distance via pgvector |
| Recency | 0.20 | Position in `conversation_visual_state.recentAssetIds` |
| Metadata match | 0.10 | Tag/keyword overlap with `media_asset_analysis` |
| Project scope | 0.05 | Bonus for same-project assets |
| Salience | 0.05 | From `multimodal_memory_items.salience` |

**Implementation logic**:

1. If `explicitRefs` is non-empty and has high confidence (any ref >= 0.8), **bypass vector search** for speed. Score explicit refs at their confidence * 0.35 weight, then add recency/salience bonuses only. Return immediately.

2. Otherwise, perform full hybrid retrieval:
   a. **Vector search**: Call `embeddingProvider.embedText({ text: query })` to get query vector. Execute a raw SQL query against `multimodal_memory_vectors` using pgvector cosine distance (`1 - (embedding <=> $queryVector)`), filtered by `provider = currentProvider` and joined through `multimodal_memory_items` with `tenantId` and `userId` filters. Limit to top 20 candidates.
   b. **Recency scoring**: For each candidate, check its position in `recentAssetIds`. Score = `(12 - position) / 12` (most recent = 1.0, position 12 = 0.0). Assets not in the recent list get 0.
   c. **Metadata matching**: Tokenize the query text, match against `media_asset_analysis` fields (objects, styles, materials, colors, architectureTags). Score = matched keywords / total query keywords.
   d. **Project scope**: If the asset's `projectId` matches the query's `projectId`, add 1.0 for this signal (else 0).
   e. **Salience**: Read directly from `multimodal_memory_items.salience`.

3. Combine all signals: `finalScore = sum(signal_i * weight_i)` for each candidate.

4. Sort by `finalScore` descending, return top `limit` results.

**Critical**: The vector search query MUST filter `multimodal_memory_vectors.provider` to match the currently active embedding provider. Vectors from different providers exist in different embedding spaces and produce meaningless similarity scores when compared.

### 4. `buildImageContext(resolvedAssets, modelCapabilities, budget)`

**Parameters**:
```typescript
interface ModelCapabilities {
  supportsVision: boolean;
  maxImageInputs?: number; // default 5
}

interface ImageBudget {
  maxImages: number; // hard cap, typically 5
  maxTextTokens: number; // token budget for text descriptions
}
```

**Returns**:
```typescript
interface ImageContext {
  imageAssets: Array<{
    assetId: number;
    fileUrl: string;   // signed URL (1h expiry)
    caption?: string;
    role: "memory" | "current";
  }>;
  visualMemoryContext: string | null; // text descriptions for non-vision models
  memoryCards: Array<{
    assetId: number;
    label: string;
    summary: string;
    tags: string[];
    salientAttributes: Record<string, string>;
  }> | null;
}
```

**Logic**:

1. If `resolvedAssets` is empty, return empty context (`imageAssets: [], visualMemoryContext: null, memoryCards: null`).

2. Cap the resolved assets list at `budget.maxImages` (default 5).

3. For each resolved asset, fetch the `media_asset_analysis` row and generate a signed URL via `mediaAssetService.generateSignedUrl()` (from section 02).

4. **Vision-capable model path** (`modelCapabilities.supportsVision === true`):
   - Populate `imageAssets` with signed URLs and captions.
   - Set `visualMemoryContext` to null (images speak for themselves).
   - If the number of resolved assets exceeds `budget.maxImages`, compress the overflow into `memoryCards` -- JSON objects with `assetId`, `label` (from shortCaption), `summary` (from detailedCaption truncated to 200 chars), `tags` (from architectureTags + styles), and `salientAttributes` (key visual attributes like dominant colors, materials).

5. **Text-only model path** (`supportsVision === false`):
   - Set `imageAssets` to empty (no point sending URLs).
   - Build `visualMemoryContext` as a formatted text block with each image's description:
     ```
     [Image 1: "Modern white house with glass facade"]
     Details: Two-story, minimalist design, floor-to-ceiling windows...
     Tags: modern, minimalist, glass, white

     [Image 2: "Wooden cabin in forest"]
     ...
     ```
   - Truncate total text to fit within `budget.maxTextTokens` (estimate 4 chars/token).
   - Also produce `memoryCards` for any assets that didn't fit in the text budget.

### Signed URL Generation

All image URLs returned by `buildImageContext` must be time-limited signed URLs with 1-hour expiry. Call `mediaAssetService.generateSignedUrl(asset.storageKey, 3600)` from section 02. Never return raw storage keys or permanent URLs.

### Tenant Isolation

Every database query in this service MUST include `tenantId` in the WHERE clause. The `retrieveRelevantAssets` function joins through `multimodal_memory_items` which has a `tenantId` column. The vector search query must also filter through this join. Never expose raw `assetId` lookups without tenant verification.

---

## Key Types and Interfaces

These are the primary types the service exports (to be consumed by section 07):

```typescript
/** Result from the LLM reference resolver */
export interface ResolvedReference {
  assetId: number;
  confidence: number;
  reason: string;
}

/** A ranked retrieval result */
export interface RetrievalResult {
  assetId: number;
  score: number;
  source: string; // which signal dominated: 'explicit' | 'vector' | 'recency' | 'metadata'
}

/** Packed image context ready for LLM consumption */
export interface ImageContext {
  imageAssets: Array<{
    assetId: number;
    fileUrl: string;
    caption?: string;
    role: "memory" | "current";
  }>;
  visualMemoryContext: string | null;
  memoryCards: Array<{
    assetId: number;
    label: string;
    summary: string;
    tags: string[];
    salientAttributes: Record<string, string>;
  }> | null;
}
```

---

## Integration Points

- **Consumed by section 07 (Context Packing)**: The `buildChatContext()` extension calls `resolveVisualReferences()` then `retrieveRelevantAssets()` then `buildImageContext()` as step 4.5 of context assembly.
- **Reads from section 05 (Visual State)**: Uses `getOrCreateState()` to get the conversation's recent/active/compared asset lists.
- **Reads from section 04 (Embedding Provider)**: Calls `embedText()` to generate query vectors for semantic search.
- **Reads from section 03 (Vision Pipeline results)**: Queries `media_asset_analysis` for captions, tags, and other analysis fields used in metadata matching and context building.
- **Uses section 02 (Media Asset Service)**: Calls `generateSignedUrl()` for URL generation and `fetchAsset()` for asset lookups.

---

## Performance Considerations

- The keyword pre-filter (`hasImageReferenceKeywords`) is a cheap regex test that avoids the LLM call entirely for the majority of messages that have nothing to do with images.
- Redis caching of visual state (30-second TTL) prevents a DB round-trip on every message in a conversation.
- When explicit references are high-confidence, vector search is bypassed entirely, saving an embedding API call plus pgvector query time.
- The reference resolution LLM call should target < 150ms latency by using the cheapest model available (Gemini Flash). The `callLLMStructured` function handles provider routing automatically.
- Vector search queries should use the HNSW index on `multimodal_memory_vectors.embedding` for sub-linear search time (created in section 12 after backfill).
