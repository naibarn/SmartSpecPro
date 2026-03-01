Now I have all the context I need. Let me verify the `tenants.id` type more carefully - it's `varchar("id", { length: 36 })` and `users.currentTenantId` is `integer("currentTenantId")`. This is the type mismatch the plan warns about.

Now I have enough context to write the complete section. Let me compose it.

# Section 01: Database Foundation and Migrations

## Overview

This section establishes all database schema changes required by the 02-ClawFeature feature set. It must be completed before any other section begins, as every feature depends on these tables, columns, and enum values existing in PostgreSQL.

The work includes: new `creditSourceType` enum values, STT/TTS provider seed data in `llmProviders`, six new tables (`persona_templates`, `channel_connections`, `channel_credentials`, `chat_widgets`, `conversation_artifacts`, `webhook_triggers`, `webhook_trigger_logs`, `channel_routing_rules`), new columns on existing tables (`users`, `tenants`, `conversations`, `messages`), a data backfill for `conversations.tenantId`, and a data migration from `telegramConnections` to `channel_connections`.

**Key file:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

**Migration numbering:** The latest existing migration is `0053_skill_llm_routing.sql`. New migrations will start at `0054`.

---

## Dependencies

None. This is the foundational section that all others depend on.

---

## Tests

Write tests **before** implementing the schema changes. These validate that the migrations produce the expected database state. All tests use **Vitest** and should be placed in a new file:

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/clawDatabaseMigrations.test.ts`

### 1.1 Enum Migration Tests

```typescript
/**
 * Test: New creditSourceType values are accepted by INSERT into creditTransactions.
 * After migration, inserting a row with sourceType = 'tts', 'browser_automation',
 * 'widget_chat', or 'webhook_chat' must succeed.
 */

/**
 * Test: Existing enum values still work after migration.
 * Inserting with sourceType = 'chat', 'skill', 'stt', etc. must still succeed.
 */
```

### 1.1b Provider Seed Data Tests

```typescript
/**
 * Test: llmProviders table has entries for Groq Whisper STT, OpenAI Whisper STT,
 * ElevenLabs TTS, and OpenAI TTS after seed script runs.
 * Query by providerName and verify displayName, configJson metadata.
 */

/**
 * Test: providerUsageLog INSERT with a seeded STT/TTS providerId succeeds
 * (validates the FK constraint is satisfied).
 */
```

### 1.2-1.7 Schema Migration Tests

```typescript
/**
 * Test: Each new table can be inserted into with valid data.
 * persona_templates, channel_connections, channel_credentials,
 * chat_widgets, conversation_artifacts, webhook_triggers,
 * webhook_trigger_logs, channel_routing_rules — each gets a basic INSERT test.
 */

/**
 * Test: FK constraints work (insert with invalid FK fails).
 * e.g., channel_connections with nonexistent tenant_id, persona_templates with
 * nonexistent user_id, etc.
 */

/**
 * Test: CHECK constraints reject invalid values.
 * e.g., channel_connections.channel_type = 'invalid_type' fails,
 * persona_templates.tone = 'angry' fails,
 * persona_templates.scope = 'global' fails.
 */

/**
 * Test: conversations.tenantId backfill populates correctly from users.currentTenantId.
 * Create a user with currentTenantId, create a conversation for that user with
 * tenantId = NULL, run backfill, verify tenantId is set.
 */

/**
 * Test: Unique constraints prevent duplicate entries.
 * e.g., channel_connections (tenant_id, channel_type, external_user_id) rejects
 * duplicate combinations.
 */

/**
 * Test: ON DELETE CASCADE removes child rows when parent deleted.
 * e.g., deleting a tenant cascades to persona_templates, channel_connections, etc.
 */

/**
 * Test: ON DELETE SET NULL nullifies FK columns when referenced row deleted.
 * e.g., deleting a persona_templates row sets users.defaultPersonaId to NULL.
 */
```

### Test Notes

- These tests require a real PostgreSQL database connection (integration tests). Use the existing test database connection pattern from the project.
- Mock the database if the project convention uses mocked Drizzle operators for unit tests. The enum and constraint tests specifically need integration-level validation.
- Mark with a test group/tag if the project uses pytest-style markers (the TypeScript side uses Vitest `describe` blocks).

---

## Implementation Details

### Step 1: Enum Extension (creditSourceType)

**Problem:** PostgreSQL `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block. Drizzle's `db:push` may wrap migrations in transactions. This requires a **separate raw SQL migration file** executed directly via `psql`.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/0054_claw_enum_extension.sql`

Execute this SQL outside any transaction:

```sql
-- Cannot be inside BEGIN/COMMIT
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'tts';
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'browser_automation';
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'widget_chat';
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'webhook_chat';
```

**Important:** The value `'stt'` already exists in the enum (line 107 of `schema.ts`), so no migration is needed for STT.

After running the SQL, update the TypeScript side. In `schema.ts` at line 99, add the new values to the `creditSourceTypeEnum` array:

```typescript
export const creditSourceTypeEnum = pgEnum("credit_source_type", [
  "chat", "skill", "media_image", "media_video", "media_audio",
  "indexing", "rag", "stt", "translation", "brainstorm",
  "scheduler", "admin", "agency", "creator_revenue", "other",
  // New values for ClawFeature
  "tts", "browser_automation", "widget_chat", "webhook_chat",
]);
```

Also update the `CreditSourceType` union type in `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts` if it maintains a separate TypeScript union (grep for `CreditSourceType` to locate it).

### Step 2: Seed STT/TTS Providers in llmProviders

**Why this is a blocker:** `providerUsageLog.providerId` is `integer("providerId").notNull().references(() => llmProviders.id)` -- a real integer FK with NOT NULL constraint. Voice features (Section 06) will log STT/TTS usage to `providerUsageLog`, so these provider rows must exist first.

**File to create or modify:** A seed script or migration SQL file. Can be appended to the enum migration SQL or a separate seed script.

Seed these four entries into the `llm_providers` table:

| providerName | displayName | configJson (metadata) | isEnabled |
|---|---|---|---|
| `groq-whisper-stt` | Groq Whisper STT | `{"type": "stt", "supportedFormats": ["wav","mp3","webm"]}` | true |
| `openai-whisper-stt` | OpenAI Whisper STT | `{"type": "stt", "supportedFormats": ["wav","mp3","webm","m4a"]}` | true |
| `elevenlabs-tts` | ElevenLabs TTS | `{"type": "tts", "supportedVoices": true}` | true |
| `openai-tts` | OpenAI TTS | `{"type": "tts", "supportedVoices": true}` | true |

The `llmProviders` table does not have a dedicated `type` column for stt/tts, so differentiation is done via `providerName` naming convention and the `configJson.type` field. The `id` values (auto-incremented serial) will be referenced by voice feature code, so after seeding, the implementer should note the assigned IDs or query them by `providerName` at runtime.

Use `INSERT ... ON CONFLICT (providerName) DO NOTHING` to make the seed idempotent.

### Step 3: Migration -- Persona Foundation (persona_templates table)

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add the `persona_templates` table definition. This table has no dependencies on other new tables -- it only references existing `tenants` and `users` tables.

**Table: `persona_templates`**

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `tenantId` | `varchar(36)` | Nullable FK to `tenants(id)` ON DELETE CASCADE |
| `userId` | `integer` | Nullable FK to `users(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL |
| `description` | `text` | Nullable |
| `systemPromptPrefix` | `text` | NOT NULL (max 2000 chars enforced at app layer) |
| `tone` | `text` | CHECK ('formal', 'casual', 'friendly', 'technical', 'creative') |
| `language` | `text` | Default 'auto' |
| `responseStyle` | `jsonb` | Default '{}' |
| `restrictions` | `text[]` | Default '{}' (max 20 entries, 500 chars each -- app validation) |
| `scope` | `text` | NOT NULL, CHECK ('platform', 'tenant', 'user') |
| `isDefault` | `boolean` | Default false |
| `createdAt` | `timestamptz` | Default now(), NOT NULL |
| `updatedAt` | `timestamptz` | Default now(), NOT NULL |

**Indexes:** `(tenantId, scope)` and `(userId)`.

In Drizzle, implement the CHECK constraints via the `check()` helper in the table's trailing config function. Example pattern:

```typescript
}, (t) => [
  index("persona_templates_tenant_scope_idx").on(t.tenantId, t.scope),
  index("persona_templates_user_idx").on(t.userId),
  check("persona_templates_tone_check", sql`"tone" IN ('formal','casual','friendly','technical','creative') OR "tone" IS NULL`),
  check("persona_templates_scope_check", sql`"scope" IN ('platform','tenant','user')`),
]);
```

**New columns on existing tables (same migration):**

- `users.defaultPersonaId` -- `varchar("defaultPersonaId", { length: 36 })`, nullable FK to `persona_templates(id)` ON DELETE SET NULL
- `tenants.defaultPersonaId` -- `varchar("defaultPersonaId", { length: 36 })`, nullable FK to `persona_templates(id)` ON DELETE SET NULL
- `conversations.personaId` -- `varchar("personaId", { length: 36 })`, nullable FK to `persona_templates(id)` ON DELETE SET NULL
- `conversations.tenantId` -- `varchar("tenantId", { length: 36 })`, nullable FK to `tenants(id)` ON DELETE CASCADE. Add index `idx_conversations_tenant`.

**Critical note on conversations.tenantId backfill:**

The `users.currentTenantId` column is `integer` type (line 187 of schema.ts: `currentTenantId: integer("currentTenantId").references((): AnyPgColumn => tenants.id)`), while `tenants.id` is `varchar(36)`. This integer references a varchar PK, which means PostgreSQL is doing an implicit cast. The actual stored values in `users.currentTenantId` are integers that correspond to the varchar tenant IDs.

**Before writing the backfill query**, verify the actual data in production:

```sql
SELECT u.id, u."currentTenantId", t.id as tenant_id 
FROM users u 
LEFT JOIN tenants t ON u."currentTenantId"::text = t.id 
LIMIT 10;
```

If the join works (integers cast to text match tenant IDs), the backfill is:

```sql
UPDATE conversations SET "tenantId" = u."currentTenantId"::text
FROM users u WHERE conversations."userId" = u.id AND conversations."tenantId" IS NULL;
```

If the project uses `tenantId` as a varchar on users via a different column, use that instead. The key requirement is that after backfill, every existing conversation has a valid `tenantId` matching its owner's tenant.

**Also required:** Update all conversation creation sites to set `tenantId` at creation time. Search for `db.insert(conversations)` across the codebase:
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/channelGateway.ts` (if it creates conversations)
- Any agency conversation creation paths

### Step 4: Migration -- Messages TraceId

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add to the `messages` table definition (after line ~1254):

```typescript
/** Trace ID for cost correlation with providerUsageLog */
traceId: varchar("traceId", { length: 32 }),
```

Add to the table's index config:

```typescript
index("idx_messages_traceid").on(t.traceId),
```

This column must match the type of `providerUsageLog.traceId` exactly: `varchar(32)`, nullable.

### Step 5: Migration -- Channel Infrastructure

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

**Table: `channel_connections`** -- Generalizes the existing `telegramConnections` table (line 4257 of schema.ts).

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `tenantId` | `varchar(36)` | NOT NULL FK to `tenants(id)` ON DELETE CASCADE |
| `userId` | `integer` | NOT NULL FK to `users(id)` ON DELETE CASCADE |
| `channelType` | `text` | NOT NULL, CHECK ('telegram', 'whatsapp', 'line', 'slack', 'discord') |
| `externalUserId` | `text` | NOT NULL |
| `externalChatId` | `text` | Nullable |
| `connectionConfig` | `jsonb` | Default '{}' (may contain encrypted OAuth tokens) |
| `status` | `text` | NOT NULL, default 'pending', CHECK ('active', 'revoked', 'pending', 'blocked') |
| `activeChannelId` | `varchar(36)` | Nullable FK to `conversationChannels(id)` ON DELETE SET NULL |
| `linkedAt` | `timestamptz` | Default now(), NOT NULL |
| `linkedBy` | `varchar(20)` | |
| `revokedAt` | `timestamptz` | Nullable |
| `revokedBy` | `varchar(36)` | Nullable |

**Unique constraint:** `(tenantId, channelType, externalUserId)`

**Indexes:** `(tenantId, channelType, status)` and `(tenantId, userId)`.

**Table: `channel_credentials`** -- Admin-configured per-tenant channel secrets.

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `tenantId` | `varchar(36)` | NOT NULL FK to `tenants(id)` ON DELETE CASCADE |
| `channelType` | `text` | NOT NULL, CHECK same as above |
| `credentialsEncrypted` | `text` | NOT NULL (AES-256-GCM via `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts`) |
| `webhookUrl` | `text` | Nullable |
| `webhookSecretEncrypted` | `text` | Nullable |
| `isActive` | `boolean` | Default true |
| `metadata` | `jsonb` | Nullable |
| `createdAt` | `timestamptz` | Default now(), NOT NULL |
| `updatedAt` | `timestamptz` | Default now(), NOT NULL |

**Unique constraint:** `(tenantId, channelType)` -- may need relaxation later for multi-bot-per-channel.

**Index:** `(tenantId, channelType)`.

**Data migration from telegramConnections to channel_connections:**

After creating the `channel_connections` table, copy existing data from `telegramConnections` (schema.ts line 4257). Column mapping:

| telegramConnections | channel_connections |
|---|---|
| `id` | `id` |
| `tenantId` | `tenantId` |
| `userId` | `userId` |
| (hardcode) | `channelType = 'telegram'` |
| `telegramUserId` | `externalUserId` |
| `telegramChatId` | `externalChatId` |
| `status` | `status` |
| `activeChannelId` | `activeChannelId` |
| `linkedAt` | `linkedAt` |
| `linkedBy` | `linkedBy` |
| `revokedAt` | `revokedAt` |
| `revokedBy` | `revokedBy` |
| `botId` + `metadata` | `connectionConfig = jsonb_build_object('bot_id', botId, 'telegram_username', telegramUsername, 'metadata', metadata)` |

This should be a SQL migration that runs after the table creation. Use `INSERT INTO ... SELECT FROM` with the mapping above. Verify row counts match before and after.

### Step 6: Migration -- Widget and Artifacts

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

**Table: `chat_widgets`** -- Depends on `persona_templates` for `defaultPersonaId` FK.

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `tenantId` | `varchar(36)` | NOT NULL FK to `tenants(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL |
| `targetType` | `text` | CHECK ('chat', 'agency') |
| `targetAgencyId` | `varchar(36)` | Nullable FK to `agencies(id)` ON DELETE SET NULL |
| `defaultPersonaId` | `varchar(36)` | Nullable FK to `persona_templates(id)` ON DELETE SET NULL |
| `theme` | `jsonb` | Nullable |
| `allowedOrigins` | `text[]` | Default '{}' (empty = NO origins allowed) |
| `rateLimitPerMinute` | `integer` | Default 10 |
| `maxConversationLength` | `integer` | Default 100 |
| `requireEmail` | `boolean` | Default false |
| `creditSource` | `text` | CHECK ('tenant', 'visitor') |
| `monthlyCreditBudget` | `integer` | Nullable |
| `maxCreditsPerVisitorSession` | `integer` | Default 50 |
| `maxCreditsPerVisitorDay` | `integer` | Default 100 |
| `isActive` | `boolean` | Default true |
| `createdAt` | `timestamptz` | Default now(), NOT NULL |
| `updatedAt` | `timestamptz` | Default now(), NOT NULL |

**Index:** `(tenantId, isActive)`.

**Table: `conversation_artifacts`** -- Depends on `conversations` and `messages`.

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `conversationId` | `integer` | NOT NULL FK to `conversations(id)` ON DELETE CASCADE |
| `messageId` | `integer` | NOT NULL FK to `messages(id)` ON DELETE CASCADE |
| `artifactType` | `text` | NOT NULL, CHECK ('code', 'react', 'chart', 'table', 'mermaid', 'html', 'markdown', 'svg') |
| `title` | `text` | Nullable |
| `content` | `text` | NOT NULL (500KB max -- app validation) |
| `language` | `text` | Nullable |
| `version` | `integer` | Default 1 |
| `parentArtifactId` | `varchar(36)` | Self-referential FK ON DELETE SET NULL |
| `metadata` | `jsonb` | Nullable |
| `createdAt` | `timestamptz` | Default now(), NOT NULL |

**Self-referential FK note:** In Drizzle, use the deferred lambda pattern for self-references:

```typescript
parentArtifactId: varchar("parentArtifactId", { length: 36 })
  .references((): AnyPgColumn => conversationArtifacts.id, { onDelete: "set null" }),
```

**Indexes:** `(conversationId)` and `(messageId)`.

### Step 7: Migration -- Webhooks and Routing

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

**Table: `webhook_triggers`** -- Depends on `conversations`, `agencies`, `workflows`.

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `tenantId` | `varchar(36)` | NOT NULL FK to `tenants(id)` ON DELETE CASCADE |
| `userId` | `integer` | NOT NULL FK to `users(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL |
| `description` | `text` | Nullable |
| `authType` | `text` | NOT NULL, default 'token', CHECK ('token', 'hmac_sha256') |
| `authSecretEncrypted` | `text` | NOT NULL (encrypted via crypto.ts) |
| `targetType` | `text` | NOT NULL, CHECK ('chat', 'agency', 'workflow') |
| `targetConversationId` | `integer` | Nullable FK to `conversations(id)` ON DELETE SET NULL |
| `targetAgencyId` | `varchar(36)` | Nullable FK to `agencies(id)` ON DELETE SET NULL |
| `targetWorkflowId` | `integer` | Nullable FK to `workflows(id)` ON DELETE SET NULL |
| `payloadTemplate` | `jsonb` | Default '{}' (max 2000 chars -- app validation) |
| `rateLimitPerMinute` | `integer` | Default 10 |
| `monthlyTriggerBudget` | `integer` | Nullable |
| `isActive` | `boolean` | Default true |
| `totalTriggers` | `integer` | Default 0 |
| `lastTriggeredAt` | `timestamptz` | Nullable |
| `createdAt` | `timestamptz` | Default now(), NOT NULL |
| `updatedAt` | `timestamptz` | Default now(), NOT NULL |

Note: `workflows.id` is `serial` (integer), so `targetWorkflowId` is `integer`.

**Index:** `(tenantId, isActive)`.

**Table: `webhook_trigger_logs`** -- Append-heavy logging table.

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `triggerId` | `varchar(36)` | NOT NULL FK to `webhook_triggers(id)` ON DELETE CASCADE |
| `requestMethod` | `text` | Nullable |
| `requestHeadersSafe` | `jsonb` | Nullable (allowlist: Content-Type, User-Agent, X-Forwarded-For only) |
| `requestBodyHash` | `varchar(64)` | Nullable (SHA-256) |
| `requestBodySize` | `integer` | Nullable |
| `extractedVariables` | `jsonb` | Nullable (secret patterns stripped before storage) |
| `sourceIpMasked` | `text` | Nullable (/24 prefix only) |
| `status` | `text` | NOT NULL, CHECK ('success', 'auth_failed', 'rate_limited', 'target_error', 'credit_insufficient') |
| `targetExecutionId` | `text` | Nullable |
| `creditsConsumed` | `numeric(12,4)` | Default 0 |
| `errorMessage` | `text` | Nullable |
| `processingTimeMs` | `integer` | Nullable |
| `createdAt` | `timestamptz` | Default now(), NOT NULL |

**Index:** `(triggerId, createdAt DESC)`.

**Table: `channel_routing_rules`** -- Depends on `agencies`, `persona_templates`.

| Column | Type | Constraints |
|---|---|---|
| `id` | `varchar(36)` | PK, default `gen_random_uuid()` |
| `tenantId` | `varchar(36)` | NOT NULL FK to `tenants(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL |
| `description` | `text` | Nullable |
| `priority` | `integer` | Default 50 |
| `isActive` | `boolean` | Default true |
| `conditions` | `jsonb` | NOT NULL (validated against Zod schema on save) |
| `targetType` | `text` | NOT NULL, CHECK ('agency', 'chat', 'workflow') |
| `targetAgencyId` | `varchar(36)` | Nullable FK to `agencies(id)` ON DELETE SET NULL |
| `targetPersonaId` | `varchar(36)` | Nullable FK to `persona_templates(id)` ON DELETE SET NULL |
| `targetWorkflowId` | `integer` | Nullable FK to `workflows(id)` ON DELETE SET NULL |
| `totalMatches` | `integer` | Default 0 |
| `lastMatchedAt` | `timestamptz` | Nullable |
| `createdAt` | `timestamptz` | Default now(), NOT NULL |
| `updatedAt` | `timestamptz` | Default now(), NOT NULL |

**Critical index:** `(tenantId, isActive, priority DESC)` -- this index is evaluated on every inbound channel message so performance matters.

### Step 8: Voice Consent Column

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add to the `users` table definition (after the existing TOTP/2FA fields):

```typescript
/** PDPA/GDPR voice consent: NULL = not consented, timestamp = when consent was given */
voiceConsentGrantedAt: timestamp("voiceConsentGrantedAt", { withTimezone: true }),
```

This is a nullable TIMESTAMPTZ column. NULL means the user has not granted voice consent. A timestamp value indicates when consent was granted. Setting it back to NULL revokes consent.

---

## Migration Execution Order

The migrations must be run in this exact order due to FK dependencies:

1. **Enum extension** (Step 1) -- raw SQL via `psql`, must run outside transaction
2. **STT/TTS provider seed** (Step 2) -- SQL INSERT, can run in same session
3. **Schema changes** (Steps 3-8) -- modify `schema.ts`, then run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push`
4. **Backfill `conversations.tenantId`** (part of Step 3) -- raw SQL UPDATE after migration
5. **Data migration `telegramConnections` to `channel_connections`** (part of Step 5) -- raw SQL INSERT after table creation

**MANDATORY: Follow the Database Safety Protocol from CLAUDE.md.** Before any migration:

```bash
mkdir -p /home/dev/projects/SmartSpecPro/.db-backups

# Backup all affected tables
pg_dump "$DATABASE_URL" --data-only \
  --table=users --table=tenants --table=conversations --table=messages \
  --table=telegram_connections --table=credit_transactions \
  --file="/home/dev/projects/SmartSpecPro/.db-backups/claw_pre_migration_$(date +%Y%m%d_%H%M%S).sql"

# Record row counts
psql "$DATABASE_URL" -c "
  SELECT 'users' as tbl, count(*) FROM users
  UNION ALL SELECT 'tenants', count(*) FROM tenants
  UNION ALL SELECT 'conversations', count(*) FROM conversations
  UNION ALL SELECT 'messages', count(*) FROM messages
  UNION ALL SELECT 'telegram_connections', count(*) FROM telegram_connections
  UNION ALL SELECT 'credit_transactions', count(*) FROM credit_transactions;
"
```

After migration, verify row counts match and spot-check data integrity.

---

## Post-Migration Verification Checklist

1. All six new tables exist and accept valid INSERTs
2. New enum values `'tts'`, `'browser_automation'`, `'widget_chat'`, `'webhook_chat'` are accepted in `credit_transactions.sourceType`
3. Four new STT/TTS providers exist in `llm_providers`
4. `conversations.tenantId` is populated for all existing conversations
5. `channel_connections` contains all rows from `telegram_connections` (matching row counts)
6. `messages.traceId` column exists and is nullable varchar(32)
7. `users.voiceConsentGrantedAt` column exists and is nullable timestamptz
8. `users.defaultPersonaId` and `tenants.defaultPersonaId` columns exist with proper FK constraints
9. All CHECK constraints enforce valid values (test with invalid INSERT attempts)
10. All indexes are created (verify with `\di` in psql or `SELECT * FROM pg_indexes WHERE tablename = '...'`)

---

## Type Exports

After adding all tables to `schema.ts`, export the inferred types for each new table. Follow the existing convention:

```typescript
export type PersonaTemplate = typeof personaTemplates.$inferSelect;
export type InsertPersonaTemplate = typeof personaTemplates.$inferInsert;

export type ChannelConnection = typeof channelConnections.$inferSelect;
export type InsertChannelConnection = typeof channelConnections.$inferInsert;

export type ChannelCredential = typeof channelCredentials.$inferSelect;
export type InsertChannelCredential = typeof channelCredentials.$inferInsert;

export type ChatWidget = typeof chatWidgets.$inferSelect;
export type InsertChatWidget = typeof chatWidgets.$inferInsert;

export type ConversationArtifact = typeof conversationArtifacts.$inferSelect;
export type InsertConversationArtifact = typeof conversationArtifacts.$inferInsert;

export type WebhookTrigger = typeof webhookTriggers.$inferSelect;
export type InsertWebhookTrigger = typeof webhookTriggers.$inferInsert;

export type WebhookTriggerLog = typeof webhookTriggerLogs.$inferSelect;
export type InsertWebhookTriggerLog = typeof webhookTriggerLogs.$inferInsert;

export type ChannelRoutingRule = typeof channelRoutingRules.$inferSelect;
export type InsertChannelRoutingRule = typeof channelRoutingRules.$inferInsert;
```

These types are consumed by all subsequent feature sections for type-safe Drizzle queries.

---

## Important Caveats

1. **`tenants.id` is `varchar(36)` but `users.currentTenantId` is `integer`** -- This type mismatch exists in the current schema. The backfill query must account for this with `::text` cast. Verify actual data before running.

2. **`telegramConnections` table should NOT be dropped** -- Keep it alongside `channel_connections` during a transition period. Section 05 (Channel Adapter) will implement dual-write and eventually deprecate it.

3. **`conversation_artifacts.parentArtifactId` self-reference** -- Use Drizzle's `(): AnyPgColumn =>` deferred lambda pattern (already imported at line 1 of schema.ts) to avoid circular reference issues.

4. **`webhook_triggers.authSecretEncrypted`** -- This column stores AES-256-GCM encrypted secrets via `crypto.ts`. Never store plaintext auth secrets. The encryption/decryption happens at the application layer (Section 11).

5. **Index on `channel_routing_rules(tenantId, isActive, priority DESC)`** -- The DESC ordering is critical for performance since rules are evaluated highest-priority-first. In Drizzle, use `sql` helper if the index builder does not support DESC natively.

---

## Implementation Notes (Actual)

### Files Created/Modified
- `apps/web/drizzle/schema.ts` — All 8 new tables + new columns on users, tenants, conversations, messages
- `apps/web/drizzle/0054_claw_enum_extension.sql` — Raw SQL enum extension (run manually first)
- `apps/web/drizzle/0054_faithful_midnight.sql` — Generated Drizzle migration (tables, columns, indexes, FKs)
- `apps/web/drizzle/0055_serious_crystal.sql` — FK constraints for conversations.tenantId/personaId, users/tenants.defaultPersonaId
- `apps/web/server/services/creditService.ts` — CreditSourceType union extended
- `apps/web/server/services/__tests__/clawDatabaseMigrations.test.ts` — 22 integration tests

### Deviations from Plan
1. **conversations.tenantId backfill** — `users.currentTenantId` stores varchar values directly (not integers requiring cast). No `::text` cast needed.
2. **telegramConnections data migration** — Deferred to Section 05 as planned. Table preserved alongside channel_connections.
3. **STT/TTS provider seed** — Seeded via manual psql INSERT ON CONFLICT DO NOTHING (IDs: 6-9). No separate seed script created.
4. **Index DESC ordering** — Drizzle index builder doesn't support DESC natively. ASC indexes used; PostgreSQL backward scan handles DESC queries.
5. **tenants.featureFlags** — Added proactively for Section 14 (feature flags) since it's a simple nullable JSON column.

### Test Count: 22 (all passing)