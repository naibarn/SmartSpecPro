# Section 09: Database Migration -- `agency_agent_memories` Table

## Overview

This section adds the `agency_agent_memories` table that supports Level 3 long-term memory for autonomous agents. The table stores per-user, per-agent learnings extracted from successful runs, enabling agents to improve over time. This section has **no dependencies** on other sections and **blocks section-12** (long-term memory service).

The table is defined in two places:
1. **Drizzle schema** (`apps/web/drizzle/schema.ts`) -- source of truth for migrations and tRPC queries
2. **SQLAlchemy model** (`python-backend/app/models/agency_agent_memories.py`) -- read/write model for Python backend services

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/drizzle/schema.ts` | Modify | Add `agencyAgentMemories` table definition |
| `python-backend/app/models/agency_agent_memories.py` | Create | SQLAlchemy model for Python services |
| `python-backend/app/models/all_models.py` | Modify | Register new model import |
| `python-backend/tests/unit/test_agency_agent_memories_schema.py` | Create | Schema validation tests |

---

## Tests First

### File: `python-backend/tests/unit/test_agency_agent_memories_schema.py`

This test file validates that the `agency_agent_memories` table exists with the correct schema after migration. Tests use SQLAlchemy's model introspection and the `AgencyAgentMemory` model class.

```python
"""Tests for agency_agent_memories table schema and SQLAlchemy model."""
import pytest
from app.models.agency_agent_memories import AgencyAgentMemory, MemoryType


def test_table_exists():
    """agency_agent_memories table name is correctly set on the model."""
    assert AgencyAgentMemory.__tablename__ == "agency_agent_memories"


def test_tenant_id_is_varchar36():
    """tenant_id column type matches tenants.id (VARCHAR(36))."""
    col = AgencyAgentMemory.__table__.columns["tenant_id"]
    assert str(col.type) == "VARCHAR(36)"
    assert col.nullable is False


def test_agency_id_is_varchar36():
    """agency_id column type matches agencies.id (VARCHAR(36))."""
    col = AgencyAgentMemory.__table__.columns["agency_id"]
    assert str(col.type) == "VARCHAR(36)"
    assert col.nullable is False


def test_user_id_column_exists():
    """user_id column exists and is INTEGER NOT NULL."""
    col = AgencyAgentMemory.__table__.columns["user_id"]
    assert str(col.type) == "INTEGER"
    assert col.nullable is False


def test_content_hash_column_exists():
    """content_hash column exists and is TEXT NOT NULL."""
    col = AgencyAgentMemory.__table__.columns["content_hash"]
    assert str(col.type) == "TEXT"
    assert col.nullable is False


def test_memory_type_enum_values():
    """MemoryType enum has exactly 4 values: constraint, preference, fact, skill."""
    expected = {"constraint", "preference", "fact", "skill"}
    actual = {m.value for m in MemoryType}
    assert actual == expected


def test_model_to_dict():
    """to_dict() returns all expected keys in camelCase."""
    memory = AgencyAgentMemory(
        id=1,
        tenant_id="t-1",
        agency_id="a-1",
        user_id=42,
        agent_node_id="node-1",
        memory_type="fact",
        content="test content",
        content_hash="abc123",
        confidence=0.9,
        use_count=5,
        is_active=True,
    )
    d = memory.to_dict()
    required_keys = {
        "id", "tenantId", "agencyId", "userId", "agentNodeId",
        "memoryType", "content", "contentHash", "sourceRunId",
        "confidence", "useCount", "lastUsedAt", "createdAt",
        "updatedAt", "isActive",
    }
    assert required_keys.issubset(set(d.keys()))
    assert d["tenantId"] == "t-1"
    assert d["userId"] == 42


def test_content_hash_unique_index():
    """Unique index on (tenant_id, agency_id, agent_node_id, user_id, content_hash) is defined.

    Note: The partial WHERE is_active constraint is applied in the Drizzle migration SQL.
    The SQLAlchemy model defines the composite unique index; the migration handles the
    partial predicate.
    """
    idx_names = [idx.name for idx in AgencyAgentMemory.__table__.indexes]
    assert "uq_agent_memories_content" in idx_names


def test_lookup_index_exists():
    """Composite lookup index on (tenant_id, agency_id, agent_node_id, user_id, is_active) exists."""
    idx_names = [idx.name for idx in AgencyAgentMemory.__table__.indexes]
    assert "ix_agent_memories_lookup" in idx_names
```

---

## Implementation Details

### 1. Drizzle Schema Addition

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add the `agencyAgentMemories` table definition after the existing agency-related tables (after the `agencyAgents` table and its related tables, near the end of the agency section). The table uses the same FK pattern as other agency tables: `VARCHAR(36)` for `tenantId` and `agencyId`, `serial` integer for the `id` primary key, and `integer` for `userId` referencing `users.id`.

**Table definition to add:**

```typescript
/**
 * Agency Agent Memories — Long-term learnings extracted from agent runs.
 * Scoped per-user: each user's memories are isolated.
 * Used by Level 3 autonomous agents to improve over time.
 */
export const agencyAgentMemories = pgTable("agency_agent_memories", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentNodeId: text("agentNodeId").notNull(),
  memoryType: text("memoryType").notNull(),
  // CHECK constraint applied via raw SQL in migration: memoryType IN ('constraint','preference','fact','skill')
  content: text("content").notNull(),
  contentHash: text("contentHash").notNull(),
  sourceRunId: text("sourceRunId"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).default("1.000"),
  useCount: integer("useCount").default(0).notNull(),
  lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
}, (t) => [
  index("agent_memories_tenant_idx").on(t.tenantId),
  index("agent_memories_agency_idx").on(t.agencyId),
  index("agent_memories_user_idx").on(t.userId),
  index("agent_memories_lookup_idx").on(t.tenantId, t.agencyId, t.agentNodeId, t.userId, t.isActive),
  uniqueIndex("agent_memories_content_hash_idx").on(t.tenantId, t.agencyId, t.agentNodeId, t.userId, t.contentHash),
]);

export type AgencyAgentMemory = typeof agencyAgentMemories.$inferSelect;
export type InsertAgencyAgentMemory = typeof agencyAgentMemories.$inferInsert;
```

**Key design decisions:**
- `confidence` uses `numeric(4,3)` (values 0.000-1.000) matching the codebase pattern of using `numeric` for decimal values (see `confidence` column on messages table at line 1533 of schema.ts)
- `tenantId` and `agencyId` are `VARCHAR(36)` matching the FK types of `tenants.id` and `agencies.id` (CRIT-6 from security review)
- `userId` is `INTEGER` matching `users.id` which uses `serial` (auto-increment integer)
- `onDelete: "cascade"` for all FKs -- memories are deleted when tenant, agency, or user is deleted
- The unique index on `contentHash` prevents duplicate memory content per agent+user combination
- The lookup index supports the primary query pattern: "get all active memories for this agent and user"

**Partial unique index note:** Drizzle does not natively support `WHERE` clauses on indexes. The unique index `agent_memories_content_hash_idx` enforces uniqueness across all rows. If a partial index (only `WHERE is_active = true`) is needed for soft-delete scenarios, add it via raw SQL in the generated migration file before running `pnpm db:push`:

```sql
-- Drop the Drizzle-generated full unique index and replace with partial
DROP INDEX IF EXISTS "agent_memories_content_hash_idx";
CREATE UNIQUE INDEX "agent_memories_content_hash_idx"
  ON "agency_agent_memories" ("tenantId", "agencyId", "agentNodeId", "userId", "contentHash")
  WHERE "isActive" = true;
```

**After modifying schema.ts, IMMEDIATELY run the migration:**
```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
```

Follow the Database Safety Protocol from CLAUDE.md -- this is a new table (ADD TABLE = Low risk) so row count verification of existing tables is sufficient.

### 2. SQLAlchemy Model

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/agency_agent_memories.py`

Create a new SQLAlchemy model that mirrors the Drizzle table. This model is used by the Python backend services (section-12 long-term memory) to read/write memories.

**Important:** The model uses **plain columns without ForeignKey constraints** for `tenant_id`, `agency_id`, and `user_id`. This follows the established pattern in `python-backend/app/models/agency.py` where cross-schema references (to Drizzle-owned tables) use plain columns with referential integrity enforced at the application level. The actual FK constraints live in the Drizzle migration.

The model should define:
- `__tablename__ = "agency_agent_memories"`
- All columns matching the Drizzle schema (using snake_case column names that map to the camelCase DB column names)
- `MemoryType` enum class with values: `constraint`, `preference`, `fact`, `skill`
- Two indexes matching the Drizzle definition:
  - `ix_agent_memories_lookup` on `(tenant_id, agency_id, agent_node_id, user_id, is_active)`
  - `uq_agent_memories_content` unique index on `(tenant_id, agency_id, agent_node_id, user_id, content_hash)`
- `to_dict()` method returning camelCase keys for API responses

**Column mapping (DB column name -> Python attribute):**

| DB Column | Python Attribute | SQLAlchemy Type |
|-----------|-----------------|-----------------|
| `id` | `id` | `Integer, primary_key, autoincrement` |
| `tenantId` | `tenant_id` | `String(36), nullable=False` |
| `agencyId` | `agency_id` | `String(36), nullable=False` |
| `userId` | `user_id` | `Integer, nullable=False` |
| `agentNodeId` | `agent_node_id` | `Text, nullable=False` |
| `memoryType` | `memory_type` | `String(20), nullable=False` |
| `content` | `content` | `Text, nullable=False` |
| `contentHash` | `content_hash` | `Text, nullable=False` |
| `sourceRunId` | `source_run_id` | `Text, nullable=True` |
| `confidence` | `confidence` | `Numeric(4, 3), default=1.0` |
| `useCount` | `use_count` | `Integer, default=0` |
| `lastUsedAt` | `last_used_at` | `DateTime(timezone=True), nullable=True` |
| `createdAt` | `created_at` | `DateTime(timezone=True), default=now` |
| `updatedAt` | `updated_at` | `DateTime(timezone=True), default=now` |
| `isActive` | `is_active` | `Boolean, default=True` |

**Critical:** Use the SQLAlchemy `Column("camelCaseName", ...)` pattern to map Python snake_case attributes to the camelCase DB column names that Drizzle created. For example:
```python
tenant_id = Column("tenantId", String(36), nullable=False)
```

### 3. Register Model Import

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/all_models.py`

Add an import line for the new model so it is registered with SQLAlchemy's Base metadata:

```python
from .agency_agent_memories import AgencyAgentMemory
```

---

## Migration Verification Checklist

After running the migration:

1. Verify the table exists:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_name = 'agency_agent_memories';
   ```

2. Verify column types:
   ```sql
   SELECT column_name, data_type, character_maximum_length, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'agency_agent_memories'
   ORDER BY ordinal_position;
   ```

3. Verify indexes:
   ```sql
   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'agency_agent_memories';
   ```

4. Verify FK constraints:
   ```sql
   SELECT conname, conrelid::regclass, confrelid::regclass
   FROM pg_constraint
   WHERE conrelid = 'agency_agent_memories'::regclass AND contype = 'f';
   ```

5. Verify no existing tables lost rows (new table creation should not affect existing data).

---

## Dependencies

- **No upstream dependencies** -- this section is in batch 1 and can run independently
- **Blocks section-12** (long-term memory service) which reads/writes to this table
- **Blocks section-13** (frontend Level 3) which displays memory data via tRPC procedures that query this table

---

## Risk Assessment

| Operation | Risk Level | Mitigation |
|-----------|-----------|------------|
| ADD TABLE `agency_agent_memories` | Low | New table, no existing data affected |
| ADD INDEXES | Low | New table has no rows yet |
| ADD FK constraints | Low | References existing tables with valid data |

No backup of existing tables required for this migration (new table only). Standard post-migration verification of existing table row counts is sufficient.