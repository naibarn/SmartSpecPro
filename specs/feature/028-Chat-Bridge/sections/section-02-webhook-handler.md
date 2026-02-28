Section-01 has not been written yet, so I need to reference its expected outputs. Now I have all the information needed to generate the section content.

# Section 02: Webhook Handler

## Overview

This section creates the Express webhook endpoint at `POST /webhooks/telegram/:botId` that receives Telegram Bot API webhook updates. It handles secret validation, Redis deduplication, audit logging to `telegram_updates`, rate limiting, and command/message routing dispatch. The handler returns `200 OK` immediately and processes updates asynchronously.

## Dependencies

- **section-01-schema-migration**: Provides the `telegramUpdates` Drizzle table (columns: `id`, `botId`, `updateId`, `telegramChatId`, `receivedAt`, `processedAt`, `processingStatus`, `errorCode`, `errorReason`) with a UNIQUE constraint on `(botId, updateId)`. Also provides `telegramConnections` table used for connection lookups.
- **section-03-i18n-types**: Provides `telegramI18n.ts` for bilingual bot messages and `channelTypes.ts` for event interfaces. Until this section is complete, the webhook handler can use inline placeholder strings and a stub `getMessage()` function.

## Files to Create

### `/home/dev/projects/SmartSpecPro/apps/web/server/routes/telegramWebhook.ts`

The main webhook handler Express router. This is a new file.

### `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramWebhook.test.ts`

Unit tests for the webhook handler.

## Files to Modify

### `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Register the webhook route before tRPC middleware. Add CSRF bypass for the webhook path.

### `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts`

Update the `registerWebhook` mutation to use the new URL format and `allowed_updates`.

---

## Tests (Write First)

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramWebhook.test.ts`

Tests use Vitest and follow the same mocking patterns as existing test files (e.g., `telegram.test.ts`). The tests mock database, Redis, crypto, and the Telegram settings cache.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGetDb, mockCacheClient, mockDecrypt, mockGetTelegramSettings } = vi.hoisted(() => {
  return {
    mockGetDb: vi.fn(),
    mockCacheClient: {
      set: vi.fn(),
      get: vi.fn(),
    },
    mockDecrypt: vi.fn(),
    mockGetTelegramSettings: vi.fn(),
  };
});

// Mock modules (db, redis, crypto, telegramService settings)
vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../../services/redisClients", () => ({ getCacheClient: () => mockCacheClient }));
vi.mock("../../services/crypto", () => ({ decrypt: mockDecrypt }));
// Mock schema to provide table references
vi.mock("../../../drizzle/schema", () => ({
  telegramUpdates: { /* symbol columns */ },
  systemSettings: { category: Symbol("category"), key: Symbol("key") },
}));

// Import the router factory after mocks are set up
import { createTelegramWebhookRouter } from "../telegramWebhook";

describe("telegramWebhook", () => {
  // --- Webhook validation ---
  // Test: valid secret token returns 200
  // Test: invalid secret token returns 403
  // Test: missing secret token header returns 403
  // Test: missing bot settings returns 404 (or 200 with ignored status)

  // --- Dedupe ---
  // Test: first update_id processes normally (200 + async processing dispatched)
  // Test: duplicate update_id returns 200 but skips processing
  // Test: Redis SET NX called with correct key format "tg:update:{botId}:{updateId}" and 86400 TTL
  // Test: telegram_updates record created for audit trail

  // --- Command routing ---
  // Test: /start <token> dispatches to link handler
  // Test: /start (no token) dispatches to status handler
  // Test: /help dispatches to help handler
  // Test: /resume dispatches to resume handler
  // Test: /unlink dispatches to unlink handler
  // Test: /status dispatches to status handler
  // Test: plain text message dispatches to message handler
  // Test: callback_query update dispatches to callback handler

  // --- Rate limiting ---
  // Test: 30th message in 1 minute from same Telegram user is accepted
  // Test: 31st message in 1 minute from same Telegram user is rejected with rate limit reply

  // --- Non-text message handling ---
  // Test: photo message receives i18n error reply ("only text supported")
  // Test: voice message receives i18n error reply
  // Test: sticker message receives i18n error reply
  // Test: document message receives i18n error reply
});
```

Each test should create a mock Express request/response and call the router handler directly. Use `supertest` if a full Express app mock is preferred, but direct handler invocation is simpler and matches existing patterns.

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramWebhook.security.test.ts`

Security-focused tests for the webhook handler.

```typescript
import { describe, it, expect, vi } from "vitest";

describe("telegramWebhook security", () => {
  // Test: timing-safe comparison used for secret validation (no short-circuit)
  //   - Verify that crypto.timingSafeEqual is called, not === or ==

  // Test: failed validation logs to audit trail
  //   - Verify auditLogger.log is called with eventType and rejection metadata

  // Test: in-process rate limiter tracks per-Telegram-user counts
  //   - Verify counter map keys use telegramUserId, not chatId

  // Test: rate limit resets after 1 minute window
  //   - Advance timers by 60s, verify next message is accepted
});
```

---

## Implementation Details

### 1. Create the Webhook Router (`telegramWebhook.ts`)

The file exports a factory function `createTelegramWebhookRouter()` that returns an Express `Router`. This pattern matches the existing `createWebhookRouter()` in `/home/dev/projects/SmartSpecPro/apps/web/server/routes/webhooks.ts`.

**Route**: `POST /webhooks/telegram/:botId`

**Function signature**:

```typescript
import { Router } from "express";

export function createTelegramWebhookRouter(): Router {
  const router = Router();

  router.post("/:botId", async (req, res) => {
    // Implementation follows the steps below
  });

  return router;
}
```

**Step-by-step processing**:

1. **Extract botId** from `req.params.botId`.

2. **Load bot settings** from `systemSettings` where `category = 'telegram'`. Use the existing pattern from `telegramService.ts` -- load all telegram category settings into a Map, decrypt `webhook_secret`. If no settings found or Telegram is not enabled, return 200 (silently ignore, do not leak info).

3. **Validate the secret token** by reading the `X-Telegram-Bot-Api-Secret-Token` header. Compare against the decrypted `webhook_secret` using `crypto.timingSafeEqual()` (not string `===`) to prevent timing attacks. Both values must be converted to `Buffer` of equal length before comparison. If validation fails, log the attempt via `auditLogger.log()` and return 403.

   ```typescript
   import crypto from "crypto";
   
   function timingSafeCompare(a: string, b: string): boolean {
     if (a.length !== b.length) return false;
     return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
   }
   ```

4. **Parse the Telegram Update** from `req.body`. Extract `update_id`, `message`, and `callback_query` fields.

5. **Redis deduplication**: Call `getCacheClient().set("tg:update:{botId}:{updateId}", "1", "EX", 86400, "NX")`. The `getCacheClient()` function is imported from `redisClients.ts` (NOT `redis.ts` -- the cache client is the correct one for stateless short-lived operations). If the SET returns `null` (key already existed), this is a duplicate. Return 200 OK immediately.

6. **Return 200 OK** immediately. All further processing runs asynchronously (fire-and-forget with error logging).

7. **Insert audit record** into `telegram_updates` table:
   ```typescript
   await db.insert(telegramUpdates).values({
     id: crypto.randomUUID(),
     botId,
     updateId: BigInt(update.update_id),
     telegramChatId: message?.chat?.id?.toString() ?? null,
     receivedAt: new Date(),
     processingStatus: "accepted",
   });
   ```

8. **Rate limiting**: Maintain an in-process `Map<string, { count: number; windowStart: number }>` keyed by `telegramUserId`. Allow 30 messages per 60-second window. If exceeded, reply with an i18n rate limit message and insert the audit record with status `"ignored"`. The rate limiter is per-process, which is sufficient for the target scale (<100 users).

   ```typescript
   const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
   const RATE_LIMIT_MAX = 30;
   const RATE_LIMIT_WINDOW_MS = 60_000;
   
   function checkInboundRateLimit(userId: string): boolean {
     const now = Date.now();
     const entry = rateLimitMap.get(userId);
     if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
       rateLimitMap.set(userId, { count: 1, windowStart: now });
       return true;
     }
     if (entry.count >= RATE_LIMIT_MAX) return false;
     entry.count++;
     return true;
   }
   ```

9. **Route based on update type**:

   - If `callback_query` is present: dispatch to a callback handler (stub for section-09, which implements `/unlink` confirmation).
   - If `message.text` starts with `/`: parse as a command. Supported commands:
     - `/start <token>` -- dispatch to link handler (implemented in section-04)
     - `/start` (no token) -- dispatch to status info handler (section-09)
     - `/help` -- dispatch to help handler (section-09)
     - `/resume` -- dispatch to resume handler (section-09)
     - `/unlink` -- dispatch to unlink handler (section-09)
     - `/status` -- dispatch to status handler (section-09)
   - If `message.text` is present (plain text, no command): dispatch to the channel gateway ingestion handler (section-05).
   - If `message` has non-text content (photo, voice, sticker, document, video, audio, etc.): reply with i18n error message "Sorry, only text messages are supported at this time" (section-03 provides the string).

10. **Command/message dispatchers** are defined as pluggable handler functions so other sections can register their implementations:

    ```typescript
    export type WebhookCommandHandler = (ctx: WebhookContext) => Promise<void>;

    export interface WebhookContext {
      botId: string;
      update: TelegramUpdate;
      message: TelegramMessage;
      chatId: string;
      telegramUserId: string;
      languageCode: string | undefined;
      db: DrizzleDB;
      botToken: string;
    }

    // Handler registry -- other sections register handlers
    const handlers: Record<string, WebhookCommandHandler> = {};

    export function registerWebhookHandler(command: string, handler: WebhookCommandHandler): void {
      handlers[command] = handler;
    }
    ```

    Alternatively, for simplicity at this stage, the router can export a plain object of handler references that default to stub functions (logging "not implemented") and are replaced when later sections import and override them. The key point is that section-02 does NOT implement the command logic itself -- it only routes to handler stubs.

11. **Reply helper**: Create a small helper function that wraps `sendTelegramMessage()` from `telegramService.ts` for sending quick bot replies:

    ```typescript
    async function replyToChat(
      botToken: string,
      chatId: string,
      text: string
    ): Promise<void> {
      await sendTelegramMessage(botToken, chatId, text, "HTML");
    }
    ```

### 2. Telegram Update Type Definitions

Define minimal TypeScript interfaces for the Telegram Update object inline in the webhook file (or in a shared types file). Only the fields we actually use:

```typescript
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; language_code?: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  photo?: unknown[];
  voice?: unknown;
  sticker?: unknown;
  document?: unknown;
  video?: unknown;
  audio?: unknown;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number; language_code?: string };
  message?: TelegramMessage;
  data?: string;
}
```

### 3. Register Route in `_core/index.ts`

In `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`, add the webhook route registration. It must be placed:
- **After** `express.json()` middleware (the handler needs parsed JSON body)
- **Before** the tRPC middleware (webhook is not a tRPC endpoint)
- The CSRF check must **exclude** the webhook path (Telegram sends POSTs without an Origin header)

Add the CSRF bypass by extending the existing condition in the `csrfCheck` function (around line 220):

```typescript
// In the csrfCheck function, add this condition alongside the existing webhook bypasses:
if (
  req.path.startsWith("/webhooks/telegram/") ||
  req.originalUrl.startsWith("/webhooks/telegram/")
) {
  return next();
}
```

Add the route registration near line 331 (after `app.use("/api/webhooks", createWebhookRouter())` and before tRPC):

```typescript
import { createTelegramWebhookRouter } from "../routes/telegramWebhook";

// Telegram Bot API webhook (before tRPC, bypasses CSRF since Telegram sends raw POSTs)
app.use("/webhooks/telegram", createTelegramWebhookRouter());
```

### 4. Update `registerWebhook` Mutation URL Format

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts`, update the `registerWebhook` mutation (around line 301):

**Current code**:
```typescript
const webhookUrl = `${appUrl}/api/webhook/telegram`;
```

**New code**:
```typescript
// Get bot username for the webhook URL path
const botUsername = settingsMap.get("bot_username");
if (!botUsername) {
  return {
    success: false,
    error: "Bot username not configured. Please set bot username in Telegram settings.",
  };
}
const webhookUrl = `https://smartaihub.app/webhooks/telegram/${botUsername}`;
```

The URL uses the production domain `https://smartaihub.app` (per CLAUDE.md rules) instead of the configurable `appUrl`, because Telegram must reach the server via the public domain.

**Also update `allowed_updates`** in the same `setWebhook` call (around line 311):

**Current code**:
```typescript
allowed_updates: ["message"],
```

**New code**:
```typescript
allowed_updates: ["message", "callback_query"],
```

This is required for inline keyboard callbacks used by the `/unlink` confirmation flow (section-09).

---

## Architecture Notes

### Why `getCacheClient()` for Redis Dedupe

The codebase has three Redis client modules:
- `getCacheClient()` from `redisClients.ts` -- stateless, short-lived operations (rate limiting, locks, dedup). Has `maxRetriesPerRequest: 3`.
- `getRealtimeClient()` from `redisClients.ts` -- connection-oriented, BullMQ-compatible. Has `maxRetriesPerRequest: null`.
- `getRedisClient()` from `redis.ts` -- the legacy client used by existing telegram router for link codes.

The webhook dedupe `SET NX` is a stateless cache operation, so `getCacheClient()` is correct. The BullMQ delivery queue (section-06) uses `getRealtimeClient()`.

### Why Return 200 Before Processing

Telegram re-sends webhook updates if it does not receive a `200 OK` within a few seconds. By returning 200 immediately and processing asynchronously, we prevent Telegram from flooding us with retries during slow LLM calls (which can take 10-120 seconds). The Redis dedupe key ensures that even if Telegram does retry, the update is not processed twice.

### Handler Registration Pattern

The webhook handler uses a simple handler registry pattern to allow other sections to plug in command implementations without modifying this file. Section-04 registers the `/start` handler, section-09 registers `/resume`, `/unlink`, `/help`, `/status`, and section-05 registers the text message handler. If a command has no registered handler, the webhook handler replies with a generic "Unknown command" i18n message.

### Rate Limiter Scope

The in-process rate limiter is sufficient for the target scale (<100 users, <1K messages/day). It tracks per-`telegramUserId` (not per-chatId, since a single user could interact with the bot from multiple group chats). The window is 60 seconds with a maximum of 30 messages. The Map should be periodically cleaned of stale entries to prevent memory leaks -- a simple approach is to delete entries older than 2 minutes on each check.

---

## Verification Checklist

After implementing this section:

1. `POST /webhooks/telegram/:botId` with valid secret returns 200
2. `POST /webhooks/telegram/:botId` with invalid secret returns 403
3. Duplicate `update_id` values are silently ignored (200 returned)
4. `telegram_updates` table receives audit records
5. Redis key `tg:update:{botId}:{updateId}` is set with 86400s TTL
6. Command messages (`/start`, `/help`, etc.) are routed to the correct handler stub
7. Non-text messages receive a polite error reply
8. Rate limiting kicks in after 30 messages/minute from the same user
9. `registerWebhook` mutation now uses `https://smartaihub.app/webhooks/telegram/{botUsername}` URL format
10. `allowed_updates` includes `["message", "callback_query"]`
11. All existing Telegram tests pass (`pnpm test` in `apps/web`)
12. TypeScript check passes (`pnpm check` in `apps/web`)