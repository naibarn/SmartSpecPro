# 028-Chat-Bridge: Combined Specification

This document synthesizes the original spec, codebase research, web research, and stakeholder interview into a single authoritative specification.

## Feature Overview

Add Telegram as a bidirectional chat channel for SmartSpecPro, working with both the regular chat system (`conversations` + `messages`) and the agency-swarm system (`agencyConversations` + `agency_messages`).

## Key Decisions (from Interview)

1. **Routing**: Explicit selection required — no auto-routing to most recent conversation
2. **Delivery**: BullMQ queue from Phase 1 for reliable delivery with retry
3. **Scale**: Small (<100 users, <1K msg/day) at launch
4. **Webhook path**: `/webhooks/telegram/:botId` (multi-bot ready)
5. **Web sync**: TanStack Query invalidation (no SSE needed for Phase 1)
6. **Localization**: Thai + English bot messages, auto-detect via `language_code`

## Architecture

### Existing Components to Extend

| Component | File | Extension |
|-----------|------|-----------|
| telegramService | `apps/web/server/services/telegramService.ts` | Add webhook processing methods |
| telegram router | `apps/web/server/routers/telegram.ts` | Add conversation binding endpoints |
| chat router | `apps/web/server/routers/chat.ts` | Add `sourceChannel` to message saves, channel fan-out |
| agency router | `apps/web/server/routers/agency.ts` | Add channel fan-out after response |
| server init | `apps/web/server/_core/index.ts` | Register webhook Express route, init delivery queue |
| drizzle schema | `apps/web/drizzle/schema.ts` | 5 new tables + column extensions |

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| Webhook handler | `apps/web/server/routes/telegramWebhook.ts` | Express route for Telegram webhook |
| Channel gateway | `apps/web/server/services/channelGateway.ts` | Message normalization + fan-out |
| Delivery queue | `apps/web/server/services/deliveryQueue.ts` | BullMQ queue for reliable Telegram delivery |
| Channel types | `apps/web/shared/channelTypes.ts` | ChatIngressEvent, ChatEgressEvent types |
| Bot i18n | `apps/web/server/services/telegramI18n.ts` | Thai/English bot message strings |

### Forbidden Couplings

1. telegramService MUST NOT call LLM providers directly
2. telegramService MUST NOT create its own conversation storage
3. telegramService MUST NOT access LLM_ENCRYPTION_KEY or provider API keys
4. Webhook handler MUST NOT process messages synchronously (async after 200 OK)

## Data Model

### New Tables (Drizzle)

1. **telegram_connections** — Telegram identity bindings (replaces user-level fields)
2. **conversation_channels** — Maps conversations to channels (supports `chat` and `agency` types)
3. **channel_messages** — Per-channel delivery tracking with retry status
4. **telegram_link_tokens** — Auditable link tokens (augments Redis)
5. **telegram_updates** — Webhook dedupe (unique on `bot_id, update_id`)

### Column Extensions

- `messages`: add `sourceChannel`, `sourceConnectionId`, `externalSourceId` (all nullable)
- `agency_messages` (SQLAlchemy): add `source_channel`, `source_connection_id` (all nullable)
- `conversations`: add `defaultChannelPolicy` (nullable, default `allow_attach`)

### Migration Risk: MEDIUM

All changes are additive: new tables + nullable columns. No existing data affected.

## Message Contracts

### ChatIngressEvent (inbound)

```typescript
interface ChatIngressEvent {
  eventId: string;
  eventType: "user_message" | "command" | "callback";
  tenantId: string;
  userId: number;
  conversationId: string;
  conversationType: "chat" | "agency";
  channel: {
    type: "web" | "telegram";
    connectionId?: string;
    externalChatId?: string;
    externalMessageId?: string;
  };
  message: { text: string; attachments: Attachment[] };
  idempotencyKey: string;
}
```

### ChatEgressEvent (outbound fan-out)

```typescript
interface ChatEgressEvent {
  eventId: string;
  conversationId: string;
  conversationType: "chat" | "agency";
  messageId: string;
  tenantId: string;
  targets: Array<{
    channelType: "web" | "telegram";
    channelRefId: string;
    syncMode: "two_way" | "notify_only";
  }>;
  rendering: {
    plainText: string;
    html?: string;
    truncatedWebUrl?: string;
  };
}
```

## Processing Lifecycle

### Inbound (Telegram → SmartSpecPro)

1. Telegram POST → `/webhooks/telegram/:botId`
2. Validate `X-Telegram-Bot-Api-Secret-Token`
3. Redis dedupe check (SET NX EX 86400)
4. Return 200 OK immediately
5. Async: parse update → resolve connection → normalize
6. Route by `conversationType`: `chat` pipeline or `agency` pipeline
7. Pipeline processes (skill detect, LLM, tools, etc.)
8. Save response, emit `ChatEgressEvent`
9. BullMQ delivers to Telegram + invalidates web cache

### Outbound (SmartSpecPro → Telegram)

1. Canonical message saved
2. Query `conversation_channels` for active bindings
3. For Telegram: enqueue to `telegram-delivery` BullMQ queue
4. Worker sends via Telegram Bot API (HTML mode)
5. Track in `channel_messages` (status: pending → sent → delivered/failed)
6. Retry with exponential backoff (1s, 2s, 4s), max 5 attempts
7. DLQ for exhausted retries

## Telegram Commands

| Command | Behavior |
|---------|----------|
| `/start <token>` | Validate token → create connection → bind conversation |
| `/start` (no token) | Show help + link status |
| `/resume` | Show list of bound conversations, user selects one |
| `/new` | Error — must create from web UI (Phase 1) |
| `/unlink` | Confirmation → revoke connection |
| `/help` | Show commands + current status |
| `/status` | Show active conversation info |

## Delivery Queue (BullMQ)

```typescript
// Queue: telegram-delivery
// Connection: getRealtimeClient() (existing)
// Default: 5 attempts, exponential backoff 1s base
// Rate limit: 25 jobs/sec (under Telegram's 30/sec)
// DLQ: telegram-delivery-dlq
// Concurrency: 10 workers
```

Custom backoff:
- 429 Too Many Requests → use `retry_after` value
- Bot blocked / chat not found → permanent failure, skip retries
- Network error → exponential backoff

## Security

1. Webhook: validate secret token header
2. Linking: signed tokens, single-use, 5-min expiry
3. Credentials: bot token encrypted in systemSettings (existing)
4. Rate limiting: 30 msg/min per user from Telegram
5. Tenant isolation: all queries scoped by tenantId

## Localization

~20 bot system messages in Thai + English:

```typescript
const messages = {
  link_success: {
    th: "เชื่อมต่อสำเร็จ! คุณสามารถส่งข้อความได้แล้ว",
    en: "Connected! You can now send messages.",
  },
  // ...
};
```

Auto-detect via Telegram `language_code`, default to Thai for `th`.

## Phased Implementation

### Phase 1A: Foundation (~200 lines)
- `telegram_updates` table + webhook Express route
- Secret validation + dedupe + `/start` command handler
- Complete existing broken linking flow

### Phase 1B: Channel Abstraction (~600 lines)
- 4 new tables (connections, channels, messages, tokens)
- Column extensions (messages, agency_messages, conversations)
- ChannelGateway service + ChatIngressEvent/ChatEgressEvent types
- Extend generateTelegramLink for conversation binding

### Phase 1C: Bidirectional Chat (~800 lines)
- Inbound: Telegram → chat pipeline + agency pipeline
- Outbound: BullMQ delivery queue + worker
- Delivery tracking in channel_messages
- Web sync via TanStack Query invalidation
- Bot i18n (Thai + English)

### Phase 2: Production Hardening
- Admin controls (connection management, force unlink)
- Redis-based rate limiting
- Observability dashboards
- Approval flows via Telegram

### Phase 3: Rich Interaction
- Attachment support
- Inline keyboards for confirmations
- Message editing for streaming updates
- Voice note transcription

## Acceptance Criteria

1. User can link Telegram from web chat end-to-end
2. Messages from Telegram + web appear in same timeline
3. Both chat and agency conversations work
4. All LLM calls visible in gateway logs + billing
5. telegramService has no provider API keys
6. Duplicate updates produce no duplicate messages
7. Unlinking immediately stops Telegram ingress
8. Delivery failures don't corrupt conversation history
9. Bot messages display in Thai for Thai users
10. Existing notification functionality unchanged
