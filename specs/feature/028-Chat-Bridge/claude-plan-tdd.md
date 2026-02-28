# 028-Chat-Bridge: TDD Plan

Mirrors the structure of `claude-plan.md`. Defines test stubs to write BEFORE implementing each section.

## Testing Infrastructure

- **TypeScript tests**: Vitest (`pnpm test` in `apps/web`), existing patterns in `apps/web/server/routers/__tests__/` and `apps/web/server/services/__tests__/`
- **Python tests**: pytest (`pytest` in `python-backend`), existing patterns in `python-backend/tests/`
- **Existing Telegram tests**: `telegramService.test.ts` (509 lines), `telegram.test.ts` (415 lines) — use these as patterns
- **Mock patterns**: db, Redis, fetch already established in existing test files

---

## 3. Data Model

### Test file: `apps/web/server/routers/__tests__/telegramBridge.schema.test.ts`

```typescript
// Test: telegram_connections table can be inserted with all required fields
// Test: telegram_connections UNIQUE(botId, telegramUserId) rejects duplicates
// Test: telegram_connections cascade-deletes when tenant is deleted
// Test: telegram_connections cascade-deletes when user is deleted

// Test: conversation_channels can bind to a chat conversation (chatConversationId set)
// Test: conversation_channels can bind to an agency conversation (agencyConversationId set)
// Test: conversation_channels rejects both conversation IDs set simultaneously
// Test: conversation_channels rejects both conversation IDs null
// Test: conversation_channels UNIQUE constraint prevents duplicate bindings per conversation+channel

// Test: channel_messages can store integer messageId as text (chat messages)
// Test: channel_messages can store bigint messageId as text (agency messages)
// Test: channel_messages UNIQUE(channelType, externalChatId, externalMessageId) dedupes

// Test: telegram_link_tokens tokenHash is unique
// Test: telegram_link_tokens can reference chatConversationId (integer FK)
// Test: telegram_link_tokens can reference agencyConversationId (varchar FK)

// Test: telegram_updates UNIQUE(botId, updateId) prevents duplicate processing

// Test: messages.sourceChannel column accepts nullable varchar values
// Test: conversations.defaultChannelPolicy column accepts nullable varchar values
```

### Test file: `python-backend/tests/test_agency_messages_channel.py`

```python
# Test: agency_messages source_channel column is nullable and accepts string values
# Test: agency_messages source_connection_id column is nullable
# Test: existing agency_messages queries still work with new columns
```

---

## 4. Message Processing

### Test file: `apps/web/server/services/__tests__/channelGateway.test.ts`

```typescript
// --- Inbound (ingest) ---
// Test: ingest routes chat-type event to chat pipeline
// Test: ingest routes agency-type event to agency pipeline
// Test: ingest rejects event with invalid connectionId
// Test: ingest rejects event with revoked connection
// Test: ingest rejects event with no active channel binding
// Test: ingest sets sourceChannel=telegram on saved user message

// --- processMessageServerSide ---
// Test: processMessageServerSide saves user message with sourceChannel metadata
// Test: processMessageServerSide calls buildChatContext with correct conversation
// Test: processMessageServerSide calls LLM gateway (non-streaming)
// Test: processMessageServerSide saves assistant response via createMessage
// Test: processMessageServerSide deducts credits via creditService
// Test: processMessageServerSide calls emitEgress after saving assistant message
// Test: processMessageServerSide handles LLM error gracefully (saves error message)
// Test: processMessageServerSide handles insufficient credits (returns error)

// --- Outbound (emitEgress) ---
// Test: emitEgress queries conversation_channels for active bindings
// Test: emitEgress enqueues BullMQ job for each Telegram binding
// Test: emitEgress skips web-only conversations (no Telegram binding)
// Test: emitEgress skips revoked/paused channels
// Test: emitEgress uses deterministic job ID to prevent duplicate enqueue

// --- Typing Indicator ---
// Test: sendTypingLoop calls sendChatAction every 4 seconds
// Test: sendTypingLoop cleans up interval on completion
// Test: sendTypingLoop cleans up interval on error

// --- Non-text message handling ---
// Test: non-text messages (photo/voice/sticker) receive i18n error reply
// Test: non-text messages do not create canonical messages
```

### Test file: `apps/web/server/routes/__tests__/telegramWebhook.test.ts`

```typescript
// --- Webhook validation ---
// Test: valid secret token returns 200
// Test: invalid secret token returns 403
// Test: missing secret token header returns 403
// Test: missing bot settings returns 404

// --- Dedupe ---
// Test: first update_id processes normally (200 + async processing)
// Test: duplicate update_id returns 200 but skips processing
// Test: Redis SET NX used with 86400 TTL
// Test: telegram_updates record created for audit

// --- Command routing ---
// Test: /start <token> routes to link handler
// Test: /start (no token) routes to status handler
// Test: /help routes to help handler
// Test: /resume routes to resume handler
// Test: /unlink routes to unlink handler
// Test: /status routes to status handler
// Test: plain text message routes to message handler
// Test: callback_query update routes to callback handler

// --- Rate limiting ---
// Test: 30th message in 1 minute from same user is accepted
// Test: 31st message in 1 minute from same user is rejected with rate limit message
```

---

## 5. Delivery Queue

### Test file: `apps/web/server/services/__tests__/deliveryQueue.test.ts`

```typescript
// --- Queue setup ---
// Test: queue initializes with correct Redis client (getRealtimeClient)
// Test: worker has concurrency 10 and rate limit 25/sec
// Test: graceful shutdown calls worker.close() and queue.close()

// --- Job processing ---
// Test: successful delivery updates channel_messages status to 'sent'
// Test: successful delivery stores externalMessageId from Telegram response
// Test: job uses deterministic jobId (tg-deliver-{channelMessageId})

// --- Error classification ---
// Test: 403 Forbidden triggers permanent failure (no retry)
// Test: "bot was blocked by the user" triggers permanent failure
// Test: "chat not found" triggers permanent failure
// Test: 429 Too Many Requests uses retry_after value, doesn't count as attempt
// Test: 500 server error triggers exponential backoff retry
// Test: network error triggers exponential backoff retry
// Test: after 5 failed attempts, job moves to DLQ

// --- Delivery status tracking ---
// Test: pending → sent transition on success
// Test: pending → failed transition after max retries
// Test: attemptCount increments on each retry
// Test: failureCode and failureReason stored on failure
```

---

## 6. Webhook Endpoint

### Test file: `apps/web/server/routes/__tests__/telegramWebhook.integration.test.ts`

```typescript
// Test: webhook registered before tRPC middleware (responds correctly)
// Test: POST to /webhooks/telegram/:botId with valid body returns 200
// Test: GET to /webhooks/telegram/:botId returns 405 (method not allowed)
// Test: POST with empty body returns 200 (graceful handling)
```

---

## 7. Telegram Router Extensions

### Test file: `apps/web/server/routers/__tests__/telegram.bridge.test.ts`

```typescript
// --- getConversationChannelStatus ---
// Test: returns bound=true for conversation with active Telegram channel
// Test: returns bound=false for conversation with no Telegram channel
// Test: returns bound=false for conversation with revoked channel
// Test: rejects for conversations user doesn't own

// --- bindConversation ---
// Test: creates conversation_channels record for chat conversation
// Test: creates conversation_channels record for agency conversation
// Test: uses correct chatConversationId (integer) for chat type
// Test: uses correct agencyConversationId (varchar) for agency type
// Test: rejects binding for user without active Telegram connection
// Test: rejects binding for conversation user doesn't own
// Test: rejects duplicate binding for same conversation+channel

// --- unbindConversation ---
// Test: sets conversation_channels.state to 'revoked'
// Test: clears activeChannelId if it pointed to the unbound channel
// Test: rejects for conversations user doesn't own

// --- generateTelegramLink (extended) ---
// Test: accepts optional conversationId and conversationType
// Test: creates telegram_link_tokens record with SHA-256 hash
// Test: stores targetChatConversationId for chat conversations
// Test: stores targetAgencyConversationId for agency conversations
// Test: token expires after 5 minutes

// --- unlinkTelegram (extended) ---
// Test: revokes telegram_connections record
// Test: revokes all associated conversation_channels
// Test: clears users.telegramVerified for backward compat

// --- adminListConnections ---
// Test: returns paginated connections for admin's tenant
// Test: filters by status when provided
// Test: requires admin role

// --- adminRevokeConnection ---
// Test: revokes connection and all channel bindings
// Test: requires admin role
// Test: rejects cross-tenant access
```

---

## 8. Chat and Agency Pipeline Integration

### Test file: `apps/web/server/routers/__tests__/chat.bridge.test.ts`

```typescript
// Test: saveAssistantMessage calls emitEgress when conversation has active channels
// Test: saveAssistantMessage does NOT call emitEgress when conversation has no channels
// Test: saveAssistantMessage still works normally (existing behavior preserved)
// Test: sendMessage accepts optional sourceChannel in input
// Test: user message saved with sourceChannel metadata when provided
```

### Test file: `apps/web/server/routers/__tests__/agency.bridge.test.ts`

```typescript
// Test: sendMessage calls emitEgress after agencyBridge.executeRun
// Test: sendMessage does NOT call emitEgress when no active channels
// Test: agency pipeline still works normally (existing behavior preserved)
```

---

## 9. Security

### Test file: `apps/web/server/routes/__tests__/telegramWebhook.security.test.ts`

```typescript
// --- Webhook validation ---
// Test: timing-safe comparison used for secret validation (no short-circuit)
// Test: failed validation logs to audit trail

// --- Link token security ---
// Test: expired token (>5 min) is rejected
// Test: already-used token (usedAt set) is rejected
// Test: revoked token (revokedAt set) is rejected
// Test: valid token is consumed (usedAt set) in same transaction as connection creation

// --- Rate limiting ---
// Test: in-process rate limiter tracks per-Telegram-user counts
// Test: rate limit resets after 1 minute window

// --- Tenant isolation ---
// Test: webhook handler resolves tenantId from connection, not conversation
// Test: admin endpoints restrict to caller's tenant
// Test: user endpoints verify conversation ownership before binding
```

---

## 10. Localization

### Test file: `apps/web/server/services/__tests__/telegramI18n.test.ts`

```typescript
// Test: getMessage returns Thai text for language_code 'th'
// Test: getMessage returns English text for language_code 'en'
// Test: getMessage returns English text for unknown language_code
// Test: getMessage returns English text for undefined language_code
// Test: all message keys have both 'th' and 'en' translations
// Test: no message string is empty
```

---

## 11. Impact and Regression

### Existing test verification (no new test file needed)

```
# Run after each phase to verify no regressions:
# Test: all existing tests in telegramService.test.ts pass
# Test: all existing tests in telegram.test.ts pass
# Test: all existing tests in chat router tests pass
# Test: all existing tests in agency router tests pass
# Test: pnpm check (TypeScript) passes
# Test: pnpm test (full suite) passes
```

---

## 13. Backward Compatibility

### Test file: `apps/web/server/routers/__tests__/telegram.compat.test.ts`

```typescript
// Test: creating telegram_connections also sets users.telegramVerified = true
// Test: revoking telegram_connections also sets users.telegramVerified = false
// Test: checkTelegramStatus returns correct status from both old fields and new table
// Test: existing notification flow (notificationService → telegramService) still works
// Test: existing telegram preferences (updateTelegramPreferences) still works
```

---

## Rendering Tests

### Test file: `apps/web/server/services/__tests__/telegramRendering.test.ts`

```typescript
// Test: markdown bold converted to <b> tags
// Test: markdown italic converted to <i> tags
// Test: code blocks converted to <pre> tags
// Test: unsupported markdown (tables, footnotes) stripped
// Test: message ≤ 4096 chars returned as single chunk
// Test: message > 4096 chars split at paragraph boundaries
// Test: split messages get truncation notice with web URL
// Test: code blocks capped at 2000 chars with truncation notice
// Test: HTML special chars (&, <, >) properly escaped in text
```
