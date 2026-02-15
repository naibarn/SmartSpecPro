# 013 — Vector Database: Production-Ready Multi-Provider Search

## 1. Problem Statement

SmartSpecPro has **3 vector database implementations** (Cloudflare Vectorize, pgvector, ChromaDB) but none are production-ready:

- **Cloudflare Vectorize** — Client, embeddings, search API all coded but **no indexing triggers**. Content never gets indexed automatically.
- **pgvector** — Full store class implemented but **never instantiated** in any endpoint.
- **ChromaDB** — Used only for Python episodic memory. Not connected to document/media search.

The admin can configure a vector DB provider in Settings, but switching providers has no effect on actual indexing or search behavior.

**Goal:** Make all 3 providers fully functional and interchangeable via admin toggle, with automatic content indexing, deletion hooks, async queue processing, and monitoring.

---

## 2. Current Implementation Inventory

### 2.1 Cloudflare Vectorize (Node.js)

| File | Purpose | Status |
|------|---------|--------|
| `apps/web/server/services/vectorize.ts` | Embedding generation (768D, Workers AI bge-base-en-v1.5), document chunking (2000 char / 200 overlap), image description (llava-1.5-7b) | Complete |
| `apps/web/server/services/vectorize-indexing.ts` | Vectorize REST client (upsert/delete/query), `indexDocument()`, `indexImage()`, `removeDocument()` | Complete |
| `apps/web/server/services/vectorize-search.ts` | `searchDocs()`, `searchImages()` with tenant isolation, score threshold 0.5 | Complete |
| `apps/web/server/routers/search.ts` | tRPC `search.docs` + `search.images` (protectedProcedure) | Complete |
| `apps/web/server/__tests__/vectorize-indexing.test.ts` | Unit tests for chunking, batch upsert, image indexing | Complete |
| `apps/web/server/__tests__/vectorize-search.test.ts` | Unit tests for tenant filtering, topK, empty results | Complete |

**Env vars:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_KEY`, `VECTORIZE_API_TOKEN`, `VECTORIZE_DOCS_INDEX`, `VECTORIZE_IMAGES_INDEX`

### 2.2 Cloudflare Vectorize (Python)

| File | Purpose | Status |
|------|---------|--------|
| `python-backend/app/orchestrator/vector_store/cloudflare_vectorize_store.py` | Async REST client: `upsert()`, `query()`, `delete_by_ids()`, `get_by_ids()`, `test_connection()` | Complete but unused |

### 2.3 pgvector (Python)

| File | Purpose | Status |
|------|---------|--------|
| `python-backend/app/orchestrator/vector_store/pgvector_store.py` | Full async store: CRUD + hybrid search (vector 70% + keyword 30%), IVFFlat/HNSW indexes, tenant/project isolation | Complete but unused |
| `python-backend/app/orchestrator/vector_store/index_manager.py` | Index lifecycle: create, rebuild, status tracking | Complete but unused |
| `python-backend/app/models/vector_store.py` | SQLAlchemy models: `VectorCollection`, `VectorDocument`, `EmbeddingJob` | Complete but not migrated |

**Schema creates:** `vector_documents` table with `vector(1536)` column, `search_vector` tsvector, IVFFlat + GIN indexes

### 2.4 ChromaDB (Python)

| File | Purpose | Status |
|------|---------|--------|
| `python-backend/app/core/vectordb.py` | ChromaDB client wrapper, `VectorCollection` class, 3 pre-defined collections (episodic_memories, code_snippets, conversation_history) | Active for memory |
| `python-backend/app/services/embedding_service.py` | Multi-provider: `ChromaDefaultEmbedding` (384D), `OpenAIEmbedding` (1536D), LRU cache | Active |

### 2.5 Admin UI (Existing)

The `AdminSettings.tsx` vectordb tab currently allows:
- Select provider: `cloudflare_vectorize` / `chromadb` / `pgvector`
- Configure Vectorize: Account ID, API Token (encrypted), Index Name
- Test connection button
- Status display

Settings stored in `system_settings` table, category `"vectordb"`.

---

## 3. Embedding Dimension Matrix

| Provider | Model | Dimensions | Used By |
|----------|-------|------------|---------|
| Cloudflare Workers AI | `@cf/baai/bge-base-en-v1.5` | **768** | Node.js Vectorize |
| ChromaDB Default | `all-MiniLM-L6-v2` | **384** | Python episodic memory |
| OpenAI | `text-embedding-3-small` | **1536** | Python pgvector |
| OpenAI | `text-embedding-ada-002` | **1536** | Python pgvector (legacy) |
| OpenAI | `text-embedding-3-large` | **3072** | Not used |

**Critical issue:** Dimensions differ between providers. Switching providers requires re-indexing all content with the new embedding model.

---

## 4. Content Types to Index

### 4.1 Indexable Tables (Drizzle schema)

| Table | Key Fields | Index Priority | Volume |
|-------|-----------|---------------|--------|
| `galleryItems` | title, description, fileUrl, type | HIGH | Images, videos, media |
| `libraryItems` | title, description, source, sourceUrl | HIGH | Knowledge documents |
| `libraryChunks` | content (pre-chunked) | HIGH | Document chunks |
| `messages` | content, role | MEDIUM | Chat messages (RAG context) |
| `conversations` | title, summary | LOW | Session metadata |
| `conversationSummaries` | summary, keyTopics | MEDIUM | Condensed context |
| `entityMemories` | content, entityType | LOW | Entity knowledge |

### 4.2 Vector Metadata Schema (Unified)

```typescript
interface VectorMetadata {
  tenantId: string;        // Multi-tenant isolation (REQUIRED)
  type: string;            // "gallery" | "library" | "message" | "memory"
  title: string;           // Display title
  sourceUrl: string;       // Link back to source
  sourceId: string;        // DB primary key of source record
  sourceTable: string;     // "galleryItems" | "libraryItems" | etc.
  createdAt: number;       // Unix timestamp
  chunkIndex?: number;     // For multi-chunk documents
  parentId?: string;       // Original document ID if chunked
}
```

---

## 5. Gaps and Required Work

### 5.1 BLOCKING — No Indexing Triggers

Content is uploaded but **never indexed**. The following routers need indexing calls:

| Router | Action | Required Call | Priority |
|--------|--------|--------------|----------|
| `routers/gallery.ts` | upload / create | `indexImage()` or `indexDocument()` | HIGH |
| `routers/library.ts` | uploadDocument / create | `indexDocument()` | HIGH |
| `routers/library.ts` | deleteItem | `removeDocument()` | HIGH |
| `routers/gallery.ts` | deleteItem | `removeDocument()` | HIGH |
| `routers/mediaJobs.ts` | job completion callback | `indexImage()` for generated media | MEDIUM |
| `routers/chat.ts` | save message | index for RAG context | LOW |

### 5.2 BLOCKING — No Async Indexing Queue

Embedding generation is slow (100-500ms per chunk). Synchronous indexing in request handlers will block uploads. Need a background queue.

**Required:** BullMQ queue `vector-indexing` or Cloud Tasks queue for async processing.

### 5.3 BLOCKING — Provider Abstraction Layer Missing

Currently, switching provider in admin UI has no effect. Need a unified abstraction:

```
Admin selects "pgvector" → system_settings updated
→ All indexing calls route through abstraction layer
→ Abstraction reads provider setting
→ Dispatches to correct backend (Vectorize / pgvector / ChromaDB)
```

### 5.4 MAJOR — No Deletion Hooks

When content is deleted from PostgreSQL, orphaned vectors remain in the vector DB.

### 5.5 MAJOR — Index Script is Stub

`scripts/index-existing-content.ts` has disabled queries. Cannot backfill existing content.

### 5.6 MAJOR — Python ↔ Node.js Not Unified

- Node.js indexes to Vectorize (768D)
- Python uses ChromaDB (384D) for memory
- No shared index, no cross-system search
- Different embedding dimensions prevent sharing

### 5.7 MAJOR — No Audit Logging

Zero observability for vector operations (index, search, delete, errors).

### 5.8 MAJOR — pgvector Tables Not Migrated

`vector_documents` and `vector_collections` tables exist in SQLAlchemy models but are **not created in the database**. Alembic migration needed.

### 5.9 MODERATE — No Reindexing Infrastructure

No admin-triggered full/incremental reindex capability.

### 5.10 MODERATE — .env.example Missing Vector Vars

Neither `apps/web/.env.example` nor `python-backend/.env.example` documents vector DB variables.

---

## 6. Architecture Design

### 6.1 Unified Provider Abstraction (Node.js)

Create `apps/web/server/services/vectorStore.ts`:

```
VectorStoreProvider (interface)
├── CloudflareVectorizeProvider  (existing code, wrap)
├── PgVectorProvider             (new, calls Python API or direct SQL)
└── ChromaDBProvider             (new, HTTP client to ChromaDB container)

VectorStoreService (singleton)
├── getProvider() → reads system_settings → returns active provider
├── indexDocument(params) → delegates to provider
├── indexImage(params) → delegates to provider
├── removeDocument(id) → delegates to provider
├── search(query, tenantId) → delegates to provider
└── getStats() → delegates to provider
```

### 6.2 Async Indexing Pipeline

```
Upload Handler
  → enqueue to BullMQ "vector-indexing" queue
  → { action: "index", sourceTable, sourceId, tenantId }

Vector Indexing Worker (BullMQ)
  → read content from DB by sourceId
  → extract text (title + description + content)
  → chunk if needed (>2000 chars)
  → generate embeddings via active provider's model
  → upsert to active vector DB
  → log to audit (content_indexed event)
  → on failure: retry 3x with exponential backoff
  → on permanent failure: log to audit (indexing_failed event)

Deletion Handler
  → enqueue to BullMQ "vector-indexing" queue
  → { action: "delete", sourceTable, sourceId }
  → remove vectors from active vector DB
```

### 6.3 Provider Configuration Flow

```
Admin Settings → vectordb tab
  → Select provider: cloudflare_vectorize / pgvector / chromadb
  → Configure provider-specific settings
  → Test connection
  → Save

On save:
  1. Write to system_settings (category: "vectordb")
  2. Set Redis key: vector-db-provider = "cloudflare_vectorize"
  3. Clear provider singleton cache

On provider switch:
  1. Show warning: "Switching providers requires re-indexing all content"
  2. If confirmed:
     a. Update provider setting
     b. Show "Reindex All" button
     c. On click: enqueue batch reindex job
```

### 6.4 Per-Provider Configuration

#### Cloudflare Vectorize

```
Settings:
  - account_id (required)
  - api_token (encrypted, required)
  - docs_index_name (default: docs-index-prod)
  - images_index_name (default: images-index-prod)
  - embedding_model: @cf/baai/bge-base-en-v1.5 (fixed, 768D)

Characteristics:
  - Edge-distributed, low latency globally
  - Managed infrastructure (no maintenance)
  - 768-dim vectors
  - Metadata filtering for tenant isolation
  - Cost: per-query + per-stored-vector pricing
```

#### pgvector

```
Settings:
  - connection_string (uses DATABASE_URL, no extra config)
  - table_name (default: vector_documents)
  - embedding_dimension (1536 for OpenAI, 768 for Workers AI)
  - distance_metric: cosine / l2 / inner_product
  - index_type: ivfflat / hnsw
  - search_mode: vector / keyword / hybrid
  - embedding_provider: openai / cloudflare (determines dimension)

Characteristics:
  - Runs in existing PostgreSQL (no extra infra)
  - Hybrid search (vector + full-text BM25)
  - ACID transactions
  - Requires pgvector extension
  - Scales with PostgreSQL (vertical)
```

#### ChromaDB

```
Settings:
  - host (default: localhost)
  - port (default: 8001, mapped from container 8000)
  - collection_name (default: smartspec_docs)
  - persist_directory (for local mode)
  - embedding_model: all-MiniLM-L6-v2 (384D, local) or custom

Characteristics:
  - Simple setup (Docker container or in-process)
  - Good for development and small datasets
  - No SQL dependency
  - Limited scalability
  - 384-dim default (lightweight)
```

---

## 7. Implementation Plan

### Phase 1: Provider Abstraction Layer (Foundation)

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/server/services/vectorStore.ts` | Unified VectorStoreProvider interface + VectorStoreService singleton |
| `apps/web/server/services/vectorProviders/cloudflareVectorize.ts` | Wrapper around existing vectorize-indexing.ts |
| `apps/web/server/services/vectorProviders/pgvector.ts` | pgvector provider (direct SQL via Drizzle or HTTP to Python) |
| `apps/web/server/services/vectorProviders/chromadb.ts` | ChromaDB HTTP client (connect to Docker container) |

**Key interface:**

```typescript
interface VectorStoreProvider {
  name: string;
  dimensions: number;

  // Lifecycle
  initialize(): Promise<void>;
  testConnection(): Promise<{ success: boolean; message: string }>;
  getStats(): Promise<VectorStats>;

  // Indexing
  indexDocument(params: IndexDocumentParams): Promise<void>;
  indexImage(params: IndexImageParams): Promise<void>;
  removeDocument(sourceId: string): Promise<void>;

  // Search
  searchDocuments(query: string, tenantId: string, limit: number): Promise<SearchResult[]>;
  searchImages(query: string, tenantId: string, limit: number): Promise<SearchResult[]>;

  // Maintenance
  reindexAll(tenantId?: string): Promise<{ queued: number }>;
  getIndexHealth(): Promise<IndexHealth>;
}
```

### Phase 2: Indexing Triggers + Async Queue

**Files to modify:**

| File | Change |
|------|--------|
| `apps/web/server/routers/gallery.ts` | Add `enqueueVectorIndex()` after upload/create |
| `apps/web/server/routers/library.ts` | Add `enqueueVectorIndex()` after document create |
| `apps/web/server/routers/library.ts` | Add `enqueueVectorDelete()` on delete |
| `apps/web/server/routers/gallery.ts` | Add `enqueueVectorDelete()` on delete |
| `apps/web/server/routers/mediaJobs.ts` | Add `enqueueVectorIndex()` on job completion |

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/server/services/vectorQueue.ts` | BullMQ queue "vector-indexing" with index/delete/reindex job types |
| `apps/web/server/workers/vectorIndexWorker.ts` | BullMQ worker: process index/delete jobs via VectorStoreService |

**Job schema:**

```typescript
type VectorJob =
  | { action: "index"; sourceTable: string; sourceId: string; tenantId: string }
  | { action: "delete"; sourceTable: string; sourceId: string }
  | { action: "reindex_all"; tenantId?: string }
  | { action: "reindex_table"; sourceTable: string; tenantId?: string };
```

### Phase 3: pgvector Database Migration

**Files to create/modify:**

| File | Change |
|------|--------|
| `python-backend/alembic/versions/xxx_add_vector_tables.py` | Create `vector_collections`, `vector_documents`, `embedding_jobs` tables |
| SQL migration | `CREATE EXTENSION IF NOT EXISTS vector;` |
| SQL migration | Create IVFFlat + GIN indexes |

**OR for Node.js direct access:**

| File | Change |
|------|--------|
| `apps/web/drizzle/schema.ts` | Add `vectorDocuments` table with pgvector column |
| Migration | `pnpm db:push` to create table |

### Phase 4: ChromaDB Provider Integration

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/server/services/vectorProviders/chromadb.ts` | HTTP client connecting to ChromaDB container at `localhost:8001` |

ChromaDB is already running in Docker (`docker-compose.yml` line 68-87). Just needs a Node.js HTTP adapter that:
- Creates/manages collections
- Generates embeddings (via Workers AI or sends pre-embedded vectors)
- Queries with metadata filtering

### Phase 5: Backfill Script

**Files to modify:**

| File | Change |
|------|--------|
| `scripts/index-existing-content.ts` | Replace stubs with real DB queries for galleryItems, libraryItems |

**Backfill process:**

```
1. Query all galleryItems (paginated, 100 per batch)
2. For each: enqueue vector-indexing job
3. Query all libraryItems + libraryChunks
4. For each: enqueue vector-indexing job
5. Report: total queued, estimated completion time
```

### Phase 6: Admin UI Enhancements

**Files to modify:**

| File | Change |
|------|--------|
| `apps/web/client/src/pages/AdminSettings.tsx` (vectordb tab) | Add reindex controls, index health display, search testing |

**Add to vectordb tab:**

1. **Reindex Controls**
   - "Reindex All Content" button (with confirmation dialog)
   - "Reindex by Type" dropdown (gallery / library / messages)
   - Progress indicator during reindex

2. **Index Health Dashboard**
   - Total vectors indexed (per provider)
   - Last successful index timestamp
   - Failed indexing count (last 24h)
   - Average embedding latency

3. **Search Testing**
   - Test query input
   - "Search" button → display results with scores
   - Verify tenant isolation is working

4. **Provider Switch Warning**
   - When changing provider: show migration dialog
   - Explain dimension mismatch implications
   - Offer to trigger full reindex

### Phase 7: Monitoring & Observability

**Files to create/modify:**

| File | Change |
|------|--------|
| `apps/web/server/services/vectorAudit.ts` | Audit log functions for vector operations |
| `apps/web/server/routers/infrastructure.ts` | Add `getVectorHealth` endpoint |

**Audit events to log (JSONL format):**

```jsonl
{"eventType":"content_indexed","traceId":"...","tenantId":"...","sourceTable":"galleryItems","sourceId":"123","chunkCount":5,"embeddingModel":"bge-base-en-v1.5","dimensions":768,"durationMs":450,"provider":"cloudflare_vectorize","timestamp":"..."}
{"eventType":"content_deleted","traceId":"...","sourceId":"123","vectorsRemoved":5,"provider":"cloudflare_vectorize","timestamp":"..."}
{"eventType":"vector_search","traceId":"...","tenantId":"...","query":"sunset photo","resultsCount":8,"topK":10,"durationMs":120,"provider":"cloudflare_vectorize","timestamp":"..."}
{"eventType":"indexing_failed","traceId":"...","sourceId":"456","errorMessage":"Embedding API timeout","failurePoint":"embedding","attemptCount":3,"provider":"cloudflare_vectorize","timestamp":"..."}
{"eventType":"provider_switched","adminUserId":1,"from":"chromadb","to":"cloudflare_vectorize","timestamp":"..."}
{"eventType":"reindex_started","adminUserId":1,"totalDocuments":1500,"provider":"cloudflare_vectorize","timestamp":"..."}
```

**Monitoring alerts:**

| Alert | Condition | Severity |
|-------|-----------|----------|
| No indexing activity | 0 documents indexed in 24h (if content exists) | WARNING |
| High indexing failure rate | >5% of indexing jobs fail in 1h | HIGH |
| Search latency spike | p95 search latency >500ms for 10min | WARNING |
| Dead letter queue growth | vector indexing dead letters >10 | HIGH |
| Provider connection failure | testConnection() fails 3x consecutively | CRITICAL |
| Index size anomaly | Vector count drops >10% in 1h | CRITICAL |

**Admin dashboard metrics (add to Infrastructure settings or vectordb tab):**

| Metric | Source | Display |
|--------|--------|---------|
| Total vectors indexed | Provider `getStats()` | Number badge |
| Documents pending indexing | BullMQ queue depth | Number with color |
| Failed indexing (24h) | Audit log count | Red badge if >0 |
| Average search latency | Audit log p95 | ms value |
| Last successful index | Audit log max timestamp | Relative time |
| Provider health | `testConnection()` | Green/Red dot |
| Embedding cost (24h) | Audit log sum | USD value |

---

## 8. Environment Variables Specification

### 8.1 apps/web/.env

```bash
# ============================================
# Vector Database Configuration
# ============================================

# Active provider: cloudflare_vectorize | pgvector | chromadb
# Can also be set via Admin Settings UI (system_settings table)
VECTOR_DB_PROVIDER=cloudflare_vectorize

# --- Cloudflare Vectorize ---
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_AI_API_KEY=your-workers-ai-api-key
VECTORIZE_API_TOKEN=your-vectorize-token       # Optional, falls back to AI key
VECTORIZE_DOCS_INDEX=docs-index-prod
VECTORIZE_IMAGES_INDEX=images-index-prod

# --- pgvector ---
# Uses DATABASE_URL (already configured)
# Requires: CREATE EXTENSION vector; in PostgreSQL
PGVECTOR_TABLE=vector_documents
PGVECTOR_DIMENSION=768
PGVECTOR_DISTANCE_METRIC=cosine

# --- ChromaDB ---
CHROMADB_HOST=localhost
CHROMADB_PORT=8001
CHROMADB_COLLECTION=smartspec_docs
```

### 8.2 python-backend/.env

```bash
# ============================================
# Vector Database (Python Backend)
# ============================================

# Embedding provider: chromadb_default | openai
EMBEDDING_PROVIDER=chromadb_default

# ChromaDB
CHROMA_PERSIST_DIR=~/.smartspec/chroma

# Cloudflare Vectorize (if used from Python)
CF_ACCOUNT_ID=your-account-id
CF_VECTORIZE_API_TOKEN=your-token
CF_VECTORIZE_INDEX=docs-index-prod
```

---

## 9. Testing Plan

### 9.1 Unit Tests

| Test File | Tests |
|-----------|-------|
| `vectorStore.test.ts` | Provider selection, singleton caching, fallback behavior |
| `vectorProviders/cloudflareVectorize.test.ts` | Existing tests (indexing, search, deletion) |
| `vectorProviders/pgvector.test.ts` | CRUD, hybrid search, tenant filtering, dimension validation |
| `vectorProviders/chromadb.test.ts` | Collection management, upsert, query, metadata filtering |
| `vectorQueue.test.ts` | Job enqueue, worker processing, retry logic, dead letter |
| `vectorAudit.test.ts` | Event logging, metric aggregation |

### 9.2 Integration Tests

| Test | Validates |
|------|-----------|
| Upload gallery item → search for it | Full indexing pipeline |
| Upload library document → search by content | Document chunking + search |
| Delete item → search returns empty | Deletion hook working |
| Switch provider → reindex → search works | Provider abstraction |
| Concurrent uploads → all indexed | Queue concurrency handling |
| Provider unavailable → graceful degradation | Error handling |

### 9.3 End-to-End Tests

| Test | Steps |
|------|-------|
| Admin configures Vectorize | Settings → vectordb → fill config → test connection → save |
| Admin switches to pgvector | Settings → change provider → confirm reindex → verify search |
| User searches documents | Upload doc → wait for indexing → search → verify results |
| Tenant isolation | User A uploads → User B searches → zero results |

---

## 10. Migration Strategy: Switching Providers

### 10.1 Provider Switch Procedure

```
1. Admin opens Settings → Vector Database
2. Selects new provider (e.g., pgvector)
3. Configures provider-specific settings
4. Clicks "Test Connection" → verifies connectivity
5. Clicks "Save & Switch"
6. System shows warning:
   "Switching from Cloudflare Vectorize to pgvector requires re-indexing
    all content. This may take several minutes depending on content volume.
    Search will return incomplete results until reindexing completes."
7. Admin confirms
8. System:
   a. Updates system_settings (provider = pgvector)
   b. Updates Redis (vector-db-provider = pgvector)
   c. Clears provider singleton
   d. Enqueues reindex-all job
   e. New searches now query pgvector (initially empty)
   f. Background worker indexes all content into pgvector
   g. Old provider data preserved (can switch back without re-indexing)
```

### 10.2 Dimension Handling During Switch

| From | To | Action Required |
|------|-----|----------------|
| Vectorize (768D) | pgvector (768D) | Re-embed with same model, no loss |
| Vectorize (768D) | pgvector (1536D, OpenAI) | Re-embed with OpenAI model, different results |
| Vectorize (768D) | ChromaDB (384D) | Re-embed with MiniLM, lower quality |
| pgvector (1536D) | Vectorize (768D) | Re-embed with Workers AI |
| Any | Same dimension | Re-embed (model-specific vectors not transferable) |

**Key insight:** Vectors are NEVER transferable between providers even with same dimensions, because different models produce incompatible embedding spaces. Always re-embed on switch.

---

## 11. Security Considerations

### 11.1 Multi-Tenant Isolation

- **REQUIRED:** Every vector operation MUST include `tenantId` in metadata
- **REQUIRED:** Every search MUST filter by authenticated user's `tenantId`
- **REQUIRED:** `tenantId` derived from JWT, NEVER from client input
- **REQUIRED:** Admin reindex must preserve per-tenant vectors

### 11.2 API Token Security

- Vectorize API token stored encrypted in `system_settings` (`isSensitive: true`)
- Token never exposed in API responses (masked as `***configured***`)
- Token only decrypted server-side when making API calls

### 11.3 Content Exposure

- Vector embeddings are one-way (cannot reconstruct original text)
- Metadata may contain titles/URLs — respect access controls
- Search results filtered by tenant before returning to client

---

## 12. File Summary

### New Files to Create

| File | Phase | Description |
|------|-------|-------------|
| `apps/web/server/services/vectorStore.ts` | 1 | Unified provider interface + service singleton |
| `apps/web/server/services/vectorProviders/cloudflareVectorize.ts` | 1 | Wrapper around existing code |
| `apps/web/server/services/vectorProviders/pgvector.ts` | 1 | pgvector provider implementation |
| `apps/web/server/services/vectorProviders/chromadb.ts` | 4 | ChromaDB HTTP client provider |
| `apps/web/server/services/vectorQueue.ts` | 2 | BullMQ queue for async indexing |
| `apps/web/server/workers/vectorIndexWorker.ts` | 2 | Background worker for indexing jobs |
| `apps/web/server/services/vectorAudit.ts` | 7 | Audit logging for vector operations |

### Existing Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `apps/web/server/routers/gallery.ts` | 2 | Add indexing triggers on create/delete |
| `apps/web/server/routers/library.ts` | 2 | Add indexing triggers on create/delete |
| `apps/web/server/routers/mediaJobs.ts` | 2 | Add indexing on job completion |
| `apps/web/server/routers/search.ts` | 1 | Route through VectorStoreService instead of direct Vectorize |
| `apps/web/server/routers/infrastructure.ts` | 7 | Add vector health endpoint |
| `apps/web/client/src/pages/AdminSettings.tsx` | 6 | Enhance vectordb tab with reindex + health |
| `scripts/index-existing-content.ts` | 5 | Replace stubs with real DB queries |
| `apps/web/.env.example` | 1 | Add vector DB env vars |
| `python-backend/.env.example` | 1 | Add vector DB env vars |

### Database Migrations

| Migration | Phase | Description |
|-----------|-------|-------------|
| pgvector extension | 3 | `CREATE EXTENSION IF NOT EXISTS vector;` |
| vector_documents table | 3 | Create table with vector column + indexes |
| vector_collections table | 3 | Create collection management table |
| embedding_jobs table | 3 | Create job tracking table |

---

## 13. Success Criteria

| Criteria | Measurement |
|----------|------------|
| Content auto-indexed on upload | Gallery/library items searchable within 30s of upload |
| Provider switching works | Admin can switch between all 3 providers, search returns results after reindex |
| Tenant isolation verified | User A cannot see User B's search results (tested) |
| Deletion hooks work | Deleted content returns zero search results |
| Async indexing | Upload response time unaffected by indexing (< 100ms overhead) |
| Monitoring active | Audit log tracks all index/search/delete operations |
| Reindex capability | Admin can trigger full reindex from UI, completes without errors |
| All 3 providers pass tests | Unit + integration tests pass for Vectorize, pgvector, and ChromaDB |
