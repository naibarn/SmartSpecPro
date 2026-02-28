# 028-Chat-Bridge Research Notes

## 1. Codebase Research (from session analysis)

### 1.1 telegramService (existing)

**File**: `apps/web/server/services/telegramService.ts` (455 lines)

- Direct HTTP to Telegram Bot API (`/sendMessage`)
- In-process rate limiting: 25 msg/sec token bucket
- Retry with exponential backoff (3 attempts max)
- HTML formatting with priority emoji, action button, timestamp
- Settings cached from `systemSettings` table
- **Critical gap**: No webhook handler — users cannot complete linking flow
- Fire-and-forget delivery — no retry queue

### 1.2 Telegram Router (existing)

**File**: `apps/web/server/routers/telegram.ts` (569 lines)

Admin endpoints:
- `getTelegramSettings` / `updateTelegramSettings` — config CRUD
- `testTelegramConnection` — calls Telegram `/getMe`
- `setWebhook` — registers webhook URL with Telegram

User endpoints:
- `generateTelegramLink` — creates 128-bit code, stores in Redis (5-min TTL), returns deep link
- `checkTelegramStatus` — polls `users.telegramVerified`
- `unlinkTelegram` — clears user fields + preferences
- `updateTelegramPreferences` — notification level settings

### 1.3 Chat System

**File**: `apps/web/server/routers/chat.ts` (~1,800 lines)

Pipeline: `sendMessage → skill detect → buildChatContext → LLM provider → save → deduct credits`

Tables: `conversations`, `messages`, `conversationSummaries`, `entityMemories`, `skillPreferences`

Key observations:
- No `source_channel` field on messages
- No fan-out delivery mechanism
- Per-message credit deduction via `creditService`
- Memory: short-term (history) + long-term (entityMemories)

### 1.4 Agency Swarm

**File**: `apps/web/server/routers/agency.ts` (~500 lines)
**File**: `apps/web/server/services/agencyBridge.ts` (~200 lines)

Pipeline: `sendMessage → agencyBridge.executeRun → Python /api/v1/agencies/{id}/run → agency-swarm → LLM gateway`

Tables: `agencyConversations` (Drizzle), `agency_messages` + `agency_runs` (SQLAlchemy)

Key observations:
- Separate from chat — different tables, different router
- 120s timeout on bridge calls
- Credit: pre-check → per-call gateway deduction → post-run multiplier markup
- SSE streaming at Python `/api/v1/agencies/{id}/stream`
- Feature-flagged: `AGENCY_SWARM_ENABLED`

### 1.5 LLM Gateway

**File**: `apps/web/server/services/llmRouter.ts` (~600 lines)
**File**: `apps/web/server/services/creditService.ts` (~400 lines)

- Multi-provider routing with health circuit breaker
- Dynamic cost or priority candidate sorting
- Fallback chain (up to 3+ providers)
- Atomic credit deduction with TOCTOU prevention
- Idempotency: Redis cache (24h TTL) + DB unique constraint
- Audit: JSONL + `provider_usage_log` table

### 1.6 OpenSandbox

**File**: `apps/web/server/services/sandbox/dispatchService.ts` (~300 lines)

- Feature-flagged: `OPENSANDBOX_ENABLED`
- Risk levels: low (direct), medium (whitelist), high (sandbox)
- Dispatch → Python backend → returns job ID for polling

### 1.7 Database Schema

**File**: `apps/web/drizzle/schema.ts` (~4,000 lines)

- 42+ migrations, Drizzle ORM
- Conventions: varchar(36) IDs, tenantId FK with cascade, timezone timestamps
- Telegram: user-level fields only (telegramChatId, telegramUsername, telegramVerified)
- No channel abstraction
- Encrypted fields: `*Encrypted` suffix pattern
- Bot token in `systemSettings` (encrypted, category: `telegram`)

### 1.8 Redis Architecture

**File**: `apps/web/server/services/redisClients.ts`

- Split client architecture: cache client + realtime client
- Realtime client has `maxRetriesPerRequest: null` (BullMQ-compatible)
- Used for: session cache, Telegram link codes, rate limiting

### 1.9 Notification Service

**File**: `apps/web/server/services/notificationService.ts` (111 lines)

- `createNotification()` → inserts to `user_notifications` table
- Fire-and-forget `enqueueTelegramNotification()`
- No delivery tracking
- No channel abstraction

---

## 2. Web Research: Telegram Bot API Webhook Patterns

### 2.1 Webhook Setup

- `setWebhook` with `secret_token` param → server validates via `X-Telegram-Bot-Api-Secret-Token` header
- HTTPS required (TLS 1.2+), ports 443/80/88/8443
- `allowed_updates` filter to reduce noise
- `getWebhookInfo` for health monitoring (pending_update_count, last_error)

### 2.2 Update Processing

- Each Update contains one of: message, callback_query, inline_query, etc.
- **Critical**: Return 200 OK immediately, process async
- Telegram retries with exponential backoff if non-200 response
- Same-chat updates arrive sequentially; different-chat updates arrive concurrently
- Webhook reply shortcut: include method call in response body (saves 1 round-trip)

### 2.3 Idempotency and Dedupe

- `update_id` is unique and sequential per bot
- Redis-backed dedupe recommended: `SET key NX EX 86400` (24h TTL)
- Database-backed: `INSERT ... ON CONFLICT DO NOTHING`
- Telegram keeps updates max 24 hours

### 2.4 Deep Linking

- Format: `https://t.me/<bot>?start=<payload>` (max 64 chars, A-Za-z0-9_-)
- Bot receives `/start <payload>` when user taps Start
- Payload hidden from user in Telegram UI

### 2.5 Rate Limits

| Scenario | Limit |
|----------|-------|
| Same chat (private) | ~1 msg/sec |
| Different chats (broadcast) | ~30 msg/sec |
| Same group | 20 msg/min |

- 429 response includes `retry_after` (seconds) — global block
- Use queue with ~25 jobs/sec rate limit
- Honor `retry_after` exactly

### 2.6 Message Formatting

- **HTML mode recommended** for production (easier to generate, no escaping needed)
- Supported: `<b>`, `<i>`, `<code>`, `<pre>`, `<a>`, `<blockquote>`
- **4096 UTF-16 code units** per message limit
- Split at paragraph boundaries, then sentence, then word

### 2.7 Typing Indicators

- `sendChatAction(chatId, 'typing')` expires after 5 seconds
- Refresh every 4 seconds during long processing
- Clean up interval in finally block

---

## 3. Web Research: Multi-Channel Chat Architecture

### 3.1 Channel Adapter Patterns

| Pattern | Used By | Key Trait |
|---------|---------|-----------|
| Polymorphic DB model | Chatwoot | Channel config in separate tables, unified Inbox |
| Channel monitor + Gateway | OpenClaw | Adapters normalize to InboundContext |
| Provider factory | Novu | Stateless providers behind factory |
| Channel Adapter (EIP) | Enterprise Integration Patterns | Classic adapter pattern |

### 3.2 Message Normalization

- EIP Canonical Data Model: superset schema all channels translate into
- Envelope + body separation (OpenClaw): metadata separate from content
- Channel-specific features: store in opaque `channelMeta` JSON field
- Core engine never reads channelMeta — only outbound adapter interprets it

### 3.3 Recommended Canonical Message Schema

```typescript
interface CanonicalMessage {
  id: string;
  externalId?: string;
  conversationId: string;
  channelType: string;
  direction: 'inbound' | 'outbound';
  sender: { userId?: string; channelIdentity: string; displayName?: string };
  content: { text?: string; html?: string; attachments?: Attachment[] };
  channelMeta?: Record<string, unknown>;
  idempotencyKey: string;
  timestamp: Date;
  traceId: string;
}
```

### 3.4 Fan-Out Delivery

- Write one `message_deliveries` row per target channel (same transaction as message)
- Dispatcher reads pending deliveries → enqueues to channel-specific BullMQ queues
- Per-channel workers send via provider → update delivery row
- Failures: exponential backoff → dead letter after max retries
- **Transactional Outbox pattern** solves dual-write problem

### 3.5 Channel Binding Models

- Chatwoot: `contact_inboxes` junction table with `source_id` (channel-specific identifier)
- One-to-many: one user → many channel bindings
- Tenant-scoped uniqueness: `(tenant_id, channel_type, channel_identity)`
- Soft unbind with `unbound_at` for audit trail

### 3.6 Two-Way Sync

- Canonical store is authoritative (not channel)
- Event-driven: message create/edit/delete fires events
- Per-channel workers translate to channel-native operations
- Edit/delete propagation: best-effort (not all channels support)
- Ordering: server-assigned sequence numbers, not client timestamps

---

## 4. Web Research: BullMQ Reliable Delivery

### 4.1 Queue-Based Delivery Setup

- Dedicated queue per concern (e.g., `telegram-delivery`)
- Reuse existing realtime Redis client (`maxRetriesPerRequest: null`)
- Redis `maxmemory-policy: noeviction` required
- `removeOnComplete: { count: 1000 }` + `removeOnFail: { count: 5000 }` for visibility

### 4.2 Retry Strategies

- Built-in exponential backoff: `{ type: 'exponential', delay: 1000 }`
- Custom backoff for error classification:
  - Return `-1` for permanent failures (skip remaining retries)
  - Use `retryAfter` from 429 responses
  - Exponential with cap for transient failures

### 4.3 Idempotency

- Custom job IDs: `telegram-notify-${notificationId}-${chatId}` (no `:` allowed)
- BullMQ v5+ deduplication API: throttle mode with TTL
- Processor must be idempotent: check delivery status before re-sending

### 4.4 Dead Letter Queues

- Not built-in — listen for `failed` event, move exhausted jobs to DLQ
- `QueueEvents` uses Redis Streams (survives connection drops)
- DLQ processing: manual review, automated reprocessing, or alerting

### 4.5 Rate Limiting

- Worker-level: `limiter: { max: 25, duration: 1000 }` (25/sec)
- Dynamic: `worker.rateLimit(retryAfterMs)` + `Worker.RateLimitError()` (don't count as attempt)
- Smoothed: `{ max: 1, duration: 40 }` for even distribution
- Per-chat limits: BullMQ Pro group feature, or approximate with in-worker logic

### 4.6 Worker Configuration

- Concurrency: 10-50 for IO-bound (HTTP calls)
- Graceful shutdown: `worker.close()` with timeout fallback
- Stalled detection: `stalledInterval: 30000`, `maxStalledCount: 2`

### 4.7 SmartSpecPro Integration

- Existing Redis realtime client is BullMQ-ready
- Create `apps/web/server/services/deliveryQueue.ts`
- Register `closeDeliveryQueue()` in server shutdown handler
- Extend admin queue stats router for delivery queue metrics

---

## 5. Key Decisions Informed by Research

### 5.1 Webhook Validation

Use `X-Telegram-Bot-Api-Secret-Token` header validation. The secret is already stored encrypted in `systemSettings` (category: `telegram`, key: `webhook_secret`).

### 5.2 Dedupe Strategy

Redis-backed dedupe for webhook updates (fast, 24h TTL matches Telegram retention). Database `telegram_updates` table for audit trail. Both together: Redis for speed, DB for durability.

### 5.3 Channel Gateway Pattern

Adopt the Chatwoot-inspired polymorphic model: `conversation_channels` maps conversations to channel bindings. Channel-specific metadata in JSON columns. Core engine remains channel-agnostic.

### 5.4 Delivery Queue

BullMQ queue with exponential backoff, custom error classification (permanent vs transient), and dead letter queue. Reuse existing Redis realtime client. Rate limit at 25/sec to stay under Telegram's 30/sec limit.

### 5.5 Message Formatting

HTML mode for Telegram (easier to generate, no escaping). Split long messages at paragraph boundaries. Typing indicator refreshed every 4 seconds during processing.

### 5.6 Fan-Out Approach

Transactional outbox: write `channel_messages` rows in same transaction as canonical message. BullMQ dispatcher processes pending deliveries per channel. Partial failure isolation: one channel failing doesn't block others.

---

## 6. Testing Considerations

### 6.1 Existing Test Infrastructure

- **Vitest** for TypeScript (`pnpm test` in `apps/web`)
- **pytest** for Python (`pytest` in `python-backend`)
- Existing Telegram tests: `telegramService.test.ts` (509 lines), `telegram.test.ts` (415 lines)
- Mock patterns: db, Redis, fetch already established

### 6.2 Test Approach for Chat Bridge

1. **Unit tests**: Webhook handler, channel gateway, message normalization, delivery queue
2. **Integration tests**: Full round-trip (Telegram → conversation → delivery)
3. **Dedupe tests**: Duplicate update_id handling
4. **Error handling tests**: Invalid tokens, expired links, unlinked users, delivery failures
5. **Rate limit tests**: Verify 429 handling with Worker.RateLimitError
6. **Schema migration tests**: Verify nullable column additions don't break existing queries
