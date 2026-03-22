---
name: Vector Database Configuration - ChromaDB to pgvector Migration
description: Complete mapping of vector DB configuration, provider selection, embedding service, and settings management for switching from ChromaDB to pgvector
type: reference
---

# Vector Database Configuration Research

**Last Updated:** 2026-03-18
**Status:** Complete — All configuration layers mapped

## Executive Summary

SmartSpecPro has a **multi-provider vector database abstraction** supporting chromadb, pgvector, and cloudflare_vectorize. The system uses:
- **Node.js service**: `vectorProvider.ts` — Provider abstraction, configuration, all I/O operations
- **Admin panel**: `AdminSettings.tsx` → `systemSettings.ts` → system_settings table (category: "vectordb")
- **Python embedding**: `embedding_service.py` — Generates embeddings (currently chromadb default, supports OpenAI)
- **Feature flag control**: Calls Python backend guard before allowing config changes
- **Multimodal retrieval**: Uses vectorProvider to fetch embeddings for context

To switch from chromadb to pgvector, you update the `provider` field in system_settings via the admin UI or API.

---

## 1. Vector Provider Abstraction (vectorProvider.ts)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/vectorProvider.ts` (992 lines)

### Supported Providers

| Provider | Status | Key Features | Config Keys |
|----------|--------|-------------|------------|
| **chromadb** | ✅ Current default | File-based (JSON), default embedding model (all-MiniLM-L6-v2), lock-based concurrency | `chromaPersistDir` |
| **pgvector** | ✅ Available | PostgreSQL with pgvector extension, configurable dimensions (384-1536), SQL-based filtering | `pgvectorHost`, `pgvectorPort`, `pgvectorDatabase`, `pgvectorUser`, `pgvectorPassword` |
| **cloudflare_vectorize** | ✅ Available | Cloudflare Edge, 768D, metadata filtering | `vectorizeAccountId`, `vectorizeApiToken` |

### Provider Resolution

**Function:** `resolveVectorProvider(operation, config)` (line 800-823)

Logic for selecting which provider to use:
```typescript
// Search (read) operations
provider = readProvider || configuredProvider || defaultProvider

// Write (index/delete) operations
provider = writeProvider || configuredProvider || defaultProvider

// Default provider: "cloudflare_vectorize"
```

**Switch state support** (lines 296-329):
- Reads from `library_provider_switch_states` table (Python backend migration)
- Supports `currentReadProvider` (read from old) + `targetProvider` (write to new) during cutover
- Allows gradual migration: read from old provider, write to new provider

### Adapter Architecture

Each provider has a `VectorProviderAdapter` with:
- `capabilities`: min/max topK, supported dimensions, metadata filter support
- `index(params)`: Add or upsert vectors
- `delete(params)`: Remove by ID
- `search(params)`: Vector similarity search with metadata filtering

**Chromadb Adapter** (lines 731-784):
- Stores vectors in JSON files on disk
- Uses `CHROMA_PERSIST_DIR` environment variable or `/tmp/smartspec-chromadb/`
- File-level locking with `.lock` files to prevent concurrent access corruption
- Lock timeout: 5 seconds

**pgvector Adapter** (lines 656-729):
- Table name: `smartspec_vector_entries` (auto-created in PostgreSQL)
- Schema: `index_name (TEXT), vector_id (TEXT), embedding (double precision[]), metadata (JSONB), updated_at (TIMESTAMPTZ)`
- Search: Loads all matching rows into memory, computes cosine similarity, sorts, returns top-K
- Max scan: 5000 rows per search

**Cloudflare Vectorize Adapter** (lines 512-592):
- HTTP API: `https://api.cloudflare.com/client/v4/accounts/{accountId}/vectorize/indexes/{indexName}`
- Operations: `/upsert`, `/delete-by-ids`, `/query`
- Requires: Account ID + API Token

### Configuration Flow

**Load configuration** (lines 970-991):
1. Read from environment variables (`VECTORDB_PROVIDER`, `VECTORDB_CURRENT_READ_PROVIDER`, etc.)
2. Load from database (`systemSettings` table, category="vectordb")
3. Check `library_provider_switch_states` for tenant-specific overrides
4. Cache for 5 seconds (TTL: `EFFECTIVE_CONFIG_CACHE_TTL_MS = 5000`)

```typescript
await getEffectiveVectorProviderConfig({ tenantId?, forceRefresh? })
  // Returns merged config: env → stored → switch state
```

### Metadata Support

**VectorMetadata type** (lines 14-21):
```typescript
{
  tenantId: string;
  type: string;
  createdAt: number;
  title: string;
  sourceUrl: string;
  description?: string;
}
```

All providers support metadata filtering in search (WHERE clauses).

---

## 2. System Settings Storage

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

### systemSettings Table

Category: **"vectordb"** stores all configuration:

| Key | Type | Sensitive | Default | Example Value |
|-----|------|-----------|---------|----------------|
| `provider` | enum | NO | chromadb | chromadb / pgvector / cloudflare_vectorize |
| `currentReadProvider` | string | NO | - | pgvector |
| `targetProvider` | string | NO | - | cloudflare_vectorize |
| `mirrorWrites` | boolean | NO | - | true / false |
| `chromaPersistDir` | string | NO | ~/.smartaihub/chroma | /var/lib/smartspec/vectors |
| `pgvectorHost` | string | NO | - | postgres.local |
| `pgvectorPort` | string | NO | 5432 | 5432 |
| `pgvectorDatabase` | string | NO | - | vectors_db |
| `pgvectorUser` | string | NO | - | vector_user |
| `pgvectorPassword` | string | YES | - | (encrypted) |
| `vectorizeAccountId` | string | NO | - | 1a2b3c4d5e6f7g8h9i0j |
| `vectorizeApiToken` | string | YES | - | (encrypted) |

**Encryption:** Sensitive fields encrypted with `encrypt()` from `crypto.ts` before storage.

---

## 3. Admin Settings Panel

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSettings.tsx`

### Current Implementation

- Tab-based interface (stripe, invoice, email, etc.)
- **VectorDB tab not yet in UI** — Only backend endpoints exist
- Frontend would need new tab component similar to InfrastructureSettingsPanel or StorageSettingsPanel

### Backend Endpoints (systemSettings.ts)

#### getVectorDbSettings

**Route:** `systemSettings.getVectorDbSettings`
**Access:** `adminProcedure` only

Returns current configuration with masked sensitive values:
```typescript
{
  provider: "chromadb",
  embeddingModel: "all-MiniLM-L6-v2",
  embeddingDimension: 384,
  chromaPersistDir: string,
  pgvectorHost: string | undefined,
  pgvectorPort: string | undefined,
  pgvectorDatabase: string | undefined,
  pgvectorUser: string | undefined,
  pgvectorPasswordConfigured: boolean,
  openaiApiKeyConfigured: boolean,
  vectorizeAccountId: string | undefined,
  vectorizeApiTokenConfigured: boolean,
}
```

#### updateVectorDbSettings

**Route:** `systemSettings.updateVectorDbSettings`
**Access:** `adminProcedure` only
**Guard:** Calls Python backend `/api/admin/vectordb/provider-switch/assert-config-edit` before allowing changes

**Input schema:**
```typescript
{
  provider?: "chromadb" | "pgvector" | "cloudflare_vectorize",
  chromaPersistDir?: string,
  pgvectorHost?: string,
  pgvectorPort?: string,
  pgvectorDatabase?: string,
  pgvectorUser?: string,
  pgvectorPassword?: string,
  openaiApiKey?: string,
  vectorizeAccountId?: string,
  vectorizeApiToken?: string,
  vectorizeIndexName?: string,
}
```

Process:
1. Call `assertVectorDbConfigEditAllowedOrThrow()` (lines 99-127) — Python guard
2. For each field, INSERT or UPDATE in `systemSettings` table
3. Encrypt sensitive values before storing
4. Return `{ success: true }`

#### testVectorDbConnection

**Route:** `systemSettings.testVectorDbConnection`
**Access:** `adminProcedure` only

Tests connectivity to the configured provider:

**ChromaDB test:**
- Checks if persist directory exists
- Returns directory path + list of collection names

**pgvector test:**
- Creates temporary `pg.Pool` connection
- Queries `pg_extension` table for 'vector' extension
- Returns version if found

**Cloudflare Vectorize test:**
- Makes HTTP request to Cloudflare API
- Checks index metadata
- Returns dimensions, metric (cosine), and confirms index exists

#### getVectorDbStats

**Route:** `systemSettings.getVectorDbStats`
**Access:** `adminProcedure` only

Returns provider-specific statistics (collection counts, document counts, storage size, etc.).

---

## 4. Python Backend Embedding Service

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/embedding_service.py` (337 lines)

### Architecture

**EmbeddingProvider ABC** with two implementations:

#### ChromaDefaultEmbedding

- Uses ChromaDB's default embedding function
- Model: `all-MiniLM-L6-v2`
- Dimension: 384
- Auto-downloaded by ChromaDB

```python
from chromadb.utils import embedding_functions
self._ef = embedding_functions.DefaultEmbeddingFunction()
```

#### OpenAIEmbedding

- API: OpenAI embeddings endpoint
- Models supported:
  - `text-embedding-ada-002` (1536D)
  - `text-embedding-3-small` (1536D)
  - `text-embedding-3-large` (3072D)
- Requires `OPENAI_API_KEY`

### EmbeddingService

Wrapper with caching:
- LRU cache with configurable max size (default: 10,000)
- Batch processing support
- Cache key: MD5 hash of text

```python
service = EmbeddingService(provider=OpenAIEmbedding(...))
embeddings = service.embed_batch(texts)  # Returns List[List[float]]
```

### Current Usage

- Default provider: `ChromaDefaultEmbedding()` — 384D vectors
- Used by multimodal memory and episodic memory systems
- No explicit provider selection via settings yet (could be added)

---

## 5. Multimodal Retrieval Integration

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/multimodalRetrievalService.ts`

### How Vectors Are Used

- Stores embeddings in `multimodalMemoryVectors` table (768-dimensional for multimodal)
- Calls `dispatchVectorOperation()` to search for relevant memory items
- Supports hybrid ranking: explicit + vector + recency + metadata + project scope + salience

### Vector Indexing

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/vectorize-indexing.ts`

- Calls `dispatchVectorOperation({ operation: "index", ... })` to store embeddings
- Calls `dispatchVectorOperation({ operation: "delete", ... })` to remove old vectors

---

## 6. How to Switch from ChromaDB to pgvector

### Option A: Direct Switch (Simple, No Downtime Window)

1. **Provision pgvector:**
   ```bash
   # Ensure PostgreSQL has pgvector extension installed
   psql -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

2. **Admin panel or API:** Update `provider` setting
   ```bash
   curl -X POST http://localhost:3000/api/trpc/systemSettings.updateVectorDbSettings \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <admin_token>" \
     -d '{
       "provider": "pgvector",
       "pgvectorHost": "localhost",
       "pgvectorPort": "5432",
       "pgvectorDatabase": "smartspec",
       "pgvectorUser": "smartspec",
       "pgvectorPassword": "..."
     }'
   ```

3. **Verify connection:**
   ```bash
   curl -X POST http://localhost:3000/api/trpc/systemSettings.testVectorDbConnection \
     -H "Authorization: Bearer <admin_token>"
   ```

4. **Next read/write operations use pgvector**

**Risk:** Old chromadb vectors are abandoned; multimodal memory searches start from empty pgvector table.

### Option B: Gradual Migration (Zero Data Loss)

Uses `currentReadProvider` + `targetProvider` + `mirrorWrites`:

1. **Phase 1:** Configure pgvector settings + enable dual writes
   ```typescript
   {
     "provider": "chromadb",  // Still the default
     "currentReadProvider": "chromadb",  // Still reading from chroma
     "targetProvider": "pgvector",  // Start writing to pgvector
     "mirrorWrites": true,  // Write to BOTH
     "pgvectorHost": "...",
     "pgvectorPort": "...",
     ...
   }
   ```

2. **Phase 2:** Re-index all existing vectors to pgvector
   - Call `systemSettings.vectorDbReindex()` (if implemented)
   - Or manually: read all from chromadb, write to pgvector

3. **Phase 3:** Flip reads to pgvector
   ```typescript
   {
     "currentReadProvider": "pgvector",
     "targetProvider": "chromadb",  // Fallback
     "mirrorWrites": false,
   }
   ```

4. **Phase 4:** Turn off chromadb writes
   ```typescript
   {
     "provider": "pgvector",
     "currentReadProvider": undefined,
     "targetProvider": undefined,
   }
   ```

**Advantage:** Zero data loss, can rollback at any phase.

---

## 7. Key Files Summary

| File | Purpose | Lines |
|------|---------|-------|
| `apps/web/server/services/vectorProvider.ts` | Provider abstraction, adapters, config resolution | 992 |
| `apps/web/server/routers/systemSettings.ts` | Admin CRUD + test + stats endpoints | ~2000 |
| `apps/web/client/src/pages/AdminSettings.tsx` | Admin UI (needs VectorDB tab) | 1500+ |
| `python-backend/app/services/embedding_service.py` | Embedding generation (ChromaDB default or OpenAI) | 337 |
| `apps/web/server/services/multimodalRetrievalService.ts` | Multimodal memory using vectors | 500+ |
| `apps/web/server/services/vectorize-indexing.ts` | Vector storage (calls dispatchVectorOperation) | 200+ |
| `drizzle/schema.ts` | systemSettings table definition | 1 |

---

## 8. Environment Variables

```bash
# Vector DB Provider Selection
VECTORDB_PROVIDER=chromadb  # Default: chromadb, pgvector, cloudflare_vectorize
VECTORDB_CURRENT_READ_PROVIDER=
VECTORDB_TARGET_PROVIDER=
VECTORDB_MIRROR_WRITES=false

# ChromaDB
CHROMA_PERSIST_DIR=~/.smartaihub/chroma

# pgvector
PGVECTOR_HOST=localhost
PGVECTOR_PORT=5432
PGVECTOR_DATABASE=smartspec
PGVECTOR_USER=smartspec
PGVECTOR_PASSWORD=

# Cloudflare Vectorize
CLOUDFLARE_ACCOUNT_ID=
VECTORIZE_API_TOKEN=  # or CLOUDFLARE_AI_API_KEY

# Embedding service (Python backend)
OPENAI_API_KEY=  # For OpenAI embeddings
```

---

## 9. Vector Dimensions

| Provider | Min | Max | Supported | Notes |
|----------|-----|-----|-----------|-------|
| chromadb | 384 | 768 | [384, 768] | all-MiniLM-L6-v2 (384) is default |
| pgvector | 384 | 1536 | [384, 768, 1024, 1536] | Flexible, can store any dimension |
| cloudflare_vectorize | 768 | 768 | [768] | Fixed 768-dimension Cloudflare model |

**Multimodal memory:** Uses 768D vectors (see schema.ts multimodalMemoryVectors table).

---

## 10. Existing pgvector Implementation Details

### Table Schema (Auto-created)

```sql
CREATE TABLE smartspec_vector_entries (
  index_name TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  embedding DOUBLE PRECISION[] NOT NULL,
  metadata JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (index_name, vector_id)
);

CREATE INDEX smartspec_vector_entries_index_name_idx
  ON smartspec_vector_entries (index_name);
```

### Search Query Pattern

```sql
SELECT vector_id, embedding, metadata
FROM smartspec_vector_entries
WHERE index_name = $1
  [AND metadata ->> 'key' = 'value' ...]  -- Metadata filtering
LIMIT 5000  -- MAX_PGVECTOR_SEARCH_SCAN

-- Results: Cosine similarity computed in-memory by adapter
```

### Concurrency Safety

- No explicit locks (unlike chromadb file locks)
- PostgreSQL ACID guarantees row-level consistency
- Multiple workers can write concurrently

---

## 11. Python Backend Guard

**Function:** `assertVectorDbConfigEditAllowedOrThrow()` (systemSettings.ts lines 99-127)

Before allowing vectordb config changes, calls Python backend:
```
POST /api/admin/vectordb/provider-switch/assert-config-edit
{
  "tenant_id": null,
  "emergency": false
}
```

Returns:
- **200 OK:** Config edit allowed
- **409 Conflict:** Migration in progress, cannot edit unless emergency=true
- **Other error:** Config edit blocked for other reasons

**Purpose:** Prevents overlapping reindex operations or cutover conflicts.

---

## 12. Testing

**Test file:** `apps/web/server/services/__tests__/vectorProvider.test.ts`

Tests:
- Provider resolution logic (read/write provider selection)
- Configuration loading (env + DB + cache)
- Adapter registration (override for testing)
- Error classification (transient vs permanent)

---

## Next Steps

To implement a full VectorDB admin UI panel:

1. Create `VectorDatabasePanel.tsx` component in `apps/web/client/src/components/admin/`
2. Add tab to `AdminSettings.tsx`
3. Call `trpc.systemSettings.getVectorDbSettings.useQuery()`
4. Render provider selector + connection-specific inputs
5. Implement "Test Connection" button (calls `testVectorDbConnection`)
6. Implement "Reindex" button (calls Python backend reindex endpoint)
7. Display stats via `getVectorDbStats`

---

## References

- Root CLAUDE.md: Encryption & Secrets Safety
- chromadb default embedding: all-MiniLM-L6-v2 (384D, MIT license)
- pgvector PostgreSQL extension: https://github.com/pgvector/pgvector
- Cloudflare Vectorize: https://developers.cloudflare.com/vectorize/
