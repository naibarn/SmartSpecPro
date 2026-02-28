Good, I can see that `conversations` has `userId` (integer) and no `tenantId`, while `agencyConversations` has `userId` (integer) and `id` is varchar(36). Now I have all the context I need to write the section.

# Section 10: Telegram Router Extensions

## Overview

This section adds new tRPC endpoints to the existing `apps/web/server/routers/telegram.ts` router and extends three existing endpoints. These endpoints let the web frontend manage conversation-to-Telegram bindings, let admins view and revoke connections, and ensure the existing `checkTelegramStatus` and `unlinkTelegram` endpoints reflect the new `telegram_connections`/`conversation_channels` data model.

**Dependencies**: Section 01 (schema migration) must be complete. The new tables `telegram_connections`, `conversation_channels`, and `telegram_link_tokens` must exist in the database schema. The `channelTypes.ts` shared types from Section 03 are referenced but not required at the type level since endpoints define their own Zod schemas.

**Blocks**: Section 11 (integration tests).

**Files to create or modify**:

| File | Action | Purpose |
|------|--------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts` | Modify | Add 5 new endpoints, extend 3 existing endpoints |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegram.bridge.test.ts` | Create | Tests for all new and extended endpoints |

---

## Tests First

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/telegram.bridge.test.ts`

This test file covers all new and extended endpoints added to the telegram router. It follows the mock pattern established in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.test.ts`, where tRPC is mocked to extract raw handler functions and the database layer is fully stubbed.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

/**
 * Tests for Telegram Chat Bridge router extensions.
 *
 * Covers:
 * - getConversationChannelStatus (new query)
 * - bindConversation (new mutation)
 * - unbindConversation (new mutation)
 * - adminListConnections (new admin query)
 * - adminRevokeConnection (new admin mutation)
 * - generateTelegramLink (extended)
 * - unlinkTelegram (extended)
 * - checkTelegramStatus (extended)
 *
 * Mock strategy: vi.mock tRPC to extract raw handler functions,
 * mock DB (getDb) and drizzle schema, mock Redis (getRedisClient).
 * Same pattern as agency.test.ts.
 */

// --- Mock tRPC to extract handler functions ---
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

// --- Mock DB ---
// Mock getDb to return a chainable query builder
// Mock drizzle schema table references
// Mock getRedisClient for generateTelegramLink token storage
// Mock encrypt/decrypt from crypto.ts

// --- Test context helpers ---
// const mockCtx = { user: { id: 1, role: "admin", currentTenantId: "t1" } }
// const mockUserCtx = { user: { id: 1, role: "user", currentTenantId: "t1" } }

// =========================================================================
// getConversationChannelStatus
// =========================================================================

// Test: returns bound=true for conversation with active Telegram channel
//   Setup: conversation_channels row exists with state='active', channelType='telegram'
//   for the given conversationId. User owns the conversation.
//   Expected: { bound: true, syncMode: 'two_way', connectionStatus: 'active' }

// Test: returns bound=false for conversation with no Telegram channel
//   Setup: no conversation_channels row for the given conversationId.
//   Expected: { bound: false }

// Test: returns bound=false for conversation with revoked channel
//   Setup: conversation_channels row exists with state='revoked'.
//   Expected: { bound: false }

// Test: rejects for conversations user doesn't own
//   Setup: conversation exists but userId does not match ctx.user.id.
//   Expected: TRPCError with code FORBIDDEN or NOT_FOUND

// =========================================================================
// bindConversation
// =========================================================================

// Test: creates conversation_channels record for chat conversation
//   Setup: user has active telegram_connections row. Conversation exists
//   with userId matching ctx.user.id. conversationType='chat'.
//   Expected: new conversation_channels row with chatConversationId set
//   (integer), agencyConversationId null, state='active'.

// Test: creates conversation_channels record for agency conversation
//   Setup: user has active telegram_connections row. Agency conversation
//   exists with userId matching ctx.user.id. conversationType='agency'.
//   Expected: new conversation_channels row with agencyConversationId set
//   (varchar), chatConversationId null, state='active'.

// Test: uses correct chatConversationId (integer) for chat type
//   Assert the insert call sets chatConversationId to parseInt(conversationId).

// Test: uses correct agencyConversationId (varchar) for agency type
//   Assert the insert call sets agencyConversationId to conversationId as string.

// Test: rejects binding for user without active Telegram connection
//   Setup: no telegram_connections row with status='active' for this user.
//   Expected: TRPCError with code PRECONDITION_FAILED.

// Test: rejects binding for conversation user doesn't own
//   Setup: conversation exists but userId doesn't match ctx.user.id.
//   Expected: TRPCError with code FORBIDDEN or NOT_FOUND.

// Test: rejects duplicate binding for same conversation+channel
//   Setup: conversation_channels row already exists with matching conversation
//   ID, channelType, and channelRefId.
//   Expected: TRPCError with code CONFLICT.

// =========================================================================
// unbindConversation
// =========================================================================

// Test: sets conversation_channels.state to 'revoked'
//   Setup: active conversation_channels row exists for user's conversation.
//   Expected: DB update sets state='revoked', updatedAt to current time.

// Test: clears activeChannelId if it pointed to the unbound channel
//   Setup: telegram_connections.activeChannelId matches the channel being unbound.
//   Expected: telegram_connections.activeChannelId set to null.

// Test: rejects for conversations user doesn't own
//   Setup: conversation exists but userId doesn't match.
//   Expected: TRPCError with code FORBIDDEN or NOT_FOUND.

// =========================================================================
// generateTelegramLink (extended)
// =========================================================================

// Test: accepts optional conversationId and conversationType
//   Setup: call with { conversationId: "123", conversationType: "chat" }.
//   Expected: returns deepLink and also creates telegram_link_tokens row.

// Test: creates telegram_link_tokens record with SHA-256 hash
//   Setup: call with conversationId.
//   Expected: insert into telegram_link_tokens with tokenHash equal to
//   SHA-256 hex of the generated code, expiresAt ~5 minutes from now.

// Test: stores targetChatConversationId for chat conversations
//   Setup: call with conversationType='chat', conversationId='42'.
//   Expected: telegram_link_tokens row has targetChatConversationId=42,
//   targetAgencyConversationId=null.

// Test: stores targetAgencyConversationId for agency conversations
//   Setup: call with conversationType='agency', conversationId='uuid-abc'.
//   Expected: telegram_link_tokens row has targetAgencyConversationId='uuid-abc',
//   targetChatConversationId=null.

// Test: token expires after 5 minutes
//   Expected: expiresAt is approximately Date.now() + 300_000.

// =========================================================================
// unlinkTelegram (extended)
// =========================================================================

// Test: revokes telegram_connections record
//   Setup: active telegram_connections row exists for ctx.user.id.
//   Expected: DB update sets status='revoked', revokedAt to current time.

// Test: revokes all associated conversation_channels
//   Setup: multiple conversation_channels rows linked to the connection.
//   Expected: all rows updated to state='revoked'.

// Test: clears users.telegramVerified for backward compat
//   Setup: user has telegramVerified=true.
//   Expected: users update sets telegramVerified=false (existing behavior preserved).

// =========================================================================
// checkTelegramStatus (extended)
// =========================================================================

// (Existing tests for the old behavior still apply.)
// Additional behavior:

// Test: returns active telegram_connections details
//   Setup: telegram_connections row exists with status='active' for user.
//   Expected: response includes connection: { id, telegramUsername, status,
//   linkedAt, activeChannelId }.

// Test: returns bound conversation count
//   Setup: 3 active conversation_channels rows for user's connection.
//   Expected: response includes boundConversationCount: 3.

// Test: returns connection=null when no active connection
//   Setup: no telegram_connections row for user.
//   Expected: response includes connection: null, boundConversationCount: 0.

// =========================================================================
// adminListConnections
// =========================================================================

// Test: returns paginated connections for admin's tenant
//   Setup: 5 telegram_connections rows for tenant 't1'.
//   Input: { limit: 2, offset: 0 }.
//   Expected: returns 2 items with total=5.

// Test: filters by status when provided
//   Setup: 3 active, 2 revoked connections.
//   Input: { status: 'active', limit: 10, offset: 0 }.
//   Expected: returns 3 items.

// Test: requires admin role
//   Setup: ctx.user.role='user' (not admin).
//   Expected: TRPCError with code FORBIDDEN (handled by adminProcedure).

// =========================================================================
// adminRevokeConnection
// =========================================================================

// Test: revokes connection and all channel bindings
//   Setup: active telegram_connections row with 2 conversation_channels rows.
//   Input: { connectionId: 'conn-1' }.
//   Expected: connection.status='revoked', all channels.state='revoked'.

// Test: requires admin role
//   Handled by adminProcedure mock -- adminProcedure should be used.

// Test: rejects cross-tenant access
//   Setup: connectionId belongs to a different tenantId than ctx.user.currentTenantId.
//   Expected: TRPCError with code NOT_FOUND or FORBIDDEN.
```

---

## Implementation Details

### 1. New Endpoint: `getConversationChannelStatus`

**Type**: `protectedProcedure.query`

**Input** (Zod schema):
```typescript
z.object({
  conversationId: z.string(),
  conversationType: z.enum(["chat", "agency"]).default("chat"),
})
```

**Logic**:
1. Verify conversation ownership by querying the appropriate table (`conversations` for chat, `agencyConversations` for agency) and checking `userId === ctx.user.id`.
2. Query `conversation_channels` for an active binding matching this conversation. For chat type, filter on `chatConversationId = parseInt(conversationId)`. For agency type, filter on `agencyConversationId = conversationId`.
3. Also filter on `state = 'active'` and `channelType = 'telegram'`.
4. If found, return `{ bound: true, syncMode: row.syncMode, connectionStatus: <from joined telegram_connections> }`.
5. If not found, return `{ bound: false }`.

**Key consideration**: The `conversations` table has `id` as `serial` (integer) while `agencyConversations` has `id` as `varchar(36)`. Use `parseInt()` for chat IDs when querying `chatConversationId`, and pass the string directly for agency IDs when querying `agencyConversationId`.

### 2. New Endpoint: `bindConversation`

**Type**: `protectedProcedure.mutation`

**Input** (Zod schema):
```typescript
z.object({
  conversationId: z.string(),
  conversationType: z.enum(["chat", "agency"]),
  syncMode: z.enum(["two_way", "notify_only"]).default("two_way"),
})
```

**Logic**:
1. Verify conversation ownership (same as `getConversationChannelStatus`).
2. Look up the user's active `telegram_connections` record: `WHERE userId = ctx.user.id AND status = 'active'`. If none, throw `PRECONDITION_FAILED` with message "No active Telegram connection. Link your account first."
3. Check for existing active binding to prevent duplicates: query `conversation_channels` for matching conversation ID + channelType='telegram' + state='active'. If found, throw `CONFLICT`.
4. Generate a new UUID (`crypto.randomUUID()`) for the channel ID.
5. Insert into `conversation_channels`:
   - `id`: generated UUID
   - `tenantId`: from the connection's `tenantId`
   - `chatConversationId`: `parseInt(conversationId)` if chat type, else null
   - `agencyConversationId`: `conversationId` if agency type, else null
   - `conversationType`: from input
   - `channelType`: `'telegram'`
   - `channelRefId`: the connection's `telegramChatId`
   - `connectionId`: the connection's `id`
   - `syncMode`: from input
   - `state`: `'active'`
   - `createdAt`, `updatedAt`: `new Date()`
6. Optionally update `telegram_connections.activeChannelId` to the new channel ID (auto-select newly bound conversation).
7. Return `{ success: true, channelId: <new id> }`.

### 3. New Endpoint: `unbindConversation`

**Type**: `protectedProcedure.mutation`

**Input** (Zod schema):
```typescript
z.object({
  conversationId: z.string(),
  conversationType: z.enum(["chat", "agency"]).default("chat"),
})
```

**Logic**:
1. Verify conversation ownership.
2. Find the active `conversation_channels` record for this conversation + channelType='telegram'.
3. If not found, throw `NOT_FOUND`.
4. Update the row: `state = 'revoked'`, `updatedAt = new Date()`.
5. Check if the user's `telegram_connections.activeChannelId` points to this channel. If so, set `activeChannelId = null`.
6. Return `{ success: true }`.

### 4. New Endpoint: `adminListConnections`

**Type**: `adminProcedure.query`

**Input** (Zod schema):
```typescript
z.object({
  status: z.enum(["active", "revoked", "pending", "blocked"]).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
})
```

**Logic**:
1. Determine tenantId from `ctx.user.currentTenantId`.
2. Build query on `telegram_connections` WHERE `tenantId = <tenantId>`. If `status` filter provided, add WHERE `status = <status>`.
3. Run two queries: count query for total, and paginated data query with `limit` and `offset`, joined with `users` table to get `email` and `username` for display.
4. Return `{ connections: [...], total: number }`.

### 5. New Endpoint: `adminRevokeConnection`

**Type**: `adminProcedure.mutation`

**Input** (Zod schema):
```typescript
z.object({
  connectionId: z.string(),
})
```

**Logic**:
1. Look up the `telegram_connections` record by `id = connectionId`.
2. Verify it belongs to the admin's tenant: `tenantId = ctx.user.currentTenantId`. If not, throw `NOT_FOUND`.
3. Update `telegram_connections`: `status = 'revoked'`, `revokedAt = new Date()`, `revokedBy = String(ctx.user.id)`.
4. Update all `conversation_channels` WHERE `connectionId = connectionId`: `state = 'revoked'`, `updatedAt = new Date()`.
5. Optionally update the user's `telegramVerified = false` for backward compat (look up `userId` from the connection).
6. Return `{ success: true }`.

### 6. Extended Endpoint: `generateTelegramLink`

The existing `generateTelegramLink` endpoint in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/telegram.ts` (line 349) generates a verification code, stores it in Redis, and returns a deep link. Extend it to:

**New input fields** (add to existing endpoint or create a new `.input()` on the procedure):
```typescript
z.object({
  conversationId: z.string().optional(),
  conversationType: z.enum(["chat", "agency"]).optional(),
})
```

**Additional logic** (after the existing Redis SET):
1. If `conversationId` is provided, also create a `telegram_link_tokens` record:
   - `id`: `crypto.randomUUID()`
   - `tenantId`: `ctx.user.currentTenantId`
   - `userId`: `ctx.user.id`
   - `targetChatConversationId`: `parseInt(conversationId)` if `conversationType === 'chat'`, else null
   - `targetAgencyConversationId`: `conversationId` if `conversationType === 'agency'`, else null
   - `targetConversationType`: `conversationType`
   - `purpose`: `'connect'`
   - `tokenHash`: `crypto.createHash('sha256').update(code).digest('hex')`
   - `expiresAt`: `new Date(Date.now() + 300_000)` (5 minutes)
   - `createdAt`: `new Date()`
   - `createdBy`: `ctx.user.id`
2. The existing Redis storage and deep link generation remain unchanged.
3. The existing return shape `{ code, deepLink, expiresIn }` remains unchanged. The token record is stored for audit and for the `/start` command handler (Section 04) to use when creating the connection.

### 7. Extended Endpoint: `unlinkTelegram`

The existing `unlinkTelegram` endpoint (line 465) clears user-level Telegram fields. Extend it to also revoke the connection-level records:

**Additional logic** (before or after the existing user update):
1. Query `telegram_connections` WHERE `userId = ctx.user.id AND status = 'active'`.
2. If found, update each connection: `status = 'revoked'`, `revokedAt = new Date()`, `revokedBy = String(ctx.user.id)`.
3. For each revoked connection, update all `conversation_channels` WHERE `connectionId = connection.id`: `state = 'revoked'`, `updatedAt = new Date()`.
4. The existing behavior (clearing `telegramChatId`, `telegramUsername`, `telegramVerified`, `telegramVerifiedAt`, `userPreferences`, and Redis failure counter) remains unchanged.

### 8. Extended Endpoint: `checkTelegramStatus`

The existing `checkTelegramStatus` endpoint (line 423) returns linking status from user-level fields. Extend it to also return connection-level data:

**Additional queries** (after the existing user query):
1. Query `telegram_connections` WHERE `userId = ctx.user.id AND status = 'active'`. Take the first result (a user has at most one active connection per bot).
2. If found, count `conversation_channels` WHERE `connectionId = connection.id AND state = 'active'`.
3. Add to the existing return object:
   - `connection`: `{ id, telegramUsername, status, linkedAt, activeChannelId }` or `null` if no active connection
   - `boundConversationCount`: number of active channel bindings (0 if no connection)

The existing return fields (`linked`, `username`, `verifiedAt`, `notifyLevel`, `deliveryFailing`) remain unchanged.

---

## Router Registration

After defining the new endpoints, add them to the `telegramRouter` export at the bottom of the file:

```typescript
export const telegramRouter = router({
  // Existing admin endpoints
  getTelegramSettings,
  updateTelegramSettings,
  testTelegramConnection,
  registerWebhook,

  // Existing user endpoints
  generateTelegramLink,       // extended with optional conversationId
  checkTelegramStatus,        // extended with connection details
  unlinkTelegram,             // extended to revoke connections
  updateTelegramPreferences,

  // New Chat Bridge endpoints
  getConversationChannelStatus,
  bindConversation,
  unbindConversation,

  // New admin endpoints
  adminListConnections,
  adminRevokeConnection,
});
```

---

## Schema Imports Required

The following new table references must be imported from `drizzle/schema.ts` at the top of `telegram.ts`:

```typescript
import {
  systemSettings,
  users,
  conversations,
  agencyConversations,
  telegramConnections,
  conversationChannels,
  telegramLinkTokens,
} from "../../drizzle/schema";
```

These table names correspond to the Drizzle `pgTable` definitions created in Section 01. The exact export names must match what Section 01 defines (e.g., `telegramConnections` for the `telegram_connections` table).

---

## Conversation Ownership Verification

Multiple endpoints need to verify that the calling user owns a conversation. This should be extracted into a shared helper within the file (or imported from a utility):

```typescript
/**
 * Verify that the user owns the specified conversation.
 * Throws TRPCError NOT_FOUND if the conversation doesn't exist or
 * doesn't belong to the user.
 *
 * @param db - Drizzle database instance
 * @param userId - The authenticated user's ID (integer)
 * @param conversationId - The conversation ID (string from input)
 * @param conversationType - 'chat' or 'agency'
 * @returns void (throws on failure)
 */
async function verifyConversationOwnership(
  db: any,
  userId: number,
  conversationId: string,
  conversationType: "chat" | "agency"
): Promise<void> {
  // For chat: query conversations WHERE id = parseInt(conversationId) AND userId = userId
  // For agency: query agencyConversations WHERE id = conversationId AND userId = userId
  // If no row found, throw TRPCError NOT_FOUND
}
```

Key detail: `conversations.id` is `serial` (integer) so the conversationId string must be parsed with `parseInt()`. `agencyConversations.id` is `varchar(36)` so the string is used directly.

---

## Tenant ID Resolution

The `conversations` and `agencyConversations` tables do NOT have a `tenantId` column. Tenant isolation for the new `conversation_channels` and `telegram_connections` tables uses the user's `currentTenantId` from the tRPC context (`ctx.user.currentTenantId`). When creating `conversation_channels` records, derive `tenantId` from the `telegram_connections.tenantId` field (which was set at link time from the user's tenant). This ensures all channel records are properly tenant-scoped.

---

## Error Handling Conventions

All new endpoints should use `TRPCError` with appropriate codes:

| Situation | TRPCError Code |
|-----------|---------------|
| Conversation not found or not owned | `NOT_FOUND` |
| No active Telegram connection | `PRECONDITION_FAILED` |
| Duplicate binding | `CONFLICT` |
| Cross-tenant admin access | `NOT_FOUND` (do not reveal existence) |
| Database unavailable | `INTERNAL_SERVER_ERROR` |

---

## Implementation Checklist

1. Add schema imports to `telegram.ts` (telegramConnections, conversationChannels, telegramLinkTokens, conversations, agencyConversations)
2. Create `verifyConversationOwnership` helper function
3. Implement `getConversationChannelStatus` query
4. Implement `bindConversation` mutation
5. Implement `unbindConversation` mutation
6. Implement `adminListConnections` query
7. Implement `adminRevokeConnection` mutation
8. Extend `generateTelegramLink` to accept optional conversationId/conversationType and insert `telegram_link_tokens` row
9. Extend `unlinkTelegram` to revoke `telegram_connections` and `conversation_channels` records
10. Extend `checkTelegramStatus` to return connection details and bound conversation count
11. Update `telegramRouter` export to include new endpoints
12. Create test file and verify all tests pass with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test server/routers/__tests__/telegram.bridge.test.ts`
13. Run full test suite to verify no regressions: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
14. Run TypeScript check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`