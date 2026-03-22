---
name: Vector Search Integration — Quick Reference
description: One-page summary of all vector search code locations, config flow, and status
type: reference
---

# Vector Search Integration — Quick Reference

## 16 Integration Points at a Glance

### Node.js Layer (4 entry points)
```
vectorProvider.ts                 [abstraction]
  ├─ resolveVectorProvider()       [config routing: search→read provider, else→write provider]
  ├─ getEffectiveVectorProviderConfig()  [precedence: switch-state > settings > env > default]
  ├─ dispatchVectorOperation()     [main dispatcher: search/index/delete]
  └─ createPgVectorAdapter()       [pgvector impl: DOUBLE PRECISION[] + in-memory cosine]

vectorize-search.ts               [tRPC data layer]
  ├─ searchDocs()                 [docs-index-prod with tenantId filter]
  └─ searchImages()               [images-index-prod with tenantId filter]

vectorize-indexing.ts             [tRPC data layer]
  ├─ indexDocument()              [chunk + embed + batch upsert (1,000/batch)]
  ├─ indexImage()                 [single embed + upsert]
  ├─ removeVector()               [single delete]
  └─ removeDocument()             [batch delete via chunk-IDs]

systemSettings.ts                 [admin API]
  ├─ getVectorDbSettings()        [read (masked)]
  ├─ updateVectorDbSettings()     [write (with Python guard)]
  ├─ testVectorDbConnection()     [validate connectivity]
  └─ getVectorDbStats()           [provider stats]
```

### Python Layer (3 modules)
```
embedding_service.py              [provider-agnostic]
  └─ class ChromaDefaultEmbedding() [all-MiniLM-L6-v2, 384D] ← rename for clarity

library_indexing_service.py       [uses VectorCollection abstraction]
  ├─ VectorUpsertFn protocol      [abstraction for upsert]
  └─ SUPPORTED_VECTOR_PROVIDERS   ["chroma", "pgvector", "cloudflare_vectorize"]

core/vectordb.py                  [⚠️ UNUSED - REMOVE]
  ├─ import chromadb              [dead code, no callers]
  └─ get_chroma_client()          [deprecated]
```

---

## Configuration Flow

```
User searches for doc
  ↓
tRPC endpoint: router.docs({ query, limit })  [routers/search.ts]
  ↓
searchDocs({ query, tenantId, limit })        [vectorize-search.ts:41]
  ├─ 1. Embed query               [generateEmbedding(query)]
  ├─ 2. Read provider config      [getEffectiveVectorProviderConfig({ tenantId })]
  │     ↓
  │     Config precedence:
  │     ├─ library_provider_switch_states table (per-tenant)
  │     ├─ system_settings table (category="vectordb")
  │     ├─ ENV vars (VECTORDB_PROVIDER, PGVECTOR_HOST, etc.)
  │     └─ default: cloudflare_vectorize
  │
  ├─ 3. Dispatch vector search    [dispatchVectorOperation({...})]
  │     ├─ Resolve adapter: pgvector? chromadb? cloudflare?
  │     ├─ Validate capability    [topK range, dimension support, metadata filter]
  │     └─ Execute search:
  │         └─ pgvector: SELECT ... WHERE metadata ->> 'tenantId' = $1 LIMIT 5000, then in-memory sort
  │
  ├─ 4. Filter results            [score >= 0.5]
  └─ 5. Return to client          [{ id, score, title, sourceUrl, ... }]
```

---

## Status Summary

| Component | File | Reads Config? | pgvector Ready? | Issues |
|-----------|------|---------------|-----------------|--------|
| Abstraction | vectorProvider.ts | ✅ | ✅ | None |
| Search ops | vectorize-search.ts | ✅ | ✅ | None |
| Index ops | vectorize-indexing.ts | ✅ | ✅ | `getVectorizeClient()` deprecated (remove) |
| Admin API | systemSettings.ts | ✅ | ✅ | None |
| Embedding | embedding_service.py | N/A | ✅ | Rename class for clarity |
| Indexing | library_indexing_service.py | ✅ | ✅ | Python lacks per-tenant switching (future work) |
| Unused | core/vectordb.py | N/A | ⚠️ N/A | Dead code (remove) |

---

## Key Code Locations

### To understand config flow
1. `vectorProvider.ts:970-991` — `getEffectiveVectorProviderConfig()`
2. `vectorProvider.ts:250-330` — Load from system_settings + switch-state
3. `vectorProvider.ts:800-823` — `resolveVectorProvider()`

### To add new provider
1. `vectorProvider.ts:786-794` — `createDefaultAdapter()`
2. Add your adapter function (e.g., `createYourProviderAdapter()`)
3. Update `PROVIDER_CAPABILITIES` [Line 75]

### To debug search failures
1. Check provider setting: `SELECT * FROM system_settings WHERE category='vectordb' AND key='provider'`
2. Test connectivity: `POST /api/admin/vectordb/test`
3. Check vector count: `SELECT count(*) FROM smartspec_vector_entries`
4. Verify embeddings: `SELECT array_length(embedding, 1) FROM smartspec_vector_entries LIMIT 1` (should be 384)

### To test new config
```bash
# Via admin API
curl -X POST http://localhost:3000/api/admin/vectordb/update \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "pgvector",
    "pgvectorHost": "localhost",
    "pgvectorDatabase": "smartspec"
  }'

# Via tRPC
router.search.docs({ query: "test", limit: 5 })
```

---

## Cleanup Tasks

### 1. Remove `getVectorizeClient()` (15 min)
- **File**: `vectorize-indexing.ts:61-114`
- **Why**: Hard-codes Cloudflare, making it incompatible with pgvector fallback
- **Check**: `grep -r "getVectorizeClient\|VectorizeClient" apps/web/` (no active callers)
- **Action**: Delete or add deprecation comment

### 2. Remove ChromaDB import in Python (30 min)
- **File**: `python-backend/app/core/vectordb.py:18-19`
- **Why**: Dead code post-migration; no callers
- **Check**: `grep -r "get_chroma_client\|vectordb" python-backend/app/ | grep -v test` (should find nothing)
- **Action**: Delete module or wrap with `@deprecated` warning

### 3. Rename embedding class (optional, 15 min)
- **File**: `embedding_service.py:66`
- **Why**: `ChromaDefaultEmbedding` name is misleading (used for pgvector too)
- **Rename to**: `DefaultEmbedding` or `MiniLMEmbedding`

---

## Verification Commands

```bash
# 1. Confirm pgvector setup
psql $DATABASE_URL -c "\d smartspec_vector_entries"

# 2. Check provider setting
psql $DATABASE_URL -c "SELECT * FROM system_settings WHERE category='vectordb' AND key='provider'"

# 3. Verify vectors exist
psql $DATABASE_URL -c "SELECT count(*), min(array_length(embedding,1)) FROM smartspec_vector_entries"

# 4. Test search (Node.js)
npm run test -- --grep "searchDocs"

# 5. Test indexing (Python)
pytest python-backend/tests/unit/services/test_library_indexing_service.py -v

# 6. Check for dead code
grep -r "getVectorizeClient\|get_chroma_client" apps/web/ python-backend/
```

---

## See Also

- `VECTOR-SEARCH-INTEGRATION-AUDIT.md` — Full audit with all details
- `VECTORDB-CHROMADB-TO-PGVECTOR-RESEARCH.md` — Provider abstraction architecture
- `systemSettings.ts` lines 1428-1806 — Admin API implementation
- `vectorProvider.ts` lines 1-100 — Type definitions and interfaces
