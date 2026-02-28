# SmartSpecPro Telegram Chat Bridge

Version: 2.0
Status: Final (Codebase-Aligned)
Feature: 028-Chat-Bridge
Owner: Platform Architecture
Branch: feat/028-chat-bridge
Base: feat/027-agency-swarm

## 1. Executive Summary

This specification defines a Telegram chat bridge for SmartSpecPro that upgrades the existing notification-only Telegram integration into a full bidirectional chat channel.

SmartSpecPro currently has two parallel conversation systems:

1. **Web Chat** — Single-agent conversations via `chat.ts` router, stored in `conversations` + `messages` tables.
2. **Agency Swarm** — Multi-agent orchestration via `agency.ts` router, stored in `agencyConversations` + `agency_messages` tables.

The Telegram bridge must work with **both** systems as a transport layer, not as a third conversation system.

### Core Architectural Decision

Telegram is a **channel adapter**. It normalizes inbound Telegram messages into the existing SmartSpecPro pipelines and delivers outbound SmartSpecPro messages back to Telegram. It does not own conversations, memory, billing, tool execution, or orchestration.

### What Already Exists

| Component | File | Status |
|-----------|------|--------|
| Telegram send engine | `apps/web/server/services/telegramService.ts` (455 lines) | Working: notifications only |
| Telegram admin router | `apps/web/server/routers/telegram.ts` (569 lines) | Working: config, link gen, status |
| Notification service | `apps/web/server/services/notificationService.ts` | Working: fire-and-forget |
| User Telegram fields | `users.telegramChatId`, `telegramUsername`, `telegramVerified` | In schema |
| Bot settings | `systemSettings` table (category: `telegram`) | Encrypted storage |
| Deep link generator | `telegram.generateTelegramLink` tRPC endpoint | Working: stores code in Redis |
| Webhook handler | NOT IMPLEMENTED | **Critical gap** |
| Inbound message processing | NOT IMPLEMENTED | Required for chat bridge |
| Channel abstraction | NOT IMPLEMENTED | Required for multi-channel sync |

### What This Feature Adds

1. Webhook handler to receive Telegram messages and complete the linking flow.
2. Channel gateway abstraction for transport-agnostic message ingestion and delivery.
3. Bidirectional sync between web chat and Telegram for both regular and agency conversations.
4. Per-conversation channel bindings (not just per-user).
5. Delivery tracking with retry and dedupe.
6. Admin controls for tenant-level Telegram governance.

## 2. Product Goals

### 2.1 Primary Goals

1. Allow users to continue SmartSpecPro conversations from Telegram.
2. Keep web chat and Telegram synchronized as one logical conversation.
3. Preserve all existing billing, memory, audit, approvals, safety, and tool execution policies.
4. Support both single-agent (chat) and multi-agent (agency-swarm) flows without channel-specific drift.
5. Provide a channel abstraction reusable for future channels (LINE, WhatsApp, Slack).

### 2.2 Non-Goals

1. Telegram will not become a standalone product surface with its own orchestration.
2. Telegram will not call LLM providers directly.
3. Telegram will not own memory separate from SmartSpecPro.
4. Telegram will not bypass SmartSpecPro permission or billing.
5. Group chats, supergroups, and Telegram channels are out of scope for Phase 1.

## 3. Codebase Alignment Analysis

### 3.1 Existing telegramService Capabilities

**File**: `apps/web/server/services/telegramService.ts`

Current capabilities:
- Direct HTTP calls to Telegram Bot API (`/sendMessage`)
- In-process rate limiting: 25 msg/sec (token bucket)
- Retry with exponential backoff (3 attempts max)
- HTML message formatting with priority emoji, action button, timestamp
- Settings cached from `systemSettings` table (manual invalidation)

Current gaps:
- No webhook handler (users cannot complete linking flow)
- No inbound message processing
- No delivery status tracking table
- Rate limiting is in-process only (unsafe for multi-instance)
- Fire-and-forget delivery (no retry queue)

### 3.2 Existing Conversation Architecture

**Regular Chat** (`apps/web/server/routers/chat.ts`, ~1,800 lines):
```
User → tRPC chat.sendMessage → skill detection → buildChatContext →
LLM provider → save response → deduct credits → return
```
- Tables: `conversations`, `messages`, `conversationSummaries`, `entityMemories`
- Per-message credit deduction via `creditService`
- No `source_channel` field on messages

**Agency Swarm** (`apps/web/server/routers/agency.ts`):
```
User → tRPC agency.sendMessage → agencyBridge.executeRun →
Python /api/v1/agencies/{id}/run → agency-swarm → LLM gateway →
save result → return
```
- Tables: `agencyConversations`, `agency_messages` (SQLAlchemy), `agency_runs`
- Credit: pre-check → per-call gateway deduction → post-run multiplier markup
- Streaming via SSE at Python `/api/v1/agencies/{id}/stream`

### 3.3 Existing LLM Gateway

**File**: `apps/web/server/services/llmRouter.ts`

- Multi-provider routing with health circuit breaker
- Dynamic cost-based or priority-based candidate sorting
- Fallback chain (up to 3+ providers)
- Full audit trail: JSONL + `provider_usage_log` table
- Credit reservation via `creditService.ts` (atomic SQL deduction)

**Constraint**: All Telegram-originated LLM calls MUST flow through this same gateway. The `source_channel` metadata must be carried for traceability.

### 3.4 Existing OpenSandbox

**File**: `apps/web/server/services/sandbox/dispatchService.ts`

- Feature-flagged (`OPENSANDBOX_ENABLED`)
- Dispatches risky tools to Python backend
- Risk levels: low (direct), medium (whitelist), high (sandbox)
- Returns job ID for async polling

**Constraint**: Tool execution policy is channel-independent. Telegram cannot bypass sandbox requirements.

### 3.5 Database Schema Patterns

**File**: `apps/web/drizzle/schema.ts`

Existing patterns the bridge must follow:
- All tables use `varchar(36)` for IDs (nanoid)
- Multi-tenancy via `tenantId` foreign key with cascade delete
- Timestamps with timezone (`{ withTimezone: true }`)
- Encrypted fields use `*Encrypted` suffix
- Soft delete via status field or `trashedAt` timestamp
- JSON columns typed with `$type<T>()`

## 4. System Architecture

### 4.1 High-Level Topology

```
Web Chat UI                    Telegram Bot
    |                              |
    v                              v
tRPC chat.sendMessage     Express /webhooks/telegram/:botId
tRPC agency.sendMessage          |
    |                     telegramService.handleWebhook()
    |                              |
    v                              v
+------------------------------------------+
|         Channel Gateway                   |
|   normalize → ChatIngressEvent            |
|   fan-out  ← ChatEgressEvent              |
+------------------------------------------+
         |                    |
         v                    v
  Conversation Engine    Agency Engine
  (chat.ts pipeline)     (agency.ts → Python)
         |                    |
         v                    v
   LLM Gateway (llmRouter.ts)
         |
         v
   Provider APIs  /  OpenSandbox  /  Tool Broker
```

### 4.2 Design Separation

| Component | Owns | Does NOT Own |
|-----------|------|-------------|
| `telegramService` | Transport, identity binding, webhook processing, delivery | Conversations, memory, billing, routing |
| Channel Gateway | Message normalization, fan-out delivery, channel registry | Business logic, LLM calls |
| `chat.ts` pipeline | Regular conversation orchestration, skill detection, context building | Channel-specific rendering |
| `agency.ts` pipeline | Multi-agent orchestration via Python backend | Channel-specific rendering |
| `llmRouter.ts` | Provider routing, credit reservation, metering | Channel awareness |
| `creditService.ts` | Atomic credit deduction, idempotency | Channel awareness |

### 4.3 Forbidden Couplings

1. `telegramService` MUST NOT call LLM providers directly.
2. `telegramService` MUST NOT create its own conversation/message storage.
3. `telegramService` MUST NOT invoke OpenSandbox directly.
4. `telegramService` MUST NOT access `LLM_ENCRYPTION_KEY` or provider API keys.
5. Telegram command handlers MUST NOT bypass the conversation engine billing path.

## 5. User Experience

### 5.1 Journey A: Link Telegram from Web Chat

1. User opens a SmartSpecPro conversation in web chat.
2. User clicks "Connect Telegram" (uses existing `telegram.generateTelegramLink` endpoint).
3. SmartSpecPro generates a signed link token, stores verification code in Redis (5-min TTL).
4. User is redirected to `https://t.me/{botUsername}?start={code}`.
5. User taps "Start" in Telegram.
6. **NEW**: Webhook handler receives `/start {code}` message.
7. **NEW**: Handler validates code against Redis, creates `telegram_connections` record.
8. **NEW**: Handler creates `conversation_channels` record binding the conversation.
9. Telegram confirms successful connection.
10. Frontend polls `telegram.checkTelegramStatus` → linked = true.

### 5.2 Journey B: Send Message from Telegram

1. User sends a text message to the bot in Telegram.
2. Webhook handler receives the update, deduplicates via `update_id`.
3. Handler resolves the `telegram_connections` record → user, tenant, conversation.
4. Handler normalizes message into `ChatIngressEvent`.
5. Channel gateway routes to appropriate pipeline:
   - If conversation is a `conversations` row → `chat.ts` pipeline
   - If conversation is an `agencyConversations` row → `agency.ts` pipeline
6. Pipeline processes message (skill detection, LLM, tools, etc.).
7. Response is saved as canonical message.
8. `ChatEgressEvent` is emitted.
9. Delivery worker sends response to Telegram AND updates web chat (SSE/polling).

### 5.3 Journey C: Receive Reply in Telegram from Web-Initiated Chat

1. User sends a message from web chat.
2. Pipeline processes and generates assistant response.
3. Response is saved as canonical message.
4. Channel gateway checks `conversation_channels` for active Telegram binding.
5. If binding exists with `sync_mode = two_way`: deliver to Telegram.
6. Telegram receives the assistant message.

### 5.4 Journey D: Unlink Telegram

1. User sends `/unlink` in Telegram or clicks "Unlink" in web settings.
2. `telegram_connections.status` set to `revoked`.
3. All `conversation_channels` for this connection set to `state = revoked`.
4. Telegram can no longer send messages into SmartSpecPro.
5. Existing conversation history remains for audit.

### 5.5 UX Principles

1. Same conversation, continuous across channels.
2. Telegram rendering degrades gracefully (no format forking).
3. Large or complex outputs link back to web UI.
4. All differences are representational, never semantic.

## 6. Data Model

### 6.1 New Tables

All new tables follow existing Drizzle conventions: `varchar(36)` IDs, `tenantId` FK, timezone timestamps, cascade deletes.

#### `telegram_connections`

Replaces the current user-level fields with a proper connection model supporting multiple connections and tenant scoping.

```typescript
export const telegramConnections = pgTable("telegram_connections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  telegramUserId: varchar("telegramUserId", { length: 64 }).notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }).notNull(),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  botId: varchar("botId", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  // status: active | revoked | pending | blocked
  linkedAt: timestamp("linkedAt", { withTimezone: true }).defaultNow().notNull(),
  linkedBy: varchar("linkedBy", { length: 20 }).default("deep_link").notNull(),
  // linkedBy: deep_link | admin | api
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  revokedBy: varchar("revokedBy", { length: 36 }),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("tg_conn_bot_user_idx").on(t.botId, t.telegramUserId),
  index("tg_conn_tenant_user_idx").on(t.tenantId, t.userId),
  index("tg_conn_chat_idx").on(t.telegramChatId),
]);
```

#### `conversation_channels`

Maps conversations to channels. Supports both `conversations` and `agencyConversations`.

```typescript
export const conversationChannels = pgTable("conversation_channels", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: varchar("conversationId", { length: 36 }).notNull(),
  conversationType: varchar("conversationType", { length: 20 }).notNull(),
  // conversationType: chat | agency
  channelType: varchar("channelType", { length: 20 }).notNull(),
  // channelType: web | telegram
  channelRefId: varchar("channelRefId", { length: 64 }),
  // For telegram: telegram_connections.id. For web: null.
  connectionId: varchar("connectionId", { length: 36 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  syncMode: varchar("syncMode", { length: 20 }).default("two_way").notNull(),
  // syncMode: two_way | notify_only | paused
  state: varchar("state", { length: 20 }).default("active").notNull(),
  // state: active | paused | revoked
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("conv_channel_unique_idx")
    .on(t.conversationId, t.channelType, t.channelRefId),
  index("conv_channel_tenant_idx").on(t.tenantId, t.channelType),
]);
```

#### `channel_messages`

Tracks per-channel message delivery status.

```typescript
export const channelMessages = pgTable("channel_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: varchar("conversationId", { length: 36 }).notNull(),
  messageId: varchar("messageId", { length: 36 }).notNull(),
  // messageId: references messages.id OR agency_messages.id
  channelType: varchar("channelType", { length: 20 }).notNull(),
  externalMessageId: varchar("externalMessageId", { length: 64 }),
  externalChatId: varchar("externalChatId", { length: 64 }),
  deliveryStatus: varchar("deliveryStatus", { length: 20 })
    .default("pending").notNull(),
  // deliveryStatus: pending | sent | delivered | failed | suppressed
  attemptCount: integer("attemptCount").default(0).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt", { withTimezone: true }),
  deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
  failureCode: varchar("failureCode", { length: 50 }),
  failureReason: text("failureReason"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("ch_msg_external_idx")
    .on(t.channelType, t.externalChatId, t.externalMessageId),
  index("ch_msg_conv_idx").on(t.conversationId, t.messageId),
]);
```

#### `telegram_link_tokens`

Stores one-time link tokens (replaces Redis-only approach for auditability while keeping Redis for fast lookup).

```typescript
export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetConversationId: varchar("targetConversationId", { length: 36 }),
  targetConversationType: varchar("targetConversationType", { length: 20 }),
  // target conversation type: chat | agency | null (tenant default)
  purpose: varchar("purpose", { length: 20 }).default("connect").notNull(),
  // purpose: connect | resume | approval_link
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("createdBy"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("tg_token_hash_idx").on(t.tokenHash),
  index("tg_token_tenant_user_idx").on(t.tenantId, t.userId, t.purpose),
]);
```

#### `telegram_updates`

Dedupe table for inbound Telegram webhook updates.

```typescript
export const telegramUpdates = pgTable("telegram_updates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  botId: varchar("botId", { length: 64 }).notNull(),
  updateId: bigint("updateId", { mode: "number" }).notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true }),
  processingStatus: varchar("processingStatus", { length: 20 })
    .default("accepted").notNull(),
  // processingStatus: accepted | ignored | failed | duplicate
  errorCode: varchar("errorCode", { length: 50 }),
  errorReason: text("errorReason"),
}, (t) => [
  uniqueIndex("tg_update_dedupe_idx").on(t.botId, t.updateId),
]);
```

### 6.2 Existing Table Extensions

#### `messages` table — add channel metadata

```typescript
// Add columns to existing messages table:
sourceChannel: varchar("sourceChannel", { length: 20 }),
// sourceChannel: web | telegram | system | null (legacy)
sourceConnectionId: varchar("sourceConnectionId", { length: 36 }),
externalSourceId: varchar("externalSourceId", { length: 64 }),
replyToExternalId: varchar("replyToExternalId", { length: 64 }),
```

#### `agency_messages` table (SQLAlchemy) — add channel metadata

```python
# Add columns to existing agency_messages model:
source_channel = Column(String(20), nullable=True)
source_connection_id = Column(String(36), nullable=True)
external_source_id = Column(String(64), nullable=True)
```

#### `conversations` table — add channel policy

```typescript
// Add column:
defaultChannelPolicy: varchar("defaultChannelPolicy", { length: 20 })
  .default("allow_attach"),
// defaultChannelPolicy: allow_attach | notify_only | disabled
```

### 6.3 Migration Strategy

Migration risk: **MEDIUM** (new tables + nullable column additions to existing tables).

1. New tables: pure additions, no risk.
2. `messages` extensions: nullable columns, no data loss.
3. `agency_messages` extension: nullable columns, separate Alembic migration.
4. `conversations` extension: nullable column with default, no data loss.
5. Existing `users.telegramChatId` etc. remain for backward compatibility during migration period.

## 7. Internal Message Contract

### 7.1 ChatIngressEvent

All channel sources normalize into this contract before entering the conversation engine.

```typescript
interface ChatIngressEvent {
  eventId: string;               // Generated by SmartSpecPro
  eventType: "user_message" | "command" | "callback";
  tenantId: string;
  userId: number;
  conversationId: string;
  conversationType: "chat" | "agency";
  channel: {
    type: "web" | "telegram";
    connectionId?: string;       // telegram_connections.id
    externalChatId?: string;     // Telegram chat_id
    externalMessageId?: string;  // Telegram message_id
    replyToExternalMessageId?: string;
  };
  message: {
    text: string;
    attachments: Array<{
      type: "image" | "file" | "audio" | "video";
      url?: string;
      telegramFileId?: string;
      mimeType?: string;
      fileName?: string;
    }>;
    clientTimestamp?: string;     // ISO 8601
  };
  idempotencyKey: string;        // e.g. "telegram:bot_1:update_99001"
}
```

### 7.2 ChatEgressEvent

Used by the conversation engine to publish replies to all attached channels.

```typescript
interface ChatEgressEvent {
  eventId: string;
  conversationId: string;
  conversationType: "chat" | "agency";
  messageId: string;             // Canonical message ID
  tenantId: string;
  targets: Array<{
    channelType: "web" | "telegram";
    channelRefId: string;        // telegram_connections.id or session ID
    syncMode: "two_way" | "notify_only";
  }>;
  rendering: {
    plainText: string;
    markdownSafe: boolean;
    html?: string;               // For Telegram HTML mode
    attachments: Array<{
      type: string;
      url: string;
      caption?: string;
    }>;
    truncatedWebUrl?: string;    // Link to full content on web
  };
  deliveryPolicy: {
    bestEffort: boolean;
    retryable: boolean;
    maxRetries: number;          // Default: 3
  };
}
```

## 8. API Contracts

### 8.1 Webhook Endpoint (NEW — Express route)

**`POST /webhooks/telegram/:botId`**

This is the critical missing piece. Must be an Express route (not tRPC) because Telegram sends raw HTTP POST.

```typescript
// File: apps/web/server/routes/telegramWebhook.ts
// Register in: apps/web/server/_core/index.ts

router.post("/webhooks/telegram/:botId", async (req, res) => {
  // 1. Validate X-Telegram-Bot-Api-Secret-Token header
  // 2. Parse Telegram Update object
  // 3. Check update_id dedupe in telegram_updates table
  // 4. Quick 200 OK response (don't block on processing)
  // 5. Enqueue async processing via BullMQ or in-process
  res.sendStatus(200);
});
```

Responsibilities:
1. Validate `X-Telegram-Bot-Api-Secret-Token` against `systemSettings.webhook_secret`.
2. Persist dedupe marker in `telegram_updates`.
3. Acknowledge receipt with `200 OK` immediately.
4. Enqueue update for async processing.

### 8.2 Existing Endpoints to Extend

#### `telegram.generateTelegramLink` (extend)

Current: Generates verification code, stores in Redis with 5-min TTL.
Extension: Also create a `telegram_link_tokens` record for audit trail.

```typescript
// apps/web/server/routers/telegram.ts — generateTelegramLink mutation
// ADD: Insert into telegram_link_tokens with tokenHash = SHA-256(code)
// KEEP: Redis storage for fast lookup during webhook validation
```

#### `telegram.checkTelegramStatus` (extend)

Current: Checks `users.telegramVerified`.
Extension: Also check `telegram_connections` for active connection.

#### `telegram.unlinkTelegram` (extend)

Current: Clears user fields + preferences.
Extension: Also revoke `telegram_connections` and `conversation_channels`.

### 8.3 New tRPC Endpoints

Add to existing `telegramRouter` in `apps/web/server/routers/telegram.ts`:

```typescript
// Get Telegram connection status for a specific conversation
getConversationChannelStatus: protectedProcedure
  .input(z.object({ conversationId: z.string() }))
  .query(async ({ ctx, input }) => { ... }),

// Bind Telegram to a specific conversation
bindConversation: protectedProcedure
  .input(z.object({
    conversationId: z.string(),
    conversationType: z.enum(["chat", "agency"]),
    syncMode: z.enum(["two_way", "notify_only"]).default("two_way"),
  }))
  .mutation(async ({ ctx, input }) => { ... }),

// Unbind Telegram from a specific conversation
unbindConversation: protectedProcedure
  .input(z.object({ conversationId: z.string() }))
  .mutation(async ({ ctx, input }) => { ... }),

// Admin: list all Telegram connections for tenant
adminListConnections: adminProcedure
  .input(z.object({
    tenantId: z.string().optional(),
    status: z.enum(["active", "revoked", "pending", "blocked"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  }))
  .query(async ({ ctx, input }) => { ... }),

// Admin: force revoke a connection
adminRevokeConnection: adminProcedure
  .input(z.object({ connectionId: z.string() }))
  .mutation(async ({ ctx, input }) => { ... }),
```

## 9. Telegram Command Handling

Commands are processed by the webhook handler before normalization.

### 9.1 `/start [token]`

Modes:
1. `/start <token>`: Validate token → create `telegram_connections` → create `conversation_channels` → confirm.
2. `/start` (no token): Show help, account status, and available conversations.

### 9.2 `/new`

Create a new conversation if policy permits. Must apply the same defaults as web chat (model, system prompt, tenant settings).

### 9.3 `/resume`

Resume the most recent active conversation, or show a selection list if multiple.

### 9.4 `/unlink`

Revoke the active Telegram connection. Requires confirmation (Telegram inline keyboard).

### 9.5 `/help`

Return supported commands and current link status.

### 9.6 `/status`

Show current conversation info: name, message count, credits used.

## 10. Message Processing Lifecycle

### 10.1 Inbound (Telegram → SmartSpecPro)

```
1. Telegram sends webhook POST to /webhooks/telegram/:botId
2. Validate X-Telegram-Bot-Api-Secret-Token header
3. Check update_id dedupe in telegram_updates
4. Return 200 OK immediately
5. Async processing begins:
   a. Parse update → extract message text, chat_id, user info
   b. Check for command prefix (/, @bot) → route to command handler
   c. Resolve telegram_connections → get userId, tenantId
   d. Resolve conversation_channels → get conversationId, conversationType
   e. Normalize into ChatIngressEvent
   f. Route based on conversationType:
      - "chat": Insert user message into `messages` table,
                call chat pipeline (skill detect → LLM → response)
      - "agency": Call agencyBridge.executeRun() via agency pipeline
   g. Save assistant response as canonical message
   h. Emit ChatEgressEvent to all active channels
   i. Delivery worker sends to Telegram (edit typing → send final)
   j. Delivery worker updates web chat (SSE or TanStack Query invalidation)
   k. Log audit event
```

### 10.2 Outbound (SmartSpecPro → Telegram)

```
1. Conversation engine saves canonical message
2. Query conversation_channels for active bindings with sync_mode != paused
3. For each Telegram channel:
   a. Render message for Telegram (HTML subset, truncation, link-back)
   b. Create channel_messages record (status: pending)
   c. Call telegramService.sendTelegramMessage()
   d. On success: update status to sent, store external_message_id
   e. On failure: increment attempt_count, schedule retry
4. For web channel:
   a. Existing flow (TanStack Query invalidation or SSE)
```

### 10.3 Integration with Existing Chat Pipeline

The chat bridge integrates at the **message insertion** and **response delivery** points, not inside the LLM pipeline itself.

```typescript
// Existing flow (simplified):
// chat.ts sendMessage mutation
async function handleSendMessage(ctx, input) {
  // 1. Save user message
  const userMsg = await saveMessage({
    ...input,
    sourceChannel: input.channel?.type ?? "web",  // NEW
    sourceConnectionId: input.channel?.connectionId, // NEW
  });

  // 2. Process (skill detect, LLM call, etc.) — UNCHANGED
  const response = await processMessage(userMsg, ctx);

  // 3. Save assistant response — UNCHANGED
  const assistantMsg = await saveMessage(response);

  // 4. Fan-out delivery — NEW
  await channelGateway.emitEgressEvent({
    conversationId: input.conversationId,
    conversationType: "chat",
    messageId: assistantMsg.id,
    tenantId: ctx.tenantId,
    rendering: formatForChannels(assistantMsg),
  });

  return assistantMsg;
}
```

### 10.4 Integration with Agency-Swarm Pipeline

The agency bridge already returns responses to the Node.js router. The channel fan-out hooks in after the bridge returns.

```typescript
// agency.ts sendMessage mutation (simplified):
async function handleAgencySendMessage(ctx, input) {
  // 1. Validate conversation — UNCHANGED
  // 2. Call agencyBridge.executeRun() — UNCHANGED
  const result = await agencyBridge.executeRun(params);

  // 3. Fan-out delivery — NEW
  await channelGateway.emitEgressEvent({
    conversationId: input.conversationId,
    conversationType: "agency",
    messageId: result.messageId,
    tenantId: ctx.tenantId,
    rendering: formatForChannels(result),
  });

  return result;
}
```

## 11. Channel Gateway Service

New service: `apps/web/server/services/channelGateway.ts`

```typescript
// Responsibilities:
// 1. Normalize inbound events (ChatIngressEvent)
// 2. Fan-out outbound events (ChatEgressEvent)
// 3. Manage channel_messages delivery records
// 4. Retry failed deliveries

export class ChannelGateway {
  // Inbound: route normalized event to correct pipeline
  async ingest(event: ChatIngressEvent): Promise<void>;

  // Outbound: deliver to all active channels
  async emitEgressEvent(event: ChatEgressEvent): Promise<void>;

  // Delivery: send to specific Telegram target
  async deliverToTelegram(
    target: EgressTarget,
    rendering: EgressRendering,
    messageId: string,
  ): Promise<void>;

  // Retry: process failed deliveries
  async retryFailedDeliveries(): Promise<void>;
}
```

This service is channel-agnostic and designed for future extension (LINE, WhatsApp, etc.).

## 12. Security Model

### 12.1 Identity and Binding

1. Telegram identity alone is NOT sufficient for SmartSpecPro account access.
2. Linking requires an authenticated SmartSpecPro session to generate a token.
3. Link tokens must be:
   - Opaque (no user info in the token itself)
   - Signed (SHA-256 hash stored, not raw token)
   - Short-lived (5 minutes, matching existing Redis TTL)
   - Single-use (mark `usedAt` on consumption, delete Redis key)
   - Revocable (mark `revokedAt`)
4. Binding is always tenant-scoped.
5. A Telegram account can only have one active connection per bot.

### 12.2 Transport Security

1. Webhook endpoint validates `X-Telegram-Bot-Api-Secret-Token` header.
2. The webhook secret is stored encrypted in `systemSettings` (existing pattern).
3. Internal service calls use the existing auth middleware.

### 12.3 Credential Isolation

1. `telegramService` stores ONLY Telegram bot credentials (in `systemSettings`, encrypted).
2. `telegramService` MUST NOT store LLM provider API keys.
3. `telegramService` MUST NOT have direct write access to billing ledgers.
4. Bot token decryption uses existing `getTelegramSettings()` with `decrypt()` from `crypto.ts`.

### 12.4 Abuse Prevention

1. Rate limit inbound Telegram messages per user: 30/min (matches existing agency rate limit).
2. Rate limit per Telegram chat: 60/min.
3. Rate limit per tenant: configurable via `systemSettings`.
4. Deduplicate updates via `telegram_updates` table.
5. Block repeated invalid token attempts (log + rate limit).
6. Support admin force-unlink and user blocking.

### 12.5 Existing Security Integration

The following existing security measures apply automatically:
- JWT-based authentication for all tRPC calls
- Tenant isolation via `tenantId` in all queries
- Credit checks before LLM calls
- Encrypted storage for sensitive settings
- Audit logging via `apiAuditEvents` table

## 13. Billing and Usage Enforcement

### 13.1 Core Rule

All LLM usage, regardless of originating channel, flows through the existing SmartSpecPro billing path.

### 13.2 Chat Pipeline Billing (unchanged)

```
Message → creditService.hasEnoughCredits() → LLM call →
creditService.deductCreditsForModel() → provider_usage_log
```

The only change: `source_channel` metadata is added to `provider_usage_log` entries for traceability.

### 13.3 Agency Pipeline Billing (unchanged)

```
Message → agencyCreditManager.pre_check() → agency-swarm execution →
per-call gateway deduction → agencyCreditManager.apply_multiplier_markup()
```

The only change: `source_channel` metadata carried in request headers.

### 13.4 Prohibited

1. No direct provider API calls from `telegramService`.
2. No separate Telegram billing ledger.
3. No channel-specific credit multipliers (credit cost is conversation-based, not channel-based).

## 14. Agency-Swarm Integration Rules

### 14.1 Selection

The conversation engine decides whether a message uses single-agent or multi-agent runtime. Telegram never selects this independently.

For regular chat: always single-agent via `chat.ts` pipeline.
For agency conversations: always multi-agent via `agency.ts` → Python backend.

### 14.2 Context Invariance

agency-swarm receives identical context regardless of source channel:
- Tenant context, user identity, conversation history
- Memory scope (entityMemories), tool policy, spend constraints
- Same `AgentConfig`, same `RunContext`

### 14.3 Human-in-the-Loop via Telegram

If an agency-swarm run requires user approval:
1. The question is emitted as a `ChatEgressEvent`.
2. Delivered to all active channels (web + Telegram).
3. User can respond from either channel.
4. Response enters the same conversation, regardless of channel.
5. Agency-swarm resumes with no channel-specific branching.

### 14.4 Model Client Enforcement

agency-swarm model clients point to `{NODEJS_INTERNAL_URL}/api/llm/v2` with user JWT.
This is unchanged. Telegram messages simply enter the same flow.

## 15. Tool Execution and OpenSandbox

### 15.1 Tool Broker

All agent tools go through the existing tool broker:
- Regular chat: tools via skill system (`skillExecutor.ts`)
- Agency: tools via `agency_tools.py` with risk-based routing

### 15.2 OpenSandbox

Risky tools execute in OpenSandbox regardless of source channel:
- Code execution, browser automation, file transformation
- Feature-flagged: `OPENSANDBOX_ENABLED`, `SANDBOX_REQUIRE_FOR_SKILLS`
- Dispatch via `dispatchService.ts` → Python backend

### 15.3 Result Delivery

Tool outputs are normalized into conversation messages before channel delivery.
Telegram receives:
- Concise text summaries (max 4096 chars per Telegram message limit)
- File attachments when supported
- Links back to web UI for large or complex artifacts

## 16. Rendering Rules for Telegram

### 16.1 Formatting

1. Use Telegram HTML mode (subset: `<b>`, `<i>`, `<code>`, `<pre>`, `<a>`).
2. Strip unsupported markdown (tables, footnotes, etc.).
3. Messages > 4096 chars: split at paragraph boundaries or truncate with web link.
4. Code blocks: wrap in `<pre>` tags, max 2000 chars per block.

### 16.2 Streaming Approximation

Telegram does not support true token streaming. Use:
1. Send typing indicator (`sendChatAction: typing`).
2. Send final assembled response.
3. For long responses (agency-swarm): staged updates via message editing.

### 16.3 Attachments

Phase 1: Text only.
Phase 2+: Images via `sendPhoto`, files via `sendDocument`.

## 17. Reliability and Idempotency

### 17.1 Webhook Idempotency

1. Dedupe via `(bot_id, update_id)` unique constraint in `telegram_updates`.
2. Duplicate updates return `200 OK` (prevent Telegram retry storms).
3. Duplicates do NOT create canonical messages.

### 17.2 Delivery Retry

1. Failed Telegram sends retry with exponential backoff: 1s, 2s, 4s (matching existing `telegramService` pattern).
2. Max 3 attempts (matching existing retry logic).
3. After max retries: mark `channel_messages.deliveryStatus = failed`.
4. Canonical message is never rolled back due to delivery failure.

### 17.3 Ordering

1. Canonical ordering uses server-generated timestamps + auto-increment IDs.
2. Cross-channel messages maintain deterministic timeline in web chat.
3. Telegram messages are ordered by SmartSpecPro processing time, not Telegram send time.

## 18. Observability and Audit

### 18.1 Required Metrics

Extend existing monitoring (built on structured logging + `apiAuditEvents`):

1. `telegram.webhook.accepted` — count of accepted webhook updates
2. `telegram.webhook.duplicate` — count of deduplicated updates
3. `telegram.message.ingested` — count of messages entering pipeline
4. `telegram.message.delivered` — count of outbound deliveries
5. `telegram.delivery.failed` — count of failed deliveries
6. `telegram.connection.active` — gauge of active connections
7. `telegram.connection.linked` — count of new links
8. `telegram.connection.revoked` — count of unlinks
9. `telegram.latency.inbound_ms` — webhook → canonical message save
10. `telegram.latency.delivery_ms` — canonical message → Telegram delivery

### 18.2 Audit Events

Add to existing `apiAuditEvents` table:

```typescript
type TelegramAuditEventType =
  | "telegram_link_created"
  | "telegram_link_completed"
  | "telegram_link_revoked"
  | "telegram_message_ingested"
  | "telegram_message_delivered"
  | "telegram_delivery_failed"
  | "telegram_command_executed"
  | "telegram_admin_revoked";
```

## 19. Admin Controls

### 19.1 Tenant Admin

Extend existing admin settings (already partially in `telegram.ts` router):

1. Enable/disable Telegram for the tenant (existing: `systemSettings.enabled`).
2. View active connections (new: `adminListConnections`).
3. Force unlink a user (new: `adminRevokeConnection`).
4. Set default channel policy: `two_way` | `notify_only` | `disabled`.
5. Configure per-tenant rate limits.

### 19.2 Platform Admin

Extend existing platform admin:

1. Rotate bot credentials (existing: `telegram.updateTelegramSettings`).
2. Register/update webhook (existing: `telegram.setWebhook`).
3. View operational health metrics.
4. Disable bot globally.

## 20. Rollout Plan

### Phase 1A: Foundation (Complete Webhook Handler)

**Prerequisite**: This unblocks the entire feature and fixes the existing broken linking flow.

Deliver:
1. Implement `/webhooks/telegram/:botId` Express route.
2. Validate `X-Telegram-Bot-Api-Secret-Token` header.
3. Create `telegram_updates` table for dedupe.
4. Handle `/start <code>` command → complete user verification.
5. Set `users.telegramVerified = true` on successful linking.
6. Register webhook URL with Telegram via existing `setWebhook` admin endpoint.

Success criteria:
1. Users can complete Telegram linking flow end-to-end.
2. Webhook processes `/start` commands and ignores other messages gracefully.
3. Duplicate updates are safely deduplicated.

Estimated effort: ~200 lines of new code.

### Phase 1B: Channel Abstraction and Bindings

Deliver:
1. Create `telegram_connections`, `conversation_channels` tables.
2. Migrate existing user-level Telegram fields to connection model.
3. Create `telegram_link_tokens` table (augment Redis with DB audit trail).
4. Implement `ChatIngressEvent` / `ChatEgressEvent` contracts.
5. Implement `ChannelGateway` service.
6. Extend `telegram.generateTelegramLink` to support conversation binding.

Success criteria:
1. A conversation can have multiple channel bindings.
2. Channel gateway can normalize and route events.

Estimated effort: ~600 lines of new code + migration.

### Phase 1C: Bidirectional Chat

Deliver:
1. Inbound: Telegram text messages → `chat.ts` pipeline (regular conversations).
2. Inbound: Telegram text messages → `agency.ts` pipeline (agency conversations).
3. Outbound: Assistant responses → Telegram delivery.
4. Two-way sync between web and Telegram.
5. Delivery tracking in `channel_messages`.
6. Basic retry for failed deliveries.

Success criteria:
1. A user can continue a web conversation from Telegram.
2. Messages from both channels appear in the same timeline.
3. All LLM calls are visible in gateway logs and billing records.
4. Duplicate Telegram updates do not create duplicate messages.
5. Unlinking immediately prevents further Telegram ingress.
6. Delivery failures do not corrupt conversation history.

Estimated effort: ~800 lines of new code.

### Phase 2: Production Hardening

Deliver:
1. Redis-based rate limiting (replace in-process token bucket).
2. Admin controls: tenant enablement, connection management, force unlink.
3. Improved delivery retry with BullMQ queue.
4. Role-based policy checks.
5. Human-in-the-loop approval prompts via Telegram.
6. Observability dashboards and alerts.
7. Per-user and per-tenant rate limits.

### Phase 3: Rich Interaction

Deliver:
1. Attachment support (inbound images/files → S3 storage, outbound files).
2. Inline approval buttons (Telegram inline keyboard).
3. Compact rich cards for tool results.
4. Staged responses via message editing (for long agency-swarm runs).
5. Voice note transcription (optional).

## 21. Acceptance Criteria

The implementation is accepted only if ALL of the following are true:

1. A user can link Telegram from web chat without manual credential exchange.
2. Messages from Telegram and web appear in the same conversation timeline.
3. The conversation engine (chat or agency) remains the only orchestration entrypoint.
4. All LLM calls triggered via Telegram are visible in `provider_usage_log` and billing records.
5. `telegramService` contains no LLM provider API keys.
6. A multi-agent (agency-swarm) flow triggered from Telegram behaves identically to web.
7. A risky tool call triggered from Telegram runs in OpenSandbox.
8. Duplicate Telegram updates do not create duplicate canonical messages.
9. Unlinking Telegram immediately prevents further channel ingress.
10. Delivery failures do not corrupt canonical conversation history.
11. Both `conversations` (chat) and `agencyConversations` (agency) work with Telegram binding.
12. Existing notification functionality (`notificationService`) continues to work unchanged.

## 22. Implementation Checklist

### Backend — Phase 1A (Foundation)

- [ ] Create `telegram_updates` Drizzle table + migration
- [ ] Implement `POST /webhooks/telegram/:botId` Express route
- [ ] Validate webhook secret header
- [ ] Handle `/start <code>` command (match Redis code → verify user)
- [ ] Register route in `apps/web/server/_core/index.ts`
- [ ] Write tests for webhook handler

### Backend — Phase 1B (Channel Abstraction)

- [ ] Create `telegram_connections` Drizzle table + migration
- [ ] Create `conversation_channels` Drizzle table + migration
- [ ] Create `channel_messages` Drizzle table + migration
- [ ] Create `telegram_link_tokens` Drizzle table + migration
- [ ] Implement `ChannelGateway` service
- [ ] Implement `ChatIngressEvent` / `ChatEgressEvent` types
- [ ] Extend `telegram.generateTelegramLink` for conversation binding
- [ ] Add `sourceChannel` column to `messages` table
- [ ] Add `source_channel` column to `agency_messages` (Alembic migration)
- [ ] Migrate user-level Telegram fields to connection model
- [ ] Write tests for channel gateway

### Backend — Phase 1C (Bidirectional Chat)

- [ ] Implement inbound message processing (Telegram → chat pipeline)
- [ ] Implement inbound message processing (Telegram → agency pipeline)
- [ ] Implement outbound delivery (assistant response → Telegram)
- [ ] Implement delivery tracking in `channel_messages`
- [ ] Implement basic retry logic for failed deliveries
- [ ] Add `source_channel` to `provider_usage_log` entries
- [ ] Write integration tests for full round-trip

### Web UI

- [ ] Add "Connect Telegram" button to conversation header
- [ ] Show Telegram connection status per conversation
- [ ] Add "Unlink" option in conversation settings
- [ ] Show channel indicator on messages (web vs telegram)
- [ ] Show delivery errors for admin users

### Conversation Engine

- [ ] Add `sourceChannel` to message save in `chat.ts`
- [ ] Add channel fan-out after response in `chat.ts`
- [ ] Add channel fan-out after response in `agency.ts`
- [ ] Ensure billing path includes `source_channel` metadata

### Admin

- [ ] Add `adminListConnections` endpoint
- [ ] Add `adminRevokeConnection` endpoint
- [ ] Add connection management UI to admin panel
- [ ] Add Telegram metrics to observability dashboard

## 23. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Telegram becomes shadow chat system | HIGH | Enforce channel gateway abstraction; all messages go through conversation engine |
| Billing leakage via Telegram | HIGH | No provider credentials in telegramService; all LLM calls through gateway |
| Duplicate inbound events | MEDIUM | `telegram_updates` dedupe table + idempotency keys |
| Policy drift between web and Telegram | MEDIUM | Centralize policy in conversation engine; channel adapter is thin |
| Two conversation systems complicate channel binding | MEDIUM | `conversationType` field in `conversation_channels`; gateway routes by type |
| Breaking existing notification functionality | MEDIUM | Extend, don't replace; backward-compatible column additions only |
| Rate limiting bypass via Telegram | MEDIUM | Redis-based rate limiting (Phase 2); in-process for Phase 1 |
| Poor UX for complex outputs on mobile | LOW | Truncate + web link fallback |
| Webhook processing delays under load | LOW | Async processing after immediate 200 OK |

## 24. Future Compatibility

The channel gateway abstraction is designed for reuse with future channels:

1. LINE: Same `conversation_channels` model, different adapter.
2. WhatsApp: Same `ChatIngressEvent`/`ChatEgressEvent` contract.
3. Slack DM: Same delivery tracking in `channel_messages`.
4. Email reply: Same normalization pattern.

Transport-specific code stays inside channel adapters. The canonical message contract, conversation engine, billing, and tool execution remain centralized.

## 25. Appendix: Existing Code References

| Component | File | Lines |
|-----------|------|-------|
| Telegram send engine | `apps/web/server/services/telegramService.ts` | 455 |
| Telegram admin router | `apps/web/server/routers/telegram.ts` | 569 |
| Notification service | `apps/web/server/services/notificationService.ts` | 111 |
| Chat router | `apps/web/server/routers/chat.ts` | ~1,800 |
| Agency router | `apps/web/server/routers/agency.ts` | ~500 |
| Agency bridge | `apps/web/server/services/agencyBridge.ts` | ~200 |
| LLM router | `apps/web/server/services/llmRouter.ts` | ~600 |
| Credit service | `apps/web/server/services/creditService.ts` | ~400 |
| Sandbox dispatch | `apps/web/server/services/sandbox/dispatchService.ts` | ~300 |
| Skill executor | `apps/web/server/services/skillExecutor.ts` | ~500 |
| Drizzle schema | `apps/web/drizzle/schema.ts` | ~4,000 |
| Server init | `apps/web/server/_core/index.ts` | ~800 |
| Python agency adapter | `python-backend/app/services/agency_swarm_adapter.py` | ~300 |
| Python agency service | `python-backend/app/services/agency_service.py` | ~400 |
| Python agency router | `python-backend/app/api/agencies.py` | ~200 |
| Telegram tests | `apps/web/server/services/telegramService.test.ts` | 509 |
| Telegram router tests | `apps/web/server/routers/telegram.test.ts` | 415 |
