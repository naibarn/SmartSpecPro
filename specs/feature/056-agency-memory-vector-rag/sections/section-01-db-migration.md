# Section 01: Database Migration -- Embedding Column + Chunks Table

## Overview

This section adds the vector infrastructure required by all subsequent sections of spec 056. It creates:

1. A nullable `embedding vector(1536)` column on the existing `agency_agent_memories` table (Level 1 facts store)
2. A new `agency_memory_chunks` table (Level 2 chunks store)
3. HNSW indexes for fast cosine similarity search on both tables
4. A corresponding SQLAlchemy model for the new table
5. An update to the existing `AgencyAgentMemory` SQLAlchemy model to include the new column

This section has **no dependencies** and **blocks** sections 02, 03, 08, and 09.

---

## Verification (from TDD Plan)

No Python unit tests are needed for this section. Verification is done via SQL queries after migration:

```sql
-- 1. Confirm embedding column exists on agency_agent_memories
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'agency_agent_memories' AND column_name = 'embedding';

-- 2. Confirm agency_memory_chunks table exists
SELECT tablename FROM pg_tables WHERE tablename = 'agency_memory_chunks';

-- 3. Confirm HNSW index on agency_agent_memories
SELECT indexname FROM pg_indexes
WHERE tablename = 'agency_agent_memories'
  AND indexname = 'agent_memories_embedding_idx';

-- 4. Confirm HNSW index on agency_memory_chunks
SELECT indexname FROM pg_indexes
WHERE tablename = 'agency_memory_chunks'
  AND indexname = 'memory_chunks_embedding_idx';

-- 5. Confirm lookup index on agency_memory_chunks
SELECT indexname FROM pg_indexes
WHERE tablename = 'agency_memory_chunks'
  AND indexname = 'memory_chunks_scope_idx';

-- 6. Confirm TTL index on agency_memory_chunks
SELECT indexname FROM pg_indexes
WHERE tablename = 'agency_memory_chunks'
  AND indexname = 'memory_chunks_expires_idx';

-- 7. Confirm active-lookup index on agency_agent_memories
SELECT indexname FROM pg_indexes
WHERE tablename = 'agency_agent_memories'
  AND indexname = 'agent_memories_active_lookup_idx';

-- 8. Row count sanity (should be unchanged for agency_agent_memories)
SELECT count(*) FROM agency_agent_memories;
```

---

## File Changes

### 1. Modify: `apps/web/drizzle/schema.ts`

#### 1a. Add `embedding` column to `agencyAgentMemories`

Locate the `agencyAgentMemories` table definition (currently around line 5018). Add a single nullable column using the existing `vector1536` custom type (defined at line 6858):

```typescript
// Add after the isActive column (line ~5036):
embedding: vector1536("embedding"),
```

**Important**: The `vector1536` custom type is already defined in this file (line 6858). The `scopedMemories` table (line 6874) already uses it, so follow the same file-ordering approach. Drizzle schema evaluation is lazy (table definitions are function calls that reference column builders), so the ordering is safe. Verify by running `pnpm check` in `apps/web/` after the change.

#### 1b. Add `agencyMemoryChunks` table

Add the new table definition near the `agencyAgentMemories` table (after its type exports at line ~5046):

```typescript
/**
 * Agency Memory Chunks — Level 2 raw output chunks with vector embeddings.
 * Stores ~500 token segments of agent node outputs for semantic retrieval.
 * Short-lived (default 7 days TTL), cleaned by purge job.
 */
export const agencyMemoryChunks = pgTable("agency_memory_chunks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenantId", { length: 36 }).notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentNodeId: text("agentNodeId").notNull(),
  runId: text("runId").notNull(),
  sourceNodeId: text("sourceNodeId").notNull(),
  chunkIndex: integer("chunkIndex").notNull(),
  content: text("content").notNull(),
  embedding: vector1536("embedding"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
}, (t) => [
  index("memory_chunks_scope_idx").on(t.tenantId, t.agencyId, t.agentNodeId, t.userId),
  index("memory_chunks_expires_idx").on(t.expiresAt),
  index("memory_chunks_run_idx").on(t.runId, t.sourceNodeId),
]);

export type AgencyMemoryChunk = typeof agencyMemoryChunks.$inferSelect;
export type InsertAgencyMemoryChunk = typeof agencyMemoryChunks.$inferInsert;
```

**Notes on column types and references**:
- `id` uses `text` with `crypto.randomUUID()` default, matching the `scopedMemories` pattern (line 6875)
- `tenantId`, `agencyId`, `userId` have FK references with cascade delete, matching `agencyAgentMemories`
- `embedding` uses the shared `vector1536` custom type
- `metadata` uses `jsonb` for flexible structured data (model name, iteration count, etc.)
- `expiresAt` is NOT NULL because every chunk must have a TTL

**Indexes defined in Drizzle** (B-tree, handled natively):
- `memory_chunks_scope_idx` -- compound lookup for scoped queries
- `memory_chunks_expires_idx` -- B-tree for TTL cleanup queries
- `memory_chunks_run_idx` -- lookup by run + source node

**Indexes NOT defined in Drizzle** (HNSW, must be added manually to migration SQL):
- `agent_memories_embedding_idx` -- HNSW on `agency_agent_memories.embedding`
- `memory_chunks_embedding_idx` -- HNSW on `agency_memory_chunks.embedding`
- `agent_memories_active_lookup_idx` -- partial compound index

### 2. Migration SQL Amendments

After running `drizzle-kit generate` in `apps/web/`, the generated migration SQL will include the column addition and table creation. **Manually append** the following index statements to the generated `.sql` file (Drizzle does not generate pgvector HNSW indexes):

```sql
-- HNSW index for vector search on L1 facts (partial: active only)
CREATE INDEX IF NOT EXISTS agent_memories_embedding_idx
ON agency_agent_memories USING hnsw (embedding vector_cosine_ops)
WHERE "isActive" = true;

-- Compound lookup for scoped active memory queries
CREATE INDEX IF NOT EXISTS agent_memories_active_lookup_idx
ON agency_agent_memories ("tenantId", "agencyId", "agentNodeId", "userId")
WHERE "isActive" = true;

-- HNSW index for vector search on L2 chunks
CREATE INDEX IF NOT EXISTS memory_chunks_embedding_idx
ON agency_memory_chunks USING hnsw (embedding vector_cosine_ops);
```

**HNSW parameters**: Use defaults (m=16, ef_construction=64). These are optimal for the expected scale of < 1M rows per the research findings.

**Partial index note**: The `agent_memories_embedding_idx` uses `WHERE "isActive" = true` so that inactive/soft-deleted memories are excluded from the index, making it smaller and faster. Query predicates in Python must include `is_active == True` to use this index.

### 3. Run Migration

Follow the Database Safety Protocol from CLAUDE.md:

```bash
# Step 1: Backup
mkdir -p .db-backups
pg_dump "$DATABASE_URL" --data-only --table=agency_agent_memories \
  --file=".db-backups/agency_agent_memories_$(date +%Y%m%d_%H%M%S).sql"

# Step 2: Record row counts
psql "$DATABASE_URL" -c "SELECT count(*) FROM agency_agent_memories;"

# Step 3: Generate and apply migration
cd apps/web && pnpm db:push

# Step 4: Verify (run the SQL queries from the Verification section above)

# Step 5: Verify row counts unchanged
psql "$DATABASE_URL" -c "SELECT count(*) FROM agency_agent_memories;"
```

**Risk**: LOW -- this adds a nullable column (no data migration) and creates a new table. Existing rows get `embedding = NULL`. No existing data is modified.

---

### 4. Create: `python-backend/app/models/agency_memory_chunks.py`

New SQLAlchemy model mirroring the Drizzle schema. Follow the pattern established by existing models.

**Class**: `AgencyMemoryChunk(Base)`
- `__tablename__` = `"agency_memory_chunks"`
- Column names use camelCase strings matching the Drizzle SQL column names (e.g., `Column("tenantId", ...)`)
- Python attribute names use snake_case (e.g., `tenant_id = Column("tenantId", ...)`)

**Columns** (all must match the Drizzle schema exactly):

| Python attribute | DB column name | SQLAlchemy type | Nullable |
|-----------------|----------------|-----------------|----------|
| `id` | `id` | `Text, primary_key=True` | No |
| `tenant_id` | `tenantId` | `String(36)` | No |
| `agency_id` | `agencyId` | `String(36)` | No |
| `user_id` | `userId` | `Integer` | No |
| `agent_node_id` | `agentNodeId` | `Text` | No |
| `run_id` | `runId` | `Text` | No |
| `source_node_id` | `sourceNodeId` | `Text` | No |
| `chunk_index` | `chunkIndex` | `Integer` | No |
| `content` | `content` | `Text` | No |
| `embedding` | `embedding` | `Vector(1536)` | Yes |
| `metadata_json` | `metadata` | `JSON` | Yes |
| `created_at` | `createdAt` | `DateTime(timezone=True)` | No |
| `expires_at` | `expiresAt` | `DateTime(timezone=True)` | No |

**Vector column import**: Use the same pattern as existing models:

```python
try:
    from pgvector.sqlalchemy import Vector
    _VECTOR_TYPE = Vector(1536)
except ImportError:
    from sqlalchemy import JSON
    _VECTOR_TYPE = JSON  # type: ignore[assignment]
```

**Table args**: Define indexes matching the Drizzle-generated B-tree indexes:

```python
__table_args__ = (
    Index("memory_chunks_scope_idx", "tenantId", "agencyId", "agentNodeId", "userId"),
    Index("memory_chunks_expires_idx", "expiresAt"),
    Index("memory_chunks_run_idx", "runId", "sourceNodeId"),
)
```

**Methods**: Include `to_dict(self) -> dict` following the `AgencyAgentMemory.to_dict()` pattern.

---

### 5. Modify: `python-backend/app/models/agency_agent_memories.py`

Add the `embedding` column to the existing `AgencyAgentMemory` model:

```python
# Add Vector import (same pattern as other models)
try:
    from pgvector.sqlalchemy import Vector
    _VECTOR_TYPE = Vector(1536)
except ImportError:
    from sqlalchemy import JSON as _VECTOR_TYPE  # type: ignore[assignment]

# Add column to class body (after is_active):
embedding = Column("embedding", _VECTOR_TYPE, nullable=True)
```

---

### 6. Modify: `python-backend/app/models/__init__.py`

Add the new model import:

```python
from .agency_memory_chunks import AgencyMemoryChunk
```

### 7. Modify: `python-backend/app/models/all_models.py`

Add the import to ensure the model is registered with SQLAlchemy metadata:

```python
from .agency_memory_chunks import AgencyMemoryChunk
```

---

## Tenant Settings Extension

Add `chunkRetentionDays` to the tenant settings type. This is a minor addition used by sections 03 and 08.

**TypeScript side** (`apps/web/`): Locate the TypeScript type definition for tenant settings (in the `tenants` table type or a shared settings interface). Add:

```typescript
chunkRetentionDays?: number;  // Range: 3-30, default: 7
```

**Python side**: Read from the tenant settings as `settings.get("chunkRetentionDays", 7)` at usage sites (sections 03 and 08).

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `vector1536` reference order in schema.ts | Low | Medium | `pnpm check` validates; Drizzle uses lazy evaluation |
| HNSW index build on empty column | Very Low | None | Building on NULL-only column is instant |
| Migration failure due to missing pgvector extension | Low | High | pgvector is already installed (used by `scoped_memories`) |
| Python import of `pgvector.sqlalchemy` fails | Low | Low | Fallback to JSON type |

## Rollback

All changes are purely additive:
1. The `embedding` column can be left in place (nullable, no impact)
2. The `agency_memory_chunks` table can be dropped safely (new, no data depends on it)
3. The HNSW indexes can be dropped without data loss
