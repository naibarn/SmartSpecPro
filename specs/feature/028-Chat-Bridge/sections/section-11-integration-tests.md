Now I have comprehensive context. Let me generate the section content.

# Section 11: Integration Tests

## Overview

This is the final section of the Chat Bridge feature. It provides end-to-end integration test suites that verify the full round-trip message flows, rendering correctness, regression safety, backward compatibility, and TypeScript type integrity across all previously implemented sections (01 through 10).

Unlike the unit tests defined within each individual section (which mock dependencies heavily), these integration tests wire multiple real modules together to verify cross-module contracts. They still mock external services (Telegram Bot API, Redis, PostgreSQL) but let the internal modules interact with each other.

## Dependencies

This section depends on **all** prior sections:

- **section-01-schema-migration**: All 5 Drizzle tables and column extensions must exist.
- **section-02-webhook-handler**: The Express webhook route at `POST /webhooks/telegram/:botId` must be registered and functional.
- **section-03-i18n-types**: `telegramI18n.ts` and `channelTypes.ts` must export their interfaces and message functions.
- **section-04-link-flow**: The `/start <token>` handler and `generateTelegramLink` extension must be implemented.
- **section-05-channel-gateway**: `channelGateway.ts` must export `ingest()`, `emitEgress()`, `sendTypingLoop()`, and `handleNonTextMessage()`.
- **section-06-delivery-queue**: `deliveryQueue.ts` must export `enqueueDelivery()`, `initDeliveryQueue()`, and `closeDeliveryQueue()`.
- **section-07-server-side-chat**: `processMessageServerSide()` must be functional within the channel gateway.
- **section-08-pipeline-hooks**: `chat.ts` and `agency.ts` must call `emitEgress()` after saving assistant messages. The `renderForTelegram()` function must be implemented.
- **section-09-telegram-commands**: `/resume`, `/unlink`, `/status`, `/help` commands must be implemented.
- **section-10-router-extensions**: tRPC endpoints (`bindConversation`, `unbindConversation`, `getConversationChannelStatus`, `adminListConnections`, `adminRevokeConnection`) must be functional.

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramWebhook.integration.test.ts` | Full round-trip integration tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/telegramRendering.test.ts` | Telegram HTML rendering + message splitting tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegram.compat.test.ts` | Backward compatibility tests |

## Files NOT to Create (Verification Only)

The following are existing test suites that must pass without modification after the Chat Bridge feature is complete. Running them is part of this section's validation checklist:

- All existing tests under `apps/web/server/routers/__tests__/`
- All existing tests under `apps/web/server/services/__tests__/`
- TypeScript type check (`pnpm check`)
- Full test suite (`pnpm test`)

---

## Tests First

### Test file 1: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramWebhook.integration.test.ts`

This file tests the full round-trip: a simulated Telegram webhook POST traverses the webhook handler, channel gateway, chat/agency pipeline, delivery queue enqueue, and delivery status tracking. It mocks only the outermost boundaries (HTTP calls to Telegram API, database driver, Redis client) and lets the internal module wiring work naturally.

The test follows the same `vi.mock` + `vi.hoisted` pattern established in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================
// Mock boundary: Database (Drizzle ORM)
// ============================================================
const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbTransaction,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbTransaction: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockDbTransaction,
  },
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockDbTransaction,
  })),
}));

// ============================================================
// Mock boundary: Redis (cache client for dedupe, realtime for BullMQ)
// ============================================================
const mockCacheSet = vi.fn();
const mockCacheGet = vi.fn();

vi.mock("../../services/redisClients", () => ({
  getCacheClient: vi.fn(() => ({
    set: mockCacheSet,
    get: mockCacheGet,
  })),
  getRealtimeClient: vi.fn(() => ({})),
}));

// ============================================================
// Mock boundary: Telegram Bot API (fetch calls)
// ============================================================
const mockFetch = vi.fn();

// ============================================================
// Mock boundary: BullMQ (queue + worker)
// ============================================================
const mockQueueAdd = vi.fn();
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

// ============================================================
// Mock boundary: LLM Gateway (for chat pipeline)
// ============================================================
const mockExecuteWithFallback = vi.fn();
vi.mock("../../services/llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

// ============================================================
// Mock boundary: Credit service
// ============================================================
const mockHasEnoughCredits = vi.fn();
const mockDeductCreditsForModel = vi.fn();
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCreditsForModel: mockDeductCreditsForModel,
  calculateCreditsForLLM: vi.fn().mockReturnValue(5),
}));

// ============================================================
// Mock boundary: Crypto (for webhook secret validation)
// ============================================================
vi.mock("../../services/crypto", () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

// ============================================================
// Mock: Schema table references (symbol columns for Drizzle)
// ============================================================
vi.mock("../../../drizzle/schema", () => ({
  telegramUpdates: {},
  telegramConnections: {},
  conversationChannels: {},
  channelMessages: {},
  telegramLinkTokens: {},
  messages: {},
  conversations: {},
  users: {},
  systemSettings: {},
}));

// Mock audit logger
vi.mock("../../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

describe("Telegram Chat Bridge - Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // Full round-trip: Telegram inbound -> chat pipeline -> delivery
  // ============================================================
  describe("Chat pipeline round-trip", () => {
    // Test: Telegram text message from linked user with active chat
    //       conversation binding -> user message saved with
    //       sourceChannel=telegram -> LLM called -> assistant message
    //       saved -> delivery job enqueued to BullMQ -> channel_messages
    //       record created with status 'pending'
    it("processes inbound Telegram message through chat pipeline end-to-end");

    // Test: Verify the saved user message includes correct source
    //       metadata (sourceChannel, sourceConnectionId, externalSourceId)
    it("saves sourceChannel metadata on the user message");

    // Test: Verify the LLM gateway receives correctly built context
    //       (conversation history, skill detection, system prompt)
    it("builds chat context correctly for Telegram-originated message");

    // Test: Verify credits are deducted after LLM response
    it("deducts credits for Telegram-originated LLM calls");

    // Test: Verify the delivery job enqueued to BullMQ has the correct
    //       shape (channelMessageId, chatId, HTML-formatted text, parseMode)
    it("enqueues delivery job with correct DeliveryJob shape");
  });

  // ============================================================
  // Full round-trip: Telegram inbound -> agency pipeline -> delivery
  // ============================================================
  describe("Agency pipeline round-trip", () => {
    // Test: Telegram text message from linked user with active agency
    //       conversation binding -> agency pipeline called ->
    //       response saved -> delivery job enqueued
    it("processes inbound Telegram message through agency pipeline end-to-end");

    // Test: Agency bridge receives correct parameters (agencyId,
    //       conversationId, message text, user token, tenantId)
    it("passes correct parameters to agencyBridge.executeRun");
  });

  // ============================================================
  // Webhook -> pipeline -> delivery wiring
  // ============================================================
  describe("Webhook to pipeline wiring", () => {
    // Test: POST /webhooks/telegram/:botId with valid text message
    //       from a linked user triggers the full pipeline.
    //       Verify: 200 response, async processing fires,
    //       channel_messages record exists after processing.
    it("webhook POST triggers async pipeline processing");

    // Test: Duplicate update_id is ignored (Redis NX returns false),
    //       no pipeline processing occurs, no delivery enqueued
    it("duplicate update_id skips pipeline entirely");

    // Test: Message from unlinked Telegram user receives i18n error
    //       reply and no pipeline processing
    it("unlinked user receives connection instructions");

    // Test: Message from linked user with no active conversation
    //       binding receives i18n error reply
    it("user with no active channel receives binding instructions");
  });

  // ============================================================
  // Outbound: Web UI -> pipeline hook -> Telegram delivery
  // ============================================================
  describe("Web-to-Telegram outbound flow", () => {
    // Test: When saveAssistantMessage is called on a conversation
    //       with an active Telegram binding, emitEgress fires and
    //       enqueues a delivery job
    it("saveAssistantMessage triggers Telegram delivery for bound conversations");

    // Test: When saveAssistantMessage is called on a conversation
    //       with NO Telegram binding, emitEgress returns early,
    //       no BullMQ job enqueued
    it("saveAssistantMessage skips delivery for unbound conversations");

    // Test: Agency sendMessage with active Telegram binding
    //       triggers delivery after response is saved
    it("agency sendMessage triggers Telegram delivery for bound conversations");
  });

  // ============================================================
  // Delivery queue error scenarios
  // ============================================================
  describe("Delivery error handling", () => {
    // Test: When Telegram API returns 403 (bot blocked), the
    //       channel_messages record is marked as 'failed' with
    //       failureCode 'bot_blocked', and no retry is attempted
    it("permanent failure (403) marks delivery as failed without retry");

    // Test: When Telegram API returns 429, the retry_after value
    //       is used for backoff delay and attempt does not count
    it("rate limit (429) uses retry_after and does not count as attempt");

    // Test: After 5 failed transient retries, job moves to DLQ
    //       and channel_messages is marked as 'failed'
    it("exhausted retries move job to DLQ");
  });

  // ============================================================
  // Typing indicator lifecycle
  // ============================================================
  describe("Typing indicator", () => {
    // Test: sendTypingLoop starts calling sendChatAction immediately
    //       and every 4 seconds until stop() is called
    it("sendTypingLoop fires at expected intervals");

    // Test: typing loop is stopped in finally block even if
    //       pipeline throws an error
    it("typing loop cleaned up on pipeline error");
  });

  // ============================================================
  // Non-text message handling
  // ============================================================
  describe("Non-text messages", () => {
    // Test: Photo message receives i18n unsupported_message_type reply
    //       and does NOT create any database record
    it("photo message receives polite rejection");

    // Test: Voice message receives i18n unsupported_message_type reply
    it("voice message receives polite rejection");

    // Test: Sticker message receives i18n unsupported_message_type reply
    it("sticker message receives polite rejection");
  });

  // ============================================================
  // Command integration
  // ============================================================
  describe("Command end-to-end", () => {
    // Test: /start <valid_token> creates connection + channel binding
    //       + sets user.telegramVerified + consumes token + replies
    //       with success message
    it("/start <token> completes full link flow");

    // Test: /resume with one active binding sets activeChannelId
    //       and replies with confirmation
    it("/resume with single binding activates it");

    // Test: /unlink with confirmation callback revokes connection
    //       and all channel bindings
    it("/unlink revokes connection and bindings after confirmation");

    // Test: /status shows correct active conversation info
    it("/status returns current conversation details");
  });
});
```

---

### Test file 2: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/telegramRendering.test.ts`

This file tests the `renderForTelegram()` function that converts canonical message content (which may contain markdown, code blocks, or long text) into Telegram-safe HTML chunks.

The rendering function is implemented as part of section-08 (pipeline hooks) at `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts` (or a separate utility file imported by the gateway). These tests verify its behavior in isolation.

```typescript
import { describe, it, expect } from "vitest";

// Import the rendering function from whichever module exports it.
// If it lives in channelGateway.ts:
// import { renderForTelegram } from "../channelGateway";
// If it's a separate utility:
// import { renderForTelegram } from "../telegramRendering";

describe("renderForTelegram", () => {
  // --- Markdown-to-HTML conversion ---

  // Test: **bold text** -> <b>bold text</b>
  it("converts markdown bold to <b> tags");

  // Test: *italic text* or _italic text_ -> <i>italic text</i>
  it("converts markdown italic to <i> tags");

  // Test: `inline code` -> <code>inline code</code>
  it("converts inline code to <code> tags");

  // Test: ```code block``` -> <pre>code block</pre>
  it("converts fenced code blocks to <pre> tags");

  // Test: markdown tables are stripped (Telegram does not support tables)
  it("strips unsupported markdown tables");

  // Test: markdown footnotes are stripped
  it("strips unsupported markdown footnotes");

  // --- HTML safety ---

  // Test: & in text -> &amp;
  // Test: < in text -> &lt;
  // Test: > in text -> &gt;
  it("escapes HTML special characters in text content");

  // Test: characters inside <b>/<i>/<code>/<pre> tags are NOT double-escaped
  it("does not double-escape within Telegram-supported tags");

  // --- Message length splitting ---

  // Test: message with exactly 4096 characters returns single-element array
  it("returns single chunk for message at 4096 char limit");

  // Test: message with 4097+ characters is split into multiple chunks
  it("splits message exceeding 4096 chars into multiple chunks");

  // Test: split happens at paragraph boundaries (double newline)
  //       rather than mid-word or mid-sentence
  it("splits at paragraph boundaries when possible");

  // Test: when no paragraph boundary exists within 4096 chars,
  //       splits at the last newline
  it("falls back to newline split when no paragraph boundary");

  // Test: split messages get truncation notice with web URL
  //       e.g., "[... continued at https://smartaihub.app/chat/123]"
  it("appends truncation notice with web URL to split messages");

  // --- Code block handling ---

  // Test: code block with >2000 chars is truncated at 2000 chars
  //       with a "[truncated]" notice
  it("truncates code blocks exceeding 2000 chars");

  // Test: code block truncation does not break HTML tags
  //       (the <pre> tag is properly closed)
  it("properly closes <pre> tag on truncated code blocks");

  // --- Edge cases ---

  // Test: empty string returns [""]
  it("handles empty string input");

  // Test: string with only whitespace returns the whitespace
  it("handles whitespace-only input");

  // Test: null/undefined content is handled gracefully
  it("handles null or undefined content gracefully");
});
```

---

### Test file 3: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegram.compat.test.ts`

This file verifies that the Chat Bridge feature maintains backward compatibility with the existing Telegram notification system and user-level fields.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock tRPC (same pattern as agency.test.ts) ---
vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

// --- Mock database ---
const { mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
}));

// Mock schema tables
vi.mock("../../../drizzle/schema", () => ({
  telegramConnections: {},
  conversationChannels: {},
  users: {},
  systemSettings: {},
}));

// Mock crypto, telegramService, redis, etc. as needed
vi.mock("../../services/crypto", () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  })),
}));

describe("Telegram backward compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // Dual-write: new table + legacy user fields
  // ============================================================
  describe("Connection creation dual-write", () => {
    // Test: When a telegram_connections record is created (via /start),
    //       users.telegramVerified is also set to true
    it("creating telegram_connections also sets users.telegramVerified = true");

    // Test: When a telegram_connections record is created,
    //       users.telegramChatId is set to the Telegram chat ID
    it("creating telegram_connections also sets users.telegramChatId");
  });

  describe("Connection revocation dual-write", () => {
    // Test: When telegram_connections.status is set to 'revoked',
    //       users.telegramVerified is set to false
    it("revoking telegram_connections clears users.telegramVerified");

    // Test: When connection is revoked, all conversation_channels
    //       with that connectionId are also set to state='revoked'
    it("revoking connection cascades to channel bindings");
  });

  // ============================================================
  // Existing API compatibility
  // ============================================================
  describe("checkTelegramStatus compatibility", () => {
    // Test: checkTelegramStatus returns correct status when user
    //       has a telegram_connections record (new path)
    it("returns linked status from telegram_connections table");

    // Test: checkTelegramStatus falls back to users.telegramVerified
    //       for users who were linked before the Chat Bridge migration
    it("falls back to users.telegramVerified for legacy users");

    // Test: checkTelegramStatus includes connection details and
    //       bound conversation count in response
    it("includes connection details and bound conversation count");
  });

  // ============================================================
  // Existing notification flow
  // ============================================================
  describe("Notification flow preservation", () => {
    // Test: The existing notification path
    //       (notificationService -> telegramService.sendTelegramMessage)
    //       continues to work. It does NOT use the BullMQ delivery queue.
    it("existing notification flow bypasses delivery queue");

    // Test: Existing telegram preferences (updateTelegramPreferences)
    //       still read/write from the same user-level fields
    it("existing telegram preferences still work");
  });

  // ============================================================
  // Existing tRPC endpoints
  // ============================================================
  describe("Existing endpoint preservation", () => {
    // Test: generateTelegramLink without conversationId still works
    //       (backward compatible -- only Redis, no telegram_link_tokens)
    it("generateTelegramLink works without conversationId (legacy mode)");

    // Test: unlinkTelegram clears both the new telegram_connections
    //       record AND the legacy users.telegramVerified field
    it("unlinkTelegram clears both new and legacy records");
  });
});
```

---

## Implementation Details

### Integration Test Architecture

The integration tests use a "boundary mock" strategy rather than a "unit mock" strategy. The boundary mocks sit at the edges of the system:

1. **Database boundary**: Mock the Drizzle `db` object with configurable chain-returns for `select().from().where()` etc. This lets the gateway, webhook handler, and router all interact with the same mock DB state.

2. **Redis boundary**: Mock `getCacheClient()` for dedupe operations and `getRealtimeClient()` for BullMQ.

3. **Telegram API boundary**: Mock `globalThis.fetch` to intercept calls to `api.telegram.org`.

4. **LLM Gateway boundary**: Mock `executeWithFallback` to return canned LLM responses without calling real providers.

5. **BullMQ boundary**: Mock the `Queue` and `Worker` constructors to capture enqueued jobs without running a real Redis queue.

Everything between these boundaries runs as real code -- the webhook handler parses the update, the channel gateway resolves connections and routes to pipelines, the delivery queue formats jobs.

### Setting Up DB Mock State

For round-trip tests, the mock DB needs to return consistent data across multiple queries within a single flow. The pattern is to set up a mock chain that returns the appropriate records based on which table is being queried.

A helper factory function builds the mock chain:

```typescript
/**
 * Helper to configure mockDbSelect for a sequence of queries.
 * Each call to db.select() returns the next result in the sequence.
 */
function setupDbQuerySequence(results: Array<{ from: string; rows: any[] }>) {
  // ... configure mockDbSelect to return a chainable object
  // that eventually resolves to the matching rows
}
```

For example, the chat round-trip test sets up:
1. Query for `telegramConnections` -> returns the active connection
2. Query for `conversationChannels` -> returns the active binding
3. Insert into `messages` -> returns the saved user message
4. Query for `conversations` -> returns the conversation (for context building)
5. Insert into `messages` -> returns the saved assistant message
6. Query for `conversationChannels` -> returns active Telegram binding (for emitEgress)
7. Insert into `channelMessages` -> returns the pending delivery record

### Rendering Test Fixtures

The rendering tests use string fixtures rather than mocks. Example fixture data:

- **Short message**: `"Hello, this is a **test** message with *italic* and \`code\`."` -- should produce valid Telegram HTML in a single chunk.
- **Long message**: A 5000-character string with paragraph breaks -- should split into two chunks at the paragraph boundary nearest to 4096.
- **Code-heavy message**: A message with a 3000-character code block -- should truncate the code block at 2000 characters.
- **Table message**: A message containing a markdown table -- the table should be stripped or converted to plain text.
- **Mixed formatting**: Bold, italic, code, and links intermixed -- all should convert correctly.

### Backward Compatibility Test Strategy

The compatibility tests verify that the Chat Bridge feature does not break the existing Telegram notification system. The key invariant is: **the existing `telegramService.sendTelegramMessage()` function is unchanged and the existing notification flow (`notificationService` -> `telegramService`) never touches the BullMQ delivery queue.**

The tests verify this by:
1. Confirming that `sendTelegramMessage` signatures and behavior are preserved.
2. Confirming that `users.telegramVerified` and `users.telegramChatId` are still written during connection creation (dual-write).
3. Confirming that `checkTelegramStatus` returns a response compatible with the existing web UI consumer.
4. Confirming that `generateTelegramLink` called without a `conversationId` follows the existing Redis-only path.

### Regression Verification Checklist

After all integration tests pass, the implementer must run the following commands to verify no regressions:

```bash
# 1. TypeScript type check -- all types must be valid
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check

# 2. Full test suite -- all existing tests must pass
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test

# 3. Specific existing test files that MUST pass unchanged:
#    - All tests in server/routers/__tests__/agency.test.ts
#    - All tests in server/services/__tests__/agencyBridge.test.ts
#    - All tests in server/services/__tests__/callLLMStructured.test.ts
#    - Any existing telegram-related tests (if they exist)

# 4. Python tests (for agency_messages column additions):
cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/test_agency_messages_channel.py -v
```

### Test Execution Order

The integration test file should be run after all unit tests from sections 01-10 pass. The recommended verification sequence:

1. Run schema tests (section-01): `pnpm vitest run server/routers/__tests__/telegramBridge.schema.test.ts`
2. Run webhook tests (section-02): `pnpm vitest run server/routes/__tests__/telegramWebhook.test.ts`
3. Run i18n tests (section-03): `pnpm vitest run server/services/__tests__/telegramI18n.test.ts`
4. Run link flow tests (section-04): `pnpm vitest run server/routes/__tests__/telegramWebhook.link.test.ts`
5. Run gateway tests (section-05): `pnpm vitest run server/services/__tests__/channelGateway.test.ts`
6. Run delivery queue tests (section-06): `pnpm vitest run server/services/__tests__/deliveryQueue.test.ts`
7. Run rendering tests (this section): `pnpm vitest run server/services/__tests__/telegramRendering.test.ts`
8. Run compatibility tests (this section): `pnpm vitest run server/routers/__tests__/telegram.compat.test.ts`
9. Run integration tests (this section): `pnpm vitest run server/routes/__tests__/telegramWebhook.integration.test.ts`
10. Run full suite: `pnpm test`
11. Run type check: `pnpm check`

### Post-Change Validation Mapping

These integration tests map directly to the acceptance criteria from the specification:

| Acceptance Criterion | Covered By |
|---|---|
| User can link Telegram from web chat end-to-end | `/start <token>` integration test |
| Messages from Telegram + web appear in same timeline | Chat pipeline round-trip + Web-to-Telegram outbound tests |
| Both chat and agency conversations work | Chat pipeline + Agency pipeline round-trip tests |
| All LLM calls visible in gateway logs + billing | Credit deduction test |
| telegramService has no provider API keys | Architecture validation (no LLM imports in telegramService) |
| Duplicate updates produce no duplicate messages | Webhook dedupe test |
| Unlinking immediately stops Telegram ingress | `/unlink` command integration test |
| Delivery failures do not corrupt conversation history | Delivery error handling tests |
| Bot messages display in Thai for Thai users | i18n tests (section-03) + non-text message tests |
| Existing notification functionality unchanged | Backward compatibility tests |

### Architecture Validation Test (Optional)

An additional static analysis test can verify the forbidden couplings defined in the specification:

```typescript
describe("Architecture constraints", () => {
  // Test: telegramService.ts does not import from llmRouter, llmQueue,
  //       or any LLM provider module
  it("telegramService has no LLM provider imports", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts",
      "utf-8"
    );
    expect(content).not.toMatch(/import.*llmRouter/);
    expect(content).not.toMatch(/import.*llmQueue/);
    expect(content).not.toMatch(/import.*openai/i);
    expect(content).not.toMatch(/import.*anthropic/i);
  });

  // Test: telegramService.ts does not import creditService directly
  it("telegramService has no direct credit service imports", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts",
      "utf-8"
    );
    expect(content).not.toMatch(/import.*creditService/);
  });
});
```

This test reads the source file as a string and asserts that forbidden imports do not appear. It is a lightweight way to enforce architectural boundaries without a dedicated linting rule.