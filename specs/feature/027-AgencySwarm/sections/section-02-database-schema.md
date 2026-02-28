Now I have all the context needed to write the section. Let me produce the content.

# Section 02 -- Database Schema

## Overview

This section creates 8 new database tables for the Agency-Swarm integration feature. Six tables are managed by Drizzle ORM (Node.js side) and two high-write runtime tables are managed by SQLAlchemy (Python side). Additionally, the existing `creditSourceTypeEnum` and `sandboxFeatureTypeEnum` Drizzle enums are extended with an `"agency"` value, and the `CreditSourceType` TypeScript union in the credit service is updated.

All changes are **additive** -- no existing tables are modified, no columns renamed or dropped. Risk is low, but standard backup protocol must be followed before running migrations per project rules.

**Dependencies:**
- **section-01-pre-validation** must be complete (Python 3.12 + dependency upgrades, feature flags)

**Blocks:** sections 03, 04, 05, 06 (all Python and Node.js service layers depend on these tables)

---

## Files to Create or Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | Modify | Add 6 new pgTable definitions + 2 new enum values |
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.test.ts` | Modify | Add schema validation tests for all 6 new tables |
| `/home/dev/projects/SmartSpecPro/python-backend/app/models/agency.py` | Create | SQLAlchemy models for `agency_messages` and `agency_runs` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/models/__init__.py` | Modify | Register new agency models |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/database.py` | Modify | Import agency models in `init_db()` |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_models.py` | Create | SQLAlchemy model tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts` | Modify | Add `"agency"` to `CreditSourceType` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/sandbox.ts` | Modify | Add `"agency"` to featureType zod enum |

---

## Tests FIRST

### Drizzle Schema Tests (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.test.ts`

Add the following test blocks to the existing test file. These tests follow the same pattern as the existing `user_groups` and `group_members` tests -- they validate column presence, types, and constraints using `getTableColumns()`.

```typescript
import {
  agencies,
  agencyAgents,
  agencyAgentTools,
  agencyTools,
  agencyCommunicationFlows,
  agencyConversations,
} from './schema';

describe('agencies table schema', () => {
  test('has all required columns', () => {
    const columns = getTableColumns(agencies);
    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.slug).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.description).toBeDefined();
    expect(columns.systemPrompt).toBeDefined();
    expect(columns.creditMultiplier).toBeDefined();
    expect(columns.maxAgents).toBeDefined();
    expect(columns.maxRunTimeSeconds).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.isFallbackSafe).toBeDefined();
    expect(columns.isPublished).toBeDefined();
    expect(columns.createdBy).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
  });

  test('tenantId is not null (FK constraint)', () => {
    const columns = getTableColumns(agencies);
    expect(columns.tenantId.notNull).toBe(true);
  });

  test('unique constraint on (tenantId, slug) is defined', () => {
    const columns = getTableColumns(agencies);
    expect(columns.tenantId).toBeDefined();
    expect(columns.slug).toBeDefined();
    // Unique index verified at migration level
  });

  test('cascade delete on tenantId FK', () => {
    // Verified by referencing tenants.id with onDelete: "cascade"
    const columns = getTableColumns(agencies);
    expect(columns.tenantId).toBeDefined();
  });
});

describe('agency_agents table schema', () => {
  test('has all required columns', () => {
    const columns = getTableColumns(agencyAgents);
    expect(columns.id).toBeDefined();
    expect(columns.agencyId).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.description).toBeDefined();
    expect(columns.instructions).toBeDefined();
    expect(columns.model).toBeDefined();
    expect(columns.modelSettings).toBeDefined();
    expect(columns.isEntryPoint).toBeDefined();
    expect(columns.isOptional).toBeDefined();
    expect(columns.position).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
  });

  test('agencyId is not null (FK constraint)', () => {
    const columns = getTableColumns(agencyAgents);
    expect(columns.agencyId.notNull).toBe(true);
  });
});

describe('agency_agent_tools junction table schema', () => {
  test('has all required columns', () => {
    const columns = getTableColumns(agencyAgentTools);
    expect(columns.id).toBeDefined();
    expect(columns.agentId).toBeDefined();
    expect(columns.toolId).toBeDefined();
    expect(columns.createdAt).toBeDefined();
  });

  test('agentId and toolId are not null', () => {
    const columns = getTableColumns(agencyAgentTools);
    expect(columns.agentId.notNull).toBe(true);
    expect(columns.toolId.notNull).toBe(true);
  });
});

describe('agency_tools table schema', () => {
  test('has all required columns', () => {
    const columns = getTableColumns(agencyTools);
    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.description).toBeDefined();
    expect(columns.toolType).toBeDefined();
    expect(columns.config).toBeDefined();
    expect(columns.riskLevel).toBeDefined();
    expect(columns.requiresApproval).toBeDefined();
    expect(columns.createdAt).toBeDefined();
  });
});

describe('agency_communication_flows table schema', () => {
  test('has all required columns', () => {
    const columns = getTableColumns(agencyCommunicationFlows);
    expect(columns.id).toBeDefined();
    expect(columns.agencyId).toBeDefined();
    expect(columns.fromAgentId).toBeDefined();
    expect(columns.toAgentId).toBeDefined();
    expect(columns.flowType).toBeDefined();
    expect(columns.createdAt).toBeDefined();
  });

  test('unique constraint on (agencyId, fromAgentId, toAgentId) is defined', () => {
    const columns = getTableColumns(agencyCommunicationFlows);
    expect(columns.agencyId).toBeDefined();
    expect(columns.fromAgentId).toBeDefined();
    expect(columns.toAgentId).toBeDefined();
  });
});

describe('agency_conversations table schema', () => {
  test('has all required columns', () => {
    const columns = getTableColumns(agencyConversations);
    expect(columns.id).toBeDefined();
    expect(columns.agencyId).toBeDefined();
    expect(columns.userId).toBeDefined();
    expect(columns.title).toBeDefined();
    expect(columns.totalCreditsUsed).toBeDefined();
    expect(columns.messageCount).toBeDefined();
    expect(columns.isArchived).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
  });

  test('UUID primary key format (varchar 36)', () => {
    const columns = getTableColumns(agencyConversations);
    expect(columns.id).toBeDefined();
    // PK is varchar(36) for UUID consistency with other agency tables
  });
});
```

### SQLAlchemy Model Tests (pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_models.py`

```python
"""Tests for agency SQLAlchemy models (agency_messages, agency_runs)."""

import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.database import Base
from app.models.agency import AgencyMessage, AgencyRun, AgencyRunStatus


@pytest.fixture(scope="function")
async def agency_db():
    """Create in-memory SQLite DB with agency tables for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyMessage:
    """Tests for the agency_messages SQLAlchemy model."""

    async def test_create_message_without_fk_constraint(self, agency_db):
        """agency_messages has no DB FK to agency_conversations (Drizzle-owned table)."""
        msg = AgencyMessage(
            conversation_id="conv-uuid-1234",
            agent_name="Researcher",
            role="assistant",
            content="Hello from agent",
        )
        agency_db.add(msg)
        await agency_db.commit()
        await agency_db.refresh(msg)
        assert msg.id is not None
        assert msg.conversation_id == "conv-uuid-1234"

    async def test_pii_redacted_defaults_to_false(self, agency_db):
        """pii_redacted flag defaults to False."""
        msg = AgencyMessage(
            conversation_id="conv-uuid-1234",
            agent_name="Writer",
            role="assistant",
            content="Some content",
        )
        agency_db.add(msg)
        await agency_db.commit()
        await agency_db.refresh(msg)
        assert msg.pii_redacted is False

    async def test_all_role_values_accepted(self, agency_db):
        """role column accepts user, assistant, system, tool."""
        for role in ("user", "assistant", "system", "tool"):
            msg = AgencyMessage(
                conversation_id="conv-uuid-1234",
                agent_name="Agent",
                role=role,
                content=f"Message with role {role}",
            )
            agency_db.add(msg)
        await agency_db.commit()


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyRun:
    """Tests for the agency_runs SQLAlchemy model."""

    async def test_create_run_with_all_status_values(self, agency_db):
        """agency_runs accepts all defined status values."""
        for status in AgencyRunStatus:
            run = AgencyRun(
                id=f"run-{status.value}",
                conversation_id="conv-uuid-1234",
                user_id=1,
                agency_id="agency-uuid-1234",
                tenant_id="tenant-uuid-1234",
                status=status.value,
            )
            agency_db.add(run)
        await agency_db.commit()

    async def test_total_credits_calculation(self, agency_db):
        """total_credits_used = gateway_cost + multiplier_markup."""
        run = AgencyRun(
            id="run-cost-test",
            conversation_id="conv-uuid-1234",
            user_id=1,
            agency_id="agency-uuid-1234",
            tenant_id="tenant-uuid-1234",
            status="completed",
            total_gateway_cost=10.0,
            multiplier_markup=5.0,
            total_credits_used=15.0,
        )
        agency_db.add(run)
        await agency_db.commit()
        await agency_db.refresh(run)
        assert float(run.total_credits_used) == float(run.total_gateway_cost) + float(run.multiplier_markup)

    async def test_to_dict_returns_expected_shape(self, agency_db):
        """to_dict() returns a dict with all expected keys."""
        run = AgencyRun(
            id="run-dict-test",
            conversation_id="conv-uuid-1234",
            user_id=1,
            agency_id="agency-uuid-1234",
            tenant_id="tenant-uuid-1234",
            status="queued",
        )
        agency_db.add(run)
        await agency_db.commit()
        d = run.to_dict()
        assert "id" in d
        assert "status" in d
        assert "conversationId" in d
        assert "agencyId" in d
```

### CreditSourceType Test (Vitest)

This is a small addition to verify the enum value is accepted. Add to the existing credit service test file or create a small test:

```typescript
// In an appropriate test file (e.g., apps/web/server/services/creditService.test.ts)
// Test: "agency" is a valid CreditSourceType
// Test: deductCredits with sourceType="agency" records correctly in transaction
```

The key assertion is that the TypeScript union and the Drizzle enum both accept `"agency"` without type errors.

---

## Implementation Details

### Part 1: Extend Existing Enums

#### 1A. CreditSourceType (Drizzle + TypeScript)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add `"agency"` to the `creditSourceTypeEnum` array (line ~97-111):

```typescript
export const creditSourceTypeEnum = pgEnum("credit_source_type", [
  "chat",
  "skill",
  "media_image",
  "media_video",
  "media_audio",
  "indexing",
  "rag",
  "stt",
  "translation",
  "brainstorm",
  "scheduler",
  "admin",
  "agency",   // NEW
  "other",
]);
```

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`

Add `"agency"` to the TypeScript `CreditSourceType` union (line ~14-17):

```typescript
export type CreditSourceType =
  | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
  | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
  | "scheduler" | "admin" | "agency" | "other";
```

#### 1B. SandboxFeatureType (Drizzle + Zod + Python)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add `"agency"` to `sandboxFeatureTypeEnum` (line ~148-150):

```typescript
export const sandboxFeatureTypeEnum = pgEnum("sandbox_feature_type", [
  "chat", "skill", "workflow", "library", "media", "presentation", "connector",
  "agency",   // NEW
]);
```

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/sandbox.ts`

Add `"agency"` to the Zod enum in the `createJob` input schema (line ~49-51):

```typescript
featureType: z.enum([
  "chat", "skill", "workflow", "library", "media", "presentation", "connector",
  "agency",   // NEW
]),
```

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/sandbox.py`

Add `AGENCY` to the `SandboxFeatureType` Python enum:

```python
class SandboxFeatureType(str, enum.Enum):
    """Which SmartSpecPro feature triggered the sandbox job."""
    CHAT = "chat"
    SKILL = "skill"
    WORKFLOW = "workflow"
    LIBRARY = "library"
    MEDIA = "media"
    PRESENTATION = "presentation"
    CONNECTOR = "connector"
    AGENCY = "agency"   # NEW
```

---

### Part 2: Drizzle Table Definitions (6 tables)

All 6 new tables go at the end of `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, after the existing `tenantSandboxPolicies` table definition (line 3896).

The tables follow the same conventions as existing tables:
- `varchar(36)` for UUID primary keys (matching `tenants.id` pattern)
- `timestamp("...", { withTimezone: true }).defaultNow().notNull()` for timestamps
- camelCase column names
- `references(() => tableName.column, { onDelete: "cascade" })` for FK cascade
- Indexes defined via the table callback `(t) => [...]`
- Type exports: `typeof table.$inferSelect` and `typeof table.$inferInsert`

#### Table 1: agencies

```typescript
/**
 * Agencies -- Multi-agent orchestration units.
 * Each agency contains a team of AI agents with directional communication flows.
 */
export const agencies = pgTable("agencies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("systemPrompt"),
  creditMultiplier: numeric("creditMultiplier", { precision: 5, scale: 2 }).default("1.00"),
  maxAgents: integer("maxAgents").default(10),
  maxRunTimeSeconds: integer("maxRunTimeSeconds").default(600),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  isFallbackSafe: boolean("isFallbackSafe").default(false).notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agencies_tenant_slug_idx").on(t.tenantId, t.slug),
  index("agencies_tenant_idx").on(t.tenantId),
  index("agencies_created_by_idx").on(t.createdBy),
]);

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = typeof agencies.$inferInsert;
```

**Key design decisions:**
- `status` uses `varchar(20)` rather than a pgEnum because the status values (`draft`, `published`, `archived`) are agency-specific and unlikely to be shared with other tables. This avoids enum migration pain.
- `creditMultiplier` as `numeric(5,2)` allows values like `1.50` (50% markup). Default is `1.00` (no markup).
- `isFallbackSafe` controls whether the agency can degrade to single-agent mode on failure.

#### Table 2: agency_agents

```typescript
/**
 * Agency Agents -- Individual AI agents within an agency.
 * Each agent has its own model, instructions, and tool set.
 */
export const agencyAgents = pgTable("agency_agents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  instructions: text("instructions"),
  model: varchar("model", { length: 100 }),
  modelSettings: json("modelSettings").$type<{
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
  }>(),
  isEntryPoint: boolean("isEntryPoint").default(false).notNull(),
  isOptional: boolean("isOptional").default(false).notNull(),
  position: json("position").$type<{ x: number; y: number }>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_agents_agency_idx").on(t.agencyId),
  uniqueIndex("agency_agents_agency_name_idx").on(t.agencyId, t.name),
]);

export type AgencyAgent = typeof agencyAgents.$inferSelect;
export type InsertAgencyAgent = typeof agencyAgents.$inferInsert;
```

**Key design decisions:**
- `isEntryPoint` marks the agent that receives user messages first. Enforced at the application level (only one per agency).
- `isOptional` means the agent can be skipped if it fails without failing the entire run.
- `position` stores `{x, y}` coordinates for the React Flow canvas layout.

#### Table 3: agency_tools

```typescript
/**
 * Agency Tools -- Tool definitions available to agency agents.
 * Tools can be built-in, skill-based, sandbox-executed, or custom.
 */
export const agencyTools = pgTable("agency_tools", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  toolType: varchar("toolType", { length: 20 }).notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  riskLevel: varchar("riskLevel", { length: 10 }).default("low").notNull(),
  requiresApproval: boolean("requiresApproval").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_tools_tenant_idx").on(t.tenantId),
  uniqueIndex("agency_tools_tenant_name_idx").on(t.tenantId, t.name),
]);

export type AgencyTool = typeof agencyTools.$inferSelect;
export type InsertAgencyTool = typeof agencyTools.$inferInsert;
```

**Key design decisions:**
- `toolType` accepts `"builtin"`, `"skill"`, `"sandbox"`, or `"custom"`. Stored as varchar rather than enum for extensibility.
- `riskLevel` accepts `"low"`, `"medium"`, or `"high"`. Controls routing (low = direct HTTP, high = sandbox).
- `config` is a flexible JSON blob for tool-specific configuration.

#### Table 4: agency_agent_tools (junction)

```typescript
/**
 * Agency Agent Tools -- Junction table linking agents to their assigned tools.
 */
export const agencyAgentTools = pgTable("agency_agent_tools", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agentId: varchar("agentId", { length: 36 }).notNull().references(() => agencyAgents.id, { onDelete: "cascade" }),
  toolId: varchar("toolId", { length: 36 }).notNull().references(() => agencyTools.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agency_agent_tools_agent_tool_idx").on(t.agentId, t.toolId),
  index("agency_agent_tools_tool_idx").on(t.toolId),
]);

export type AgencyAgentTool = typeof agencyAgentTools.$inferSelect;
export type InsertAgencyAgentTool = typeof agencyAgentTools.$inferInsert;
```

#### Table 5: agency_communication_flows

```typescript
/**
 * Agency Communication Flows -- Directional communication links between agents.
 * Defines which agent can delegate/handoff to which other agent.
 */
export const agencyCommunicationFlows = pgTable("agency_communication_flows", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
  fromAgentId: varchar("fromAgentId", { length: 36 }).notNull().references(() => agencyAgents.id),
  toAgentId: varchar("toAgentId", { length: 36 }).notNull().references(() => agencyAgents.id),
  flowType: varchar("flowType", { length: 20 }).default("delegation").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_comm_flows_agency_idx").on(t.agencyId),
  uniqueIndex("agency_comm_flows_unique_idx").on(t.agencyId, t.fromAgentId, t.toAgentId),
]);

export type AgencyCommunicationFlow = typeof agencyCommunicationFlows.$inferSelect;
export type InsertAgencyCommunicationFlow = typeof agencyCommunicationFlows.$inferInsert;
```

**Key design decisions:**
- `flowType` accepts `"delegation"` or `"handoff"`. Delegation means agent A asks agent B to do a subtask and expects a result back. Handoff means agent A passes full control to agent B.
- The unique constraint on `(agencyId, fromAgentId, toAgentId)` prevents duplicate flows.

#### Table 6: agency_conversations

```typescript
/**
 * Agency Conversations -- Chat sessions between a user and an agency.
 * Tracks message counts and credit usage per conversation.
 */
export const agencyConversations = pgTable("agency_conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).default("New Agency Chat").notNull(),
  totalCreditsUsed: numeric("totalCreditsUsed", { precision: 12, scale: 4 }).default("0"),
  messageCount: integer("messageCount").default(0).notNull(),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_conversations_agency_user_idx").on(t.agencyId, t.userId),
  index("agency_conversations_user_idx").on(t.userId),
]);

export type AgencyConversation = typeof agencyConversations.$inferSelect;
export type InsertAgencyConversation = typeof agencyConversations.$inferInsert;
```

---

### Part 3: SQLAlchemy Models (2 tables)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/agency.py`

These two tables are managed by SQLAlchemy because they are high-write runtime tables that Python reads/writes directly for performance. They do NOT use `ForeignKey()` constraints for references to Drizzle-owned tables (e.g., `agency_conversations`). Referential integrity for those cross-ORM references is enforced at the application level.

```python
"""
Agency execution models for Agency-Swarm integration.

High-write runtime tables managed by SQLAlchemy/Alembic.
References to Drizzle-owned tables (agency_conversations, agencies) use
plain columns without ForeignKey constraints -- referential integrity is
enforced at the application level.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    Index,
)
from sqlalchemy.dialects.postgresql import JSON

from app.core.database import Base


class AgencyRunStatus(str, enum.Enum):
    """Lifecycle status for agency runs."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgencyMessage(Base):
    """Individual message within an agency conversation.

    Stores messages from all participants (user, agents, system, tool calls).
    Agent-to-agent messages may have PII redacted before storage.
    """

    __tablename__ = "agency_messages"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id = Column(String(36), nullable=False, index=True)
    # No ForeignKey -- agency_conversations is Drizzle-owned
    agent_name = Column(String(100), nullable=True)
    role = Column(String(20), nullable=False)  # user / assistant / system / tool
    content = Column(Text, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    credits_used = Column(Numeric(10, 4), nullable=True)
    tool_calls = Column(JSON, nullable=True)  # Array of tool call records
    parent_message_id = Column(BigInteger, nullable=True)  # For threading
    pii_redacted = Column(Boolean, nullable=False, default=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("agency_messages_conv_idx", "conversation_id"),
        Index("agency_messages_created_idx", "created_at"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "agentName": self.agent_name,
            "role": self.role,
            "content": self.content,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "creditsUsed": str(self.credits_used) if self.credits_used else None,
            "toolCalls": self.tool_calls,
            "parentMessageId": self.parent_message_id,
            "piiRedacted": self.pii_redacted,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class AgencyRun(Base):
    """Execution record for a single agency invocation.

    Tracks the full lifecycle from queued through completion or failure,
    including credit accounting (gateway cost + multiplier markup).
    """

    __tablename__ = "agency_runs"

    id = Column(String(36), primary_key=True)
    conversation_id = Column(String(36), nullable=False, index=True)
    # No ForeignKey -- agency_conversations is Drizzle-owned
    user_id = Column(Integer, nullable=False)
    agency_id = Column(String(36), nullable=False)
    tenant_id = Column(String(36), nullable=False)
    status = Column(String(20), nullable=False, default=AgencyRunStatus.QUEUED.value)
    total_gateway_cost = Column(Numeric(12, 4), nullable=True)
    multiplier_markup = Column(Numeric(12, 4), nullable=True)
    total_credits_used = Column(Numeric(12, 4), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_type = Column(String(50), nullable=True)  # transient / permanent / optional_skip
    error_message = Column(Text, nullable=True)
    step_count = Column(Integer, nullable=True)
    retry_count = Column(Integer, nullable=True)
    metadata = Column(JSON, nullable=True)  # Agent trace, tool calls, etc.

    __table_args__ = (
        Index("agency_runs_conv_idx", "conversation_id"),
        Index("agency_runs_tenant_idx", "tenant_id"),
        Index("agency_runs_user_idx", "user_id"),
        Index("agency_runs_status_idx", "status"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "userId": self.user_id,
            "agencyId": self.agency_id,
            "tenantId": self.tenant_id,
            "status": self.status,
            "totalGatewayCost": str(self.total_gateway_cost) if self.total_gateway_cost else None,
            "multiplierMarkup": str(self.multiplier_markup) if self.multiplier_markup else None,
            "totalCreditsUsed": str(self.total_credits_used) if self.total_credits_used else None,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "durationMs": self.duration_ms,
            "errorType": self.error_type,
            "errorMessage": self.error_message,
            "stepCount": self.step_count,
            "retryCount": self.retry_count,
        }
```

---

### Part 4: Register Models

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/__init__.py`

Add the following import block after the existing sandbox imports (around line 66-76):

```python
# Agency-Swarm multi-agent orchestration
from .agency import AgencyMessage, AgencyRun, AgencyRunStatus
```

Add to the `__all__` list:

```python
    # Agency
    "AgencyMessage",
    "AgencyRun",
    "AgencyRunStatus",
```

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/database.py`

In the `init_db()` function, add the agency model import alongside the existing sandbox import (around line 97):

```python
        # Sandbox execution
        sandbox,
        # Agency-Swarm
        agency,
```

This ensures SQLAlchemy discovers the models and creates the tables with `Base.metadata.create_all`.

---

### Part 5: Migration Sequence

Since all changes are additive (new tables and new enum values), the risk is low. However, follow the mandatory backup protocol.

**Step 1: Backup (mandatory per CLAUDE.md)**

```bash
mkdir -p /home/dev/projects/SmartSpecPro/.db-backups
pg_dump "$DATABASE_URL" \
  --file="/home/dev/projects/SmartSpecPro/.db-backups/full_backup_$(date +%Y%m%d_%H%M%S).sql"
```

**Step 2: Drizzle migration (6 new tables + 2 enum value additions)**

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push   # runs: drizzle-kit generate && drizzle-kit migrate
```

This will:
- Add `"agency"` to the `credit_source_type` PostgreSQL enum
- Add `"agency"` to the `sandbox_feature_type` PostgreSQL enum
- Create 6 new tables: `agencies`, `agency_agents`, `agency_tools`, `agency_agent_tools`, `agency_communication_flows`, `agency_conversations`

**Important note on pgEnum extension:** Drizzle Kit handles adding new values to existing pgEnum types via `ALTER TYPE ... ADD VALUE`. If drizzle-kit does not handle this automatically, apply manually:

```sql
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'agency';
ALTER TYPE sandbox_feature_type ADD VALUE IF NOT EXISTS 'agency';
```

**Step 3: SQLAlchemy table creation (2 new tables)**

The Python backend uses `Base.metadata.create_all` on startup, which will create any missing tables. For an explicit migration, create a numbered migration script:

**File:** `/home/dev/projects/SmartSpecPro/python-backend/migrations/009_agency_tables.py`

This migration script should create the `agency_messages` and `agency_runs` tables with the columns and indexes defined in the SQLAlchemy models above. Use the same pattern as existing migration scripts (e.g., `005_add_cloud_task_id.py`).

**Step 4: Verify all 8 tables exist**

```bash
psql "$DATABASE_URL" -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_name LIKE 'agency%'
  ORDER BY table_name;
"
```

Expected output: `agencies`, `agency_agent_tools`, `agency_agents`, `agency_communication_flows`, `agency_conversations`, `agency_messages`, `agency_runs`, `agency_tools` (8 tables).

**Step 5: Verify existing tables are untouched**

```bash
psql "$DATABASE_URL" -c "
  SELECT 'users' as tbl, count(*) as rows FROM users
  UNION ALL
  SELECT 'tenants', count(*) FROM tenants
  UNION ALL
  SELECT 'conversations', count(*) FROM conversations
  UNION ALL
  SELECT 'credit_transactions', count(*) FROM credit_transactions;
"
```

Row counts must match pre-migration values.

---

### Data Model Relationship Diagram

```
tenants
  |
  |-- 1:N --> agencies
  |             |
  |             |-- 1:N --> agency_agents
  |             |             |
  |             |             |-- M:N --> agency_tools (via agency_agent_tools)
  |             |
  |             |-- 1:N --> agency_communication_flows
  |             |             (fromAgentId, toAgentId -> agency_agents)
  |             |
  |             |-- 1:N --> agency_conversations
  |                           |
  |                           |-- 1:N --> agency_messages  (SQLAlchemy, no DB FK)
  |                           |-- 1:N --> agency_runs      (SQLAlchemy, no DB FK)
  |
  |-- 1:N --> agency_tools

users
  |-- 1:N --> agencies (createdBy)
  |-- 1:N --> agency_conversations (userId)
```

---

### Ownership Model Summary

| Owner | Tables | Managed By |
|-------|--------|-----------|
| **Drizzle (Node.js)** | agencies, agency_agents, agency_agent_tools, agency_tools, agency_communication_flows, agency_conversations | `drizzle-kit generate && drizzle-kit migrate` |
| **SQLAlchemy (Python)** | agency_messages, agency_runs | `Base.metadata.create_all` + migration script |

Both ORMs point at the same PostgreSQL database. Drizzle migrations MUST run before the Python app starts (so the Drizzle-owned tables exist before SQLAlchemy tries to reference them by convention).

---

## Implementation Checklist

1. Write tests (Vitest schema tests + pytest model tests) per the "Tests FIRST" section above
2. Add `"agency"` to `creditSourceTypeEnum` in Drizzle schema
3. Add `"agency"` to `sandboxFeatureTypeEnum` in Drizzle schema
4. Add `"agency"` to `CreditSourceType` TypeScript union in creditService.ts
5. Add `"agency"` to Zod enum in sandbox.ts router
6. Add `AGENCY` to `SandboxFeatureType` Python enum in sandbox.py
7. Add 6 Drizzle table definitions to schema.ts (agencies, agency_agents, agency_tools, agency_agent_tools, agency_communication_flows, agency_conversations)
8. Create SQLAlchemy models file (`python-backend/app/models/agency.py`) with AgencyMessage, AgencyRun, AgencyRunStatus
9. Register new models in `__init__.py` and `database.py`
10. Run Drizzle migration (`pnpm db:push`)
11. Create Python migration script and run it
12. Verify all 8 tables exist and existing data is intact
13. Run existing test suites to confirm no regressions

---

## Implementation Notes (Actual)

### What was built
All planned items were implemented. Key deviations from plan:

1. **Python migration script not created** — `init_db()` with `Base.metadata.create_all` handles table creation. Formal Alembic migration deferred.

2. **FK cascades corrected during review** — Original implementation had `ON DELETE no action` on several FKs. Code review caught this and the following were fixed:
   - `agency_communication_flows.fromAgentId` → `ON DELETE CASCADE`
   - `agency_communication_flows.toAgentId` → `ON DELETE CASCADE`
   - `agency_conversations.agencyId` → `ON DELETE CASCADE`
   - `agency_tools.tenantId` → `ON DELETE CASCADE`
   - `agencies.createdBy` → `ON DELETE SET NULL`

3. **SQLite test fixture** — Tests use `Base.metadata.create_all(tables=[...])` to create only agency tables, avoiding JSONB incompatibility with SQLite. BigInteger PK in `agency_messages` doesn't auto-increment in SQLite, so tests provide explicit IDs.

4. **Duplicate index removed** — `AgencyMessage.conversation_id` had both `index=True` and an explicit Index in `__table_args__`. Removed `index=True`.

5. **`listJobs` featureType enum missed** — Added `"agency"` to `listJobs` Zod enum (was only in `createJob`).

6. **Drizzle `relations()` not defined** — Intentionally deferred to section-06 (Node.js integration).

### Actual files created/modified
| File | Action |
|------|--------|
| `apps/web/drizzle/schema.ts` | Modified: 6 tables + 2 enum values |
| `apps/web/drizzle/schema.test.ts` | Modified: 8 new describe blocks (40 total tests) |
| `apps/web/drizzle/0041_classy_shockwave.sql` | Created: Initial migration |
| `apps/web/drizzle/0042_quiet_jane_foster.sql` | Created: FK cascade fixes |
| `apps/web/server/services/creditService.ts` | Modified: "agency" in CreditSourceType |
| `apps/web/server/routers/sandbox.ts` | Modified: "agency" in featureType enums |
| `python-backend/app/models/agency.py` | Created: AgencyMessage, AgencyRun, AgencyRunStatus |
| `python-backend/app/models/__init__.py` | Modified: Registered agency models |
| `python-backend/app/models/sandbox.py` | Modified: AGENCY in SandboxFeatureType |
| `python-backend/app/core/database.py` | Modified: Agency import in init_db() |
| `python-backend/tests/unit/test_agency_models.py` | Created: 6 unit tests |

### Test results
- Vitest schema tests: 40 passed (8 new agency tests)
- Python agency model tests: 6 passed
- Database verification: 6 new tables created, existing data intact (387 credit_transactions, 20 sandbox_jobs)