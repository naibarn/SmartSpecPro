# 028-Chat-Bridge: Implementation Plan

## 1. Overview

### What We're Building

A Telegram chat bridge for SmartSpecPro that upgrades the existing notification-only Telegram integration into a full bidirectional chat channel. Users can link their Telegram account via a deep link, then send and receive messages from Telegram that synchronize with the same conversation visible in the web UI.

### Why This Approach

SmartSpecPro has two parallel conversation systems:

1. **Regular Chat** — Single-agent conversations via `chat.ts` router, stored in `conversations` + `messages` tables.
2. **Agency Swarm** — Multi-agent orchestration via `agency.ts` router, stored in `agencyConversations` + `agency_messages` tables.

The Telegram bridge works as a **channel adapter** that normalizes inbound Telegram messages into either pipeline and delivers outbound responses back to Telegram. It does not own conversations, memory, billing, tool execution, or orchestration.

### Key Constraints

- Telegram is a transport layer only — no LLM provider access, no billing logic, no conversation storage
- All LLM calls flow through the existing LLM Gateway (`llmRouter.ts`)
- Explicit conversation selection required (no auto-routing)
- BullMQ delivery queue from Phase 1 for reliability
- Thai + English bot messages
- Target scale: <100 users, <1K messages/day

### Existing Code Being Extended

| File | Current Purpose | Extension |
|------|----------------|-----------|
| `apps/web/server/services/telegramService.ts` (455 lines) | Outbound notification sending, rate limiting | Add webhook processing, message formatting for chat |
| `apps/web/server/routers/telegram.ts` (569 lines) | Admin config, user linking, preferences | Add conversation binding, admin connection management |
| `apps/web/server/routers/chat.ts` (~1,800 lines) | Regular chat pipeline | Add `sourceChannel` metadata, channel fan-out hook |
| `apps/web/server/routers/agency.ts` (~500 lines) | Agency swarm CRUD + messaging | Add channel fan-out hook after response |
| `apps/web/server/_core/index.ts` (~800 lines) | Server initialization | Register webhook route, init delivery queue |
| `apps/web/drizzle/schema.ts` (~4,000 lines) | Database schema | 5 new tables + column extensions |

---

## 2. Architecture

### System Topology

```
Web Chat UI                    Telegram Bot
    |                              |
    v                              v
tRPC (chat/agency)         Express /webhooks/telegram/:botId
    |                              |
    |                       telegramWebhook.ts
    |                              |
    v                              v
+--------------------------------------------------+
|              Channel Gateway Service              |
|  ingest(ChatIngressEvent) → route to pipeline     |
|  emitEgress(ChatEgressEvent) → fan-out delivery   |
+--------------------------------------------------+
         |                           |
         v                           v
   chat.ts pipeline           agency.ts pipeline
   (skill → LLM → save)      (bridge → Python → save)
         |                           |
         v                           v
   LLM Gateway (llmRouter.ts)
         |
   Provider APIs / OpenSandbox / Tool Broker
```

### New Files

```
apps/web/
  server/
    routes/
      telegramWebhook.ts           # Express webhook handler
    services/
      channelGateway.ts            # Message normalization + fan-out
      deliveryQueue.ts             # BullMQ queue for Telegram delivery
      telegramI18n.ts              # Thai/English bot messages (~20 strings)
  shared/
    channelTypes.ts                # ChatIngressEvent, ChatEgressEvent interfaces
```

### Component Responsibilities

**telegramWebhook.ts** — Express route at `/webhooks/telegram/:botId`
- Validate `X-Telegram-Bot-Api-Secret-Token` header
- Redis dedupe (SET NX EX 86400 on `tg:update:{updateId}`)
- Return 200 OK immediately
- Enqueue async processing
- Parse commands (`/start`, `/help`, `/resume`, `/unlink`, `/status`)
- Normalize text messages into `ChatIngressEvent`

**channelGateway.ts** — Transport-agnostic message bus
- `ingest(event: ChatIngressEvent)` — validate connection, resolve conversation, route to chat or agency pipeline
- `emitEgress(event: ChatEgressEvent)` — query `conversation_channels`, enqueue delivery per target
- `deliverToTelegram(target, rendering, messageId)` — add job to BullMQ queue
- Future-proof: same interface for LINE, WhatsApp, Slack

**deliveryQueue.ts** — BullMQ-based reliable delivery
- Queue: `telegram-delivery`, using existing Redis realtime client
- Worker: concurrency 10, rate limit 25/sec
- Retry: exponential backoff (1s base), max 5 attempts
- Custom backoff: honor Telegram 429 `retry_after`, skip retries for permanent failures (bot blocked, chat not found)
- DLQ: `telegram-delivery-dlq` for exhausted retries
- Graceful shutdown registered in server init

**telegramI18n.ts** — Bilingual bot messages
- ~20 strings (link success, link failed, help text, unlink confirm, etc.)
- Auto-detect language from Telegram user's `language_code`
- Default: Thai for `th`, English for all others

---

## 3. Data Model

### New Tables

#### 3.1 telegram_connections

Replaces the current user-level `telegramChatId`/`telegramVerified` fields with a proper connection model.

Fields: `id` (varchar 36 PK), `tenantId` (FK tenants, cascade), `userId` (FK users, cascade), `telegramUserId` (varchar 64), `telegramChatId` (varchar 64), `telegramUsername` (varchar 64, nullable), `botId` (varchar 64), `status` (varchar 20: active/revoked/pending/blocked), `activeChannelId` (varchar 36, nullable — FK conversation_channels.id), `linkedAt` (timestamptz), `linkedBy` (varchar 20: deep_link/admin/api), `revokedAt` (timestamptz, nullable), `revokedBy` (varchar 36, nullable), `lastSeenAt` (timestamptz, nullable), `metadata` (json, nullable)

The `activeChannelId` field stores the "currently selected conversation" for this Telegram chat. Updated by `/resume` command and deep link activation. When a user sends a text message, this field determines which conversation receives it.

Indexes:
- UNIQUE on `(botId, telegramUserId)` — one connection per Telegram user per bot
- INDEX on `(tenantId, userId)` — lookup by SmartSpecPro user
- INDEX on `(telegramChatId)` — lookup for inbound messages

#### 3.2 conversation_channels

Maps conversations (both chat and agency) to channel bindings.

**ID Type Note**: The two conversation systems use different ID types — `conversations.id` is `serial` (integer) while `agencyConversations.id` is `varchar(36)` (UUID). To maintain proper FK constraints, we use split columns with a CHECK constraint.

Fields: `id` (varchar 36 PK), `tenantId` (FK tenants, cascade), `chatConversationId` (integer, nullable — FK conversations.id, cascade), `agencyConversationId` (varchar 36, nullable — FK agencyConversations.id, cascade), `conversationType` (varchar 20: chat/agency), `channelType` (varchar 20: web/telegram), `channelRefId` (varchar 64, nullable), `connectionId` (varchar 36, nullable — FK telegram_connections for telegram type), `isPrimary` (boolean, default false), `syncMode` (varchar 20: two_way/notify_only/paused), `state` (varchar 20: active/paused/revoked), `createdAt` (timestamptz), `updatedAt` (timestamptz)

CHECK constraint: exactly one of `chatConversationId` or `agencyConversationId` must be non-null (enforced by `conversationType`).

Helper getter: `getConversationId()` returns `chatConversationId ?? agencyConversationId` as a string for use in gateway logic.

Indexes:
- UNIQUE on `(chatConversationId, channelType, channelRefId)` WHERE `chatConversationId IS NOT NULL`
- UNIQUE on `(agencyConversationId, channelType, channelRefId)` WHERE `agencyConversationId IS NOT NULL`
- INDEX on `(tenantId, channelType)` — admin queries

#### 3.3 channel_messages

Per-channel delivery tracking for outbound messages.

Fields: `id` (varchar 36 PK), `tenantId` (FK tenants, cascade), `conversationChannelId` (varchar 36, FK conversation_channels.id), `messageId` (text, NOT NULL — logical reference, no FK constraint), `messageType` (varchar 20: chat/agency), `channelType` (varchar 20), `externalMessageId` (varchar 64, nullable), `externalChatId` (varchar 64, nullable), `deliveryStatus` (varchar 20: pending/sent/delivered/failed/suppressed), `attemptCount` (integer, default 0), `lastAttemptAt` (timestamptz, nullable), `deliveredAt` (timestamptz, nullable), `failureCode` (varchar 50, nullable), `failureReason` (text, nullable), `metadata` (json, nullable)

**ID Type Note**: `messageId` is a logical reference stored as text because `messages.id` is integer and `agency_messages.id` is bigint. The `messageType` field (derived from `conversation_channels.conversationType`) determines which table to query. No FK constraint is possible since it spans two tables with different types.

Indexes:
- UNIQUE on `(channelType, externalChatId, externalMessageId)` — dedupe external messages
- INDEX on `(conversationId, messageId)` — lookup by canonical message

#### 3.4 telegram_link_tokens

Auditable link tokens (augments existing Redis-based approach).

Fields: `id` (varchar 36 PK), `tenantId` (FK tenants, cascade), `userId` (FK users, cascade), `targetChatConversationId` (integer, nullable — FK conversations.id), `targetAgencyConversationId` (varchar 36, nullable — FK agencyConversations.id), `targetConversationType` (varchar 20, nullable: chat/agency), `purpose` (varchar 20: connect/resume/approval_link), `tokenHash` (varchar 128), `expiresAt` (timestamptz), `usedAt` (timestamptz, nullable), `revokedAt` (timestamptz, nullable), `createdAt` (timestamptz), `createdBy` (integer, nullable), `metadata` (json, nullable)

Same split-ID pattern as `conversation_channels` — uses the correct FK type per conversation system.

Indexes:
- UNIQUE on `(tokenHash)` — fast token lookup
- INDEX on `(tenantId, userId, purpose)` — user's active tokens

#### 3.5 telegram_updates

Webhook update deduplication and audit.

Fields: `id` (varchar 36 PK), `botId` (varchar 64), `updateId` (bigint), `telegramChatId` (varchar 64, nullable), `receivedAt` (timestamptz), `processedAt` (timestamptz, nullable), `processingStatus` (varchar 20: accepted/ignored/failed/duplicate), `errorCode` (varchar 50, nullable), `errorReason` (text, nullable)

Indexes:
- UNIQUE on `(botId, updateId)` — primary dedupe constraint

### Column Extensions to Existing Tables

#### messages table
- `sourceChannel` (varchar 20, nullable) — `web`, `telegram`, `system`
- `sourceConnectionId` (varchar 36, nullable) — FK to telegram_connections
- `externalSourceId` (varchar 64, nullable) — Telegram message_id

#### agency_messages table (SQLAlchemy/Alembic)
- `source_channel` (String 20, nullable)
- `source_connection_id` (String 36, nullable)
- `external_source_id` (String 64, nullable)

#### conversations table
- `defaultChannelPolicy` (varchar 20, nullable, default `allow_attach`)

All extensions are nullable columns — zero risk to existing data.

---

## 4. Message Processing

### 4.1 Inbound Flow (Telegram → SmartSpecPro)

Step 1: Telegram POSTs to `/webhooks/telegram/:botId`.

Step 2: Express handler validates `X-Telegram-Bot-Api-Secret-Token` against the encrypted `webhook_secret` in `systemSettings`. Reject with 403 if invalid.

Step 3: Redis dedupe — `SET tg:update:{botId}:{updateId} 1 NX EX 86400`. If key exists, return 200 OK and skip processing. Also insert into `telegram_updates` table for audit.

Step 4: Return 200 OK immediately. All further processing is async.

Step 5: Parse the Telegram Update object. If it's a command (`/start`, `/help`, etc.), route to the command handler. If it's a text message, continue to step 6.

Step 6: Resolve the sender's `telegram_connections` record by `(botId, telegramUserId)`. If no active connection found, reply with instructions to link from web UI (in Thai or English based on `language_code`).

Step 7: Look up `conversation_channels` for the resolved connection to find the target conversation. If no active channel binding, reply with instructions to use `/resume` or generate a link from web.

Step 8: Normalize into `ChatIngressEvent` with `conversationType`, `conversationId`, `channel` metadata, and `idempotencyKey`.

Step 9: Call `channelGateway.ingest(event)`. The gateway routes based on `conversationType`:
- `"chat"` → Insert user message into `messages` table (with `sourceChannel: "telegram"`), then call `processMessageServerSide()` (see below).
- `"agency"` → Call `agencyBridge.executeRun()` with the message, using the existing agency pipeline.

**Architecture Note: Server-Side Chat Processing**

The existing web chat flow is split: `sendMessage` saves user message only, then the client initiates an SSE stream at `/api/llm/stream` which runs the LLM pipeline. For Telegram (no browser), we need a new `processMessageServerSide()` function in the channel gateway that combines:
1. Save user message to `messages` table
2. Build chat context (skill detection, conversation history, system prompt) — reuse `buildChatContext` from chat.ts
3. Call LLM gateway non-streaming (`callLLMStructured` or provider direct call)
4. Save assistant message via `createMessage()` (same as `saveAssistantMessage` mutation)
5. Deduct credits via `creditService`

This function must be extracted from the patterns in `chat.ts` and the streaming endpoint, not duplicated. The goal is to share context-building and credit logic.

Step 10: After the pipeline completes and the assistant response is saved, call `channelGateway.emitEgress()`. Also start a typing indicator loop (see below).

Step 11: The egress handler queries `conversation_channels` for all active bindings. For Telegram targets, it enqueues a job in the `telegram-delivery` BullMQ queue. For web targets, no action needed — the TanStack Query polling cycle will pick up new messages automatically on next refetch (typically 5-30s).

Step 12: The BullMQ worker sends the message via `telegramService.sendTelegramMessage()` (existing function) and records the delivery in `channel_messages`.

**Typing Indicator Design**: Before calling the LLM or agency pipeline, start a `sendTypingLoop()` that calls `sendChatAction(chatId, 'typing')` every 4 seconds. Clean up the interval in a `finally` block after the pipeline completes (success or error). For agency calls (up to 120s timeout), this means up to 30 refresh calls.

Step 13: If the inbound message is a non-text type (photo, voice, sticker, document), reply with a polite i18n error message: "Sorry, only text messages are supported at this time." Do not silently drop non-text messages.

### 4.2 Outbound Flow (Web → Telegram)

When a message is sent from the web UI through the normal chat or agency pipeline:

Step 1: The pipeline saves the canonical message (existing behavior).

Step 2: A new hook at the end of `chat.ts` `sendMessage` and `agency.ts` `sendMessage` calls `channelGateway.emitEgress()`.

Step 3: The gateway checks for active Telegram channel bindings on this conversation.

Step 4: If found, enqueue delivery to BullMQ. The user's response appears in Telegram.

### 4.3 Command Handling

**`/start <token>`**: Hash the token with SHA-256. Look up in `telegram_link_tokens` by `tokenHash`. Validate: not expired, not used, not revoked. If valid: create `telegram_connections` record (status: active), create `conversation_channels` record if `targetConversationId` is set, mark token as used (set `usedAt`), delete Redis key, update `users.telegramVerified = true` for backward compatibility. Reply with success message.

**`/start` (no token)**: Check if user has an active `telegram_connections` record. If linked, show status and bound conversations. If not linked, show instructions to connect from web UI.

**`/resume`**: Query `conversation_channels` WHERE `connectionId = <current_connection>` AND `state = active`. If one result, set it as the active conversation by updating `telegram_connections.activeChannelId`. If multiple, show a numbered list and let user reply with number — on selection, update `activeChannelId`. If none, instruct to bind from web.

**`/unlink`**: Send confirmation with inline keyboard ("Yes, unlink" / "Cancel"). On confirmation callback: set `telegram_connections.status = revoked`, set all `conversation_channels` for this connection to `state = revoked`, clear `users.telegramVerified`, reply with success.

**`/help`**: Show available commands and current connection status.

**`/status`**: Show current active conversation (name, message count, last activity).

---

## 5. Delivery Queue

### Queue Architecture

The delivery queue uses BullMQ with the existing Redis realtime client (`getRealtimeClient()` from `redisClients.ts`), which already has `maxRetriesPerRequest: null` as required by BullMQ workers.

**Redis Client Selection**: The codebase has multiple Redis client modules. Each use case requires a specific client:
- **BullMQ Queue + Worker**: `getRealtimeClient()` from `redisClients.ts` (connection-oriented, BullMQ-compatible)
- **Webhook dedupe SET NX**: `getCacheClient()` from `redisClients.ts` (stateless, short-lived operations)
- **Existing link codes** (in telegram.ts router): `getRedisClient()` from `redis.ts` (maintain backward compatibility)

Queue name: `telegram-delivery`
DLQ name: `telegram-delivery-dlq`

Default job options: 5 attempts, exponential backoff with 1s base delay, removeOnComplete after 1000 jobs, removeOnFail after 5000 jobs.

Worker settings: concurrency 10, rate limiter 25 jobs per 1000ms.

### Error Classification

The worker uses a custom backoff strategy:

- **Permanent failures** (return -1, skip retries): bot blocked by user, chat not found, invalid chat ID, forbidden (403)
- **Rate limited** (use retry_after): Telegram 429 response — extract `parameters.retry_after` and wait exactly that many seconds. Use `Worker.RateLimitError()` so the attempt doesn't count.
- **Transient failures** (exponential backoff): network errors, timeouts, 500/502/503/504 responses

### Job Data Shape

```typescript
interface DeliveryJob {
  channelMessageId: string;    // channel_messages.id
  chatId: string;              // Telegram chat_id
  text: string;                // HTML-formatted message
  parseMode: "HTML";
  replyToMessageId?: string;   // For threading
  conversationId: string;      // For logging
  tenantId: string;            // For metrics
}
```

### Lifecycle

1. Job created by `channelGateway.emitEgress()` with deterministic jobId: `tg-deliver-${channelMessageId}`
2. Worker picks up job, calls `telegramService.sendTelegramMessage()`
3. On success: update `channel_messages` (status: sent, externalMessageId, deliveredAt)
4. On permanent failure: update `channel_messages` (status: failed, failureCode, failureReason)
5. On transient failure: BullMQ retries automatically
6. After max retries: `failed` event handler moves to DLQ, marks `channel_messages` as failed

### Initialization and Shutdown

Initialize the queue and worker in `apps/web/server/_core/index.ts` after Redis is ready. Register `closeDeliveryQueue()` in the graceful shutdown handler (alongside existing cleanup).

---

## 6. Webhook Endpoint

### Route Registration

Register as an Express route in `apps/web/server/_core/index.ts`, before tRPC middleware (since it's not a tRPC endpoint). The route is: `POST /webhooks/telegram/:botId`.

### Request Validation

1. Extract `botId` from URL params.
2. Load bot settings from `systemSettings` (category: `telegram`). Use the existing `getTelegramSettings()` function which caches settings.
3. Decrypt `webhook_secret` using existing `decrypt()` from `crypto.ts`.
4. Compare `X-Telegram-Bot-Api-Secret-Token` header against decrypted secret.
5. If mismatch: return 403, log attempt.

### Webhook URL Generation

When admin calls `telegram.setWebhook`, generate the URL as: `https://smartaihub.app/webhooks/telegram/{botUsername}` (using the production domain from CLAUDE.md).

**URL Migration**: The existing `registerWebhook` mutation currently constructs `${appUrl}/api/webhook/telegram`. This must be updated to the new path format. After deploying the new webhook route, the admin must call `setWebhook` again to re-register with Telegram (Telegram continues posting to the old URL until re-registered).

### allowed_updates Update

Update the `setWebhook` call to include `allowed_updates: ["message", "callback_query"]`. The existing code only sends `["message"]`, which won't deliver inline keyboard callbacks needed for `/unlink` confirmation.

---

## 7. Telegram Router Extensions

### New Endpoints (add to existing `apps/web/server/routers/telegram.ts`)

**getConversationChannelStatus** (query) — Returns Telegram binding status for a conversation. Input: `conversationId`. Output: `{ bound: boolean, syncMode, connectionStatus }`.

**bindConversation** (mutation) — Creates a `conversation_channels` record binding the current user's Telegram connection to a specific conversation. Input: `conversationId`, `conversationType` (chat/agency), `syncMode`. Validates conversation ownership and active Telegram connection.

**unbindConversation** (mutation) — Sets `conversation_channels.state = revoked` for a specific conversation. Input: `conversationId`.

**adminListConnections** (admin query) — Lists all active Telegram connections for a tenant. Input: `tenantId?`, `status?`, `limit`, `offset`. Output: paginated list with user details.

**adminRevokeConnection** (admin mutation) — Force-revokes a Telegram connection and all its channel bindings. Input: `connectionId`.

### Extended Endpoints

**generateTelegramLink** — Extend to accept optional `conversationId` and `conversationType`. When provided, store them in `telegram_link_tokens` so the `/start` command can create the channel binding automatically.

**unlinkTelegram** — Extend to also revoke `telegram_connections` and all associated `conversation_channels` records.

**checkTelegramStatus** — Extend to also return active `telegram_connections` details and bound conversation count.

---

## 8. Chat and Agency Pipeline Integration

### chat.ts Integration

**Architecture Note**: The web chat flow is split — `sendMessage` saves user message only, then the client initiates SSE streaming at `/api/llm/stream` for LLM processing, and `saveAssistantMessage` saves the result. For Telegram, the `processMessageServerSide()` function in the channel gateway handles the full pipeline server-side.

Changes to existing chat.ts:

1. In `saveAssistantMessage` mutation: after saving the assistant message, call `channelGateway.emitEgress()` with the conversation ID, message ID, and tenant ID. This is the hook point — fan-out happens after the response is saved, not after user message creation.
2. Accept optional `sourceChannel` metadata in `sendMessage` input (for recording Telegram origin on web-created messages if needed).
3. When saving messages, include `sourceChannel`, `sourceConnectionId`, and `externalSourceId` if present.

The LLM pipeline itself (skill detection, context building, provider routing, credit deduction) is completely unchanged. The channel metadata is pass-through only. The `emitEgress` call is conditional — only fires if the conversation has active channel bindings (checked via fast DB query).

### agency.ts Integration

In the `sendMessage` mutation:

1. Accept optional `channel` metadata.
2. After `agencyBridge.executeRun()` returns, call `channelGateway.emitEgress()`.

The agency pipeline, Python backend, and credit flow are completely unchanged.

### Rendering for Telegram

Create a rendering function that converts canonical message content to Telegram-safe HTML:

- Strip unsupported markdown (tables, footnotes)
- Convert code blocks to `<pre>` tags (max 2000 chars per block)
- Split messages > 4096 chars at paragraph boundaries
- Add truncation notice with web UI link for long content
- Preserve inline formatting: bold → `<b>`, italic → `<i>`, code → `<code>`

---

## 9. Security

### Webhook Security

- Validate `X-Telegram-Bot-Api-Secret-Token` on every request
- Webhook secret stored encrypted in `systemSettings` (existing pattern)
- Return 403 for invalid tokens, 200 for valid (even duplicates)
- Log all validation failures to audit trail

### Link Token Security

- Tokens: 128-bit random (existing `generateTelegramLink` pattern)
- Storage: SHA-256 hash in DB, raw value in Redis (5-min TTL)
- Single-use: mark `usedAt` on consumption
- Revocable: check `revokedAt` before accepting

### Rate Limiting

- Inbound: 30 messages/minute per Telegram user (in-process counter, sufficient for <100 users)
- Outbound: 25 messages/second via BullMQ rate limiter
- Invalid token attempts: log and rate limit (3 per hour per IP)

### Tenant Isolation

**Important**: The `conversations` table has no `tenantId` column — it only has `userId`. Tenant isolation for regular conversations works through `userId` → `users.currentTenantId`. Similarly, `agencyConversations` has no `tenantId`. The `conversation_channels.tenantId` is derived from `telegram_connections.tenantId` (which comes from the user's tenant at link time), NOT from the conversations themselves. All gateway queries use the connection's tenantId for isolation.

### Credential Isolation

- Bot token: encrypted in `systemSettings` (existing)
- Webhook secret: encrypted in `systemSettings` (existing)
- telegramService has NO access to LLM provider keys
- telegramService has NO direct write to credit tables

---

## 10. Localization

~20 bot system messages in Thai and English. Language detected from Telegram user's `language_code` field. Default to Thai for `th`, English for all others.

Categories:
- Link flow: success, failure, expired token, already linked
- Commands: help text, status output, unlink confirmation
- Errors: no connection, no conversation bound, rate limited
- System: typing indicator text (none needed — it's a UI element)

Implementation: simple object map with `th` and `en` keys. No i18n library needed at this scale.

---

## 11. Impact and Regression Map

### Affected Components

| Component | Change Type | Regression Risk |
|-----------|------------|----------------|
| `telegramService.ts` | Extended (new methods) | LOW — existing send functions unchanged |
| `telegram.ts` router | Extended (new endpoints) | LOW — existing endpoints unchanged |
| `chat.ts` router | Modified (fan-out hook) | MEDIUM — must not break sendMessage |
| `agency.ts` router | Modified (fan-out hook) | MEDIUM — must not break sendMessage |
| `schema.ts` | Extended (new tables + columns) | LOW — additive only |
| `_core/index.ts` | Modified (route + queue init) | MEDIUM — startup order matters |

### Regression Prevention

1. All existing Telegram tests (`telegramService.test.ts`, `telegram.test.ts`) must pass unchanged.
2. All existing chat tests must pass — the fan-out hook must be conditional (only fires if conversation has channel bindings).
3. Run `pnpm test` (full suite) after each phase.
4. Run `pnpm check` (TypeScript) after schema changes.

### Blast Radius

- Webhook route is isolated (new Express path, doesn't touch tRPC)
- BullMQ queue is isolated (new queue name, doesn't affect existing queues)
- Schema additions are nullable columns — existing queries unaffected
- Channel gateway is new code — no existing code depends on it

---

## 12. Data Safety and Migration Strategy

### Risk Classification: LOW

All changes are additive:
- 5 new tables (no existing data touched)
- 3 nullable columns added to `messages` (existing rows get NULL)
- 3 nullable columns added to `agency_messages` (existing rows get NULL)
- 1 nullable column added to `conversations` (existing rows get NULL)

### Migration Sequence

1. **Expand schema**: Add new tables and columns via Drizzle migration + Alembic migration
2. **No backfill needed**: New columns are nullable, existing data remains valid
3. **Validate**: Check row counts, verify NULL columns, spot-check existing queries
4. **No contract step**: No old paths to remove

### Backup Plan

Per Database Safety Protocol:
1. Backup `messages`, `conversations` tables before migration (they get new columns)
2. Backup `agency_messages` table before Alembic migration
3. Verify row counts match after migration
4. If any rows lost: restore immediately from backup

### Rollback

If migration needs rollback:
1. New tables can be dropped (no FK dependencies from existing tables)
2. New columns can be dropped (they're nullable, no code depends on them until feature is enabled)
3. Feature flag not needed — the webhook route simply won't exist if code is reverted

---

## 13. Backward Compatibility Plan

### Existing User Telegram Fields

The current user-level fields (`telegramChatId`, `telegramVerified`, `telegramUsername`) are preserved during migration. The new `telegram_connections` table is the authoritative source, but:

1. When a connection is created, also set `users.telegramVerified = true` (backward compat)
2. When a connection is revoked, also set `users.telegramVerified = false`
3. The existing `checkTelegramStatus` endpoint continues to work by checking both the old field and the new table

The old fields can be deprecated in a future release after verifying no code path depends on them.

### Existing Notification Flow

The existing `notificationService.ts` → `telegramService.sendTelegramMessage()` flow is completely unchanged. Notifications continue to use the fire-and-forget path. The new BullMQ queue is only used for chat bridge message delivery.

### Existing API Endpoints

All existing tRPC endpoints continue to work unchanged. New endpoints are additions, not modifications.

---

## 14. Post-Change Validation

### Phase 1A Validation

1. Generate a Telegram deep link from web UI → link appears
2. Click link in Telegram → bot receives `/start` → user verified
3. `checkTelegramStatus` returns `linked: true`
4. Duplicate webhook calls with same `update_id` are silently ignored
5. Invalid secret token returns 403

### Phase 1B Validation

1. `conversation_channels` record created when conversation is bound
2. `telegram_link_tokens` record created with correct hash
3. `messages.sourceChannel` column exists and accepts values
4. Existing queries on `messages` table still work (no breaking changes)
5. `pnpm check` passes (TypeScript types valid)

### Phase 1C Validation

1. Send message from Telegram → appears in web UI conversation
2. Send message from web → delivered to Telegram
3. Agency conversation messages work bidirectionally
4. LLM calls appear in `provider_usage_log` with correct trace
5. Credits deducted normally for Telegram-originated messages
6. `channel_messages` records show delivery status
7. Failed delivery retries 5 times then stops
8. Existing notification flow still works
9. All existing tests pass

---

## 15. Implementation Phases

### Phase 1A: Foundation (~200 lines new code)

**Goal**: Complete the broken webhook handler and linking flow.

1. Create `telegram_updates` table in Drizzle schema
2. Run migration: `pnpm db:push`
3. Create `apps/web/server/routes/telegramWebhook.ts` Express route
4. Implement secret validation using existing `getTelegramSettings()`
5. Implement Redis dedupe (SET NX EX 86400)
6. Implement `/start <code>` handler — match against Redis, verify user, set `telegramVerified`
7. Implement `/start` (no code) — return help message
8. Implement `/help` — return command list
9. Register route in `_core/index.ts`
10. Write unit tests for webhook handler
11. Update admin `setWebhook` to use correct URL format (`/webhooks/telegram/:botId`)
12. Update `allowed_updates` in `setWebhook` to `["message", "callback_query"]`
13. Add re-registration step in admin docs (admin must call setWebhook after deployment)

**Files created**: `telegramWebhook.ts`, `telegramI18n.ts`
**Files modified**: `schema.ts`, `_core/index.ts`
**Tests**: Webhook validation, dedupe, /start command

### Phase 1B: Channel Abstraction (~600 lines new code)

**Goal**: Create the channel data model and gateway service.

1. Create 4 new tables: `telegram_connections`, `conversation_channels`, `channel_messages`, `telegram_link_tokens`
2. Add nullable columns to `messages`, `conversations`
3. Create Alembic migration for `agency_messages` columns
4. Run all migrations
5. Create `apps/web/shared/channelTypes.ts` with `ChatIngressEvent` and `ChatEgressEvent` interfaces
6. Create `apps/web/server/services/channelGateway.ts` with `ingest()` and `emitEgress()` methods
7. Extend `telegram.generateTelegramLink` to accept `conversationId` and create `telegram_link_tokens` record
8. Extend `/start <code>` handler to create `telegram_connections` and `conversation_channels` records
9. Extend `telegram.unlinkTelegram` to revoke connections and channels
10. Add new tRPC endpoints: `getConversationChannelStatus`, `bindConversation`, `unbindConversation`
11. Write tests for channel gateway, connection lifecycle

**Files created**: `channelGateway.ts`, `channelTypes.ts`
**Files modified**: `schema.ts`, `telegram.ts` router, `telegramWebhook.ts`
**Alembic migration**: Add 3 columns to `agency_messages`
**Tests**: Gateway routing, connection CRUD, binding lifecycle

### Phase 1C: Bidirectional Chat (~800 lines new code)

**Goal**: Full bidirectional messaging between Telegram and web.

1. Create `apps/web/server/services/deliveryQueue.ts` with BullMQ queue, worker, DLQ
2. Implement Telegram message rendering (HTML formatting, splitting, truncation)
3. Implement `processMessageServerSide()` — extract chat context-building + non-streaming LLM call + response save + credit deduction from existing chat.ts patterns
4. Implement inbound processing: Telegram text message → channelGateway.ingest → `processMessageServerSide()` for chat pipeline
5. Implement inbound processing: Telegram text message → channelGateway.ingest → `agencyBridge.executeRun()` for agency pipeline
6. Add channel fan-out hook to `chat.ts` `saveAssistantMessage` (after response save, not `sendMessage`)
7. Add channel fan-out hook to `agency.ts` `sendMessage` (after response save)
8. Implement `/resume` command (list bound conversations, user selects, update `activeChannelId`)
9. Implement `/unlink` command with inline keyboard confirmation + callback_query handling
10. Implement `/status` command
11. Implement `sendTypingLoop()` helper — refresh `sendChatAction('typing')` every 4s, cleanup in finally block
12. Add handler for non-text messages (photo, voice, sticker) — reply with polite i18n error
13. Add `sourceChannel` to `provider_usage_log` entries
12. Initialize delivery queue in `_core/index.ts`
13. Add admin endpoints: `adminListConnections`, `adminRevokeConnection`
14. Write integration tests: full round-trip (Telegram → pipeline → delivery → Telegram)
15. Write tests: delivery queue retry, DLQ, rate limiting

**Files created**: `deliveryQueue.ts`
**Files modified**: `chat.ts`, `agency.ts`, `telegram.ts` router, `telegramWebhook.ts`, `_core/index.ts`
**Tests**: Round-trip messaging, delivery queue, error handling, admin operations
