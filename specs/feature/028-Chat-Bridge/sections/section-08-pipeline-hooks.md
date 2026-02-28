Now I have all the context needed. Let me generate the section content.

# Section 08: Pipeline Hooks -- Chat and Agency Fan-Out + Telegram Rendering

## Overview

This section hooks the existing chat and agency pipelines into the channel gateway so that outbound assistant messages are automatically delivered to linked Telegram users. It also creates the Telegram message rendering function that converts raw markdown/plain text into Telegram-safe HTML, splitting long messages at the 4096-character limit.

There are three distinct pieces of work:

1. **chat.ts hook** -- Add a `channelGateway.emitEgress()` call at the end of the `saveAssistantMessage` mutation. This fires after the assistant response is saved to the database (not after user message creation). The hook is conditional -- it only fires if the conversation has active channel bindings.

2. **agency.ts hook** -- Add a `channelGateway.emitEgress()` call at the end of the `sendMessage` mutation, after `agencyBridge.executeRun()` returns the response. Same conditional logic.

3. **Telegram rendering function** -- Create `renderForTelegram(content: string): string[]` that converts canonical message content to an array of Telegram-safe HTML strings (each <= 4096 chars). This is called by `channelGateway.emitEgress()` before enqueuing delivery jobs.

### Key Principle

The hooks are pass-through only. They do not modify the existing pipeline behavior. If `emitEgress` fails, the error is caught and logged -- it must never cause the web UI response to fail. The chat and agency pipelines remain fully functional even if the channel gateway is unavailable.

## Dependencies

- **section-05-channel-gateway**: The `channelGateway.emitEgress()` function must exist at `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts`. This section calls that function from the chat and agency routers.
- **section-06-delivery-queue**: The delivery queue must exist so that `emitEgress` can enqueue BullMQ jobs. If the queue is not initialized, `emitEgress` logs a warning and returns silently (no crash).
- **section-07-server-side-chat**: The `processMessageServerSide()` function (which also calls `emitEgress` internally) must exist. This section adds the complementary hook for web-originated messages.
- **section-01-schema-migration**: The `conversation_channels` and `channel_messages` tables must exist. The `messages` table must have the `sourceChannel` column.
- **section-03-i18n-types**: The `ChatEgressEvent` interface from `/home/dev/projects/SmartSpecPro/apps/web/shared/channelTypes.ts` must be defined.

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramRendering.ts` | Telegram HTML rendering + message splitting |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/telegramRendering.test.ts` | Rendering unit tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/chat.bridge.test.ts` | chat.ts fan-out hook tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.bridge.test.ts` | agency.ts fan-out hook tests |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts` | Add `emitEgress` hook after assistant message save in `saveAssistantMessage` mutation |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | Add `emitEgress` hook after `executeRun` returns in `sendMessage` mutation |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts` | Import and use `renderForTelegram` in `emitEgress` |

---

## Tests First

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/chat.bridge.test.ts`

This test file verifies the fan-out hook in `chat.ts`. It mocks the channel gateway and verifies that `emitEgress` is called conditionally based on whether the conversation has active channel bindings.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock channelGateway
vi.mock("../../services/channelGateway", () => ({
  channelGateway: {
    emitEgress: vi.fn().mockResolvedValue(undefined),
    hasActiveChannels: vi.fn().mockResolvedValue(false),
  },
}));

// Mock chatService
vi.mock("../../services/chatService", () => ({
  createMessage: vi.fn().mockResolvedValue({ id: 42, role: "assistant", content: "test" }),
  getConversationById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    model: "gpt-4",
    title: "Test",
  }),
  updateConversationCredits: vi.fn(),
}));

// Mock creditService
vi.mock("../../services/creditService", () => ({
  calculateCreditsForLLM: vi.fn().mockReturnValue(5),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
}));

// Mock auditLogger, abuseGuard, logger, etc. as needed by chat.ts
// (follow patterns from existing chat router tests)

describe("chat.ts bridge hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test: saveAssistantMessage calls emitEgress when conversation has active channels
  it("saveAssistantMessage calls emitEgress when conversation has active channels", async () => {
    // Arrange: mock hasActiveChannels to return true
    // Act: call saveAssistantMessage mutation via tRPC caller
    // Assert: channelGateway.emitEgress called with correct conversationId and messageId
  });

  // Test: saveAssistantMessage does NOT call emitEgress when conversation has no channels
  it("saveAssistantMessage does NOT call emitEgress when no active channels", async () => {
    // Arrange: mock hasActiveChannels to return false
    // Act: call saveAssistantMessage mutation
    // Assert: channelGateway.emitEgress NOT called
  });

  // Test: saveAssistantMessage still works normally (existing behavior preserved)
  it("saveAssistantMessage returns message id and credits even without channel hooks", async () => {
    // Arrange: normal mocks, hasActiveChannels returns false
    // Act: call saveAssistantMessage
    // Assert: returns { id, creditsUsed } as before
  });

  // Test: sendMessage accepts optional sourceChannel in input
  it("sendMessage accepts optional sourceChannel metadata", async () => {
    // Arrange: normal mocks
    // Act: call sendMessage with sourceChannel: "telegram"
    // Assert: createMessage called with sourceChannel in the message data
  });

  // Test: user message saved with sourceChannel metadata when provided
  it("user message includes sourceChannel when provided", async () => {
    // Arrange: normal mocks
    // Act: call sendMessage with sourceChannel: "telegram"
    // Assert: createMessage called with { sourceChannel: "telegram" }
  });
});
```

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.bridge.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock channelGateway
vi.mock("../../services/channelGateway", () => ({
  channelGateway: {
    emitEgress: vi.fn().mockResolvedValue(undefined),
    hasActiveChannels: vi.fn().mockResolvedValue(false),
  },
}));

// Mock agencyBridge
vi.mock("../../services/agencyBridge", () => ({
  agencyBridge: {
    executeRun: vi.fn().mockResolvedValue({
      status: "completed",
      messages: [{ role: "assistant", content: "Agency response" }],
    }),
  },
}));

// Mock db, schema, featureFlags as needed by agency.ts
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

describe("agency.ts bridge hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test: sendMessage calls emitEgress after agencyBridge.executeRun
  it("sendMessage calls emitEgress after executeRun completes", async () => {
    // Arrange: mock hasActiveChannels to return true
    //          mock agencyBridge.executeRun to return a response with messages
    //          mock db to return a valid conversation
    // Act: call sendMessage mutation
    // Assert: channelGateway.emitEgress called with the agency conversationId
  });

  // Test: sendMessage does NOT call emitEgress when no active channels
  it("sendMessage does NOT call emitEgress when no active channels", async () => {
    // Arrange: hasActiveChannels returns false
    // Act: call sendMessage mutation
    // Assert: channelGateway.emitEgress NOT called
  });

  // Test: agency pipeline still works normally (existing behavior preserved)
  it("agency sendMessage returns result even without channel hooks", async () => {
    // Arrange: hasActiveChannels returns false, executeRun returns result
    // Act: call sendMessage
    // Assert: returns the executeRun result unchanged
  });
});
```

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/telegramRendering.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { renderForTelegram } from "../telegramRendering";

describe("renderForTelegram", () => {
  // --- Markdown to HTML conversion ---

  it("converts markdown bold to <b> tags", () => {
    const result = renderForTelegram("This is **bold** text");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>bold</b>");
  });

  it("converts markdown italic to <i> tags", () => {
    const result = renderForTelegram("This is *italic* text");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<i>italic</i>");
  });

  it("converts code blocks to <pre> tags", () => {
    const result = renderForTelegram("```js\nconsole.log('hello');\n```");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<pre>");
    expect(result[0]).toContain("console.log");
  });

  it("converts inline code to <code> tags", () => {
    const result = renderForTelegram("Use `npm install` to install");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<code>npm install</code>");
  });

  // --- Unsupported markdown ---

  it("strips unsupported markdown (tables)", () => {
    const input = "| Header | Value |\n|--------|-------|\n| foo    | bar   |";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    // Should not contain pipe characters in a table format
    expect(result[0]).not.toContain("|--------|");
  });

  it("strips footnote references", () => {
    const input = "Some text[^1]\n\n[^1]: Footnote content";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toContain("[^1]");
  });

  // --- Message splitting ---

  it("returns single chunk for message <= 4096 chars", () => {
    const short = "Hello, world!";
    const result = renderForTelegram(short);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello, world!");
  });

  it("splits message > 4096 chars at paragraph boundaries", () => {
    // Create a message with multiple paragraphs that exceeds 4096 chars
    const paragraph = "A".repeat(2000);
    const input = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const result = renderForTelegram(input);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    });
  });

  it("split messages include truncation notice with web URL on last chunk", () => {
    const paragraph = "A".repeat(2000);
    const input = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const result = renderForTelegram(input, "https://smartaihub.app/chat/123");
    // If split into multiple chunks, the last chunk should not have truncation notice
    // but intermediate chunks should indicate continuation
    expect(result.length).toBeGreaterThan(1);
  });

  // --- Code block capping ---

  it("caps code blocks at 2000 chars with truncation notice", () => {
    const longCode = "x".repeat(3000);
    const input = "```\n" + longCode + "\n```";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<pre>");
    // The code inside <pre> should be truncated
    expect(result[0]).not.toContain("x".repeat(3000));
    expect(result[0]).toContain("...");
  });

  // --- HTML escaping ---

  it("escapes HTML special chars in text content", () => {
    const input = "Use <script> & \"quotes\" in content";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("&lt;script&gt;");
    expect(result[0]).toContain("&amp;");
  });

  // --- Edge cases ---

  it("handles empty string input", () => {
    const result = renderForTelegram("");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("");
  });

  it("handles plain text with no markdown", () => {
    const result = renderForTelegram("Just plain text, no formatting.");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Just plain text, no formatting.");
  });
});
```

---

## Implementation Details

### 1. Telegram Rendering Function

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramRendering.ts`

This module converts canonical message content (which may contain markdown) into Telegram-compatible HTML. Telegram supports a limited subset of HTML: `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<a>`, and `<tg-spoiler>`. All other HTML tags are stripped or cause errors.

#### Exported API

```typescript
/**
 * Converts markdown/plain text message content to Telegram-safe HTML.
 * Returns an array of strings, each <= 4096 characters (Telegram's limit).
 *
 * @param content - Raw message content (may contain markdown)
 * @param webUrl - Optional URL for "view full message" link when content is truncated
 * @returns Array of HTML-formatted strings ready for Telegram's parse_mode=HTML
 */
export function renderForTelegram(content: string, webUrl?: string): string[];
```

#### Conversion Rules

The function applies these transformations in order:

1. **HTML-escape raw text**: Replace `&` with `&amp;`, `<` with `&lt;`, `>` with `&gt;` in all text content (not inside code blocks, which are handled separately).

2. **Inline formatting**:
   - `**bold**` or `__bold__` becomes `<b>bold</b>`
   - `*italic*` or `_italic_` becomes `<i>italic</i>`
   - `` `inline code` `` becomes `<code>inline code</code>`

3. **Code blocks**:
   - ` ```language\ncode\n``` ` becomes `<pre>code</pre>`
   - Code block content is capped at 2000 characters. If truncated, append `\n... (truncated)` inside the `<pre>` tag.
   - Language hint after the opening backticks is stripped (Telegram does not support syntax highlighting).

4. **Unsupported markdown (strip)**:
   - Tables (lines with `|` separators and `---` dividers): Convert to plain text lines.
   - Footnote references (`[^1]`): Remove the reference markers.
   - Footnote definitions (`[^1]: ...`): Remove entire lines.
   - Horizontal rules (`---`, `***`): Remove.
   - Images (`![alt](url)`): Convert to text: `[Image: alt]` or just the alt text.
   - Headers (`# Header`): Strip the `#` prefix, keep the text. Optionally bold it.

5. **Links**: `[text](url)` becomes `<a href="url">text</a>` (Telegram supports this).

6. **Lists**: Preserve bullet/number markers as plain text (Telegram does not have list formatting).

#### Message Splitting Logic

After rendering to HTML, the function checks if the total length exceeds 4096 characters:

1. **If <= 4096**: Return as a single-element array.

2. **If > 4096**: Split at paragraph boundaries (double newline `\n\n`). Walk through paragraphs, accumulating into chunks. When adding the next paragraph would exceed 4096 chars, start a new chunk.

3. **If a single paragraph exceeds 4096**: Split at sentence boundaries (`. ` followed by a capital letter, or `\n`). As a last resort, split at the 4096-char boundary.

4. **Truncation notice**: If the message was split and a `webUrl` is provided, append a line to the final chunk: `\n\n<a href="{webUrl}">View full message in web app</a>`.

5. **Chunk numbering**: For multi-chunk messages, prepend each chunk (except the first) with `[{n}/{total}] ` for context.

#### Implementation Notes

- This is a pure function with no side effects or dependencies on external modules.
- Use simple regex-based conversion rather than a full markdown parser. The messages are LLM-generated and follow predictable patterns. A full parser (like `marked` or `remark`) would be overkill for this limited conversion.
- The function must be robust against malformed markdown (unclosed backticks, nested formatting, etc.). When in doubt, leave the text as-is rather than producing broken HTML.
- Telegram rejects messages with unclosed tags. The function should ensure all opened tags are closed.

#### Module Skeleton

```typescript
/**
 * Telegram Message Rendering
 *
 * Converts markdown/plain text to Telegram-safe HTML format.
 * Splits long messages at the 4096-character Telegram limit.
 */

const TELEGRAM_MAX_LENGTH = 4096;
const CODE_BLOCK_MAX_LENGTH = 2000;

/**
 * Escape HTML special characters in text.
 */
function escapeHtml(text: string): string {
  // Replace &, <, > with HTML entities
}

/**
 * Convert markdown formatting to Telegram HTML.
 */
function markdownToTelegramHtml(content: string): string {
  // 1. Extract and process code blocks (protect from other transformations)
  // 2. Escape HTML in non-code text
  // 3. Convert inline formatting (bold, italic, inline code)
  // 4. Convert links
  // 5. Strip unsupported elements (tables, footnotes, hrs)
  // 6. Re-insert processed code blocks
}

/**
 * Split a rendered HTML string into chunks of <= 4096 chars.
 */
function splitMessage(html: string, webUrl?: string): string[] {
  // Split at paragraph boundaries, then sentence boundaries if needed
}

export function renderForTelegram(content: string, webUrl?: string): string[] {
  if (!content) return [""];
  const html = markdownToTelegramHtml(content);
  return splitMessage(html, webUrl);
}
```

---

### 2. chat.ts Hook -- `saveAssistantMessage` Modification

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`

The `saveAssistantMessage` mutation currently (lines 694-759) verifies conversation ownership, calculates credits for tracking, updates conversation credits, creates the assistant message, and returns `{ id, creditsUsed }`.

#### What to Add

After the assistant message is created (after line 753: `const message = await createMessage({...});`), add a conditional fan-out call:

```typescript
// --- Channel bridge fan-out (section-08) ---
// Only fire if the conversation has active Telegram channel bindings.
// This is a fire-and-forget call -- errors must not affect the web response.
try {
  const { channelGateway } = await import("../services/channelGateway");
  const hasChannels = await channelGateway.hasActiveChannels(
    input.conversationId,
    "chat",
  );
  if (hasChannels) {
    // Fire async -- do not await in the response path if latency is a concern,
    // but awaiting is acceptable for correctness at our scale (<1K msgs/day).
    await channelGateway.emitEgress({
      eventId: crypto.randomUUID(),
      conversationId: String(input.conversationId),
      conversationType: "chat",
      messageId: String(message.id),
      tenantId: String(ctx.user.currentTenantId ?? ""),
      targets: [], // emitEgress resolves targets internally
      rendering: {
        plainText: input.content,
      },
    });
  }
} catch (err) {
  // Log but do not throw -- channel delivery failure must not break the web UI
  debugError("Chat", "emitEgress failed for saveAssistantMessage", err);
}
```

#### Import Changes to chat.ts

Add at the top of `chat.ts` (near the existing imports):

```typescript
// Channel bridge (conditional fan-out to Telegram)
// Uses dynamic import inside the hook to avoid circular dependencies
// and to keep the channel gateway optional (no crash if not deployed)
```

Note: The implementation uses `await import(...)` (dynamic import) rather than a top-level static import. This is intentional:
- It avoids circular dependency issues (channelGateway imports from chatService, chat.ts uses chatService)
- It makes the channel bridge optional -- if the gateway module does not exist or fails to load, the catch block handles it gracefully
- At our scale, the dynamic import overhead is negligible

#### `hasActiveChannels` Helper

The `channelGateway` module (from section-05) should export a `hasActiveChannels` helper that performs a fast existence check:

```typescript
/**
 * Fast check for whether a conversation has any active Telegram channel bindings.
 * Used by pipeline hooks to avoid constructing ChatEgressEvent when unnecessary.
 */
export async function hasActiveChannels(
  conversationId: number | string,
  conversationType: "chat" | "agency",
): Promise<boolean>;
```

Implementation: A simple `SELECT 1 FROM conversation_channels WHERE ... LIMIT 1` query. If this function does not exist yet in section-05's implementation, add it to the `channelGateway` exports as part of this section.

```typescript
async function hasActiveChannels(
  conversationId: number | string,
  conversationType: "chat" | "agency",
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const condition =
    conversationType === "chat"
      ? eq(conversationChannels.chatConversationId, Number(conversationId))
      : eq(conversationChannels.agencyConversationId, String(conversationId));

  const [row] = await db
    .select({ id: conversationChannels.id })
    .from(conversationChannels)
    .where(
      and(
        condition,
        eq(conversationChannels.channelType, "telegram"),
        eq(conversationChannels.state, "active"),
      ),
    )
    .limit(1);

  return !!row;
}
```

#### `sendMessage` Modification (Optional Metadata)

The `sendMessage` mutation (lines 629-689) currently accepts `conversationId`, `content`, and `attachments`. Extend the Zod input schema to accept an optional `sourceChannel`:

```typescript
// In the sendMessage input schema, add:
sourceChannel: z.enum(["web", "telegram", "system"]).optional(),
```

When saving the user message, include the `sourceChannel` if provided:

```typescript
const userMessage = await createMessage({
  conversationId: input.conversationId,
  role: "user",
  content: input.content,
  attachments: input.attachments || [],
  sourceChannel: input.sourceChannel, // undefined for web (backward compat)
});
```

This change is backward-compatible because `sourceChannel` is optional and the column is nullable. Web clients that do not send this field will have `null` in the database (existing behavior).

---

### 3. agency.ts Hook -- `sendMessage` Modification

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

The `sendMessage` mutation (lines 406-450) validates the conversation, calls `agencyBridge.executeRun()`, and returns the result.

#### What to Add

After `agencyBridge.executeRun()` returns (after line 447: `const result = await agencyBridge.executeRun({...});`), add the fan-out hook:

```typescript
// --- Channel bridge fan-out (section-08) ---
try {
  const { channelGateway } = await import("../services/channelGateway");
  const hasChannels = await channelGateway.hasActiveChannels(
    input.conversationId,
    "agency",
  );
  if (hasChannels && result.messages?.length) {
    // Find the last assistant message from the run result
    const lastAssistant = [...result.messages]
      .reverse()
      .find((m: any) => m.role === "assistant");
    if (lastAssistant) {
      await channelGateway.emitEgress({
        eventId: crypto.randomUUID(),
        conversationId: input.conversationId,
        conversationType: "agency",
        messageId: String(lastAssistant.id ?? ""),
        tenantId,
        targets: [], // emitEgress resolves targets internally
        rendering: {
          plainText: lastAssistant.content ?? "",
        },
      });
    }
  }
} catch (err) {
  // Log but do not throw
  console.error("[Agency] emitEgress failed:", err);
}
```

#### Import Changes to agency.ts

The `crypto` module is already imported at line 24 of agency.ts. No additional top-level imports are needed because the channel gateway uses a dynamic import.

#### Extracting the Last Assistant Message

The `agencyBridge.executeRun()` returns a result object that includes the messages from the agency run. The structure (from the existing agencyBridge implementation) includes a `messages` array. The hook needs to find the last assistant message to emit as egress. If the result does not contain messages (error case), the hook is skipped.

The exact shape of `result.messages` depends on the agencyBridge implementation (section from feature 027). The hook should defensively access `result.messages` and handle undefined/empty arrays gracefully.

---

### 4. channelGateway.ts Modifications

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts`

This section adds two things to the existing channel gateway module:

#### a. `hasActiveChannels` Export

Add the `hasActiveChannels` function described above to the `channelGateway` exported object:

```typescript
export const channelGateway = {
  ingest,
  emitEgress,
  sendTypingLoop,
  handleNonTextMessage,
  hasActiveChannels, // Added by section-08
};
```

#### b. Rendering Integration in `emitEgress`

The `emitEgress` function (from section-05) should use `renderForTelegram` when constructing `DeliveryJob` payloads. Modify the `emitEgress` implementation to:

1. Import `renderForTelegram` from `./telegramRendering`.
2. Before enqueuing each delivery job, render the message content:

```typescript
import { renderForTelegram } from "./telegramRendering";

// Inside emitEgress, when building delivery jobs:
const chunks = renderForTelegram(
  event.rendering.plainText,
  event.rendering.truncatedWebUrl,
);

// Enqueue one delivery job per chunk (for split messages)
for (let i = 0; i < chunks.length; i++) {
  const channelMessageId = crypto.randomUUID();
  // ... create channel_messages record ...
  await enqueueDelivery({
    channelMessageId,
    chatId: binding.channelRefId,
    text: chunks[i],
    parseMode: "HTML",
    conversationId: event.conversationId,
    tenantId: event.tenantId,
  });
}
```

If the message renders to multiple chunks, each chunk gets its own `channel_messages` record and delivery job. This ensures each chunk is independently retried on failure.

---

## Behavioral Details

### Conditional Fan-Out Logic

The fan-out hook in both `chat.ts` and `agency.ts` follows this decision tree:

1. **Check if channels exist**: Call `hasActiveChannels()`. This is a fast `SELECT 1 ... LIMIT 1` query. For conversations with no Telegram binding (the vast majority), this query returns immediately with no match.

2. **If no channels**: Skip entirely. No `ChatEgressEvent` is constructed, no rendering happens, no queue job is enqueued. This is the zero-overhead path for web-only conversations.

3. **If channels exist**: Construct the `ChatEgressEvent` and call `emitEgress()`. The gateway handles target resolution, rendering, and job enqueueing.

4. **Error isolation**: The entire hook is wrapped in try/catch. Any failure (gateway import error, DB error, queue error) is logged and swallowed. The web UI response is returned normally regardless of channel delivery status.

### Why `saveAssistantMessage` and Not `sendMessage`

For the chat pipeline, the hook is placed in `saveAssistantMessage` (not `sendMessage`) because:

- `sendMessage` only saves the user message. The LLM response has not been generated yet at that point.
- `saveAssistantMessage` is called after the streaming endpoint completes and the full assistant response is available.
- This ensures the Telegram user receives the complete response, not an empty or partial message.

For the agency pipeline, the hook is placed after `executeRun()` returns because the agency bridge handles the full request-response cycle synchronously (relative to the tRPC mutation).

### Message Content Source

The `rendering.plainText` field in `ChatEgressEvent` contains the raw assistant message content. For `chat.ts`, this is `input.content` (the content passed to `saveAssistantMessage`). For `agency.ts`, this is extracted from the last assistant message in the `executeRun` result.

The `renderForTelegram` function converts this plain text/markdown to Telegram HTML. The rendering happens inside `emitEgress`, not in the router hooks, to keep the hooks minimal.

### Backward Compatibility

- The `saveAssistantMessage` mutation's return type (`{ id, creditsUsed }`) is unchanged.
- The `sendMessage` mutation's return type in both chat.ts and agency.ts is unchanged.
- The `sendMessage` input schema gains an optional `sourceChannel` field, which is backward-compatible (existing callers that omit it continue to work).
- All existing tests should pass without modification because the channel gateway mock returns `false` for `hasActiveChannels` by default (no channels exist in test fixtures).

---

## Verification Checklist

After implementation:

1. Run the new test files:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/routers/__tests__/chat.bridge.test.ts
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/routers/__tests__/agency.bridge.test.ts
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/telegramRendering.test.ts
   ```

2. Run existing test suites to verify no regressions:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
   ```

3. Run TypeScript type check:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
   ```

4. Verify that the `saveAssistantMessage` mutation still returns `{ id, creditsUsed }` correctly.
5. Verify that the `agency.sendMessage` mutation still returns the `executeRun` result correctly.
6. Verify that the `renderForTelegram` function handles edge cases: empty strings, very long messages, malformed markdown, code blocks > 2000 chars.
7. Verify that the dynamic import of `channelGateway` in the router files does not cause circular dependency issues at runtime.