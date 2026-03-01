I now have comprehensive context about the existing codebase. Let me produce the section content.

# Section 05: F01-A -- Channel Adapter Refactor

## Overview

This section extracts the Telegram-specific logic from `telegramService.ts`, `telegramWebhook.ts`, `channelGateway.ts`, and `deliveryQueue.ts` into a generic adapter pattern. The result is a `ChannelAdapter` interface, a singleton `ChannelAdapterRegistry`, a generalized webhook route, and adapter-aware delivery -- enabling sections 09 (WhatsApp/LINE), 12 (Channel Router), and 13 (Slack/Discord) to plug in without modifying gateway code.

## Dependencies

- **section-01-database** (must be completed first): Creates the `channel_connections` and `channel_credentials` tables that the adapter registry and data migration depend on. Also creates the `channel_connections` unique constraint on `(tenant_id, channel_type, external_user_id)`.

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/services/channelAdapters/types.ts` | **Create** | ChannelAdapter interface, ChannelCapabilities, ChatIngressEvent type extension |
| `apps/web/server/services/channelAdapters/registry.ts` | **Create** | Singleton ChannelAdapterRegistry |
| `apps/web/server/services/channelAdapters/telegram.ts` | **Create** | Telegram adapter implementing ChannelAdapter |
| `apps/web/server/services/channelAdapters/index.ts` | **Create** | Barrel export |
| `apps/web/server/routes/channelWebhook.ts` | **Create** | Generalized POST /webhooks/:channelType/:connectionId |
| `apps/web/server/services/channelGateway.ts` | **Modify** | Remove hardcoded Telegram references, use adapter registry |
| `apps/web/server/services/deliveryQueue.ts` | **Modify** | Add channelType to DeliveryJob, use adapter registry |
| `apps/web/shared/channelTypes.ts` | **Modify** | Extend channel type union, add channelType to DeliveryJob |
| `apps/web/server/services/__tests__/channelAdapterRegistry.test.ts` | **Create** | Registry tests |
| `apps/web/server/services/__tests__/telegramAdapter.test.ts` | **Create** | Telegram adapter tests |
| `apps/web/server/routes/__tests__/channelWebhook.test.ts` | **Create** | Webhook router tests |
| `apps/web/server/services/__tests__/channelGateway.test.ts` | **Modify** | Update for multi-adapter queries |
| `apps/web/server/services/__tests__/deliveryQueue.test.ts` | **Modify** | Update for adapter-aware delivery |
| `apps/web/scripts/migrate-telegram-to-channel-connections.ts` | **Create** | Data migration script |

---

## Tests (Write First)

All tests use Vitest with hoisted mocks following the established project conventions.

### Test File 1: `apps/web/server/services/__tests__/channelAdapterRegistry.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for the ChannelAdapterRegistry singleton.
 *
 * Covers:
 * - register() adds an adapter keyed by channelType
 * - get() returns the correct adapter for a given channelType
 * - get() returns undefined for an unregistered channelType
 * - getAll() returns all registered adapters
 * - duplicate registration for same channelType throws or overwrites
 *   (decide on policy during implementation)
 */

describe("ChannelAdapterRegistry", () => {
  // Reset registry state between tests (import fresh or call a reset method)

  it("register adds adapter and get retrieves it by channelType", () => {
    // Create a mock adapter with channelType: "telegram"
    // Call registry.register(adapter)
    // Expect registry.get("telegram") to return the adapter
  });

  it("get returns undefined for unregistered channelType", () => {
    // Expect registry.get("whatsapp") to be undefined when not registered
  });

  it("getAll returns all registered adapters", () => {
    // Register 2 adapters, expect getAll() to return both
  });
});
```

### Test File 2: `apps/web/server/services/__tests__/telegramAdapter.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Telegram ChannelAdapter implementation.
 *
 * Covers:
 * - validateWebhook uses timing-safe compare for the secret token header
 * - parseInbound returns correct ChatIngressEvent structure from Telegram update
 * - sendMessage wraps existing sendTelegramMessage function
 * - formatMessage splits text at 4096-char Telegram limit
 * - channelType property returns "telegram"
 * - capabilities returns correct Telegram limits
 */

describe("TelegramAdapter", () => {
  // Mock telegramService.sendTelegramMessage, crypto, systemSettings DB

  describe("validateWebhook", () => {
    it("returns true for valid X-Telegram-Bot-Api-Secret-Token header", () => {
      // Provide correct header, expect true
    });

    it("returns false for invalid secret token (timing-safe)", () => {
      // Provide wrong header, expect false
      // Verify crypto.timingSafeEqual was used
    });

    it("returns false when header is missing", () => {
      // No header, expect false
    });
  });

  describe("parseInbound", () => {
    it("returns correct ChatIngressEvent from Telegram message update", () => {
      // Provide a TelegramUpdate with message.text
      // Expect returned event to have correct eventId, channel.type="telegram",
      // message.text, channel.externalChatId, channel.externalMessageId
    });

    it("returns null for non-text messages", () => {
      // Provide update with photo but no text
      // Expect null or error indication
    });
  });

  describe("sendMessage", () => {
    it("delegates to sendTelegramMessage with correct args", () => {
      // Call adapter.sendMessage(connectionConfig, chatId, text)
      // Expect sendTelegramMessage called with botToken, chatId, text, "HTML"
    });
  });

  describe("formatMessage", () => {
    it("splits at 4096 chars for long messages", () => {
      // Provide 10000-char string
      // Expect array of chunks each <= 4096 chars
    });

    it("returns single chunk for short messages", () => {
      // Provide 100-char string
      // Expect array of length 1
    });
  });
});
```

### Test File 3: `apps/web/server/routes/__tests__/channelWebhook.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the generalized channel webhook route.
 *
 * Covers:
 * - POST /webhooks/telegram/:connectionId routes to telegram adapter
 * - POST /webhooks/whatsapp/:connectionId routes to whatsapp adapter (when registered)
 * - POST /webhooks/unknown/:connectionId returns 404
 * - Redis dedup prevents processing same update twice
 * - Webhook returns 200 immediately before async processing
 */

describe("channelWebhook router", () => {
  // Mock adapter registry, Redis cache client, channelGateway.ingest

  it("routes to correct adapter based on channelType param", () => {
    // POST /webhooks/telegram/conn-123 with valid body
    // Expect telegram adapter.validateWebhook and adapter.parseInbound called
  });

  it("returns 404 for unknown channelType", () => {
    // POST /webhooks/unknown/conn-123
    // Expect 404 response
  });

  it("returns 200 immediately before async processing", () => {
    // Ensure res.sendStatus(200) called before channelGateway.ingest
  });

  it("rejects duplicate updates via Redis NX dedup", () => {
    // First call: redis.set returns "OK", processing proceeds
    // Second call: redis.set returns null, processing skipped
  });

  it("rejects request when adapter.validateWebhook returns false", () => {
    // Mock adapter.validateWebhook to return false
    // Expect 403 response
  });
});
```

### Test File 4: Updated tests in existing files

**`apps/web/server/services/__tests__/channelGateway.test.ts`** -- Add/modify:

```typescript
// Add these tests to the existing channelGateway test suite:

describe("emitEgress (multi-adapter)", () => {
  it("queries bindings for all channel types, not just telegram", () => {
    // After refactor, the WHERE clause should NOT include
    // eq(conversationChannels.channelType, "telegram")
    // Verify the query returns bindings for any channelType
  });

  it("uses adapter registry for message formatting per channel type", () => {
    // Mock binding with channelType "whatsapp"
    // Expect adapter registry.get("whatsapp").formatMessage() called
  });
});

describe("deliveryQueue (adapter-aware)", () => {
  it("includes channelType in DeliveryJob", () => {
    // Verify enqueued job has channelType field
  });

  it("uses adapter.sendMessage instead of direct sendTelegramMessage", () => {
    // After refactor, processDeliveryJob should call
    // adapterRegistry.get(job.channelType).sendMessage()
  });

  it("falls back gracefully when adapter not found for channel type", () => {
    // job.channelType = "unknown_channel"
    // Expect UnrecoverableError, not crash
  });
});
```

### Test File 5: Data migration test

```typescript
/**
 * File: apps/web/scripts/__tests__/migrate-telegram-to-channel-connections.test.ts
 *
 * Tests for the telegramConnections -> channel_connections migration script.
 *
 * Covers:
 * - Rows correctly mapped with column transformations
 * - Row count matches after migration
 * - Unique constraint on (tenant_id, channel_type, external_user_id) enforced
 * - Duplicate rows handled gracefully (ON CONFLICT DO NOTHING or skip)
 */

describe("Telegram to channel_connections migration", () => {
  it("maps telegramConnections columns to channel_connections correctly", () => {
    // chatId -> external_chat_id
    // telegramUserId -> external_user_id  
    // botId -> connection_config.bot_id
    // channel_type hardcoded to "telegram"
    // activeChannelId -> active_channel_id
  });

  it("row count matches after migration", () => {
    // Count source rows, count dest rows, expect equal
  });

  it("unique constraint prevents duplicate entries", () => {
    // Insert same (tenant_id, "telegram", external_user_id) twice
    // Expect error or graceful skip
  });
});
```

---

## Implementation Details

### 5.1 Adapter Interface and Registry

#### `apps/web/server/services/channelAdapters/types.ts`

Define the `ChannelAdapter` interface that all channel adapters must implement. This is the contract that sections 09 (WhatsApp/LINE) and 13 (Slack/Discord) will implement.

```typescript
/**
 * ChannelAdapter — Interface for external messaging channel integrations.
 *
 * Each adapter handles the platform-specific protocol details while the
 * channelGateway and deliveryQueue work with this abstraction.
 */

export interface ChannelCapabilities {
  /** Maximum message length before splitting is required */
  maxMessageLength: number;
  /** Whether the platform supports inline buttons/keyboards */
  supportsButtons: boolean;
  /** Whether the platform supports rich text (HTML/Markdown) */
  supportsRichText: boolean;
  /** Whether the platform supports media attachments */
  supportsAttachments: boolean;
  /** Platform-specific rate limits (messages per second) */
  rateLimitPerSecond: number;
}

export interface ChannelAdapter {
  /** Unique channel type identifier (e.g., "telegram", "whatsapp", "line") */
  readonly channelType: string;

  /** Platform capabilities and limits */
  readonly capabilities: ChannelCapabilities;

  /**
   * Validate an incoming webhook request (signature/secret verification).
   * Must use timing-safe comparison for HMAC/secret checks.
   * @returns true if the request is authentic
   */
  validateWebhook(req: IncomingWebhookRequest): Promise<boolean>;

  /**
   * Parse the raw webhook body into a normalized ChatIngressEvent.
   * @returns The parsed event, or null if the message should be ignored
   *          (e.g., non-text media that isn't supported yet)
   */
  parseInbound(body: unknown, connectionId: string): Promise<ParsedInbound | null>;

  /**
   * Send a message to an external chat via this channel.
   * @param config - Channel-specific configuration (bot token, API keys, etc.)
   * @param externalChatId - The platform's chat/conversation identifier
   * @param text - The message content
   * @param options - Optional: reply markup, parse mode, etc.
   * @returns External message ID if available
   */
  sendMessage(
    config: Record<string, unknown>,
    externalChatId: string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<{ ok: boolean; externalMessageId?: string }>;

  /**
   * Format and split a message according to platform limits.
   * @returns Array of message chunks, each within the platform's size limit
   */
  formatMessage(text: string): string[];

  /**
   * Optional: Initialize adapter resources (connections, caches).
   * Called once at application startup.
   */
  initialize?(): Promise<void>;

  /**
   * Optional: Clean up adapter resources.
   * Called during graceful shutdown.
   */
  shutdown?(): Promise<void>;
}

export interface IncomingWebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  params: Record<string, string>;
}

export interface ParsedInbound {
  /** The normalized event for channelGateway.ingest() */
  event: Omit<import("@shared/channelTypes").ChatIngressEvent, "eventId" | "idempotencyKey">;
  /** Platform-specific dedup key (e.g., "tg:{botId}:{updateId}") */
  dedupKey: string;
}

export interface SendMessageOptions {
  parseMode?: "HTML" | "Markdown";
  replyMarkup?: unknown;
  replyToMessageId?: string;
}
```

The key design choices:
- `validateWebhook` takes a raw request object so each adapter can check platform-specific headers
- `parseInbound` returns a `ParsedInbound` with both the normalized event and a dedup key, since dedup key format varies by platform (Telegram uses `update_id`, WhatsApp uses `message_id`, etc.)
- `sendMessage` accepts a generic `config` record because each platform has different credential shapes (Telegram has `botToken`, WhatsApp has `accessToken` + `phoneNumberId`, etc.)
- `formatMessage` is separate from `sendMessage` so the gateway can split before enqueueing individual delivery jobs

#### `apps/web/server/services/channelAdapters/registry.ts`

Singleton registry where adapters self-register on initialization.

```typescript
/**
 * ChannelAdapterRegistry — Singleton that maps channelType strings
 * to their ChannelAdapter implementations.
 *
 * Adapters register themselves during app initialization.
 * The channelGateway and deliveryQueue use this to route messages
 * to the correct platform-specific handler.
 */

import type { ChannelAdapter } from "./types";
import { auditLogger } from "../auditLogger";

class ChannelAdapterRegistryImpl {
  private adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    /** Log registration, store in map keyed by adapter.channelType */
  }

  get(channelType: string): ChannelAdapter | undefined {
    /** Return adapter or undefined */
  }

  getAll(): ChannelAdapter[] {
    /** Return all registered adapters */
  }

  /** For testing: clear all registrations */
  _reset(): void {
    this.adapters.clear();
  }
}

export const adapterRegistry = new ChannelAdapterRegistryImpl();
```

If registration fails (e.g., adapter throws during `initialize()`), log an audit event with `eventType: "channel_adapter_registration_failed"` including the channel type and error message. The registry should not throw -- a failed adapter just won't be available.

#### `apps/web/server/services/channelAdapters/index.ts`

Barrel export:

```typescript
export { adapterRegistry } from "./registry";
export type { ChannelAdapter, ChannelCapabilities, ParsedInbound, SendMessageOptions } from "./types";
```

### 5.2 Telegram Adapter Extraction

#### `apps/web/server/services/channelAdapters/telegram.ts`

Extract Telegram-specific logic from three existing files into a single adapter class. This is a **refactor, not a rewrite** -- all existing behavior must be preserved.

Source mapping from existing code:

| Adapter Method | Source | Existing File |
|---------------|--------|---------------|
| `validateWebhook()` | X-Telegram-Bot-Api-Secret-Token validation (lines 193-211) | `apps/web/server/routes/telegramWebhook.ts` |
| `parseInbound()` | Update parsing (message extraction, chatId, text) | `apps/web/server/routes/telegramWebhook.ts` (lines 262-378) |
| `sendMessage()` | Wraps `sendTelegramMessage()` | `apps/web/server/services/telegramService.ts` (lines 181-249) |
| `formatMessage()` | HTML escape + chunking at 4096 chars | `apps/web/server/services/telegramService.ts` + `telegramRendering.ts` |

Key implementation details:

- **`validateWebhook()`**: Must use the existing `timingSafeCompare()` function from `telegramWebhook.ts` (lines 115-124). This pads both buffers to the same length and uses `crypto.timingSafeEqual()`. The webhook secret is loaded from `system_settings` (category "telegram", key "webhook_secret"), decrypted with `crypto.ts`.

- **`parseInbound()`**: Must handle the full Telegram update structure including `message`, `callback_query`, command routing (`/start`, `/help`, etc.), non-text message rejection, and rate limiting. The existing command handler registry (`handlers` map in `telegramWebhook.ts`) should remain accessible -- the adapter should either delegate command handling or expose it.

- **`sendMessage()`**: The `config` parameter will contain `{ botToken: string }` for Telegram. The method wraps the existing `sendTelegramMessage()` function which handles rate limiting, 429 retry-after, bot-blocked detection, and 10s timeout.

- **`formatMessage()`**: Uses the existing `splitForTelegram()` logic from `channelGateway.ts` (lines 308-326) and `renderForTelegram()` from `telegramRendering.ts`. Split boundary is 4096 characters, preferring newline boundaries.

- **`capabilities`**: `{ maxMessageLength: 4096, supportsButtons: true, supportsRichText: true, supportsAttachments: false, rateLimitPerSecond: 25 }`

The adapter registers itself with the registry on module load:

```typescript
import { adapterRegistry } from "./registry";

class TelegramAdapter implements ChannelAdapter {
  readonly channelType = "telegram";
  readonly capabilities: ChannelCapabilities = { /* ... */ };

  // ... method implementations
}

// Self-register
adapterRegistry.register(new TelegramAdapter());
```

The existing `telegramService.ts` file is NOT deleted -- it still handles notification delivery (non-chat bridge). Only the chat bridge-related functions are extracted and delegated to the adapter. `telegramWebhook.ts` remains but its route is aliased through the new generalized webhook route.

### 5.3 Webhook Router Generalization

#### `apps/web/server/routes/channelWebhook.ts`

Create a new Express router that handles all channel webhooks through a unified flow.

**Route**: `POST /webhooks/:channelType/:connectionId`

**Processing flow**:
1. Look up adapter from `adapterRegistry.get(channelType)` -- if not found, return 404
2. Call `adapter.validateWebhook(req)` -- if false, return 403
3. Call `adapter.parseInbound(req.body, connectionId)` -- if null, return 200 (ignored message type)
4. Redis dedup using `SET channel:dedup:{dedupKey} 1 EX 86400 NX` -- if null (duplicate), return 200
5. Return 200 immediately (all further processing is async)
6. Async: call `channelGateway.ingest(event)` with the parsed event

```typescript
/**
 * Generalized Channel Webhook Router
 *
 * POST /webhooks/:channelType/:connectionId
 *
 * Routes incoming webhooks to the correct ChannelAdapter based on
 * the channelType URL parameter. Platform-specific validation,
 * parsing, and dedup are delegated to the adapter.
 */

import { Router } from "express";
import { adapterRegistry } from "../services/channelAdapters";
import { getCacheClient } from "../services/redisClients";
import { channelGateway } from "../services/channelGateway";
import { auditLogger } from "../services/auditLogger";
import crypto from "crypto";

export function createChannelWebhookRouter(): Router {
  const router = Router();

  router.post("/:channelType/:connectionId", async (req, res) => {
    // 1. Resolve adapter
    // 2. Validate webhook
    // 3. Parse inbound
    // 4. Redis dedup
    // 5. Return 200
    // 6. Async: channelGateway.ingest(event)
  });

  return router;
}
```

**Backward compatibility**: The existing `POST /webhooks/telegram/:botId` route from `telegramWebhook.ts` should be kept as an alias. In the Express app setup (`apps/web/server/_core/index.ts`), register both:

```typescript
// New generalized route
app.use("/webhooks", createChannelWebhookRouter());
// Legacy Telegram route (kept for existing bot webhook URLs)
app.use("/webhooks/telegram", createTelegramWebhookRouter());
```

The legacy route continues to work because Telegram webhooks are configured with a specific URL pointing to `/webhooks/telegram/:botId`. Over time, new Telegram bots should use the generalized route with `connectionId` instead of `botId`.

### 5.4 Gateway Updates

#### Modify `apps/web/server/services/channelGateway.ts`

Three changes are required:

**Change 1: `ingest()` -- Use `channel_connections` table instead of `telegramConnections`**

The current `ingest()` function (line 83) queries `telegramConnections`. After the refactor, it should query the new `channel_connections` table (created by section-01). The connection lookup should work for any channel type, not just Telegram.

```typescript
// BEFORE (line 83-92):
const [connection] = await db.select().from(telegramConnections).where(/*...*/)

// AFTER:
const [connection] = await db.select().from(channelConnections).where(
  and(
    eq(channelConnections.id, connectionId),
    eq(channelConnections.tenantId, event.tenantId),
  )
)
```

Note: During the dual-write period, `ingest()` should first try `channel_connections`, then fall back to `telegramConnections` if not found. This ensures backward compatibility during migration.

**Change 2: `queryActiveBindings()` -- Remove hardcoded Telegram filter**

The current function (lines 272-304) filters `eq(conversationChannels.channelType, "telegram")`. Remove this filter so bindings for all channel types are returned. The delivery queue already has the `channelType` on each binding record and will use the adapter registry to route delivery.

```typescript
// BEFORE (line 285):
eq(conversationChannels.channelType, "telegram"),

// AFTER: Remove this line entirely. The query should return
// all active bindings regardless of channelType.
```

**Change 3: `emitEgress()` -- Use adapter registry for message formatting**

The current function (lines 250-251) calls `renderForTelegram(text)` directly. After refactor, it should look up the adapter for each binding's `channelType` and use `adapter.formatMessage()`:

```typescript
// BEFORE:
const text = event.rendering.plainText;
const chunks = renderForTelegram(text);

// AFTER:
const adapter = adapterRegistry.get(binding.channelType);
if (!adapter) {
  auditLogger.log({
    eventType: "channel_gateway_no_adapter",
    metadata: { channelType: binding.channelType, bindingId: binding.id },
  });
  continue;
}
const text = event.rendering.plainText;
const chunks = adapter.formatMessage(text);
```

Also update the `DeliveryJob` creation to include `channelType`:

```typescript
const job: DeliveryJob = {
  channelMessageId,
  chatId: binding.channelRefId,
  text: chunks[i],
  parseMode: "HTML",
  channelType: binding.channelType, // NEW
  conversationId: event.conversationId,
  tenantId: event.tenantId,
};
```

#### Modify `apps/web/shared/channelTypes.ts`

Update the type union for channel types and add `channelType` to `DeliveryJob`:

```typescript
// Update the channel type union in ChatIngressEvent.channel.type:
type: "web" | "telegram" | "whatsapp" | "line" | "slack" | "discord" | "widget";

// Same for ChatEgressTarget.channelType

// Add to DeliveryJob interface:
export interface DeliveryJob {
  channelMessageId: string;
  chatId: string;
  text: string;
  parseMode: "HTML";
  channelType: string;  // NEW: adapter routing key
  replyToMessageId?: string;
  conversationId: string;
  tenantId: string;
}
```

#### Modify `apps/web/server/services/deliveryQueue.ts`

Two changes:

**Change 1: Replace `sendTelegramMessage()` with adapter registry lookup**

In `processDeliveryJob()` (lines 91-196), replace the direct `sendTelegramMessage()` call with adapter-based routing:

```typescript
// BEFORE (line 138):
const result = await sendTelegramMessage(botToken, chatId, text, parseMode);

// AFTER:
const adapter = adapterRegistry.get(job.data.channelType);
if (!adapter) {
  throw new UnrecoverableError(`No adapter for channel type: ${job.data.channelType}`);
}

// Resolve credentials for this channel type
const config = await resolveChannelConfig(job.data.channelType, job.data.tenantId);
if (!config) {
  throw new UnrecoverableError("Channel credentials not available");
}

const result = await adapter.sendMessage(
  config,
  chatId,
  text,
  { parseMode },
);
```

**Change 2: Replace `resolveBotToken()` with generic `resolveChannelConfig()`**

The existing `resolveBotToken()` function (lines 37-68) is Telegram-specific. Replace it with a `resolveChannelConfig()` function that looks up credentials from the `channel_credentials` table (created by section-01) based on `channelType` and `tenantId`:

```typescript
async function resolveChannelConfig(
  channelType: string,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  // For backward compatibility during migration, Telegram still
  // falls back to system_settings if no channel_credentials entry
  if (channelType === "telegram") {
    return resolveTelegramConfig(tenantId);
  }

  // Generic: lookup from channel_credentials
  const db = await getDb();
  if (!db) return null;

  const [cred] = await db.select()
    .from(channelCredentials)
    .where(and(
      eq(channelCredentials.tenantId, tenantId),
      eq(channelCredentials.channelType, channelType),
      eq(channelCredentials.isActive, true),
    ))
    .limit(1);

  if (!cred) return null;

  return JSON.parse(decrypt(cred.credentialsEncrypted));
}
```

The existing DLQ handler, retry logic, permanent error detection, and rate limiting remain unchanged -- they are adapter-agnostic by design.

**Change 3: Rename queue name to be channel-generic**

```typescript
// BEFORE:
const QUEUE_NAME = "telegram-delivery";
const DLQ_NAME = "telegram-delivery-dlq";

// AFTER:
const QUEUE_NAME = "channel-delivery";
const DLQ_NAME = "channel-delivery-dlq";
```

Note: If there are pending jobs in the old "telegram-delivery" queue, they need to be drained first. Consider keeping the old worker alive briefly during deployment, or running both queue names temporarily.

### 5.5 Telegram Data Migration

#### `apps/web/scripts/migrate-telegram-to-channel-connections.ts`

A standalone script that copies data from `telegramConnections` to the new `channel_connections` table.

Column mapping:

| Source (telegramConnections) | Destination (channel_connections) |
|-------------------------------|-----------------------------------|
| `id` | `id` (preserve original) |
| `tenantId` | `tenant_id` |
| `userId` | `user_id` |
| `telegramChatId` | `external_chat_id` |
| `telegramUserId` | `external_user_id` |
| `botId` | `connection_config` (as `{ "bot_id": value }` JSONB) |
| (hardcoded) | `channel_type` = `"telegram"` |
| `status` | `status` |
| `activeChannelId` | `active_channel_id` |
| `linkedAt` | `created_at` |
| `lastSeenAt` | `last_seen_at` |
| `metadata` | `metadata` |

The script should:
1. Count rows in `telegramConnections` (log as baseline)
2. Query all rows from `telegramConnections`
3. For each row, INSERT into `channel_connections` with `ON CONFLICT DO NOTHING` (on the unique constraint)
4. Count rows in `channel_connections` where `channel_type = 'telegram'` (should match step 1)
5. Log summary: rows processed, rows inserted, rows skipped (duplicates)

```typescript
/**
 * Migration script: telegramConnections -> channel_connections
 *
 * Run with: npx tsx apps/web/scripts/migrate-telegram-to-channel-connections.ts
 *
 * Safe to run multiple times (ON CONFLICT DO NOTHING).
 * Does NOT delete source data -- dual-write period begins after this script.
 */
```

#### Dual-Write Setup

After the migration script runs successfully, enable dual-write in the Telegram connection creation flow. Any code that INSERTs into `telegramConnections` should also INSERT into `channel_connections` within the same transaction. The relevant code paths are:

- `apps/web/server/routes/telegramCommands.ts` -- the `/start` link handler that creates a `telegramConnections` row
- Any admin API that manages Telegram connections

The dual-write should be wrapped in a try-catch so that a failure writing to `channel_connections` does not break the primary Telegram flow. Log any dual-write failures as audit events.

The old `telegramConnections` table is NOT dropped in this phase. Deprecation happens in a later phase after all read paths have been migrated to `channel_connections`.

---

## Integration Points

### Express App Registration

In `apps/web/server/_core/index.ts`, register the new webhook route:

```typescript
import { createChannelWebhookRouter } from "../routes/channelWebhook";

// After existing route registrations:
app.use("/webhooks", createChannelWebhookRouter());
```

### Adapter Registration at Startup

The Telegram adapter self-registers when its module is imported. Ensure the adapter module is imported during app initialization:

```typescript
// In apps/web/server/_core/index.ts or a dedicated init file:
import "../services/channelAdapters/telegram"; // triggers self-registration
```

Future adapters (WhatsApp, LINE, Slack, Discord) follow the same pattern -- import their module and they self-register.

### Feature Flag Guard

All channel adapter functionality should be gated behind the `channelAdapters` feature flag (from section-14). If the flag is disabled for a tenant, the generalized webhook route returns 404 for that tenant's connections, and `emitEgress()` skips non-Telegram channels. Telegram continues to work regardless of the flag (backward compatibility).

---

## Verification Checklist

After implementation, verify:

1. Existing Telegram webhook (`POST /webhooks/telegram/:botId`) continues to work unchanged
2. New generalized webhook (`POST /webhooks/:channelType/:connectionId`) routes Telegram correctly
3. `channelGateway.emitEgress()` delivers to Telegram bindings as before
4. `deliveryQueue` processes jobs using the adapter registry
5. Data migration script runs idempotently (safe to re-run)
6. Row counts match between `telegramConnections` and `channel_connections` (telegram rows)
7. All existing tests pass with no regressions
8. New tests pass for adapter registry, telegram adapter, and webhook router

---

## As Built (Implementation Deviations)

### Code Review Fixes Applied

The following changes were made during the code review interview, deviating from the original plan:

**H1 — CSRF regex anchored:** Added `$` end anchor to CSRF bypass regex in `_core/index.ts`:
```typescript
/^\/webhooks\/[a-z]+\/[a-z0-9-]+$/.test(req.path)
```

**H2 — tenantId filter added:** `resolveChannelConfig()` now filters `channelCredentials` by `tenantId` to prevent cross-tenant credential leakage.

**M1 — Missing test added:** Added `processDeliveryJob (no adapter)` test to `deliveryQueue.test.ts`.

**M2 — Early return for empty conversationId:** `channelWebhook.ts` now returns early when `activeChannelId` is null, logging an audit event instead of passing empty string to gateway.

**M3 — Lifecycle hooks wired:** `_core/index.ts` now calls `adapter.initialize()` for all registered adapters at startup and `adapter.shutdown()` in SIGTERM/SIGINT handlers.

**M4 — Migration columns added:** `migrate-telegram-to-channel-connections.ts` now includes `lastSeenAt` and `metadata` in the INSERT.

**M5 — Dual-write implemented:** `telegramLinkService.ts` now dual-writes new connections to `channel_connections` inside the same transaction. Failure is non-critical (wrapped in try/catch) so it cannot break the link flow.

**L1 — Dead try/catch removed:** `registry.register()` no longer has a try/catch around `Map.prototype.set()` (which never throws).

**L2 — Explanatory comment added:** `ParsedInboundEvent` in `types.ts` has a comment explaining why it's intentionally narrower than `ChatIngressEvent`.

### Queue Drain Risk Accepted

Queue renamed `telegram-delivery` → `channel-delivery`. No drain script implemented. User accepted this as dev-only risk.

### Actual Test Count

- `channelAdapterRegistry.test.ts`: 6 tests
- `telegramAdapter.test.ts`: (tests for webhook validation, inbound parsing, sendMessage)
- `channelWebhook.test.ts`: 7 tests
- `channelGateway.test.ts`: updated (4 new multi-adapter tests added)
- `deliveryQueue.test.ts`: 12 tests (1 new: adapter-not-found case)

Total new/updated tests: 63 passing