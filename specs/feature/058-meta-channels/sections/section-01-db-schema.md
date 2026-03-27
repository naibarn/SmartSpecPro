# Section 01: Database Schema

## Overview

This section defines all `social_*` table definitions in `apps/web/drizzle/schema.ts`, the corresponding migration generation, and schema verification tests. These tables form the foundation for the entire Meta Channels feature (058) and are depended on by every other section.

**No existing tables are modified.** This section only adds new tables and indexes.

## Dependencies

- None (this is a root section with no upstream dependencies)

## Blocked By This Section

- All other sections (01 blocks 02-14)

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `apps/web/drizzle/schema.ts` | **Modify** -- append 11 new `pgTable` definitions at the end of the file |
| `apps/web/drizzle/NNNN_meta_channels.sql` | **Generated** -- by `drizzle-kit generate` after schema changes |
| `apps/web/server/services/__tests__/socialSchema.test.ts` | **Create** -- schema verification tests |

---

## Tests First

### File: `apps/web/server/services/__tests__/socialSchema.test.ts`

```
Test: socialProviderConnections table accepts valid insert with all required fields
  - Insert a row with tenantId, userId, provider="meta", status="active", encryptedAccessToken
  - Verify the row is queryable and has auto-generated id and timestamps

Test: socialPages cascade-deletes when connection is deleted
  - Insert a socialProviderConnections row
  - Insert a socialPages row referencing it via connectionId
  - Delete the connection row
  - Verify the page row is also deleted (CASCADE)

Test: socialConversations unique constraint on (pageId, customerExternalId) prevents duplicates
  - Insert a socialConversations row with pageId=1, customerExternalId="psid_123"
  - Attempt to insert another row with the same pageId and customerExternalId
  - Verify the second insert throws a unique constraint violation error

Test: socialMessages unique constraint on providerMessageId prevents duplicates
  - Insert a socialMessages row with providerMessageId="mid.abc123"
  - Attempt to insert another row with the same providerMessageId
  - Verify the second insert throws a unique constraint violation error

Test: socialWebhookEventsRaw unique constraint on (provider, deliveryId)
  - Insert a socialWebhookEventsRaw row with provider="meta", deliveryId="entry1:ts1"
  - Attempt to insert another row with the same provider and deliveryId
  - Verify the second insert throws a unique constraint violation error

Test: socialHumanApprovals defaults status to "pending"
  - Insert a socialHumanApprovals row without specifying status
  - Query the row back
  - Verify status equals "pending"
```

These tests should use direct Drizzle ORM insert/select operations against a test database (following the existing pattern in the codebase where schema tests use `db.insert()` and `db.select()`). Mock or use a test database connection.

---

## Implementation Details

### Table Definitions

Append the following 11 table definitions to the end of `apps/web/drizzle/schema.ts`, before any closing comments. All tables follow existing conventions:

- `serial("id").primaryKey()` for auto-incrementing IDs
- `varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" })` for tenant scoping
- `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` for timestamps
- `json().$type<T>()` for typed JSON columns
- Index definitions in the table's third argument callback `(t) => [...]`

**Important**: The `real` type is NOT imported in the existing schema. Use `doublePrecision` (already imported) for the `autoSendConfidenceThreshold` and `confidence` columns instead.

---

### Table 1: `socialProviderConnections`

SQL table name: `"social_provider_connections"`

Export name: `socialProviderConnections`

Columns:

| Column | Drizzle Definition | Notes |
|--------|-------------------|-------|
| `id` | `serial("id").primaryKey()` | |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` | |
| `userId` | `integer("userId").notNull().references(() => users.id, { onDelete: "cascade" })` | User who authorized |
| `provider` | `varchar("provider", { length: 50 }).notNull()` | "meta" (extensible) |
| `providerUserId` | `varchar("providerUserId", { length: 255 })` | Meta user ID |
| `status` | `varchar("status", { length: 20 }).notNull().default("active")` | "active" / "expired" / "revoked" / "error" |
| `grantedScopes` | `json("grantedScopes").$type<string[]>()` | OAuth scopes granted |
| `encryptedAccessToken` | `text("encryptedAccessToken")` | AES-256-GCM encrypted long-lived token |
| `encryptedRefreshToken` | `text("encryptedRefreshToken")` | nullable |
| `tokenExpiresAt` | `timestamp("tokenExpiresAt", { withTimezone: true })` | |
| `metadata` | `json("metadata").$type<Record<string, unknown>>()` | Provider-specific extra data |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` | |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` | |

Indexes:
```typescript
(t) => [
  index("idx_social_provider_connections_tenant").on(t.tenantId),
  index("idx_social_provider_connections_user").on(t.userId),
]
```

Export types: `SocialProviderConnection`, `InsertSocialProviderConnection`

---

### Table 2: `socialPages`

SQL table name: `"social_pages"`

Export name: `socialPages`

Columns:

| Column | Drizzle Definition | Notes |
|--------|-------------------|-------|
| `id` | `serial("id").primaryKey()` | |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` | |
| `connectionId` | `integer("connectionId").notNull().references(() => socialProviderConnections.id, { onDelete: "cascade" })` | CASCADE -- critical for test |
| `providerPageId` | `varchar("providerPageId", { length: 255 }).notNull()` | Facebook Page ID |
| `pageName` | `varchar("pageName", { length: 500 })` | |
| `pageCategory` | `varchar("pageCategory", { length: 255 })` | |
| `status` | `varchar("status", { length: 20 }).notNull().default("active")` | "active" / "disconnected" / "needs_reauth" |
| `encryptedPageAccessToken` | `text("encryptedPageAccessToken")` | AES-256-GCM encrypted page token |
| `tokenExpiresAt` | `timestamp("tokenExpiresAt", { withTimezone: true })` | |
| `selectedForInbox` | `boolean("selectedForInbox").notNull().default(true)` | |
| `selectedForPublishing` | `boolean("selectedForPublishing").notNull().default(true)` | |
| `selectedForModeration` | `boolean("selectedForModeration").notNull().default(false)` | |
| `aiActionMode` | `varchar("aiActionMode", { length: 20 }).notNull().default("draft_only")` | "off" / "draft_only" / "approval_required" / "auto_send" |
| `autoSendConfidenceThreshold` | `doublePrecision("autoSendConfidenceThreshold").notNull().default(0.95)` | Uses doublePrecision (not real) since real is not imported |
| `metadata` | `json("metadata").$type<Record<string, unknown>>()` | |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` | |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` | |

Indexes:
```typescript
(t) => [
  index("idx_social_pages_tenant").on(t.tenantId),
  index("idx_social_pages_connection").on(t.connectionId),
]
```

Export types: `SocialPage`, `InsertSocialPage`

---

### Table 3: `socialWebhookSubscriptions`

SQL table name: `"social_webhook_subscriptions"`

Export name: `socialWebhookSubscriptions`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `pageId` | `integer("pageId").notNull().references(() => socialPages.id, { onDelete: "cascade" })` |
| `subscriptionStatus` | `varchar("subscriptionStatus", { length: 20 }).notNull().default("pending")` |
| `subscribedFields` | `json("subscribedFields").$type<string[]>()` |
| `lastVerifiedAt` | `timestamp("lastVerifiedAt", { withTimezone: true })` |
| `lastDeliveryAt` | `timestamp("lastDeliveryAt", { withTimezone: true })` |
| `lastError` | `text("lastError")` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` |

No additional indexes needed (pageId FK index is sufficient).

---

### Table 4: `socialConversations`

SQL table name: `"social_conversations"`

Export name: `socialConversations`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` |
| `pageId` | `integer("pageId").notNull().references(() => socialPages.id, { onDelete: "cascade" })` |
| `providerConversationId` | `varchar("providerConversationId", { length: 255 })` |
| `channelType` | `varchar("channelType", { length: 50 }).notNull().default("messenger")` |
| `customerExternalId` | `varchar("customerExternalId", { length: 255 }).notNull()` |
| `customerDisplayName` | `varchar("customerDisplayName", { length: 500 })` |
| `status` | `varchar("status", { length: 20 }).notNull().default("open")` |
| `assignedToUserId` | `integer("assignedToUserId").references(() => users.id, { onDelete: "set null" })` |
| `priority` | `integer("priority").notNull().default(0)` |
| `lastMessageAt` | `timestamp("lastMessageAt", { withTimezone: true })` |
| `lastInboundAt` | `timestamp("lastInboundAt", { withTimezone: true })` |
| `lastOutboundAt` | `timestamp("lastOutboundAt", { withTimezone: true })` |
| `unreadCount` | `integer("unreadCount").notNull().default(0)` |
| `labels` | `json("labels").$type<string[]>()` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` |

Indexes:
```typescript
(t) => [
  uniqueIndex("idx_social_conversations_page_customer").on(t.pageId, t.customerExternalId),
  index("idx_social_conversations_tenant_page").on(t.tenantId, t.pageId),
  index("idx_social_conversations_status_last_msg").on(t.status, t.lastMessageAt),
  index("idx_social_conversations_tenant_status").on(t.tenantId, t.status),
]
```

The `uniqueIndex` on `(pageId, customerExternalId)` enforces one conversation per customer per page (tested in TDD).

Export types: `SocialConversation`, `InsertSocialConversation`

---

### Table 5: `socialMessages`

SQL table name: `"social_messages"`

Export name: `socialMessages`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` |
| `conversationId` | `integer("conversationId").notNull().references(() => socialConversations.id, { onDelete: "cascade" })` |
| `pageId` | `integer("pageId").notNull().references(() => socialPages.id, { onDelete: "cascade" })` |
| `providerMessageId` | `varchar("providerMessageId", { length: 255 })` |
| `direction` | `varchar("direction", { length: 10 }).notNull()` | "inbound" / "outbound" |
| `senderType` | `varchar("senderType", { length: 20 }).notNull()` | "customer" / "agent" / "ai" / "system" |
| `senderExternalId` | `varchar("senderExternalId", { length: 255 })` |
| `senderUserId` | `integer("senderUserId").references(() => users.id, { onDelete: "set null" })` |
| `messageType` | `varchar("messageType", { length: 30 }).notNull().default("text")` |
| `body` | `text("body")` |
| `payload` | `json("payload").$type<Record<string, unknown>>()` |
| `deliveryStatus` | `varchar("deliveryStatus", { length: 20 }).notNull().default("sent")` |
| `errorMessage` | `text("errorMessage")` |
| `sentAt` | `timestamp("sentAt", { withTimezone: true })` |
| `receivedAt` | `timestamp("receivedAt", { withTimezone: true })` |
| `workflowTriggerStatus` | `varchar("workflowTriggerStatus", { length: 20 })` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |

Indexes:
```typescript
(t) => [
  index("idx_social_messages_conversation_created").on(t.conversationId, t.createdAt),
  uniqueIndex("idx_social_messages_provider_msg_id").on(t.providerMessageId),
]
```

The `uniqueIndex` on `providerMessageId` prevents duplicate message ingestion (tested in TDD).

Export types: `SocialMessage`, `InsertSocialMessage`

---

### Table 6: `socialPosts`

SQL table name: `"social_posts"`

Export name: `socialPosts`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` |
| `pageId` | `integer("pageId").notNull().references(() => socialPages.id, { onDelete: "cascade" })` |
| `providerPostId` | `varchar("providerPostId", { length: 255 })` |
| `status` | `varchar("status", { length: 20 }).notNull().default("draft")` |
| `contentText` | `text("contentText")` |
| `contentLink` | `text("contentLink")` |
| `mediaRefs` | `json("mediaRefs").$type<string[]>()` |
| `scheduledAt` | `timestamp("scheduledAt", { withTimezone: true })` |
| `publishedAt` | `timestamp("publishedAt", { withTimezone: true })` |
| `createdByUserId` | `integer("createdByUserId").references(() => users.id, { onDelete: "set null" })` |
| `approvedByUserId` | `integer("approvedByUserId").references(() => users.id, { onDelete: "set null" })` |
| `errorMessage` | `text("errorMessage")` |
| `metadata` | `json("metadata").$type<Record<string, unknown>>()` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` |

Indexes:
```typescript
(t) => [
  index("idx_social_posts_tenant_status").on(t.tenantId, t.status),
  index("idx_social_posts_page_scheduled").on(t.pageId, t.scheduledAt),
]
```

Export types: `SocialPost`, `InsertSocialPost`

---

### Table 7: `socialComments`

SQL table name: `"social_comments"`

Export name: `socialComments`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` |
| `pageId` | `integer("pageId").notNull().references(() => socialPages.id, { onDelete: "cascade" })` |
| `providerCommentId` | `varchar("providerCommentId", { length: 255 })` |
| `providerObjectId` | `varchar("providerObjectId", { length: 255 })` | Post/photo ID the comment is on |
| `parentCommentId` | `integer("parentCommentId")` | nullable self-reference for reply threads |
| `authorExternalId` | `varchar("authorExternalId", { length: 255 })` |
| `authorDisplayName` | `varchar("authorDisplayName", { length: 500 })` |
| `body` | `text("body")` |
| `status` | `varchar("status", { length: 20 }).notNull().default("visible")` |
| `lastAction` | `varchar("lastAction", { length: 20 })` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` |

Indexes:
```typescript
(t) => [
  index("idx_social_comments_page_created").on(t.pageId, t.createdAt),
  uniqueIndex("idx_social_comments_provider_id").on(t.providerCommentId),
]
```

Export types: `SocialComment`, `InsertSocialComment`

---

### Table 8: `socialCommentActions`

SQL table name: `"social_comment_actions"`

Export name: `socialCommentActions`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `commentId` | `integer("commentId").notNull().references(() => socialComments.id, { onDelete: "cascade" })` |
| `actionType` | `varchar("actionType", { length: 20 }).notNull()` |
| `performedByUserId` | `integer("performedByUserId").references(() => users.id, { onDelete: "set null" })` |
| `performedBySystem` | `boolean("performedBySystem").notNull().default(false)` |
| `providerResult` | `json("providerResult").$type<Record<string, unknown>>()` |
| `status` | `varchar("status", { length: 20 }).notNull().default("completed")` |
| `errorMessage` | `text("errorMessage")` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |

No additional indexes needed.

Export types: `SocialCommentAction`, `InsertSocialCommentAction`

---

### Table 9: `socialAutomationRules`

SQL table name: `"social_automation_rules"`

Export name: `socialAutomationRules`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` |
| `pageId` | `integer("pageId").references(() => socialPages.id, { onDelete: "cascade" })` | nullable (null = all pages) |
| `name` | `varchar("name", { length: 255 }).notNull()` |
| `isEnabled` | `boolean("isEnabled").notNull().default(false)` |
| `triggerType` | `varchar("triggerType", { length: 50 }).notNull()` |
| `conditions` | `json("conditions").$type<Record<string, unknown>>()` |
| `actionMode` | `varchar("actionMode", { length: 20 }).notNull().default("draft_only")` |
| `policyConfig` | `json("policyConfig").$type<Record<string, unknown>>()` |
| `createdByUserId` | `integer("createdByUserId").references(() => users.id, { onDelete: "set null" })` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` |

Indexes:
```typescript
(t) => [
  index("idx_social_automation_rules_tenant").on(t.tenantId),
]
```

Export types: `SocialAutomationRule`, `InsertSocialAutomationRule`

---

### Table 10: `socialHumanApprovals`

SQL table name: `"social_human_approvals"`

Export name: `socialHumanApprovals`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `tenantId` | `varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` |
| `pageId` | `integer("pageId").notNull().references(() => socialPages.id, { onDelete: "cascade" })` |
| `entityType` | `varchar("entityType", { length: 50 }).notNull()` | "reply" / "post" / "comment_action" |
| `entityId` | `integer("entityId").notNull()` | References socialMessages.id, socialPosts.id, etc. (polymorphic, no FK) |
| `proposedContent` | `text("proposedContent")` |
| `confidence` | `doublePrecision("confidence")` | AI confidence score |
| `status` | `varchar("status", { length: 20 }).notNull().default("pending")` | "pending" / "approved" / "rejected" / "expired" -- default "pending" is tested |
| `requestedBySystem` | `boolean("requestedBySystem").notNull().default(true)` |
| `reviewedByUserId` | `integer("reviewedByUserId").references(() => users.id, { onDelete: "set null" })` |
| `decisionNote` | `text("decisionNote")` |
| `createdAt` | `timestamp("createdAt", { withTimezone: true }).defaultNow().notNull()` |
| `updatedAt` | `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()` |

Indexes:
```typescript
(t) => [
  index("idx_social_human_approvals_tenant_status").on(t.tenantId, t.status, t.createdAt),
]
```

Export types: `SocialHumanApproval`, `InsertSocialHumanApproval`

---

### Table 11: `socialWebhookEventsRaw`

SQL table name: `"social_webhook_events_raw"`

Export name: `socialWebhookEventsRaw`

Columns:

| Column | Drizzle Definition |
|--------|-------------------|
| `id` | `serial("id").primaryKey()` |
| `tenantId` | `varchar("tenantId", { length: 36 })` | nullable (resolved after parsing) |
| `provider` | `varchar("provider", { length: 50 }).notNull()` |
| `pageId` | `integer("pageId")` | nullable (resolved after parsing) |
| `deliveryId` | `varchar("deliveryId", { length: 255 }).notNull()` |
| `eventType` | `varchar("eventType", { length: 100 })` |
| `payload` | `json("payload").$type<Record<string, unknown>>()` |
| `headers` | `json("headers").$type<Record<string, string>>()` |
| `receivedAt` | `timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull()` |
| `processingStatus` | `varchar("processingStatus", { length: 20 }).notNull().default("pending")` |
| `errorMessage` | `text("errorMessage")` |

Indexes:
```typescript
(t) => [
  index("idx_social_webhook_events_raw_status").on(t.processingStatus, t.receivedAt),
  uniqueIndex("idx_social_webhook_events_raw_provider_delivery").on(t.provider, t.deliveryId),
]
```

The `uniqueIndex` on `(provider, deliveryId)` prevents duplicate webhook event storage (tested in TDD).

Export types: `SocialWebhookEventRaw`, `InsertSocialWebhookEventRaw`

---

## Migration Steps

After appending all 11 table definitions to `apps/web/drizzle/schema.ts`:

1. **No existing table backups needed** -- this section only adds new tables (no modifications to existing tables)
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push` to generate migration SQL and apply it
3. Verify migration applied by checking that all 11 tables exist:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename LIKE 'social_%' ORDER BY tablename;
   ```
   Expected: `social_automation_rules`, `social_comment_actions`, `social_comments`, `social_conversations`, `social_human_approvals`, `social_messages`, `social_pages`, `social_posts`, `social_provider_connections`, `social_webhook_events_raw`, `social_webhook_subscriptions`
4. Verify all indexes exist:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename LIKE 'social_%' ORDER BY indexname;
   ```

## Naming Conventions

- All SQL table names use `snake_case` with `social_` prefix (e.g., `social_provider_connections`)
- All TypeScript export names use `camelCase` with `social` prefix (e.g., `socialProviderConnections`)
- Column names use `camelCase` in the Drizzle definition (matching existing schema convention)
- Index names use `idx_social_` prefix followed by table name fragment and column(s)
- Type exports follow pattern: `type SocialXxx = typeof socialXxx.$inferSelect` and `type InsertSocialXxx = typeof socialXxx.$inferInsert`

## Cross-Section Interface Contract

Other sections reference these tables by their TypeScript export names. Key contracts:

- **Section 04 (OAuth)**: Inserts into `socialProviderConnections` and `socialPages`
- **Section 05 (Webhooks)**: Inserts into `socialWebhookEventsRaw`, reads `socialPages` for page-to-tenant mapping
- **Section 06 (Inbox Backend)**: Queries `socialConversations`, `socialMessages`; inserts outbound messages
- **Section 09 (Publishing)**: Inserts/updates `socialPosts`
- **Section 10 (Comments)**: Queries/updates `socialComments`, inserts `socialCommentActions`
- **Section 13 (RAG Archival)**: Reads `socialConversations` and `socialMessages` for vectorization
- **Section 14 (Automation)**: CRUD on `socialAutomationRules`, inserts `socialHumanApprovals`