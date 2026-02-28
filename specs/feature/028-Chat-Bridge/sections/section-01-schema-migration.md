Now I have all the information needed. Let me produce the section content.

# Section 01: Schema Migration

## Overview

This section creates the database foundation for the Chat Bridge feature. It adds five new Drizzle tables and extends three existing tables with nullable columns. It also creates a Python migration for the `agency_messages` table. All changes are additive and pose zero risk to existing data.

**Plan references**: Section 3 (Data Model), Section 12 (Data Safety and Migration Strategy)

**Dependencies**: None -- this is the foundation section that all other sections depend on.

**Blocks**: Every other section (02 through 11) depends on this schema being in place.

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | Modify | Add 5 new tables, extend `messages` and `conversations` |
| `/home/dev/projects/SmartSpecPro/python-backend/migrations/009_agency_messages_channel_columns.py` | Create | Add 3 nullable columns to `agency_messages` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/models/agency.py` | Modify | Add 3 new columns to `AgencyMessage` model |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegramBridge.schema.test.ts` | Create | Schema validation tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_agency_messages_channel.py` | Create | Python column tests |

---

## Tests First

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegramBridge.schema.test.ts`

These tests validate that the new Drizzle table definitions export the correct shape and types. They do NOT require a live database -- they assert against the Drizzle table metadata objects.

```typescript
import { describe, it, expect } from "vitest";

/**
 * Schema shape tests for the 5 new Chat Bridge tables and column extensions.
 *
 * These tests import the table definitions from drizzle/schema.ts and verify:
 * - All expected columns exist with correct types
 * - Foreign key references point to the right tables
 * - Unique indexes and constraints are defined
 * - New columns on existing tables are nullable
 *
 * No live database required -- assertions are against Drizzle metadata objects.
 */

// Test: telegram_connections table can be inserted with all required fields
// Test: telegram_connections UNIQUE(botId, telegramUserId) rejects duplicates
// Test: telegram_connections cascade-deletes when tenant is deleted
// Test: telegram_connections cascade-deletes when user is deleted

// Test: conversation_channels can bind to a chat conversation (chatConversationId set)
// Test: conversation_channels can bind to an agency conversation (agencyConversationId set)
// Test: conversation_channels rejects both conversation IDs set simultaneously
// Test: conversation_channels rejects both conversation IDs null
// Test: conversation_channels UNIQUE constraint prevents duplicate bindings per conversation+channel

// Test: channel_messages can store integer messageId as text (chat messages)
// Test: channel_messages can store bigint messageId as text (agency messages)
// Test: channel_messages UNIQUE(channelType, externalChatId, externalMessageId) dedupes

// Test: telegram_link_tokens tokenHash is unique
// Test: telegram_link_tokens can reference chatConversationId (integer FK)
// Test: telegram_link_tokens can reference agencyConversationId (varchar FK)

// Test: telegram_updates UNIQUE(botId, updateId) prevents duplicate processing

// Test: messages.sourceChannel column accepts nullable varchar values
// Test: conversations.defaultChannelPolicy column accepts nullable varchar values
```

The test file should follow the same mock patterns established in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.test.ts` and `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.test.ts`. For schema shape tests, the simplest approach is to import the table constants and inspect their column metadata.

For example, verifying a column exists on a table:

```typescript
import { telegramConnections } from "../../../drizzle/schema";

it("telegramConnections has required columns", () => {
  // Drizzle table objects expose column metadata
  expect(telegramConnections.id).toBeDefined();
  expect(telegramConnections.tenantId).toBeDefined();
  expect(telegramConnections.userId).toBeDefined();
  expect(telegramConnections.telegramUserId).toBeDefined();
  // ... etc
});
```

For constraint tests that require a live database (like UNIQUE violation, CHECK constraints, CASCADE), these should be written as comment stubs to be verified during integration testing in section-11.

### Test file: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_agency_messages_channel.py`

```python
"""
Tests for the new channel columns on agency_messages.

Validates:
- source_channel column is nullable and accepts string values
- source_connection_id column is nullable
- external_source_id column is nullable
- Existing AgencyMessage queries and to_dict() still work with new columns
"""

# Test: agency_messages source_channel column is nullable and accepts string values
# Test: agency_messages source_connection_id column is nullable
# Test: existing agency_messages queries still work with new columns
# Test: AgencyMessage.to_dict() includes new fields when set
# Test: AgencyMessage.to_dict() returns None for new fields when unset
```

---

## Implementation Details

### 1. New Drizzle Tables

All five new tables go at the end of `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, after the existing agency tables (after line ~4034). The `check` constraint helper must be added to the import from `drizzle-orm/pg-core`.

**Updated import line** (line 1 of schema.ts):

```typescript
import { integer, pgEnum, pgTable, text, timestamp, varchar, json, jsonb, boolean, numeric, serial, uniqueIndex, index, foreignKey, bigint, check, type AnyPgColumn } from "drizzle-orm/pg-core";
```

Note: `check` is added to the import list to support the CHECK constraint on `conversation_channels`.

#### 1.1 telegram_connections

```typescript
/**
 * Telegram Connections -- Links a SmartSpecPro user to a Telegram account.
 * Replaces the user-level telegramChatId/telegramVerified fields with a
 * proper connection model supporting multiple bots and conversation binding.
 */
export const telegramConnections = pgTable("telegram_connections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  telegramUserId: varchar("telegramUserId", { length: 64 }).notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }).notNull(),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  botId: varchar("botId", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  activeChannelId: varchar("activeChannelId", { length: 36 }),
  linkedAt: timestamp("linkedAt", { withTimezone: true }).defaultNow().notNull(),
  linkedBy: varchar("linkedBy", { length: 20 }).notNull(),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  revokedBy: varchar("revokedBy", { length: 36 }),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("telegram_connections_bot_user_unique").on(t.botId, t.telegramUserId),
  index("telegram_connections_tenant_user_idx").on(t.tenantId, t.userId),
  index("telegram_connections_chat_id_idx").on(t.telegramChatId),
]);

export type TelegramConnection = typeof telegramConnections.$inferSelect;
export type InsertTelegramConnection = typeof telegramConnections.$inferInsert;
```

Key design notes:
- `status` values: `active`, `revoked`, `pending`, `blocked`
- `activeChannelId` holds the FK to `conversation_channels.id` -- nullable because a connection can exist without a bound conversation. The FK is not enforced in Drizzle to avoid circular dependency issues (conversation_channels also references telegramConnections). Application-level enforcement.
- `linkedBy` values: `deep_link`, `admin`, `api`
- The UNIQUE on `(botId, telegramUserId)` ensures one connection per Telegram user per bot.

#### 1.2 conversation_channels

This table is the central mapping between conversations and external channels. It uses split FK columns because `conversations.id` is `serial` (integer) while `agencyConversations.id` is `varchar(36)`.

```typescript
/**
 * Conversation Channels -- Maps conversations (chat or agency) to external
 * channel bindings (Telegram, future: LINE, WhatsApp).
 *
 * Uses split FK columns because conversations.id is integer and
 * agencyConversations.id is varchar(36). A CHECK constraint ensures
 * exactly one is set, determined by conversationType.
 */
export const conversationChannels = pgTable("conversation_channels", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  chatConversationId: integer("chatConversationId").references(() => conversations.id, { onDelete: "cascade" }),
  agencyConversationId: varchar("agencyConversationId", { length: 36 }).references(() => agencyConversations.id, { onDelete: "cascade" }),
  conversationType: varchar("conversationType", { length: 20 }).notNull(),
  channelType: varchar("channelType", { length: 20 }).notNull(),
  channelRefId: varchar("channelRefId", { length: 64 }),
  connectionId: varchar("connectionId", { length: 36 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  syncMode: varchar("syncMode", { length: 20 }).notNull().default("two_way"),
  state: varchar("state", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("conversation_channels_chat_unique")
    .on(t.chatConversationId, t.channelType, t.channelRefId)
    .where(sql`"chatConversationId" IS NOT NULL`),
  uniqueIndex("conversation_channels_agency_unique")
    .on(t.agencyConversationId, t.channelType, t.channelRefId)
    .where(sql`"agencyConversationId" IS NOT NULL`),
  index("conversation_channels_tenant_type_idx").on(t.tenantId, t.channelType),
  check("conversation_channels_one_conv_check", sql`
    ("conversationType" = 'chat' AND "chatConversationId" IS NOT NULL AND "agencyConversationId" IS NULL)
    OR
    ("conversationType" = 'agency' AND "agencyConversationId" IS NOT NULL AND "chatConversationId" IS NULL)
  `),
]);

export type ConversationChannel = typeof conversationChannels.$inferSelect;
export type InsertConversationChannel = typeof conversationChannels.$inferInsert;
```

Key design notes:
- `conversationType`: `chat` or `agency`
- `channelType`: `web` or `telegram`
- `syncMode`: `two_way`, `notify_only`, `paused`
- `state`: `active`, `paused`, `revoked`
- The CHECK constraint enforces that exactly one conversation FK is set, matching `conversationType`.
- The partial UNIQUE indexes prevent duplicate bindings per conversation+channel combination.

#### 1.3 channel_messages

```typescript
/**
 * Channel Messages -- Per-channel delivery tracking for outbound messages.
 *
 * messageId is stored as text because it may reference messages.id (integer)
 * or agency_messages.id (bigint). No FK constraint since it spans two tables.
 * messageType determines which source table to query.
 */
export const channelMessages = pgTable("channel_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  conversationChannelId: varchar("conversationChannelId", { length: 36 }).notNull().references(() => conversationChannels.id, { onDelete: "cascade" }),
  messageId: text("messageId").notNull(),
  messageType: varchar("messageType", { length: 20 }).notNull(),
  channelType: varchar("channelType", { length: 20 }).notNull(),
  externalMessageId: varchar("externalMessageId", { length: 64 }),
  externalChatId: varchar("externalChatId", { length: 64 }),
  deliveryStatus: varchar("deliveryStatus", { length: 20 }).notNull().default("pending"),
  attemptCount: integer("attemptCount").notNull().default(0),
  lastAttemptAt: timestamp("lastAttemptAt", { withTimezone: true }),
  deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
  failureCode: varchar("failureCode", { length: 50 }),
  failureReason: text("failureReason"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("channel_messages_external_unique")
    .on(t.channelType, t.externalChatId, t.externalMessageId),
  index("channel_messages_channel_msg_idx")
    .on(t.conversationChannelId, t.messageId),
]);

export type ChannelMessage = typeof channelMessages.$inferSelect;
export type InsertChannelMessage = typeof channelMessages.$inferInsert;
```

Key design notes:
- `deliveryStatus` values: `pending`, `sent`, `delivered`, `failed`, `suppressed`
- `messageType` values: `chat` or `agency` -- derived from `conversation_channels.conversationType`
- `messageId` is text to accommodate both integer (chat) and bigint (agency) source IDs.

#### 1.4 telegram_link_tokens

```typescript
/**
 * Telegram Link Tokens -- Auditable deep-link tokens for connecting
 * Telegram accounts and optionally binding to specific conversations.
 *
 * Uses the same split-ID pattern as conversation_channels for conversation FKs.
 */
export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetChatConversationId: integer("targetChatConversationId").references(() => conversations.id),
  targetAgencyConversationId: varchar("targetAgencyConversationId", { length: 36 }).references(() => agencyConversations.id),
  targetConversationType: varchar("targetConversationType", { length: 20 }),
  purpose: varchar("purpose", { length: 20 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("createdBy"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("telegram_link_tokens_hash_unique").on(t.tokenHash),
  index("telegram_link_tokens_tenant_user_purpose_idx").on(t.tenantId, t.userId, t.purpose),
]);

export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;
export type InsertTelegramLinkToken = typeof telegramLinkTokens.$inferInsert;
```

Key design notes:
- `purpose` values: `connect`, `resume`, `approval_link`
- `tokenHash` stores SHA-256 of the raw token. Raw token lives in Redis with 5-min TTL.
- Conversation FKs are optional -- a link can just connect without binding a conversation.

#### 1.5 telegram_updates

```typescript
/**
 * Telegram Updates -- Webhook update deduplication and audit log.
 * Stores every inbound Telegram Update ID for dedupe and troubleshooting.
 */
export const telegramUpdates = pgTable("telegram_updates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  botId: varchar("botId", { length: 64 }).notNull(),
  updateId: bigint("updateId", { mode: "bigint" }).notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true }),
  processingStatus: varchar("processingStatus", { length: 20 }).notNull().default("accepted"),
  errorCode: varchar("errorCode", { length: 50 }),
  errorReason: text("errorReason"),
}, (t) => [
  uniqueIndex("telegram_updates_bot_update_unique").on(t.botId, t.updateId),
]);

export type TelegramUpdate = typeof telegramUpdates.$inferSelect;
export type InsertTelegramUpdate = typeof telegramUpdates.$inferInsert;
```

Key design notes:
- `processingStatus` values: `accepted`, `ignored`, `failed`, `duplicate`
- `updateId` uses `bigint` with `mode: "bigint"` because Telegram Update IDs can exceed JavaScript's safe integer range.

### 2. Column Extensions to Existing Tables

#### 2.1 messages table

Add three nullable columns to the existing `messages` table definition at `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (currently around line 1174). Insert these columns before the `createdAt` field (around line 1234):

```typescript
  /** Channel that originated this message (web, telegram, system) */
  sourceChannel: varchar("sourceChannel", { length: 20 }),

  /** Connection ID for the originating channel (FK to telegram_connections) */
  sourceConnectionId: varchar("sourceConnectionId", { length: 36 }),

  /** External platform message ID (e.g., Telegram message_id) */
  externalSourceId: varchar("externalSourceId", { length: 64 }),
```

All three columns are nullable with no default, so existing rows get NULL values automatically. No data migration needed.

#### 2.2 conversations table

Add one nullable column to the existing `conversations` table definition (currently around line 1111). Insert before `createdAt` (around line 1163):

```typescript
  /** Default policy for attaching external channels to this conversation */
  defaultChannelPolicy: varchar("defaultChannelPolicy", { length: 20 }).default("allow_attach"),
```

This column is nullable with a default value. Existing rows will not be updated -- they remain NULL, which is fine because the application treats NULL as "allow_attach" (the default).

### 3. Python Migration: agency_messages

#### 3.1 SQLAlchemy Model Update

Modify `/home/dev/projects/SmartSpecPro/python-backend/app/models/agency.py` to add three new columns to the `AgencyMessage` class, after the existing `created_at` column (around line 62):

```python
    # Chat Bridge channel metadata (nullable, added by migration 009)
    source_channel = Column(String(20), nullable=True)
    source_connection_id = Column(String(36), nullable=True)
    external_source_id = Column(String(64), nullable=True)
```

Also update the `to_dict()` method to include these new fields:

```python
    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            # ... existing fields ...
            "sourceChannel": self.source_channel,
            "sourceConnectionId": self.source_connection_id,
            "externalSourceId": self.external_source_id,
        }
```

#### 3.2 Migration Script

Create `/home/dev/projects/SmartSpecPro/python-backend/migrations/009_agency_messages_channel_columns.py` following the same async pattern used by existing migration `008_library_provider_switch_state.py`:

```python
"""
Migration 009: Add channel metadata columns to agency_messages.

Adds three nullable columns for Chat Bridge integration:
- source_channel: originating channel (web, telegram, system)
- source_connection_id: FK reference to telegram_connections
- external_source_id: external platform message ID

All columns are nullable -- zero risk to existing data.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


async def upgrade() -> None:
    """Apply migration 009 -- add channel columns to agency_messages."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            # Add columns individually with IF NOT EXISTS pattern
            await session.execute(text(
                "ALTER TABLE agency_messages "
                "ADD COLUMN IF NOT EXISTS source_channel VARCHAR(20)"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages "
                "ADD COLUMN IF NOT EXISTS source_connection_id VARCHAR(36)"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages "
                "ADD COLUMN IF NOT EXISTS external_source_id VARCHAR(64)"
            ))
            await session.commit()
            logger.info("migration_009_agency_messages_channel_columns_upgraded")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """Rollback migration 009."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(text(
                "ALTER TABLE agency_messages DROP COLUMN IF EXISTS external_source_id"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages DROP COLUMN IF EXISTS source_connection_id"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages DROP COLUMN IF EXISTS source_channel"
            ))
            await session.commit()
            logger.info("migration_009_agency_messages_channel_columns_downgraded")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
```

### 4. Type Exports

After adding the tables, ensure each table exports both Select and Insert types (shown in the table definitions above). These types are used by all downstream sections for type-safe queries.

---

## Migration Execution Sequence

Follow the Database Safety Protocol from CLAUDE.md exactly.

### Step 1: Backup affected tables

```bash
cd /home/dev/projects/SmartSpecPro
mkdir -p .db-backups

# Backup tables that receive new columns
pg_dump "$DATABASE_URL" --data-only --table=messages \
  --file=".db-backups/messages_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=conversations \
  --file=".db-backups/conversations_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=agency_messages \
  --file=".db-backups/agency_messages_$(date +%Y%m%d_%H%M%S).sql"

# Record row counts
psql "$DATABASE_URL" -c "
  SELECT 'messages' as tbl, count(*) as rows FROM messages
  UNION ALL
  SELECT 'conversations', count(*) FROM conversations
  UNION ALL
  SELECT 'agency_messages', count(*) FROM agency_messages;
"
```

### Step 2: Run Drizzle migration

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push
```

This generates the SQL migration file and applies it. It will:
- Create the 5 new tables with all indexes and constraints
- Add `sourceChannel`, `sourceConnectionId`, `externalSourceId` to `messages`
- Add `defaultChannelPolicy` to `conversations`

### Step 3: Run Python migration

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
python -m migrations.009_agency_messages_channel_columns
```

This adds the 3 nullable columns to `agency_messages`.

### Step 4: Verify data integrity

```bash
psql "$DATABASE_URL" -c "
  SELECT 'messages' as tbl, count(*) as rows FROM messages
  UNION ALL
  SELECT 'conversations', count(*) FROM conversations
  UNION ALL
  SELECT 'agency_messages', count(*) FROM agency_messages;
"

# Verify new tables exist
psql "$DATABASE_URL" -c "\dt telegram_connections"
psql "$DATABASE_URL" -c "\dt conversation_channels"
psql "$DATABASE_URL" -c "\dt channel_messages"
psql "$DATABASE_URL" -c "\dt telegram_link_tokens"
psql "$DATABASE_URL" -c "\dt telegram_updates"

# Verify new columns on existing tables
psql "$DATABASE_URL" -c "\d messages" | grep -E "sourceChannel|sourceConnectionId|externalSourceId"
psql "$DATABASE_URL" -c "\d conversations" | grep defaultChannelPolicy
psql "$DATABASE_URL" -c "\d agency_messages" | grep -E "source_channel|source_connection_id|external_source_id"
```

### Step 5: Run type check

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm check
```

### Step 6: Run existing tests

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test
```

All existing tests must pass. The schema changes are additive and nullable, so no existing queries should break.

---

## Risk Assessment

| Change | Risk | Justification |
|--------|------|---------------|
| 5 new tables | LOW | Additive only, no FK from existing tables to new tables |
| 3 nullable columns on `messages` | LOW | Existing rows get NULL, no NOT NULL constraint |
| 1 nullable column on `conversations` | LOW | Has default value, existing rows unaffected |
| 3 nullable columns on `agency_messages` | LOW | Python migration uses IF NOT EXISTS, all nullable |
| CHECK constraint on `conversation_channels` | LOW | Only applies to new table, no existing data |
| Partial UNIQUE indexes | LOW | Only on new tables |

---

## Rollback Plan

If anything goes wrong:

1. **New tables** can be dropped safely -- no existing code references them until later sections are implemented:
   ```sql
   DROP TABLE IF EXISTS channel_messages CASCADE;
   DROP TABLE IF EXISTS conversation_channels CASCADE;
   DROP TABLE IF EXISTS telegram_link_tokens CASCADE;
   DROP TABLE IF EXISTS telegram_connections CASCADE;
   DROP TABLE IF EXISTS telegram_updates CASCADE;
   ```

2. **New columns** on existing tables can be dropped safely -- they are nullable and no existing code reads them:
   ```sql
   ALTER TABLE messages DROP COLUMN IF EXISTS "sourceChannel";
   ALTER TABLE messages DROP COLUMN IF EXISTS "sourceConnectionId";
   ALTER TABLE messages DROP COLUMN IF EXISTS "externalSourceId";
   ALTER TABLE conversations DROP COLUMN IF EXISTS "defaultChannelPolicy";
   ALTER TABLE agency_messages DROP COLUMN IF EXISTS source_channel;
   ALTER TABLE agency_messages DROP COLUMN IF EXISTS source_connection_id;
   ALTER TABLE agency_messages DROP COLUMN IF EXISTS external_source_id;
   ```

3. If Drizzle schema.ts is reverted, also revert the migration metadata in `drizzle/meta/_journal.json` to remove the entry for the generated migration SQL file.

---

## Backward Compatibility Notes

The existing user-level Telegram fields (`telegramChatId`, `telegramUsername`, `telegramVerified`, `telegramVerifiedAt` on the `users` table at lines 212-215 of schema.ts) are **not modified or removed** by this migration. The new `telegram_connections` table is the authoritative source going forward, but dual-write to the old fields is handled by section-04 (Link Flow), not this section.