# Research: Multimodal Chat Memory (Feature 044)

## Part A: Codebase Research

### 1. Memory System Architecture

**Three-Tier Design** (`memoryService.ts`):

| Tier | Table | Config | Key Function |
|------|-------|--------|-------------|
| Buffer | `messages` | 20 messages (`BUFFER_SIZE`) | `getBufferMessages()` |
| Summary | `conversationSummaries` | 5 max in context, triggers at 70% context usage | `needsSummarization()`, `saveSummary()` |
| Entity | `entityMemories` | 10 max in context, 11 entity types | `upsertEntityMemory()`, `getEntityMemoriesForContext()` |

**Context Building Pipeline** (`buildChatContext()` at `memoryService.ts:670`):
1. Resolve persona (if available)
2. System prompt (never trimmed)
3. Entity memories — rules always included, others ranked by relevance (40% budget)
4. Summaries — capped at 60% budget, includes project-scoped cross-session summaries
5. Buffer messages — fills remaining budget, newest-first

**ChatContext interface** (`memoryService.ts:658`):
```typescript
interface ChatContext {
  systemPrompt?: string;
  entityContext: string | null;
  summaryContext: string | null;
  bufferMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  totalTokenEstimate: number;
}
```

**Critical gap**: No `imageAssets` or `visualMemoryContext` fields. Buffer messages use only `m.content` (text) — attachments are stripped.

### 2. Message Attachment Structure

**Schema** (`schema.ts:1372`):
```typescript
attachments: json("attachments").$type<Array<{
  type: "image" | "file" | "audio" | "video";
  url: string;
  key?: string;        // S3/R2 storage key
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
}>>().default([]),
```

**Upload flow**: User uploads → S3/R2 → URL stored in attachments JSON → message saved with `createMessage()`. Attachments are **stored but never processed or sent to LLM**.

### 3. Vector Infrastructure

**Provider abstraction** (`vectorProvider.ts`, 992 lines):
- 3 providers: Cloudflare Vectorize (default), pgvector, ChromaDB
- Config from `systemSettings` table (category: "vectordb")
- Migration support: `currentReadProvider`, `targetProvider`, `mirrorWrites`
- 5-second TTL config cache

**Adapter interface**:
```typescript
interface VectorProviderAdapter {
  index(params: { indexName: string; vectors: VectorEntry[] }): Promise<{ count: number }>;
  delete(params: { indexName: string; ids: string[] }): Promise<{ count: number }>;
  search(params: { indexName: string; vector: number[]; topK: number; filter?: Record<string, ...> }): Promise<{ matches: VectorSearchMatch[] }>;
}
```

**Embedding** (`vectorize.ts`):
- Text: Cloudflare `@cf/baai/bge-base-en-v1.5` (768 dim)
- Image → text: Cloudflare LLaVA 1.5 (`generateImageDescription()`)
- Chunking: 2000 chars, 200 overlap

**Search** (`vectorize-search.ts`):
- Two indexes: `docs-index-prod`, `images-index-prod`
- Tenant isolation via metadata filter
- Min relevance threshold: 0.5

### 4. Database Schema (Memory-Related)

**conversations**: `id, userId, title, model, systemPrompt, projectId, messageCount, tenantId, personaId, memoryMode`

**conversationSummaries**: `id, conversationId, summary, messageRangeStart/End, messageCount, tokensUsed, projectId`

**entityMemories**: `id, userId, entityType (11 types), entityName, facts[], sourceConversationId, projectId, confidence, importance, source, lastAccessedAt, reinforcementCount`

**No existing vector columns** in any memory table. No pgvector extension usage in schema.

### 5. Node ↔ Python Communication

- HTTP calls from Node to `http://localhost:8000`
- Auth: `x-proxy-token` header
- Python has `embedding_service.py` (ChromaDB 384-dim, OpenAI 1536-dim) — built but not integrated
- Celery for async tasks (media generation, notifications)

### 6. Testing Patterns

**TypeScript (Vitest)**:
- `vi.mock()` for Redis, DB
- `describe/it/expect` patterns
- `beforeEach(() => vi.clearAllMocks())`
- Coverage via `@vitest/coverage-v8`

**Python (pytest)**:
- Markers: `unit`, `integration`, `e2e`, `auth`, `credits`, `llm`
- `@pytest.mark.asyncio` for async tests
- 80% coverage minimum enforced

---

## Part B: Web Research

### 1. pgvector HNSW Indexing Patterns

**HNSW vs IVFFlat**: HNSW wins for production workloads — 15.5x higher QPS at 0.998 recall. IVFFlat only for batch-reindex scenarios.

**Recommended HNSW config for this project** (768-dim embeddings, <1M rows):
```sql
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);
SET hnsw.ef_search = 100;  -- at query time
SET maintenance_work_mem = '4GB';  -- during build
```

**Quantization** (pgvector 0.7+):
- `halfvec` scalar quantization: 50% storage reduction, <1% recall loss — **strongly recommended**
- Binary quantization: 16x storage but terrible recall without reranking — skip for our scale

**Multi-tenant partitioning**:
- **Recommended**: Tenant column + partial indexes (for <10K tenants)
  ```sql
  CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops) WHERE tenant_id = ?;
  ```
- Alternative: Table partitioning by `tenant_id` for high-volume tenants

**Mixed dimensions**: Use separate tables per dimension (cleaner than partial expression indexes).

**Sources**: Crunchy Data, Neon, AWS, Jonathan Katz blog, pgvector GitHub

### 2. Gemini Embedding API Multimodal

**Current model lineup**:

| Model | Modalities | Dimensions | Status |
|-------|-----------|------------|--------|
| `text-embedding-004` | Text only | 768 | **Deprecated Jan 2026** |
| `gemini-embedding-001` | Text only | 768/1536/3072 (MRL) | GA |
| `gemini-embedding-2-preview` | **Text, Image, Audio, Video, PDF** | 128-3072 (MRL) | **Preview — first true multimodal** |

**`gemini-embedding-2-preview` is the key model**:
- Maps text + images into **unified embedding space** → cross-modal search works
- Images: up to 6 per request (PNG, JPEG)
- Matryoshka Representation Learning: choose 128 to 3072 dimensions
- **768 dimensions recommended**: "near-peak quality at one-quarter the storage footprint of 3072"
- Pricing: $0.20/1M text tokens, **$0.00012/image**
- Batch API: 50% discount for async jobs

**Comparison with alternatives**:
| Solution | True Image Embedding? | API/Self-hosted | Notes |
|----------|----------------------|-----------------|-------|
| **Gemini Embedding 2** | Yes (unified) | API | Best hosted option |
| OpenAI CLIP | Yes | Self-hosted | Requires GPU infra |
| Cohere Embed v3 | Yes | API | Good for multilingual |
| Voyage Multimodal 3 | Yes | API | 2x better on tables/figures |

**Recommendation**: Use `gemini-embedding-2-preview` at **768 dimensions** for unified text+image retrieval. Embeddings between gemini-embedding-001 and embedding-2 are **incompatible** — cannot mix in same index.

### 3. Vision Enrichment Pipeline Patterns

**Model comparison for image analysis**:

| Model | Cost/image (~1K tokens) | Quality | Best For |
|-------|------------------------|---------|----------|
| **Gemini 2.5 Flash** | ~$0.0003 | Good | **Bulk enrichment (best cost/quality)** |
| GPT-4o mini | ~$0.00015 | Good | Budget-friendly |
| Gemini 2.5 Pro | ~$0.0025 | Excellent | Complex analysis |
| Claude Sonnet 4 | ~$0.003 | Excellent | Nuanced, safety-aware |
| Claude Haiku 3.5 | ~$0.0008 | Good | Fast, cost-effective |

**Recommended structured output schema**:
```json
{
  "shortCaption": "...",
  "detailedCaption": "...",
  "objects": ["sofa", "table"],
  "styleTags": ["modern", "minimalist"],
  "materials": ["glass", "wood"],
  "colors": ["white", "gray"],
  "architectureTags": ["flat roof"],
  "ocrText": "",
  "aestheticScore": 0.85,
  "safetyFlags": []
}
```

**Async pipeline pattern**:
```
Upload → Queue (Redis/BullMQ) → Celery Worker → Vision API → Store → Index
```

**Two-pass approach for quality**:
1. Pass 1 (cheap): Gemini Flash for basic tags, objects, NSFW
2. Pass 2 (selective): Gemini Pro only for high-value/ambiguous images

**Building searchable text**:
```python
search_text = " | ".join([
    caption,
    " ".join(tags),
    " ".join(objects),
    f"style: {style}",
    f"materials: {', '.join(materials)}",
])
```

**Cost estimate** (100K images/month, Gemini Flash + Embedding 2):
| Step | Per Image | Monthly |
|------|-----------|---------|
| Vision analysis | $0.0003 | $30 |
| Embedding | $0.00012 | $12 |
| **Total** | **$0.00042** | **$42** |
| With Batch API (50% off) | | **$21** |

**Sources**: Google AI docs, IntuitionLabs, Roboflow, Novita, ArXiv

---

## Part C: Key Decisions for Implementation

### Embedding Model
**Decision**: `gemini-embedding-2-preview` at **768 dimensions**
- Unified multimodal space (text + image in same vectors)
- 768-dim is Google's recommended sweet spot
- $0.00012/image is very affordable
- Fallback: Cloudflare bge-base (768-dim text only) + LLaVA description

### Vision Analysis Model
**Decision**: Gemini 2.5 Flash for bulk analysis
- Best cost/quality ratio at $0.0003/image
- JSON mode for structured output
- Existing Cloudflare LLaVA as fallback

### Vector Storage
**Decision**: pgvector with HNSW (in-database, co-located with metadata)
- Already supported in vectorProvider.ts
- HNSW config: `m=16, ef_construction=128, ef_search=100`
- Use `halfvec` quantization for 50% storage savings
- Tenant isolation via `WHERE tenant_id = ?` in queries

### Async Processing
**Decision**: Celery tasks (Python) for vision + embedding, BullMQ (Node) for orchestration
- Consistent with existing media generation pipeline
- Separate queues: `vision-analysis` (API-bound) and `embedding-generation` (lighter)

### Testing
**Decision**: Vitest for Node services, pytest for Python services
- Mock vision API responses for deterministic tests
- Integration tests with real pgvector for retrieval accuracy
- 80% coverage target (Python), reasonable coverage (TypeScript)
