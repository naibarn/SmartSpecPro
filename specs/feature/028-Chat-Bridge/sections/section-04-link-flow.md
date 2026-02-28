I now have all the context needed. Let me produce the section content.

# Section 04: Link Flow

## Overview

This section implements the complete Telegram link flow: the `/start <token>` command handler that validates a token, creates a `telegram_connections` record, optionally binds a conversation via `conversation_channels`, and maintains backward compatibility by writing the legacy user-level `telegramVerified` / `telegramChatId` fields. It also extends `generateTelegramLink` (in the existing tRPC telegram router) to accept an optional conversation binding and persist a `telegram_link_tokens` record alongside the existing Redis key.

## Dependencies

- **section-01-schema-migration**: All five new tables (`telegram_connections`, `conversation_channels`, `channel_messages`, `telegram_link_tokens`, `telegram_updates`) and the column additions to `messages` and `conversations` must already exist.
- **section-02-webhook-handler**: The Express webhook route at `/webhooks/telegram/:botId` must already be registered and must dispatch parsed updates to command handlers. This section implements the `/start <token>` handler that the webhook dispatcher calls.
- **section-03-i18n-types**: The `telegramI18n.ts` module must provide `getMessage(languageCode, key)` and the `channelTypes.ts` types must be available.

## Files Created or Modified

| File | Action |
|------|--------|
| `apps/web/server/routes/telegramWebhook.ts` | **Modified** -- add `/start <token>` handler logic |
| `apps/web/server/routers/telegram.ts` | **Modified** -- extend `generateTelegramLink` to accept optional `conversationId`/`conversationType` and create `telegram_link_tokens` record |
| `apps/web/server/routers/__tests__/telegram.link.test.ts` | **Created** -- tests for link token generation and `/start` command |
| `apps/web/server/routes/__tests__/telegramWebhook.link.test.ts` | **Created** -- tests for `/start <token>` webhook handler |
| `apps/web/server/routers/__tests__/telegram.compat.test.ts` | **Created** -- backward compatibility tests |

---

## Tests (Write First)

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/telegramWebhook.link.test.ts`

This file tests the `/start <token>` handler invoked by the webhook dispatcher when a Telegram user clicks a deep link.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for the /start <token> command handler in telegramWebhook.ts

describe("telegramWebhook /start <token> handler", () => {
  // --- Token Validation ---

  // Test: valid token (exists in telegram_link_tokens, not expired, not used, not revoked) 
  //       creates a telegram_connections record with status 'active'
  it("creates telegram_connections for a valid token");

  // Test: expired token (expiresAt in the past) is rejected with i18n error message
  it("rejects expired token with link_expired message");

  // Test: already-used token (usedAt is set) is rejected
  it("rejects already-used token with link_already_used message");

  // Test: revoked token (revokedAt is set) is rejected
  it("rejects revoked token");

  // Test: token not found in DB returns link_invalid message
  it("rejects unknown token hash");

  // Test: token is consumed atomically -- usedAt is set in the same transaction 
  //       as telegram_connections creation
  it("sets usedAt on token in same transaction as connection creation");

  // --- Connection Creation ---

  // Test: telegram_connections record has correct fields
  //       (tenantId from user, telegramUserId, telegramChatId, botId, status='active', 
  //        linkedBy='deep_link', linkedAt set)
  it("populates telegram_connections with correct fields");

  // Test: if token has targetChatConversationId, creates a conversation_channels 
  //       record with conversationType='chat' and chatConversationId set
  it("creates conversation_channels for chat conversation binding");

  // Test: if token has targetAgencyConversationId, creates a conversation_channels 
  //       record with conversationType='agency' and agencyConversationId set
  it("creates conversation_channels for agency conversation binding");

  // Test: if token has no target conversation, no conversation_channels record is created
  it("skips conversation_channels when token has no target conversation");

  // Test: sets activeChannelId on telegram_connections when conversation binding is created
  it("sets activeChannelId when channel binding is created");

  // --- Backward Compatibility ---

  // Test: sets users.telegramVerified = true after connection creation
  it("sets users.telegramVerified to true");

  // Test: sets users.telegramChatId to the Telegram chat ID
  it("sets users.telegramChatId for backward compat");

  // Test: sets users.telegramUsername if available from Telegram update
  it("sets users.telegramUsername from Telegram user data");

  // Test: sets users.telegramVerifiedAt to current timestamp
  it("sets users.telegramVerifiedAt");

  // --- Duplicate Handling ---

  // Test: if telegram_connections already exists for (botId, telegramUserId) with 
  //       status='active', replies with already_linked message and does not create duplicate
  it("handles already-linked user gracefully");

  // Test: if telegram_connections exists with status='revoked', creates a new 
  //       active connection (or re-activates existing)
  it("re-activates revoked connection on new valid token");

  // --- Redis Cleanup ---

  // Test: deletes the Redis verification key after successful connection
  it("deletes Redis verification key on success");

  // --- Reply Messages ---

  // Test: on success, sends i18n link_success reply to Telegram chat
  it("sends link_success reply on successful linking");

  // Test: on failure, sends appropriate i18n error reply to Telegram chat
  it("sends appropriate error reply on failure");
});
```

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegram.link.test.ts`

This file tests the extended `generateTelegramLink` mutation.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for the extended generateTelegramLink tRPC mutation

describe("generateTelegramLink (extended)", () => {
  // --- Existing Behavior (must still work) ---

  // Test: generates a 32-char hex code (128-bit entropy)
  it("generates a 128-bit random verification code");

  // Test: stores code in Redis with 5-minute TTL
  it("stores code in Redis with 300s TTL");

  // Test: returns { code, deepLink, expiresIn: 300 }
  it("returns code, deepLink, and expiresIn");

  // Test: deepLink format is https://t.me/{botUsername}?start={code}
  it("constructs correct Telegram deep link URL");

  // Test: rejects when Telegram is not enabled
  it("rejects when Telegram feature is disabled");

  // Test: rejects when bot username is not configured
  it("rejects when bot username is not configured");

  // --- New: Conversation Binding ---

  // Test: accepts optional conversationId (number) and conversationType='chat'
  it("accepts optional chat conversationId");

  // Test: accepts optional conversationId (string) and conversationType='agency'
  it("accepts optional agency conversationId");

  // Test: creates telegram_link_tokens record with SHA-256 hash of the code
  it("creates telegram_link_tokens with SHA-256 tokenHash");

  // Test: telegram_link_tokens.targetChatConversationId is set for chat type
  it("stores targetChatConversationId for chat conversations");

  // Test: telegram_link_tokens.targetAgencyConversationId is set for agency type
  it("stores targetAgencyConversationId for agency conversations");

  // Test: telegram_link_tokens.expiresAt is 5 minutes from now
  it("sets token expiry to 5 minutes");

  // Test: telegram_link_tokens.purpose is 'connect' when no existing connection,
  //       'resume' when connection exists
  it("sets purpose based on whether user already has a connection");

  // Test: telegram_link_tokens.createdBy is set to ctx.user.id
  it("records createdBy from auth context");

  // Test: when conversationId is not provided, targetChatConversationId and 
  //       targetAgencyConversationId are both null
  it("leaves target conversation null when not provided");

  // Test: validates conversation ownership before creating token
  it("rejects when user does not own the specified conversation");
});
```

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegram.compat.test.ts`

This file tests backward compatibility between the new `telegram_connections` table and the legacy user-level fields.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for backward compatibility between telegram_connections and legacy user fields

describe("Telegram backward compatibility", () => {
  // Test: creating telegram_connections also sets users.telegramVerified = true
  it("dual-writes telegramVerified on connection creation");

  // Test: revoking telegram_connections also sets users.telegramVerified = false
  it("dual-writes telegramVerified=false on connection revocation");

  // Test: checkTelegramStatus returns correct status from both old fields and new table
  it("checkTelegramStatus reads from both old fields and new table");

  // Test: existing notification flow (notificationService -> telegramService) still works
  //       because it reads from users.telegramChatId which is still populated
  it("notification flow continues to use legacy telegramChatId");

  // Test: existing telegram preferences (updateTelegramPreferences) still works
  it("updateTelegramPreferences is unaffected by new tables");
});
```

---

## Implementation Details

### 1. Extend `generateTelegramLink` in the Telegram Router

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts`

The existing `generateTelegramLink` mutation (line 349-417) generates a random code, stores it in Redis with a 5-minute TTL, and returns a `t.me` deep link. Extend it as follows:

**Input schema change**: Add optional fields to the input.

```typescript
const generateTelegramLink = protectedProcedure
  .input(
    z.object({
      conversationId: z.union([z.number(), z.string()]).optional(),
      conversationType: z.enum(["chat", "agency"]).optional(),
    }).optional()
  )
  .mutation(async ({ input, ctx }) => {
    // ... existing code for enabled check, botUsername check, code generation, Redis set ...

    // NEW: Create a telegram_link_tokens record for auditing + conversation binding
    // Hash the code with SHA-256 for storage (raw code only in Redis and deep link)
    // const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    //
    // Insert into telegram_link_tokens:
    //   id: crypto.randomUUID()
    //   tenantId: derived from ctx.user (look up users.currentTenantId)
    //   userId: ctx.user.id
    //   targetChatConversationId: input?.conversationType === "chat" ? Number(input.conversationId) : null
    //   targetAgencyConversationId: input?.conversationType === "agency" ? String(input.conversationId) : null
    //   targetConversationType: input?.conversationType ?? null
    //   purpose: "connect"  (or "resume" if user already has an active connection)
    //   tokenHash: tokenHash
    //   expiresAt: new Date(Date.now() + 300_000)  // 5 minutes
    //   createdBy: ctx.user.id

    // If conversationId is provided, validate ownership:
    //   - For chat: SELECT 1 FROM conversations WHERE id = conversationId AND userId = ctx.user.id
    //   - For agency: SELECT 1 FROM agencyConversations WHERE id = conversationId AND userId = ctx.user.id
    //   Throw FORBIDDEN if not found.

    // Return same shape as before: { code, deepLink, expiresIn }
  });
```

Key points:
- The existing Redis storage is preserved for the fast-path lookup in the `/start` handler (backward compat with existing webhook if it runs before the new code deploys).
- The `telegram_link_tokens` record is the source of truth for validation. The handler looks up by `tokenHash` in the DB.
- The token hash is SHA-256 of the raw code. The raw code appears only in the deep link URL and Redis.
- Conversation ownership must be validated before creating the token.

### 2. Implement `/start <token>` Handler

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/telegramWebhook.ts`

The webhook handler (created in section-02) dispatches parsed Telegram updates to command handlers. The `/start <token>` handler is the most important command. It must be implemented as a standalone function that receives the parsed Telegram message and bot context.

**Handler signature** (stub):

```typescript
/**
 * Handle /start <token> command from Telegram.
 * 
 * Validates the link token, creates a telegram_connections record,
 * optionally binds a conversation, and dual-writes legacy user fields.
 * 
 * @param botId - The bot identifier from the webhook URL
 * @param message - The Telegram message object containing the /start command
 * @param languageCode - The user's language_code from Telegram (for i18n)
 */
export async function handleStartToken(
  botId: string,
  message: TelegramMessage,
  languageCode: string | undefined,
): Promise<void> {
  // ...
}
```

**Processing steps**:

1. Extract the token from the message text: `const token = message.text.split(" ")[1];`

2. Hash the token: `const tokenHash = crypto.createHash("sha256").update(token).digest("hex");`

3. Look up in `telegram_link_tokens` by `tokenHash`. If not found, reply with `getMessage(lang, "link_invalid")` and return.

4. Validate the token record:
   - If `expiresAt < now`: reply with `getMessage(lang, "link_expired")`, return.
   - If `usedAt` is not null: reply with `getMessage(lang, "link_already_used")`, return.
   - If `revokedAt` is not null: reply with `getMessage(lang, "link_invalid")`, return.

5. Resolve the user from `telegram_link_tokens.userId`. Look up `users` to get `currentTenantId`.

6. Check for existing active `telegram_connections` for `(botId, telegramUserId)`:
   - If active connection exists, reply with `getMessage(lang, "already_linked")` and return.
   - If revoked connection exists, it can be re-activated (update status to `active`, update fields).

7. Begin a database transaction containing:
   a. Mark token as used: `UPDATE telegram_link_tokens SET usedAt = now() WHERE id = token.id`
   b. Create (or re-activate) `telegram_connections` record:
      - `id`: `crypto.randomUUID()`
      - `tenantId`: from user's `currentTenantId`
      - `userId`: from token
      - `telegramUserId`: `String(message.from.id)`
      - `telegramChatId`: `String(message.chat.id)`
      - `telegramUsername`: `message.from.username ?? null`
      - `botId`: from webhook URL param
      - `status`: `"active"`
      - `linkedAt`: `new Date()`
      - `linkedBy`: `"deep_link"`
   c. If token has `targetChatConversationId` or `targetAgencyConversationId`, create a `conversation_channels` record:
      - `id`: `crypto.randomUUID()`
      - `tenantId`: same as connection
      - `chatConversationId`: token's `targetChatConversationId` (or null)
      - `agencyConversationId`: token's `targetAgencyConversationId` (or null)
      - `conversationType`: token's `targetConversationType`
      - `channelType`: `"telegram"`
      - `channelRefId`: `String(message.chat.id)`
      - `connectionId`: the new connection's `id`
      - `isPrimary`: `false`
      - `syncMode`: `"two_way"`
      - `state`: `"active"`
   d. Update `telegram_connections.activeChannelId` to the new channel's `id` (if created).
   e. Dual-write legacy fields:
      ```sql
      UPDATE users SET
        "telegramChatId" = :chatId,
        "telegramUsername" = :username,
        "telegramVerified" = true,
        "telegramVerifiedAt" = now()
      WHERE id = :userId
      ```

8. Delete the Redis verification key: `redis.del("telegram:verify:" + token)`. This is non-critical and should not fail the transaction.

9. Send success reply to the Telegram chat using `sendTelegramMessage()` from `telegramService.ts`:
   - Text: `getMessage(lang, "link_success")`
   - Parse mode: `"HTML"`
   - Include the conversation name if a binding was created.

**Error handling**: Wrap the entire handler in try/catch. On database errors, reply with a generic `getMessage(lang, "link_error")` message. Log the full error server-side.

### 3. Backward Compatibility: Dual-Write Pattern

The existing notification flow reads `users.telegramChatId` and `users.telegramVerified` to determine delivery eligibility (in `telegramService.ts` lines 343-355). The new `telegram_connections` table is the authoritative source for the chat bridge, but the legacy fields must remain populated so existing notification delivery continues to work.

**On connection creation** (in the `/start <token>` handler):
- Set `users.telegramChatId = telegramChatId`
- Set `users.telegramUsername = telegramUsername`
- Set `users.telegramVerified = true`
- Set `users.telegramVerifiedAt = new Date()`

**On connection revocation** (extends the existing `unlinkTelegram` mutation -- will be done in section-09/10, but the contract is defined here):
- Set `users.telegramVerified = false`
- Set `users.telegramChatId = null`
- Set `users.telegramUsername = null`
- Set `users.telegramVerifiedAt = null`

The `checkTelegramStatus` query (line 423-460 in `telegram.ts`) currently reads only the user-level fields. In a future section (section-10), it will be extended to also query `telegram_connections` and return the combined status. For now, the dual-write ensures `checkTelegramStatus` returns correct results without modification.

### 4. Token Hashing Strategy

The token is a 128-bit random hex string (32 chars), generated by `crypto.randomBytes(16).toString("hex")`. For storage in `telegram_link_tokens.tokenHash`, compute `crypto.createHash("sha256").update(rawToken).digest("hex")`. This is a 64-char hex string.

The raw token appears in:
- The deep link URL (`https://t.me/{botUsername}?start={code}`)
- Redis (`telegram:verify:{code}`) with 5-minute TTL

The token hash appears in:
- `telegram_link_tokens.tokenHash` (permanent, for audit)

The `/start <token>` handler hashes the incoming token and looks up by hash. This means:
- Even if the DB is compromised, raw tokens cannot be recovered
- Redis keys expire automatically (5 min)
- Used tokens are marked and cannot be replayed

### 5. Telegram Message Type References

The webhook handler receives Telegram Update objects. The relevant fields for the `/start` command are:

```typescript
// Minimal type definitions for the Telegram Update relevant to link flow
interface TelegramUser {
  id: number;           // Telegram user ID (unique)
  username?: string;    // e.g., "johndoe"
  language_code?: string; // e.g., "th", "en"
}

interface TelegramChat {
  id: number;           // Chat ID (same as user ID for private chats)
  type: string;         // "private", "group", etc.
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  text?: string;        // The message text, e.g., "/start abc123def..."
}
```

These types should already be defined in the webhook handler (section-02) or in `channelTypes.ts` (section-03).

### 6. Database Schema References (from section-01)

The handler writes to these tables (all created in section-01):

**`telegram_link_tokens`**: Stores the SHA-256 hash of the token, the target conversation (if any), expiry, and usage timestamps.

**`telegram_connections`**: The primary link record between a SmartSpecPro user and a Telegram identity. Key fields: `botId` + `telegramUserId` is unique, `status` tracks active/revoked/pending/blocked, `activeChannelId` points to the currently selected conversation channel.

**`conversation_channels`**: Maps a conversation to a channel transport. Uses split FK columns (`chatConversationId` for integer chat IDs, `agencyConversationId` for varchar agency IDs) with a CHECK constraint ensuring exactly one is set.

### 7. Important Implementation Notes

- **Transaction safety**: Steps 7a-7e (mark token used, create connection, create channel, update activeChannelId, dual-write user) must all be in a single database transaction. If any step fails, all must roll back. Use Drizzle's `db.transaction()`.

- **Idempotency**: If the same `/start <token>` is received twice (e.g., Telegram retransmits), the second call should see `usedAt` is already set and reply with `link_already_used`. This is safe because the token is marked used inside the transaction.

- **Bot token for replies**: The handler needs the decrypted bot token to call `sendTelegramMessage()`. It should receive this from the webhook handler context (section-02 loads and validates bot settings before dispatching to command handlers).

- **Tenant ID resolution**: The handler resolves `tenantId` from `users.currentTenantId` via the token's `userId`. This is important because `conversations` has no `tenantId` column -- tenant isolation comes from the user, not the conversation.

- **Redis client**: Use `getRedisClient()` from `apps/web/server/services/redis.ts` for Redis operations (consistent with the existing `generateTelegramLink` implementation on line 387).

---

## Verification Checklist

After implementation:

1. Generate a Telegram deep link from web UI (with no conversation) -- link token record appears in `telegram_link_tokens`
2. Generate a Telegram deep link with a conversation ID -- `targetChatConversationId` or `targetAgencyConversationId` is set
3. Click the deep link in Telegram -- `/start <token>` fires, connection created, user sees success message
4. `checkTelegramStatus` returns `linked: true`
5. Duplicate `/start <token>` with same code returns `link_already_used`
6. Expired token (wait 5+ min) returns `link_expired`
7. `users.telegramVerified` is `true`, `users.telegramChatId` is populated
8. If conversation was specified, `conversation_channels` record exists and `activeChannelId` is set
9. Existing notification flow (via `enqueueTelegramNotification`) still works (reads `users.telegramChatId`)
10. All existing telegram router tests pass (`pnpm test -- telegram.test`)
11. `pnpm check` passes (TypeScript types valid)