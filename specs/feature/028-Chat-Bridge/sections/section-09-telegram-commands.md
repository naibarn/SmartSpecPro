Now I have all the context needed. Let me generate the complete section content for section-09-telegram-commands.

# Section 09: Telegram Commands

## Overview

This section implements the interactive Telegram bot commands that allow users to manage their chat bridge session directly from Telegram. The commands are: `/resume` (select active conversation), `/unlink` (disconnect Telegram account with inline keyboard confirmation), `/status` (show current connection info), `/help` (list available commands), and `/start` with no token (show welcome/status when user is already linked). All command responses use the bilingual i18n module for Thai and English output.

These command handlers are registered with the webhook handler's command dispatch system (created in section-02) and plug into the data structures created by the link flow (section-04).

## Dependencies

- **section-01-schema-migration**: Provides all database tables (`telegram_connections`, `conversation_channels`, `telegram_link_tokens`, `telegram_updates`). Must be fully migrated.
- **section-02-webhook-handler**: Provides the Express webhook route at `POST /webhooks/telegram/:botId`, the `WebhookContext` interface, the `registerWebhookHandler()` registration function (or handler object), the `replyToChat()` helper, and the `TelegramMessage` / `TelegramCallbackQuery` type definitions. The webhook handler dispatches parsed commands to the handlers implemented in this section.
- **section-03-i18n-types**: Provides `getMessage(key, languageCode)` from `telegramI18n.ts` for all bot reply text. Provides `channelTypes.ts` shared interfaces.
- **section-04-link-flow**: Provides the `/start <token>` handler and the `telegram_connections` + `conversation_channels` records that the commands in this section query and manipulate. Also provides the backward-compatibility dual-write pattern for `users.telegramVerified`.

## Files Created

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/telegramCommands.ts` | Command handler implementations |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramCommands.test.ts` | Unit tests for all commands |

## Files Modified

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/telegramWebhook.ts` | Register command handlers from `telegramCommands.ts` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts` | Add `sendChatAction()` and `answerCallbackQuery()` helper functions |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramI18n.ts` | Verify all required message keys exist (they should from section-03, but verify `resume_list_header`, `resume_no_conversations`, `resume_success`, `unlink_confirm`, `unlink_success`, `unlink_cancelled`, `status_active`, `status_no_conversation`, `help_text`, `start_no_token`) |

---

## Tests (Write First)

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramCommands.test.ts`

Tests follow the project's Vitest conventions. They mock the database, Redis, and `sendTelegramMessage()` to verify command logic in isolation.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGetDb, mockDbInstance, mockSendTelegramMessage, mockGetMessage } =
  vi.hoisted(() => {
    const mockDbInstance = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      execute: vi.fn(),
    };
    return {
      mockGetDb: vi.fn(() => mockDbInstance),
      mockDbInstance,
      mockSendTelegramMessage: vi.fn().mockResolvedValue({ ok: true }),
      mockGetMessage: vi.fn((key: string, _lang?: string) => `[${key}]`),
    };
  });

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../../services/telegramService", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));
vi.mock("../../services/telegramI18n", () => ({
  getMessage: mockGetMessage,
}));
vi.mock("../../../drizzle/schema", () => ({
  telegramConnections: {},
  conversationChannels: {},
  conversations: {},
  agencyConversations: {},
  users: {},
}));

// Import after mocks
// import { handleResume, handleUnlink, handleUnlinkCallback, handleStatus, handleHelp, handleStartNoToken } from "../telegramCommands";

describe("Telegram Commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // /resume command
  // =========================================================================
  describe("/resume", () => {
    // Test: with one bound conversation, sets it as activeChannelId and replies with
    //       resume_success message containing the conversation title
    it("activates the single bound conversation");

    // Test: with multiple bound conversations, replies with a numbered list
    //       (resume_list_header + list items showing conversation titles)
    it("shows numbered list when multiple conversations are bound");

    // Test: with no bound conversations, replies with resume_no_conversations message
    it("replies with resume_no_conversations when no channels are bound");

    // Test: updates telegram_connections.activeChannelId to the selected channel ID
    it("updates activeChannelId on telegram_connections");

    // Test: only queries conversation_channels with state='active' and
    //       connectionId matching the user's connection
    it("only considers active channel bindings for the current connection");

    // Test: resolves conversation titles from conversations (for chat type)
    //       and agencyConversations (for agency type) for display
    it("resolves conversation titles from both conversation tables");

    // Test: when user has no active telegram_connections record, replies with
    //       error_no_connection message
    it("handles unlinked user with error_no_connection");
  });

  // =========================================================================
  // /unlink command
  // =========================================================================
  describe("/unlink", () => {
    // Test: sends confirmation message with inline keyboard containing two buttons:
    //       "Yes, unlink" (callback_data: "unlink_confirm") and
    //       "Cancel" (callback_data: "unlink_cancel")
    it("sends inline keyboard confirmation");

    // Test: the confirmation message text is the i18n unlink_confirm string
    it("uses i18n unlink_confirm message text");

    // Test: when user has no active connection, replies with error_no_connection
    it("handles unlinked user with error_no_connection");
  });

  // =========================================================================
  // callback_query handling for /unlink confirmation
  // =========================================================================
  describe("unlink callback_query", () => {
    // Test: callback_data "unlink_confirm" sets telegram_connections.status = 'revoked'
    //       and telegram_connections.revokedAt = now()
    it("revokes connection on unlink_confirm callback");

    // Test: callback_data "unlink_confirm" sets all conversation_channels for this
    //       connection to state = 'revoked'
    it("revokes all channel bindings on unlink_confirm");

    // Test: callback_data "unlink_confirm" sets users.telegramVerified = false
    //       and clears users.telegramChatId (backward compat dual-write)
    it("clears legacy user fields on unlink_confirm");

    // Test: callback_data "unlink_confirm" replies with unlink_success message
    it("replies with unlink_success on confirmation");

    // Test: callback_data "unlink_cancel" replies with unlink_cancelled message
    //       and does not modify any database records
    it("replies with unlink_cancelled on cancel");

    // Test: callback_data "unlink_cancel" does not modify telegram_connections
    it("does not revoke connection on cancel");

    // Test: answers the callback_query (calls answerCallbackQuery API) to dismiss
    //       the loading indicator in Telegram
    it("answers callback query to dismiss loading state");

    // Test: unknown callback_data is silently ignored
    it("ignores unknown callback_data values");
  });

  // =========================================================================
  // /status command
  // =========================================================================
  describe("/status", () => {
    // Test: when user has an active connection with an activeChannelId, replies
    //       with status_active message containing conversation name, message count,
    //       and last activity timestamp
    it("shows active conversation status info");

    // Test: when user has an active connection but no activeChannelId, replies
    //       with status_no_conversation message
    it("shows status_no_conversation when no active conversation");

    // Test: when user has no active connection, replies with error_no_connection
    it("handles unlinked user with error_no_connection");

    // Test: message count and last activity are queried from the correct
    //       conversation table (conversations for chat, agencyConversations for agency)
    it("queries correct conversation table based on conversationType");
  });

  // =========================================================================
  // /help command
  // =========================================================================
  describe("/help", () => {
    // Test: replies with i18n help_text message listing all commands
    it("sends help_text message");

    // Test: help text is sent with HTML parse mode
    it("uses HTML parse mode for formatting");

    // Test: works even when user is not linked (does not require connection lookup)
    it("works for unlinked users");
  });

  // =========================================================================
  // /start (no token)
  // =========================================================================
  describe("/start (no token)", () => {
    // Test: when user has an active connection, shows status summary
    //       (similar to /status output)
    it("shows status for linked user");

    // Test: when user has no active connection, shows welcome message with
    //       instructions to link from the web app (start_no_token i18n string)
    it("shows welcome/link instructions for unlinked user");
  });
});
```

### Security tests: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramWebhook.security.test.ts`

The security test file from section-02 should already contain rate limiting and tenant isolation tests. This section adds relevant test stubs for command-level security:

```typescript
// Append to the existing telegramWebhook.security.test.ts or create separate file

describe("command security", () => {
  // Test: /unlink only revokes the connection belonging to the calling Telegram user
  //       (verifies connectionId is scoped by telegramUserId, not just chatId)
  it("unlink scopes revocation to the calling user's connection");

  // Test: /resume only shows conversations bound to the calling user's connection
  it("resume only shows own conversation bindings");

  // Test: webhook handler resolves tenantId from connection, not conversation
  it("tenant isolation via connection tenantId");
});
```

---

## Implementation Details

### 1. Telegram Bot API Helpers (Add to `telegramService.ts`)

Before implementing the commands, two new helper functions are needed in `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramService.ts`. These are general-purpose Telegram Bot API wrappers used by multiple commands.

**`sendChatAction`** -- Sends a "typing" or other action indicator to a chat.

```typescript
/**
 * Sends a chat action (e.g., "typing") to a Telegram chat.
 * Used to show typing indicators while processing messages.
 *
 * @param botToken - Decrypted bot token
 * @param chatId - Telegram chat ID
 * @param action - Action string (default: "typing")
 */
export async function sendChatAction(
  botToken: string,
  chatId: string,
  action: string = "typing"
): Promise<void> {
  // POST to https://api.telegram.org/bot{token}/sendChatAction
  // Body: { chat_id, action }
  // Fire-and-forget: log errors but do not throw
}
```

**`answerCallbackQuery`** -- Answers an inline keyboard callback query to dismiss the loading indicator in the Telegram client.

```typescript
/**
 * Answers a callback query from an inline keyboard button press.
 * Must be called to dismiss the loading state in the Telegram client.
 *
 * @param botToken - Decrypted bot token
 * @param callbackQueryId - The callback_query.id from the update
 * @param text - Optional toast text shown to user (max 200 chars)
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  // POST to https://api.telegram.org/bot{token}/answerCallbackQuery
  // Body: { callback_query_id, text }
  // Fire-and-forget: log errors but do not throw
}
```

### 2. Command Handler Module

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/telegramCommands.ts`

This module exports individual command handler functions. Each handler receives the `WebhookContext` (defined in section-02's `telegramWebhook.ts`) and performs its logic.

**Module structure**:

```typescript
import { getMessage } from "../services/telegramI18n";
import {
  sendTelegramMessage,
  answerCallbackQuery,
} from "../services/telegramService";
import { getDb } from "../db";
import {
  telegramConnections,
  conversationChannels,
  conversations,
  agencyConversations,
  users,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { WebhookContext } from "./telegramWebhook";

// All handlers receive the context established by the webhook dispatcher.
// The context includes: botId, chatId, telegramUserId, languageCode, db, botToken.

export async function handleResume(ctx: WebhookContext): Promise<void> { ... }
export async function handleUnlink(ctx: WebhookContext): Promise<void> { ... }
export async function handleUnlinkCallback(ctx: WebhookContext, callbackData: string, callbackQueryId: string): Promise<void> { ... }
export async function handleStatus(ctx: WebhookContext): Promise<void> { ... }
export async function handleHelp(ctx: WebhookContext): Promise<void> { ... }
export async function handleStartNoToken(ctx: WebhookContext): Promise<void> { ... }
```

### 3. `/resume` Command Implementation

The `/resume` command lets users select which conversation they want to interact with from Telegram. It queries the user's active conversation channel bindings and either auto-selects (if one) or presents a numbered list (if multiple).

**Logic flow**:

1. Look up the user's active `telegram_connections` record by `(botId, telegramUserId)` with `status = 'active'`. If not found, reply with `getMessage("error_no_connection", lang)` and return.

2. Query `conversation_channels` where `connectionId = connection.id` AND `state = 'active'`. Join with `conversations` (on `chatConversationId`) and `agencyConversations` (on `agencyConversationId`) to get conversation titles.

3. If zero results: reply with `getMessage("resume_no_conversations", lang)` and return.

4. If exactly one result: update `telegram_connections.activeChannelId` to that channel's `id`. Reply with `getMessage("resume_success", lang).replace("{name}", channelTitle)`.

5. If multiple results: format a numbered list showing each conversation's title and type. Reply with `getMessage("resume_list_header", lang)` followed by the numbered list. The user's next text message containing just a number (e.g., "1", "2") should be intercepted and used to select the conversation. To implement this without complex state management, use a simple approach: store a pending selection in the `telegram_connections.metadata` JSON field (e.g., `{ pendingResume: [{ index: 1, channelId: "..." }, ...], expiresAt: ... }`). The webhook handler checks for pending resume state before routing to the channel gateway.

   **Alternative (simpler, preferred for Phase 1)**: Instead of a reply-based selection flow, present inline keyboard buttons for each conversation. Each button has `callback_data: "resume:{channelId}"`. The callback handler reads the channel ID, validates ownership, and updates `activeChannelId`. This avoids needing to track pending state.

   ```typescript
   const replyMarkup = {
     inline_keyboard: channels.map((ch, i) => [
       {
         text: `${i + 1}. ${ch.title} (${ch.conversationType})`,
         callback_data: `resume:${ch.id}`,
       },
     ]),
   };
   ```

6. The `/resume` callback handler (for `callback_data` starting with `"resume:"`) extracts the channel ID, verifies it belongs to the current connection, updates `telegram_connections.activeChannelId`, and replies with the success message.

### 4. `/unlink` Command Implementation

The `/unlink` command requires explicit confirmation before disconnecting. It uses Telegram's inline keyboard feature.

**Logic flow**:

1. Look up the user's active `telegram_connections` record. If not found, reply with `getMessage("error_no_connection", lang)` and return.

2. Send a confirmation message with an inline keyboard:

   ```typescript
   const text = getMessage("unlink_confirm", lang);
   const replyMarkup = {
     inline_keyboard: [
       [
         { text: "Yes, unlink", callback_data: "unlink_confirm" },
         { text: "Cancel", callback_data: "unlink_cancel" },
       ],
     ],
   };
   await sendTelegramMessage(botToken, chatId, text, "HTML", replyMarkup);
   ```

3. The callback handler for `unlink_confirm`:
   a. Set `telegram_connections.status = 'revoked'` and `revokedAt = new Date()`.
   b. Set all `conversation_channels` WHERE `connectionId = connection.id` to `state = 'revoked'`.
   c. Dual-write legacy fields: set `users.telegramVerified = false`, `users.telegramChatId = null`, `users.telegramUsername = null`, `users.telegramVerifiedAt = null`.
   d. Call `answerCallbackQuery(botToken, callbackQueryId)` to dismiss the loading spinner.
   e. Reply with `getMessage("unlink_success", lang)`.

4. The callback handler for `unlink_cancel`:
   a. Call `answerCallbackQuery(botToken, callbackQueryId)`.
   b. Reply with `getMessage("unlink_cancelled", lang)`.
   c. Do NOT modify any database records.

**Important**: Steps 3a-3c should be in a single database transaction. If the transaction fails, reply with a generic error and do not partially revoke.

### 5. `/status` Command Implementation

Shows the user's current connection status and active conversation details.

**Logic flow**:

1. Look up the user's active `telegram_connections` record. If not found, reply with `getMessage("error_no_connection", lang)` and return.

2. If `connection.activeChannelId` is null: reply with `getMessage("status_no_conversation", lang)` and return.

3. Look up the `conversation_channels` record by `id = connection.activeChannelId`. Join with the appropriate conversation table based on `conversationType`:
   - For `"chat"`: join with `conversations` on `chatConversationId` to get title, and query `messages` count for that conversation.
   - For `"agency"`: join with `agencyConversations` on `agencyConversationId` to get title, and read `messageCount` from the agency conversation record.

4. Format the status message using the `status_active` i18n template. Replace placeholders:
   - `{name}` -- conversation title
   - `{type}` -- "Chat" or "Agency"
   - `{messageCount}` -- total messages in the conversation
   - `{lastActivity}` -- human-readable timestamp of the last message or conversation update

5. Reply with the formatted status text using HTML parse mode.

### 6. `/help` Command Implementation

The simplest command. Shows available commands with descriptions.

**Logic flow**:

1. Retrieve the `help_text` message: `getMessage("help_text", lang)`.

2. The help text (defined in section-03's i18n module) should list:
   ```
   /resume - Switch active conversation
   /status - Show current connection status
   /unlink - Disconnect Telegram account
   /help - Show this help message
   ```
   (With Thai translations for `lang === "th"`.)

3. Reply with the help text using HTML parse mode.

4. This command does NOT require an active connection. It works for all users, even unlinked ones.

### 7. `/start` (No Token) Implementation

When a user sends `/start` without a token (e.g., by tapping the bot profile directly), this handler shows either status info or welcome instructions.

**Logic flow**:

1. Look up the user's active `telegram_connections` record by `(botId, telegramUserId)`.

2. If connection exists and is active: show a brief status summary similar to `/status` output. Include the active conversation name (if any) and a hint about available commands.

3. If no active connection: reply with `getMessage("start_no_token", lang)`. This message should explain how to link from the web app (e.g., "Welcome! To connect your account, generate a link from Settings > Telegram in the SmartAIHub web app at https://smartaihub.app").

### 8. Callback Query Routing

The webhook handler (section-02) dispatches `callback_query` updates to a callback handler. This section implements the callback routing logic that inspects `callback_data` and routes to the appropriate function.

**Callback data conventions**:

| `callback_data` value | Handler | Purpose |
|----------------------|---------|---------|
| `"unlink_confirm"` | `handleUnlinkCallback` | User confirmed unlinking |
| `"unlink_cancel"` | `handleUnlinkCallback` | User cancelled unlinking |
| `"resume:{channelId}"` | `handleResumeCallback` | User selected a conversation from the list |

**Router function** (added to `telegramCommands.ts`):

```typescript
/**
 * Routes callback_query updates based on callback_data prefix.
 *
 * @param ctx - Webhook context with callback query details
 */
export async function handleCallbackQuery(ctx: WebhookContext): Promise<void> {
  const callbackQuery = ctx.update.callback_query;
  if (!callbackQuery?.data) return;

  const data = callbackQuery.data;
  const queryId = callbackQuery.id;

  if (data === "unlink_confirm" || data === "unlink_cancel") {
    await handleUnlinkCallback(ctx, data, queryId);
  } else if (data.startsWith("resume:")) {
    const channelId = data.slice("resume:".length);
    await handleResumeCallback(ctx, channelId, queryId);
  } else {
    // Unknown callback -- answer to dismiss loading, do nothing else
    await answerCallbackQuery(ctx.botToken, queryId);
  }
}
```

### 9. Register Handlers with Webhook Dispatcher

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/telegramWebhook.ts`

After the handler module is complete, register the command handlers with the webhook dispatcher. The webhook handler (section-02) defines a handler registry. This section plugs in the implementations.

If the webhook handler uses a `registerWebhookHandler()` function:

```typescript
import {
  handleResume,
  handleUnlink,
  handleStatus,
  handleHelp,
  handleStartNoToken,
  handleCallbackQuery,
} from "./telegramCommands";

// Register command handlers
registerWebhookHandler("resume", handleResume);
registerWebhookHandler("unlink", handleUnlink);
registerWebhookHandler("status", handleStatus);
registerWebhookHandler("help", handleHelp);
registerWebhookHandler("start_no_token", handleStartNoToken);
registerWebhookHandler("callback_query", handleCallbackQuery);
```

If the webhook handler uses a plain handler object:

```typescript
// In telegramWebhook.ts, update the handlers object:
import {
  handleResume,
  handleUnlink,
  handleStatus,
  handleHelp,
  handleStartNoToken,
  handleCallbackQuery,
} from "./telegramCommands";

const handlers = {
  // ... existing handlers from section-02 and section-04 ...
  resume: handleResume,
  unlink: handleUnlink,
  status: handleStatus,
  help: handleHelp,
  start_no_token: handleStartNoToken,
  callback_query: handleCallbackQuery,
};
```

### 10. Database Query Patterns

All commands share a common pattern: look up the user's `telegram_connections` record. Extract this into a shared helper:

```typescript
/**
 * Find the active Telegram connection for a user.
 * Returns null if no active connection exists.
 */
async function findActiveConnection(
  db: DrizzleDB,
  botId: string,
  telegramUserId: string
): Promise<TelegramConnection | null> {
  const [connection] = await db
    .select()
    .from(telegramConnections)
    .where(
      and(
        eq(telegramConnections.botId, botId),
        eq(telegramConnections.telegramUserId, telegramUserId),
        eq(telegramConnections.status, "active")
      )
    )
    .limit(1);
  return connection ?? null;
}
```

For `/resume`, the query to get bound conversations with titles needs a join pattern:

```typescript
// Get all active channel bindings for a connection, with conversation titles
const channels = await db
  .select({
    channelId: conversationChannels.id,
    conversationType: conversationChannels.conversationType,
    chatConversationId: conversationChannels.chatConversationId,
    agencyConversationId: conversationChannels.agencyConversationId,
    chatTitle: conversations.title,
    agencyTitle: agencyConversations.title,
  })
  .from(conversationChannels)
  .leftJoin(
    conversations,
    eq(conversationChannels.chatConversationId, conversations.id)
  )
  .leftJoin(
    agencyConversations,
    eq(conversationChannels.agencyConversationId, agencyConversations.id)
  )
  .where(
    and(
      eq(conversationChannels.connectionId, connection.id),
      eq(conversationChannels.state, "active")
    )
  );

// Derive display title
const titled = channels.map((ch) => ({
  ...ch,
  title: ch.chatTitle ?? ch.agencyTitle ?? "Untitled",
}));
```

### 11. i18n Message Keys Required

This section relies on the following message keys from `telegramI18n.ts` (all defined in section-03):

| Key | Used By | Contains Placeholders |
|-----|---------|----------------------|
| `help_text` | `/help` | No |
| `status_active` | `/status` | `{name}`, `{type}`, `{messageCount}`, `{lastActivity}` |
| `status_no_conversation` | `/status` | No |
| `unlink_confirm` | `/unlink` | No |
| `unlink_success` | `/unlink` callback | No |
| `unlink_cancelled` | `/unlink` callback | No |
| `resume_list_header` | `/resume` | No |
| `resume_no_conversations` | `/resume` | No |
| `resume_success` | `/resume` | `{name}` |
| `error_no_connection` | All commands | `{url}` |
| `start_no_token` | `/start` (no token) | `{url}` |
| `error_generic` | Error handling | No |

Callers replace placeholders using `string.replace("{name}", actualName)`. The i18n module does not perform interpolation itself.

---

## Architecture Notes

### Why Inline Keyboards for `/resume` and `/unlink`

Using Telegram inline keyboard buttons (with `callback_data`) rather than text-based reply flows has several advantages:
- No state to track between messages (the callback contains all needed data).
- Users cannot accidentally send the wrong input.
- The Telegram client renders buttons natively, which is cleaner UX.
- `callback_query` updates are already supported by the `allowed_updates` setting (added in section-02).

### Callback Query Lifecycle

When a user presses an inline keyboard button, Telegram sends a `callback_query` update (not a `message` update). The handler must:
1. Process the callback (e.g., revoke connection).
2. Call `answerCallbackQuery()` to dismiss the loading spinner in the client. Telegram shows a clock icon until this API is called.
3. Optionally send a new message with the result.

If `answerCallbackQuery()` is not called within ~30 seconds, Telegram shows a timeout error to the user. Always call it, even on errors.

### Unlink Dual-Write for Backward Compatibility

When `/unlink` revokes the `telegram_connections` record, it must also clear the legacy user fields (`telegramVerified`, `telegramChatId`, `telegramUsername`, `telegramVerifiedAt`) so that:
- The existing `checkTelegramStatus` endpoint (which reads user-level fields) reports the correct status.
- The existing notification flow (which reads `telegramChatId`) stops sending to the disconnected user.
- The frontend Settings panel shows the correct linked/unlinked state.

This mirrors the dual-write pattern established in section-04 for connection creation.

### Error Handling Strategy

All command handlers should wrap their logic in try/catch. On database errors or unexpected failures:
1. Log the full error server-side (using `console.error` with the command name and telegramUserId).
2. Reply to the user with `getMessage("error_generic", lang)`.
3. Do NOT expose stack traces or internal error details to the Telegram user.
4. If `answerCallbackQuery` fails, log but do not throw (it is fire-and-forget).

---

## Verification Checklist

After implementing this section:

1. `/help` command returns bilingual help text in Telegram (Thai for `language_code: "th"`, English otherwise)
2. `/status` shows the active conversation name and message count, or "no conversation" message
3. `/resume` with one bound conversation auto-selects it and confirms
4. `/resume` with multiple bound conversations shows inline keyboard with conversation list
5. Selecting a conversation from the `/resume` list updates `activeChannelId` and confirms
6. `/resume` with no bound conversations shows appropriate message
7. `/unlink` shows inline keyboard with "Yes, unlink" and "Cancel" buttons
8. Pressing "Yes, unlink" revokes the connection, all channels, and clears legacy user fields
9. Pressing "Cancel" replies with cancellation message and changes nothing
10. `/start` (no token) shows status for linked users or welcome message for unlinked users
11. Callback queries are answered (loading spinner dismissed in Telegram)
12. All commands reply in the user's language (Thai or English)
13. All commands handle unlinked users gracefully with `error_no_connection`
14. Existing Telegram tests pass (`pnpm test` in `apps/web`)
15. TypeScript check passes (`pnpm check` in `apps/web`)