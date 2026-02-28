# TelegramService Research - Current State (2026-02-27)

## Service Location
- Main service: `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts`
- tRPC router: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts`
- Notification orchestrator: `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts`

## Core Architecture

### telegramService.ts - Core Delivery Engine (455 lines)
**Responsibility**: Send formatted Telegram messages via Telegram Bot API

**Key exports**:
- `escapeHtml(text)` - Escape HTML for Telegram HTML parse mode (<, >, &)
- `formatTelegramMessage(notification, appUrl)` - Format notification with emoji, timestamp, button
- `sendTelegramMessage(token, chatId, text, parseMode, replyMarkup?)` - Call Bot API /sendMessage
- `enqueueTelegramNotification(db, userId, notification)` - Eligibility check → direct in-process send
- `getTelegramSettings(db)` - Load/cache from system_settings
- `clearTelegramCache()` - Invalidate cached settings
- `initializeTelegramQueue(db, redisConfig)` - Stub (in-process, no queue)
- `shutdownTelegramWorker()` - Stub

**In-Process Delivery** (key point):
- No BullMQ queue (migrated off in this version)
- Rate limiting: 25 msg/sec (module-level token bucket)
- Retry: exponential backoff up to 3 attempts
- Fire-and-forget: errors logged, don't throw
- Handles 429 (rate limit), 403 (bot blocked), network errors

**Rate Limiting**:
- 25 tokens/second (below Telegram's 30/sec limit)
- Token bucket with 1000ms window
- Single window refill (no leaky bucket)

**Retry Logic** (withRetry):
- Max 3 attempts with exponential backoff
- Respects Telegram's `retry-after` header for 429 errors
- Does NOT retry on "bot blocked" (throws immediately)

**Message Format**:
- HTML parse mode: `🔴 <b>Title</b>\n\nContent\n\n<i>Timestamp</i>`
- Priority emoji: critical=🔴, high=🟠, normal=🔵, low=⚪
- Inline button: "View in SmartSpecPro" → `/notifications`
- Truncate to 4000 chars (below Telegram's 4096 limit)

### telegram.ts Router - User & Admin Endpoints (569 lines)
**Responsibility**: tRPC endpoints for admin config and user linking

**Admin endpoints**:
- `getTelegramSettings()` - Mask sensitive values, show only last 4 chars of token
- `updateTelegramSettings(input)` - Upsert to system_settings, encrypt sensitive, auto-gen webhook_secret
- `testTelegramConnection()` - Call Bot API /getMe to verify token
- `registerWebhook()` - Call Bot API /setWebhook with app_url/webhook_secret

**User endpoints**:
- `generateTelegramLink(ctx)` - Gen 128-bit code → Redis (5min TTL) → return t.me/botname?start=code
- `checkTelegramStatus(ctx)` - Return linked/username/notifyLevel/deliveryFailing
- `unlinkTelegram(ctx)` - Clear all telegram fields + Redis failure counter
- `updateTelegramPreferences({notifyLevel})` - Preserve other userPreferences fields

**Webhook Structure** (referenced but not implemented in this file):
- Endpoint: `/api/webhook/telegram`
- Expected to receive Telegram updates (not yet implemented)
- Secret token stored encrypted in system_settings.webhook_secret

### notificationService.ts - Notification Dispatcher (111 lines)
**Responsibility**: Single point for creating notifications + enqueuing for all channels

**Main export**:
- `createNotification(params)` - Insert to user_notifications → fire-and-forget Telegram enqueue

**Flow**:
1. Insert notification into `user_notifications` table
2. Call `enqueueTelegramNotification()` (async, no await)
3. Return notificationId

**Params**:
- userId, type, title, content, priority (default="normal")
- Optional: conversationId, scheduledMessageId

## Database Integration

### users table - Telegram fields
```typescript
telegramChatId: varchar(64)        // Telegram chat ID (user ID)
telegramUsername: varchar(64)      // @username
telegramVerified: boolean           // Linking complete & verified
telegramVerifiedAt: timestamp       // When linking completed

userPreferences: json {
  telegramNotifyLevel?: "all" | "high_critical" | "critical_only" | "off"
  telegramDeliveryFailing?: boolean
}
```

### systemSettings table - Telegram config
```
category="telegram"
Keys:
  bot_token           → encrypt(token) with isSensitive=true
  bot_username        → plain text (@botname)
  app_url             → plain text (domain)
  enabled             → "true"/"false"
  webhook_secret      → encrypt(secret) with isSensitive=true (auto-generated)
```

### user_notifications table - Where notifications are stored
```typescript
id: serial (PK)
userId: integer (FK → users)
type: enum (scheduled_message | follow_request | alert | system | direct_message | urgent_message)
title: varchar(255)
content: text
priority: enum (low | normal | high | critical)
conversationId?: integer (FK)
scheduledMessageId?: integer (FK)
isRead: boolean
createdAt: timestamp
```

## Integration Points

### Server startup (apps/web/server/_core/index.ts)
- Line 39: Import service
- Line 723: `await initializeTelegramQueue(db, redisConfig)` - No-op

### Router registration (apps/web/server/routers.ts)
- Line 52: Import telegramRouter
- Line 1421: Register as `telegram: telegramRouter`

### Notification creation (anywhere in app)
- Call `createNotification({db, userId, type, title, content, priority})`
- Returns `{notificationId}`
- Automatically attempts Telegram delivery (fire-and-forget)

## Eligibility Filtering (enqueueTelegramNotification)
Message is sent IFF all true:
1. Telegram feature enabled in system_settings
2. User.telegramVerified === true
3. User has telegramChatId set
4. User.userPreferences.telegramNotifyLevel !== "off" && !== undefined
5. Priority level matches user's notify level:
   - "all" → send all
   - "high_critical" → only high|critical
   - "critical_only" → only critical
6. In-process rate limit passes (token bucket)

## Error Handling

### Bot blocked by user
- Detected: response status 403, description contains "bot was blocked"
- Action: Set user.telegramVerified = false (auto-unlink)
- Effect: Future notifications skip this user

### Rate limited (429)
- Parse `retry-after` header
- Wait that duration (or default 30s)
- Retry up to 3 times total

### Network errors
- Caught and logged
- Don't propagate (fire-and-forget)
- User not notified

### Settings missing
- Returns null from getTelegramSettings
- enqueueTelegramNotification silently skips user

## Missing/Incomplete

1. **Webhook handler** - `/api/webhook/telegram` route not implemented
   - Telegram won't send updates without this
   - Needed for /start command handling (user clicks deep link → verifies linking)

2. **Verification flow** - From `/start` code to user.telegramVerified=true
   - Deep link generated ✓
   - Code stored in Redis ✓
   - But webhook must handle incoming /start message

3. **Failure tracking** - `telegramDeliveryFailing` flag
   - Set when bot blocked
   - Set on repeated delivery failures
   - Not yet implemented (code references it but doesn't set)

4. **Tests coverage** - Good unit tests exist, but:
   - telegramService.test.ts: 509 lines (service logic)
   - telegram.test.ts: 415 lines (router procedures)
   - Integration tests: missing (end-to-end flow)

## Configuration in system_settings

Admin must configure before use:
1. Create Telegram bot via @BotFather
2. Get bot token (secret!)
3. Admin dashboard: Settings → Telegram → Enter token
4. Admin clicks "Test Connection" → verifies /getMe works
5. Admin clicks "Register Webhook" → calls /setWebhook
6. Users can then link via deep link

## Security Considerations

1. **Bot token**: Encrypted with LLM_ENCRYPTION_KEY in database
2. **Webhook secret**: Auto-generated 32-byte hex, encrypted, sent to Telegram
3. **Verification code**: 128-bit (32-char hex), stored in Redis with 5min TTL
4. **Rate limiting**: In-process only (not distributed); scales to single server
5. **Fire-and-forget**: Failures don't block notification creation

## Performance Characteristics

- **Settings cache**: Module-level, no TTL (invalidated manually)
- **Message send**: ~100-300ms per API call (Telegram latency)
- **Rate limit**: 25/sec enforces ~40ms gap between messages
- **Batch send**: NOT supported (one message at a time)

## Future Work Needed

1. Implement `/api/webhook/telegram` handler
2. Handle incoming /start messages to verify linking
3. Add delivery failure tracking (retry queue)
4. Support group/channel notifications
5. Distributed rate limiting (for multi-server setups)
6. Message edit/delete support
7. Inline buttons with callbacks
