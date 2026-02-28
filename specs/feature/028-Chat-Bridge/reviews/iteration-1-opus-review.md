# 028-Chat-Bridge Implementation Plan Review

## Document: `specs/feature/028-Chat-Bridge/claude-plan.md`

---

## CRITICAL: Conversation ID Type Mismatch

The plan defines `conversation_channels.conversationId` as `varchar(36)` (Section 3.2) and uses `varchar(36)` throughout. However, the actual codebase has two different ID types:

- **`conversations.id`** is `serial("id").primaryKey()` -- an **auto-incrementing integer**.
- **`agencyConversations.id`** is `varchar("id", { length: 36 }).primaryKey()` -- a **UUID string**.

The plan treats both as `varchar(36)`, which is incorrect for regular conversations. All queries joining `conversation_channels.conversationId` to `conversations.id` will fail due to type mismatch (string vs integer).

**Recommended fix**: Split into two nullable FK columns (`chatConversationId: integer` + `agencyConversationId: varchar(36)`) and enforce that exactly one is set. This allows actual foreign key constraints.

---

## CRITICAL: `conversations` Table Has No `tenantId` Column

The plan assumes `tenantId` scoping on conversations (Section 3.2, Section 9). However, the `conversations` table has **no `tenantId` column**. It only has `userId`. Tenant isolation for regular conversations currently works through `userId` -> `users.currentTenantId`.

**Recommended fix**: Acknowledge this explicitly. Tenant validation must happen at the user level (via `telegram_connections.tenantId` -> `users.currentTenantId`), not by joining to conversations.

---

## HIGH: `sendMessage` in `chat.ts` Does Not Process LLM Inline

The plan describes a synchronous request-response flow, but the actual chat system is split into:
1. `sendMessage` (saves user message only)
2. Client-initiated SSE stream (runs LLM, streams response)
3. `saveAssistantMessage` (saves completed response)

For Telegram, there is no browser to initiate the SSE stream. The plan needs to address how the Telegram inbound path will trigger the full LLM pipeline server-side. Options:
- Create a new internal function that combines context building + LLM call + response save
- Reuse any existing non-streaming path
- Call the LLM gateway directly with the chat context and save the result

---

## HIGH: `agency_messages` Has No `tenantId` Column and Uses BigInteger ID

`agency_messages.id` is `BigInteger` (auto-incrementing), not `varchar(36)`. The `messageId` column in `channel_messages` needs to handle both `messages.id` (integer) and `agency_messages.id` (bigint).

**Recommended fix**: Document that `channel_messages.messageId` is a logical reference (no FK constraint) since it references two different tables with different types. Rely on `conversationType` already in `conversation_channels`.

---

## HIGH: Webhook URL Mismatch With Existing Code

Existing `registerWebhook` constructs: `${appUrl}/api/webhook/telegram`. Plan proposes `/webhooks/telegram/:botId`. Any existing webhook registration with Telegram will break after this change. The plan should include a step to re-register the webhook after deploying the new route.

---

## HIGH: `allowed_updates` Does Not Include `callback_query`

Existing `registerWebhook` sets `allowed_updates: ["message"]`. The plan describes `/unlink` using inline keyboard confirmation with callback query handling. Callback queries require `"callback_query"` in `allowed_updates`.

**Recommended fix**: Add `"callback_query"` to `allowed_updates` in the updated `setWebhook` call. Update webhook handler to parse `callback_query` updates.

---

## MEDIUM: Redis Client Selection Confusion

The codebase has **two** Redis client modules. The plan should explicitly state which Redis client to use for each purpose:
- Dedupe SET NX: `getCacheClient()` (stateless, short-lived)
- BullMQ Queue + Worker: `getRealtimeClient()` (connection-oriented, BullMQ-compatible)
- Telegram verification codes (existing): `getRedisClient()` from `redis.ts` (maintain backward compatibility)

---

## MEDIUM: TanStack Query Invalidation From Server Side Is Impossible

TanStack Query runs client-side. The server cannot directly invalidate a client-side cache. What actually happens is polling at `refetchInterval`.

**Recommended fix**: Remove server-side cache invalidation claims. State that web clients pick up new messages on their next polling cycle.

---

## MEDIUM: No Feature Flag for the Chat Bridge

The agency system uses `AGENCY_SWARM_ENABLED` as a tenant-scoped feature flag. The chat bridge should similarly be behind a feature flag.

**Recommended fix**: Add a tenant-scoped feature flag check in the webhook handler and channel gateway.

---

## MEDIUM: Typing Indicator Refresh Loop Not Designed

LLM calls can take 5-30+ seconds, Telegram typing indicators expire after 5 seconds. The plan does not describe who refreshes the typing indicator every 4 seconds. For agency calls via `agencyBridge.executeRun()`, the call blocks for up to 120 seconds.

---

## MEDIUM: In-Process Rate Limiting Not Multi-Instance Safe

The plan proposes in-process rate limiting (30 messages/minute per Telegram user). This works for single-process deployment but not multiple instances.

---

## MEDIUM: "Active Conversation" State Storage Not Specified

The plan requires explicit conversation selection but does not specify where the "currently selected conversation" is stored. Needs `activeConversationChannelId` or similar field on `telegram_connections`.

---

## LOW: Webhook Route Inherits Unnecessary Cookie Middleware

`cookieParser` is applied globally. The webhook route should not have session middleware applied.

---

## LOW: Deep Link Payload Length Constraint Undocumented

128-bit tokens (32 hex chars) fit within 64-char limit but should be documented.

---

## LOW: Bot Username Validation Gap

Deep link URL uses `botUsername` from `systemSettings`. If wrong, deep link points to wrong bot.

---

## LOW: DLQ Processing Strategy Unspecified

Plan creates `telegram-delivery-dlq` but does not specify what happens to jobs in it.

---

## LOW: Non-Text Telegram Messages Silently Dropped

Plan exclusively handles text messages. Non-text messages should receive a polite error reply.

---

## Positive Aspects

1. Good separation of concerns with channel gateway pattern
2. Sound dedupe strategy (Redis + DB)
3. Solid backward compatibility plan (dual-writing)
4. Well thought out BullMQ error classification
5. Reasonable phased approach (1A -> 1B -> 1C)
6. Additive-only schema changes (safe migrations)

---

## Summary of Issues by Severity

| Severity | Issue |
|----------|-------|
| CRITICAL | Conversation ID type mismatch (integer vs varchar) |
| CRITICAL | `conversations` table has no `tenantId` column |
| HIGH | `sendMessage` does not run LLM inline -- streaming architecture |
| HIGH | `agency_messages.id` is BigInteger, not varchar(36) |
| HIGH | Webhook URL change will break existing registration |
| HIGH | `allowed_updates` missing `callback_query` |
| MEDIUM | Redis client selection not specified per use case |
| MEDIUM | Server-side TanStack Query invalidation is impossible |
| MEDIUM | No feature flag for runtime control |
| MEDIUM | Typing indicator refresh loop not designed |
| MEDIUM | In-process rate limiting not multi-instance safe |
| MEDIUM | "Active conversation" state storage not specified |
| LOW | Webhook route inherits unnecessary cookie middleware |
| LOW | Deep link payload length constraint undocumented |
| LOW | Bot username validation gap |
| LOW | DLQ processing strategy unspecified |
| LOW | Non-text Telegram messages silently dropped |
