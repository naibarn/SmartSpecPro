I now have comprehensive context. Let me generate the section content.

# Section 07 -- Server-Side Chat Processing

## Overview

This section implements `processMessageServerSide()`, the core function that enables Telegram-originated messages to traverse the existing chat pipeline without a browser. In the web UI flow, `sendMessage` saves the user message, then the browser opens an SSE stream at `/api/llm/stream` which runs the LLM pipeline and streams tokens back. Since Telegram has no browser, this function combines the full pipeline into a single server-side call: save user message, build context, call LLM (non-streaming), save assistant message, deduct credits, and emit the response back through the channel gateway.

This function lives inside `apps/web/server/services/channelGateway.ts` (created by section-05). It reuses existing service functions rather than duplicating logic.

### Dependencies

- **section-01-schema-migration**: The `messages` table must have `sourceChannel`, `sourceConnectionId`, and `externalSourceId` columns. The `conversations` table must exist.
- **section-05-channel-gateway**: The `channelGateway.ts` service file must exist with `ingest()` and `emitEgress()` methods. This section adds `processMessageServerSide()` and `sendTypingLoop()` to that same file.

### What This Section Does NOT Cover

- Webhook handling (section-02)
- Delivery queue / BullMQ (section-06)
- Pipeline hooks in chat.ts and agency.ts (section-08)
- Telegram commands (section-09)

---

## Tests First

### Test file: `apps/web/server/services/__tests__/channelGateway.test.ts`

This file may already exist from section-05 (which tests `ingest` and `emitEgress`). The tests below should be **added** to the same file under new `describe` blocks for `processMessageServerSide` and `sendTypingLoop`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock modules BEFORE importing the module under test ---

// Mock chatService
vi.mock("../../services/chatService", () => ({
  createMessage: vi.fn(),
  getConversationById: vi.fn(),
  buildChatContext: vi.fn(),
  updateConversationCredits: vi.fn(),
}));

// Mock llmRouter
vi.mock("../../services/llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));

// Mock creditService
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCreditsForModel: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));

// Mock telegramService (for sendChatAction / typing indicator)
vi.mock("../../services/telegramService", () => ({
  // sendChatAction may not exist yet; the implementation may call
  // the Telegram API directly. Mock whatever the typing helper calls.
}));

// Mock channelGateway.emitEgress (we only test processMessageServerSide here)
// The actual emitEgress is tested in section-05.

// Mock auditLogger
vi.mock("../../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

// --- Import the module under test ---
// import { processMessageServerSide, sendTypingLoop } from "../channelGateway";
// import { createMessage, getConversationById, buildChatContext } from "../../services/chatService";
// import { executeWithFallback } from "../../services/llmRouter";
// import { hasEnoughCredits, deductCreditsForModel } from "../../services/creditService";

describe("processMessageServerSide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test: saves user message with sourceChannel="telegram" and sourceConnectionId
  it("saves user message with sourceChannel metadata", async () => {
    // Arrange: mock getConversationById to return a valid conversation
    // Arrange: mock hasEnoughCredits to return true
    // Arrange: mock createMessage to return a message object
    // Arrange: mock buildChatContext to return a context array
    // Arrange: mock executeWithFallback to return a success result
    // Arrange: mock deductCreditsForModel to return { creditsUsed: 5, wasFree: false }
    // Act: call processMessageServerSide(...)
    // Assert: createMessage called with sourceChannel: "telegram"
  });

  // Test: calls buildChatContext with correct conversationId, userId, and systemPrompt
  it("calls buildChatContext with correct conversation parameters", async () => {
    // Arrange: set up mocks for a chat conversation
    // Act: call processMessageServerSide(...)
    // Assert: buildChatContext called with (conversationId, userId, conversation.systemPrompt)
  });

  // Test: calls executeWithFallback with non-streaming mode and built context
  it("calls LLM gateway non-streaming with built context", async () => {
    // Arrange: buildChatContext returns [{ role: "system", content: "..." }, ...]
    // Act: call processMessageServerSide(...)
    // Assert: executeWithFallback called with { stream: false, messages: <context + user msg>, model: <conversation.model> }
  });

  // Test: saves assistant response via createMessage after LLM returns
  it("saves assistant response via createMessage", async () => {
    // Arrange: executeWithFallback returns success with content
    // Act: call processMessageServerSide(...)
    // Assert: createMessage called with role: "assistant", content from LLM response
  });

  // Test: deducts credits via deductCreditsForModel with correct token counts
  it("deducts credits via deductCreditsForModel", async () => {
    // Arrange: executeWithFallback returns usage { prompt_tokens, completion_tokens }
    // Act: call processMessageServerSide(...)
    // Assert: deductCreditsForModel called with correct inputTokens, outputTokens, model, sourceType: "chat"
  });

  // Test: calls emitEgress after saving assistant message (to deliver response to Telegram)
  it("calls emitEgress after saving assistant message", async () => {
    // Arrange: full happy path mocks
    // Act: call processMessageServerSide(...)
    // Assert: emitEgress called with { conversationId, messageId: <assistant message id>, tenantId }
  });

  // Test: handles LLM error gracefully -- saves error message, does not throw
  it("handles LLM error gracefully (saves error message)", async () => {
    // Arrange: executeWithFallback returns { type: "error", error: "Provider unavailable", statusCode: 503 }
    // Act: call processMessageServerSide(...)
    // Assert: createMessage called with role: "assistant", content containing error description
    // Assert: does NOT throw
  });

  // Test: returns error when user has insufficient credits
  it("handles insufficient credits (returns error, no LLM call)", async () => {
    // Arrange: hasEnoughCredits returns false
    // Act: call processMessageServerSide(...)
    // Assert: executeWithFallback NOT called
    // Assert: returns or saves an error message about insufficient credits
  });
});

describe("sendTypingLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test: calls the typing API every 4 seconds
  it("calls sendChatAction every 4 seconds", async () => {
    // Arrange: mock the Telegram API call for sendChatAction
    // Act: start sendTypingLoop(botToken, chatId)
    // Fast-forward 12 seconds
    // Assert: sendChatAction called 3 times
  });

  // Test: cleans up interval when stop() is called (normal completion)
  it("cleans up interval on completion", async () => {
    // Arrange: start a typing loop
    // Act: call the returned stop/cleanup function
    // Fast-forward 8 seconds
    // Assert: no more sendChatAction calls after stop
  });

  // Test: cleans up interval when error occurs
  it("cleans up interval on error", async () => {
    // Arrange: start a typing loop
    // Act: call the returned stop/cleanup function (simulating error cleanup in finally block)
    // Assert: interval cleared
  });
});
```

---

## Implementation Details

### File: `apps/web/server/services/channelGateway.ts`

This file is created by section-05. This section adds two new exported functions to it:

1. **`processMessageServerSide()`** -- the full server-side chat pipeline
2. **`sendTypingLoop()`** -- typing indicator helper

### `processMessageServerSide` Function

**Purpose**: Replace the browser-driven SSE streaming flow with a synchronous server-side pipeline for Telegram messages. This is the "glue" function that wires together existing services.

**Signature**:

```typescript
export interface ServerSideChatParams {
  conversationId: number;
  userId: number;
  tenantId: string;
  content: string;
  connectionId: string;       // telegram_connections.id for sourceConnectionId
  externalSourceId?: string;  // Telegram message_id as string
}

export interface ServerSideChatResult {
  success: boolean;
  assistantMessageId?: number;
  content?: string;
  creditsUsed?: number;
  error?: string;
}

export async function processMessageServerSide(
  params: ServerSideChatParams,
): Promise<ServerSideChatResult>;
```

**Step-by-step logic**:

1. **Validate conversation**: Call `getConversationById(params.conversationId, params.userId)` from `chatService.ts`. If not found, return `{ success: false, error: "Conversation not found" }`.

2. **Check credits**: Call `hasEnoughCredits(params.userId, estimatedCredits)` from `creditService.ts`. Estimate credits from `Math.ceil(params.content.length / 4)` input tokens and 0 output tokens using `calculateCreditsForLLM()`. If insufficient, return `{ success: false, error: "Insufficient credits" }`.

3. **Save user message**: Call `createMessage()` from `chatService.ts` with:
   - `conversationId`: params.conversationId
   - `role`: "user"
   - `content`: params.content
   - `sourceChannel`: "telegram"
   - `sourceConnectionId`: params.connectionId
   - `externalSourceId`: params.externalSourceId

4. **Build chat context**: Call `buildChatContext(params.conversationId, params.userId, conversation.systemPrompt)` from `chatService.ts`. This returns an array of `{ role, content }` messages including system prompt, entity memories, summaries, and recent messages.

5. **Call LLM (non-streaming)**: Call `executeWithFallback()` from `llmRouter.ts` with:
   - `model`: conversation.model or a sensible default (the existing LLM router resolves providers)
   - `messages`: the context from step 4 (the user message is already included via `buildChatContext` which reads recent messages including the one we just saved)
   - `stream`: false
   - `userId`: params.userId
   - `conversationId`: params.conversationId

6. **Handle LLM result**: The `executeWithFallback` function returns a discriminated union:
   - `type: "success"` -- extract `response.choices[0].message.content`, `response.usage.prompt_tokens`, `response.usage.completion_tokens`
   - `type: "error"` -- save an error message as assistant response
   - `type: "fallback_required"` -- for server-side processing, auto-accept the fallback provider (Telegram users cannot interactively approve fallbacks)

7. **Deduct credits**: Call `deductCreditsForModel()` from `creditService.ts` with:
   - `userId`, `model`, `provider` (from result), `inputTokens`, `outputTokens`
   - `costUsd` (from result if available)
   - `sourceType`: "chat"
   - `conversationId`

8. **Save assistant message**: Call `createMessage()` with:
   - `conversationId`: params.conversationId
   - `role`: "assistant"
   - `content`: the LLM response text
   - `inputTokens`, `outputTokens`, `creditsUsed`, `modelUsed`
   - `sourceChannel`: "telegram" (to indicate this response was generated server-side for a Telegram user)

9. **Update conversation credits**: Call `updateConversationCredits(params.conversationId, creditsUsed)` for tracking.

10. **Emit egress**: Call `emitEgress()` (the function from section-05 in the same file) to fan out the assistant response to any active Telegram channel bindings. This is what triggers delivery back to the Telegram user.

11. **Return result**: `{ success: true, assistantMessageId, content, creditsUsed }`.

**Error handling**: Wrap the entire LLM call + save sequence in a try/catch. On any error:
- Log the error with `auditLogger`
- Save a user-friendly error message as the assistant response (so the conversation doesn't have a dangling user message with no response)
- Return `{ success: false, error: <message> }`

**Important implementation note regarding `buildChatContext` timing**: After saving the user message in step 3, calling `buildChatContext` in step 4 will include that user message in the "recent messages" section (it reads the last 20 messages from the DB). This means you should NOT manually append the user message to the context array -- it will already be there. Verify this by checking that `buildChatContext` calls `getRecentMessages()` which reads from the database.

### `sendTypingLoop` Function

**Purpose**: Keep Telegram's "typing..." indicator visible while the LLM processes the request. Telegram's typing indicator expires after ~5 seconds, so this sends `sendChatAction('typing')` every 4 seconds.

**Signature**:

```typescript
export function sendTypingLoop(
  botToken: string,
  chatId: string,
): { stop: () => void };
```

**Implementation**:

1. Call `sendChatAction(botToken, chatId, 'typing')` immediately on start.
2. Set up a `setInterval` that calls `sendChatAction` every 4000ms.
3. Return a `{ stop }` object. When `stop()` is called, clear the interval.
4. The caller uses this in a try/finally pattern:

```typescript
const typing = sendTypingLoop(botToken, chatId);
try {
  const result = await processMessageServerSide(params);
  // ... handle result
} finally {
  typing.stop();
}
```

**The `sendChatAction` helper**: If the existing `telegramService.ts` does not export a `sendChatAction` function (grep shows it does not currently exist), create a small helper -- either inline in `channelGateway.ts` or as a new export in `telegramService.ts`. It is a simple POST to `https://api.telegram.org/bot{token}/sendChatAction` with body `{ chat_id, action: "typing" }`. Fire-and-forget (ignore errors -- typing indicators are cosmetic).

```typescript
async function sendChatAction(
  botToken: string,
  chatId: string,
  action: string,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // Ignore -- typing indicator is cosmetic
  }
}
```

### Integration With Channel Gateway `ingest()`

The `ingest()` function from section-05 routes messages based on `conversationType`. When `conversationType === "chat"`, it should call `processMessageServerSide()` (this section). The call site in `ingest()` should look approximately like:

```typescript
// Inside ingest(), after validation and conversation resolution:
if (event.conversationType === "chat") {
  const typing = sendTypingLoop(botToken, event.telegramChatId);
  try {
    const result = await processMessageServerSide({
      conversationId: event.conversationId as number,
      userId: connection.userId,
      tenantId: connection.tenantId,
      content: event.text,
      connectionId: event.connectionId,
      externalSourceId: event.externalMessageId,
    });
    if (!result.success) {
      // Reply with error message to Telegram user
    }
  } finally {
    typing.stop();
  }
}
```

For `conversationType === "agency"`, the `ingest()` function calls `agencyBridge.executeRun()` instead (handled in section-05/section-08). The typing loop pattern is the same -- wrap the agency call in `sendTypingLoop` try/finally.

### Key Imports and Dependencies

The `processMessageServerSide` function imports from these existing modules:

| Import | From | Purpose |
|--------|------|---------|
| `createMessage` | `../services/chatService` | Save user and assistant messages |
| `getConversationById` | `../services/chatService` | Validate conversation ownership |
| `buildChatContext` | `../services/chatService` | Build LLM context (system prompt, memory, history) |
| `updateConversationCredits` | `../services/chatService` | Track credits per conversation |
| `executeWithFallback` | `../services/llmRouter` | Route LLM call through multi-provider system |
| `hasEnoughCredits` | `../services/creditService` | Pre-flight credit check |
| `deductCreditsForModel` | `../services/creditService` | Post-response credit deduction |
| `calculateCreditsForLLM` | `../services/creditService` | Estimate credits for pre-flight check |
| `auditLogger` | `../services/auditLogger` | Error logging |

### Handling the `fallback_required` Result

When `executeWithFallback` returns `type: "fallback_required"`, the web UI shows a dialog asking the user to approve switching to a more expensive provider. For Telegram, there is no interactive approval flow. Two options:

**Option A (recommended)**: Auto-accept the fallback. Re-call `executeWithFallback` with `preferredProvider` set to the suggested provider ID. This means Telegram users may occasionally use a more expensive provider, but the message will always get a response.

**Option B**: Return an error message explaining that the preferred provider is unavailable. The user can try again later.

Use Option A for better UX. The credit deduction will correctly reflect the actual provider used.

### Edge Cases

1. **Empty LLM response**: If the LLM returns an empty string or null content, save a fallback message like "I couldn't generate a response. Please try again." and return `{ success: true }` (so the conversation state is consistent).

2. **Very long user messages**: The `content` field is validated upstream (max 100,000 chars in the web UI). For Telegram, messages are capped at 4,096 chars by Telegram itself, so no additional validation is needed.

3. **Conversation model not set**: If `conversation.model` is null/undefined, use a default model. The existing `executeWithFallback` handles model resolution, so passing undefined is acceptable -- it will use the system default.

4. **Concurrent messages**: If a user sends multiple Telegram messages rapidly, each will create its own `processMessageServerSide` call. The `buildChatContext` function reads the latest 20 messages, so context will be consistent. There is no locking needed -- the existing chat pipeline handles concurrent messages the same way.

---

## Verification Checklist

After implementing this section:

1. Run the new tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/channelGateway.test.ts`
2. Run TypeScript check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
3. Run full test suite to check for regressions: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
4. Verify that `processMessageServerSide` correctly reuses `buildChatContext`, `executeWithFallback`, `deductCreditsForModel`, and `createMessage` -- no logic duplication from `chat.ts` or `llmRoutesHandler.ts`
5. Verify that `sendTypingLoop` properly cleans up its interval in all cases (normal completion, error, timeout)