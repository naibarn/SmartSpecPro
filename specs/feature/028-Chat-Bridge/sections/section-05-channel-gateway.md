Now I have all the context needed. Let me generate the section content.

# Section 05: Channel Gateway

## Overview

This section creates the core Channel Gateway service at `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts`. The gateway is the transport-agnostic message bus that normalizes inbound messages from any channel (currently Telegram, future-proofed for LINE/WhatsApp/Slack) into the existing chat or agency pipelines, and fans out outbound assistant responses to all active channel bindings for a conversation.

The gateway has two primary methods:
- **`ingest(event: ChatIngressEvent)`** -- Validates the sender's connection, resolves the target conversation from `activeChannelId`, and routes to either the regular chat pipeline or the agency pipeline.
- **`emitEgress(event: ChatEgressEvent)`** -- Queries `conversation_channels` for all active bindings on a conversation, and enqueues BullMQ delivery jobs for each Telegram target.

It also provides helper functions:
- **`sendTypingLoop(chatId, botToken)`** -- Sends Telegram "typing..." indicator every 4 seconds, cleaned up in a `finally` block.
- **Non-text message handler** -- Replies with an i18n error when photos/voice/stickers/documents are received.

## Dependencies

- **section-01-schema-migration**: All database tables must exist (`telegram_connections`, `conversation_channels`, `channel_messages`, `agencyConversations`, `conversations`). The schema column `telegram_connections.activeChannelId` is read by the gateway to determine which conversation receives inbound messages.
- **section-03-i18n-types**: The `ChatIngressEvent` and `ChatEgressEvent` interfaces from `/home/dev/projects/SmartSpecPro/apps/web/shared/channelTypes.ts` and the i18n module from `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramI18n.ts` must be available.
- **section-06-delivery-queue**: The BullMQ delivery queue at `/home/dev/projects/SmartSpecPro/apps/web/server/services/deliveryQueue.ts` must be available for `emitEgress` to enqueue outbound jobs. The gateway imports an `enqueueDelivery(job: DeliveryJob)` function from the delivery queue module. If section-06 is not yet implemented, a stub that logs and no-ops is sufficient.

## Files to Create

### `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts`

The main service module.

### `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/channelGateway.test.ts`

Test file (details below).

---

## Tests FIRST

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/channelGateway.test.ts`

This test file mocks the database (Drizzle), the delivery queue, the `telegramService.sendTelegramMessage` function, the i18n module, and the chat/agency pipelines. It follows the existing mock patterns established in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyBridge.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock dependencies ---

// Mock the database module
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  getDb: vi.fn(),
}));

// Mock the delivery queue
vi.mock("../deliveryQueue", () => ({
  enqueueDelivery: vi.fn().mockResolvedValue(undefined),
}));

// Mock telegramService (sendTelegramMessage and sendChatAction)
vi.mock("../telegramService", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue({ ok: true, messageId: 123 }),
  getTelegramSettings: vi.fn().mockResolvedValue({
    botToken: "test-bot-token",
    botUsername: "testbot",
    appUrl: "https://smartaihub.app",
    enabled: true,
  }),
}));

// Mock telegramI18n
vi.mock("../telegramI18n", () => ({
  getMessage: vi.fn((_key: string, _lang?: string) => "Mocked i18n message"),
}));

// Mock chatService (for processMessageServerSide dependencies)
vi.mock("../chatService", () => ({
  createMessage: vi.fn().mockResolvedValue({ id: 1, role: "user", content: "test" }),
  buildChatContext: vi.fn().mockResolvedValue([]),
  getConversationById: vi.fn(),
}));

// Mock creditService
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  calculateCreditsForLLM: vi.fn().mockReturnValue(1),
  deductCredits: vi.fn().mockResolvedValue(undefined),
}));

import { channelGateway } from "../channelGateway";
import { enqueueDelivery } from "../deliveryQueue";

describe("channelGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Inbound (ingest) ---

  describe("ingest", () => {
    // Test: ingest routes chat-type event to chat pipeline
    it("routes chat-type event to chat pipeline", async () => {
      // Arrange: mock DB to return active connection with activeChannelId
      //   that points to a conversation_channels record of type "chat"
      // Act: call channelGateway.ingest(chatIngressEvent)
      // Assert: chat pipeline function was called with correct conversationId
    });

    // Test: ingest routes agency-type event to agency pipeline
    it("routes agency-type event to agency pipeline", async () => {
      // Arrange: mock DB to return active connection with activeChannelId
      //   that points to a conversation_channels record of type "agency"
      // Act: call channelGateway.ingest(agencyIngressEvent)
      // Assert: agency pipeline function was called
    });

    // Test: ingest rejects event with invalid connectionId
    it("rejects event with invalid connectionId", async () => {
      // Arrange: mock DB to return no connection
      // Act + Assert: ingest throws or returns error
    });

    // Test: ingest rejects event with revoked connection
    it("rejects event with revoked connection", async () => {
      // Arrange: mock DB to return connection with status "revoked"
      // Act + Assert: ingest rejects
    });

    // Test: ingest rejects event with no active channel binding
    it("rejects event with no active channel binding", async () => {
      // Arrange: mock DB to return active connection but no activeChannelId
      // Act + Assert: ingest returns error indicating no bound conversation
    });

    // Test: ingest sets sourceChannel=telegram on saved user message
    it("sets sourceChannel=telegram on saved user message", async () => {
      // Arrange: mock full path (connection + channel + chat pipeline)
      // Assert: createMessage called with sourceChannel: "telegram"
    });
  });

  // --- Outbound (emitEgress) ---

  describe("emitEgress", () => {
    // Test: emitEgress queries conversation_channels for active bindings
    it("queries conversation_channels for active bindings", async () => {
      // Arrange: mock DB to return active telegram binding
      // Act: call emitEgress with conversationId
      // Assert: DB queried with correct conversation + state filter
    });

    // Test: emitEgress enqueues BullMQ job for each Telegram binding
    it("enqueues BullMQ job for each Telegram binding", async () => {
      // Arrange: mock DB to return 2 active telegram bindings
      // Act: call emitEgress
      // Assert: enqueueDelivery called twice with correct job data
    });

    // Test: emitEgress skips web-only conversations (no Telegram binding)
    it("skips web-only conversations (no Telegram binding)", async () => {
      // Arrange: mock DB to return empty array for conversation_channels
      // Act: call emitEgress
      // Assert: enqueueDelivery NOT called
    });

    // Test: emitEgress skips revoked/paused channels
    it("skips revoked/paused channels", async () => {
      // Arrange: mock DB to return only revoked channels
      // Act: call emitEgress
      // Assert: enqueueDelivery NOT called
    });

    // Test: emitEgress uses deterministic job ID to prevent duplicate enqueue
    it("uses deterministic job ID to prevent duplicate enqueue", async () => {
      // Arrange: mock DB to return active telegram binding
      // Act: call emitEgress with a known messageId
      // Assert: enqueueDelivery called with jobId containing channelMessageId
    });
  });

  // --- Typing Indicator ---

  describe("sendTypingLoop", () => {
    // Test: sendTypingLoop calls sendChatAction every 4 seconds
    it("calls sendChatAction every 4 seconds", async () => {
      // Use vi.useFakeTimers() to advance time
      // Assert fetch called with sendChatAction body
    });

    // Test: sendTypingLoop cleans up interval on completion
    it("cleans up interval on completion", async () => {
      // Start typing loop, then call the stop function
      // Assert no more sendChatAction calls after stop
    });

    // Test: sendTypingLoop cleans up interval on error
    it("cleans up interval on error even when sendChatAction fails", async () => {
      // Mock sendChatAction to throw
      // Assert interval still cleaned up (no unhandled interval leak)
    });
  });

  // --- Non-text message handling ---

  describe("handleNonTextMessage", () => {
    // Test: non-text messages (photo/voice/sticker) receive i18n error reply
    it("replies with i18n error for non-text messages", async () => {
      // Act: call handleNonTextMessage with photo update
      // Assert: sendTelegramMessage called with i18n error text
    });

    // Test: non-text messages do not create canonical messages
    it("does not create canonical messages for non-text types", async () => {
      // Act: call handleNonTextMessage
      // Assert: createMessage NOT called
    });
  });
});
```

---

## Implementation Details

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts`

#### Module Structure

The channel gateway is a stateless service module exporting a singleton object `channelGateway` with the following methods:

```typescript
/**
 * Channel Gateway Service
 *
 * Transport-agnostic message bus that normalizes inbound messages
 * from external channels (Telegram, future LINE/WhatsApp) into
 * the existing chat or agency pipelines, and fans out outbound
 * assistant responses to all active channel bindings.
 */

import type { ChatIngressEvent, ChatEgressEvent, DeliveryJob } from "@shared/channelTypes";
// ... other imports

export const channelGateway = {
  ingest,
  emitEgress,
  sendTypingLoop,
  handleNonTextMessage,
};
```

#### `ingest(event: ChatIngressEvent): Promise<IngestResult>`

This is the main inbound entry point. Steps:

1. **Validate connection**: Query `telegram_connections` by `event.connectionId`. Reject if not found or `status !== 'active'`.

2. **Resolve active channel**: Read `connection.activeChannelId`. If null, return an error result indicating no conversation is bound (the caller -- the webhook handler -- sends an i18n message to the user).

3. **Load channel binding**: Query `conversation_channels` by `id = activeChannelId` with `state = 'active'`. If not found or not active, return error.

4. **Route by conversation type**: Based on `channel.conversationType`:
   - `"chat"`: Route to the chat pipeline. The actual LLM processing is handled by `processMessageServerSide()` (implemented in section-07). For this section, define the routing logic and call signature. If section-07 is not yet implemented, the function can be a stub that saves the user message only.
   - `"agency"`: Route to the agency pipeline by calling `agencyBridge.executeRun()` with the message content and resolved agency/conversation IDs. The agency conversation's `agencyId` is looked up from `agencyConversations` table.

5. **Set source metadata**: When saving the user message (for chat type), include `sourceChannel: "telegram"`, `sourceConnectionId: event.connectionId`, and `externalSourceId: event.externalMessageId`.

6. **Call emitEgress**: After the pipeline completes and the assistant response is saved, call `emitEgress()` to fan out the response to other channels (including back to Telegram for the sender).

The function returns an `IngestResult` object:

```typescript
interface IngestResult {
  ok: boolean;
  error?: string;
  errorCode?: "no_connection" | "revoked" | "no_channel" | "pipeline_error";
  responseMessageId?: string;
}
```

#### `emitEgress(event: ChatEgressEvent): Promise<void>`

The outbound fan-out handler. Steps:

1. **Query bindings**: Query `conversation_channels` where the relevant conversation ID matches (using `chatConversationId` for chat type or `agencyConversationId` for agency type), `state = 'active'`, `syncMode IN ('two_way', 'notify_only')`, and `channelType = 'telegram'`.

2. **Skip if no bindings**: If no active Telegram bindings exist, return immediately. This is the fast path for web-only conversations (no DB write, no queue enqueue).

3. **For each Telegram binding**:
   a. Create a `channel_messages` record with `deliveryStatus: 'pending'`.
   b. Build a `DeliveryJob` object with the `channelMessageId`, the Telegram `chatId` (from the binding's connection), the rendered message text, and `parseMode: "HTML"`.
   c. Call `enqueueDelivery(job)` from the delivery queue module. The job ID is deterministic: `tg-deliver-${channelMessageId}` to prevent duplicate enqueue.

4. **Message rendering**: Before enqueuing, the raw message content is passed through a rendering function (implemented in section-08 as part of the pipeline hooks). For this section, the gateway accepts pre-rendered text or uses a simple pass-through. The rendering function signature is:

```typescript
function renderForTelegram(content: string): string[]
```

This returns an array of strings (split at 4096-char Telegram limit boundaries). If the content is short enough, the array has a single element.

#### `sendTypingLoop(chatId: string, botToken: string): { stop: () => void }`

A helper that starts a `setInterval` loop calling Telegram's `sendChatAction` API with action `"typing"` every 4 seconds. Returns an object with a `stop()` method that clears the interval.

Implementation details:
- Uses `fetch` to call `https://api.telegram.org/bot${botToken}/sendChatAction` directly (lightweight, no need for the full `sendTelegramMessage` wrapper).
- The interval fires immediately on creation (first typing indicator), then every 4000ms.
- Errors from `sendChatAction` are silently caught and logged (typing indicators are best-effort -- a failed indicator should not crash the pipeline).
- The caller wraps the pipeline call in a `try/finally` block that calls `stop()`.

Usage pattern in the webhook handler:

```typescript
const typing = channelGateway.sendTypingLoop(chatId, botToken);
try {
  const result = await channelGateway.ingest(event);
  // ...
} finally {
  typing.stop();
}
```

#### `handleNonTextMessage(chatId: string, botToken: string, languageCode?: string): Promise<void>`

Sends a polite i18n error message when the user sends a non-text message type (photo, voice, sticker, document, video, etc.) to the bot.

Steps:
1. Get the localized error string from `telegramI18n.getMessage("unsupported_message_type", languageCode)`.
2. Call `sendTelegramMessage(botToken, chatId, text, "HTML")` to deliver the error.
3. Do NOT create any canonical message in the database -- non-text messages are silently rejected.

### Tenant Isolation in Gateway Queries

The gateway does NOT query conversations directly for tenant isolation. Instead:
- `telegram_connections.tenantId` is the authoritative tenant source (set at link time from the user's `currentTenantId`).
- All `conversation_channels` queries join through `connectionId` to get the tenant context.
- The `conversations` table has no `tenantId` column -- isolation is through `userId`. The `agencyConversations` table also has no `tenantId`.

### Database Query Patterns

The gateway uses Drizzle ORM query patterns consistent with the rest of the codebase. Example query for resolving a connection:

```typescript
import { db } from "../db";
import { telegramConnections, conversationChannels, channelMessages } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Resolve connection
const [connection] = await db
  .select()
  .from(telegramConnections)
  .where(
    and(
      eq(telegramConnections.id, event.connectionId),
      eq(telegramConnections.status, "active"),
    )
  )
  .limit(1);
```

Example query for active channel bindings (emitEgress):

```typescript
// For chat conversations
const bindings = await db
  .select()
  .from(conversationChannels)
  .where(
    and(
      eq(conversationChannels.chatConversationId, conversationId),
      eq(conversationChannels.channelType, "telegram"),
      eq(conversationChannels.state, "active"),
    )
  );
```

### Redis Client Selection

The channel gateway itself does not use Redis directly. Redis usage is in:
- **Webhook handler** (section-02): `getCacheClient()` for dedupe SET NX.
- **Delivery queue** (section-06): `getRealtimeClient()` for BullMQ.

### Error Handling Strategy

The gateway uses a result-based error pattern (not thrown exceptions) for expected failures like "no connection" or "no channel binding". Unexpected failures (DB errors, network errors) are caught, logged, and returned as `{ ok: false, error: "..." }`. This allows the webhook handler to send appropriate i18n error messages to the Telegram user without crashing the async processing loop.

For `emitEgress`, errors are logged but do not propagate -- a failed delivery enqueue should not cause the web UI response to fail. The delivery queue's retry mechanism handles transient failures.

### Import Structure

The gateway imports from these modules (all within the existing codebase):

```typescript
// Database
import { db } from "../db";
import {
  telegramConnections,
  conversationChannels,
  channelMessages,
  agencyConversations,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Shared types (from section-03)
import type { ChatIngressEvent, ChatEgressEvent, DeliveryJob } from "@shared/channelTypes";

// Delivery queue (from section-06)
import { enqueueDelivery } from "./deliveryQueue";

// Telegram service (existing)
import { sendTelegramMessage } from "./telegramService";

// I18n (from section-03)
import { getMessage } from "./telegramI18n";

// Agency bridge (existing)
import { agencyBridge } from "./agencyBridge";

// Logger (existing)
import { debugLog, debugError } from "../_core/logger";

// UUID generation
import crypto from "crypto";
```

### Future-Proofing

The gateway is designed to be channel-agnostic. The `channelType` field in `conversation_channels` determines where to deliver. Currently only `"telegram"` is implemented, but the `emitEgress` loop structure supports adding `"line"`, `"whatsapp"`, or `"slack"` delivery paths in the future by adding cases to the channel-type dispatch.

The `ChatIngressEvent` and `ChatEgressEvent` interfaces (from section-03) include a `channel` field that carries channel-specific metadata without the gateway needing to understand channel internals.

---

## Post-Implementation Checklist

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- channelGateway` to verify all gateway tests pass.
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` to verify TypeScript types are valid.
3. Verify that the gateway module exports are importable from the webhook handler (section-02) and the pipeline hook locations (section-08).
4. Confirm that the `conversation_channels` and `telegram_connections` table queries match the schema defined in section-01 (column names, types, FK relationships).