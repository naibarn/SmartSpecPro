# 028-Chat-Bridge: Integration Notes

Analysis of Opus review findings and decisions on what to integrate.

## INTEGRATING (with modifications)

### 1. CRITICAL: Conversation ID Type Mismatch
**Finding**: `conversations.id` is `serial` (integer), `agencyConversations.id` is `varchar(36)`.
**Decision**: INTEGRATE. Split into two nullable FK columns:
- `chatConversationId: integer` (FK to conversations.id)
- `agencyConversationId: varchar(36)` (FK to agencyConversations.id)
- Add CHECK constraint: exactly one must be non-null
- Same pattern for `telegram_link_tokens.targetConversationId`

### 2. CRITICAL: No tenantId on conversations table
**Finding**: `conversations` has only `userId`, no `tenantId` column.
**Decision**: INTEGRATE. Document that tenant isolation for regular conversations works through `userId` -> `users.currentTenantId`. The `conversation_channels.tenantId` comes from `telegram_connections.tenantId`, not from conversations.

### 3. HIGH: sendMessage Does Not Run LLM Inline
**Finding**: `sendMessage` only saves user message, returns immediately. LLM processing happens via client-initiated SSE streaming at `/api/llm/stream`.
**Decision**: INTEGRATE. This is a critical architecture gap. For Telegram inbound, we need a new internal `processMessageServerSide()` function that combines:
1. Save user message
2. Build chat context (skill detect, history, system prompt)
3. Call LLM gateway (non-streaming)
4. Save assistant message
5. Deduct credits
This function will be used by the channel gateway for all non-web channels.

### 4. HIGH: agency_messages.id is BigInteger, not varchar(36)
**Finding**: `channel_messages.messageId` can't use FK to both tables since types differ.
**Decision**: INTEGRATE. Make `messageId` a text field with no FK constraint. Rely on `conversationType` from the linked `conversation_channels` to know which table to query.

### 5. HIGH: Webhook URL Mismatch
**Finding**: Existing `registerWebhook` uses `/api/webhook/telegram`, new plan uses `/webhooks/telegram/:botId`.
**Decision**: INTEGRATE. Add explicit step in Phase 1A to update `registerWebhook` mutation and re-register with Telegram after deployment.

### 6. HIGH: allowed_updates Missing callback_query
**Finding**: Current `allowed_updates: ["message"]` won't deliver inline keyboard callbacks.
**Decision**: INTEGRATE. Update to `["message", "callback_query"]` in setWebhook.

### 7. MEDIUM: Redis Client Selection
**Finding**: Multiple Redis client modules with different configurations.
**Decision**: INTEGRATE. Explicitly specify in plan:
- Dedupe: `getCacheClient()` from `redisClients.ts`
- BullMQ: `getRealtimeClient()` from `redisClients.ts`
- Existing link codes: `getRedisClient()` from `redis.ts` (backward compat)

### 8. MEDIUM: TanStack Query Server-Side Invalidation Impossible
**Finding**: Server cannot directly invalidate client-side TanStack Query cache.
**Decision**: INTEGRATE. Correct the language: web clients pick up messages on their next polling cycle. No server-push mechanism in Phase 1.

### 9. MEDIUM: Active Conversation State Storage
**Finding**: No specification of where "currently selected conversation" is stored for a Telegram user.
**Decision**: INTEGRATE. Add `activeChannelId` nullable FK on `telegram_connections` pointing to `conversation_channels.id`. Updated by `/resume` command and deep link activation.

### 10. MEDIUM: Typing Indicator Refresh
**Finding**: LLM calls 5-30s+, typing indicators expire after 5s.
**Decision**: INTEGRATE. Add a `sendTypingLoop()` helper in the channel gateway that refreshes every 4 seconds and cleans up in finally block.

### 11. LOW: Non-Text Messages
**Finding**: Photos/voice/stickers silently dropped.
**Decision**: INTEGRATE. Add a polite i18n error reply for unsupported message types.

## NOT INTEGRATING

### 1. MEDIUM: Feature Flag
**Reason**: The webhook route only exists after deployment. For Phase 1 with <100 users, the admin `setWebhook` call is the effective "enable" toggle. If the admin doesn't register the webhook, no Telegram messages arrive. Adding a full tenant-scoped feature flag is over-engineering for Phase 1. Can be added in Phase 2 with admin controls.

### 2. MEDIUM: In-Process Rate Limiting Limitation
**Reason**: Acknowledged but not actionable for Phase 1. Single-process deployment is the expected configuration. Documenting as a known constraint is sufficient.

### 3. LOW: Cookie Middleware on Webhook Route
**Reason**: Cookie parser on webhook route adds negligible overhead and won't cause functional issues. Not worth the complexity of route-specific middleware exclusion.

### 4. LOW: Bot Username Validation
**Reason**: The existing `testTelegramConnection` endpoint already validates via `/getMe`. Users test before deploying. Adding automated validation on every deep link generation is unnecessary overhead.

### 5. LOW: DLQ Processing Strategy
**Reason**: Phase 1 DLQ is for observation. Admin can query via the existing queue stats infrastructure. Automated DLQ processing belongs in Phase 2.

### 6. LOW: Deep Link Payload Length Constraint
**Reason**: 32 hex chars well under 64-char limit. Adding an explicit check is over-engineering.
