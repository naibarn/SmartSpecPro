# Section 06 — Inbox Backend

## Dependencies
- section-01-db-schema: `socialConversations`, `socialMessages`, `socialPages`
- section-03-meta-graph-client: Python send endpoint
- section-04-oauth-connection: Page connection context
- section-05-webhook-ingestion: Populated conversations and messages

## Overview
`socialInbox.ts` tRPC router and `socialInboxService.ts` service layer for tenant-scoped conversation listing, message retrieval, reply sending, and conversation management.

## Files to Create or Modify
| File | Action |
|------|--------|
| `apps/web/server/routers/socialInbox.ts` | Create — tRPC router |
| `apps/web/server/services/socialInboxService.ts` | Create — Service layer |
| `apps/web/server/routers.ts` | Modify — wire router |
| Tests: `socialInbox.test.ts`, `socialInboxService.test.ts` | Create |

## Tests First
```
# Router Tests:
# Test: listConversations returns paginated results with cursor, filters by status/pageId
# Test: listConversations scopes by tenantId
# Test: getConversation returns conversation with recent messages
# Test: getConversation rejects cross-tenant access
# Test: listMessages returns cursor-paginated messages in chronological order
# Test: sendReply creates outbound message, calls python-backend with page_id (NOT decrypted token)
# Test: sendReply resets unreadCount (DB + Redis counter)
# Test: sendReply writes audit log
# Test: sendReply rejects when page status is not "active"
# Test: all procedures reject unauthenticated / feature-disabled

# Service Tests:
# Test: getConversationsByTenant returns conversations joined with page name
# Test: getMessagesByConversation validates tenant ownership
# Test: sendMessageViaPythonBackend passes page_id only (never decrypted token)
# Test: getPageForConversation throws when page not active or token expired
```

## CRITICAL Fix: Token Flow (HIGH-03)
`sendReply` and all outbound operations pass ONLY `page_id` to python-backend. Python-backend reads `socialPages.encryptedPageAccessToken` from DB and decrypts with `smartspecweb_crypto` immediately before the Meta API call. Node.js NEVER decrypts page tokens.

## Implementation Guidance

### Service Layer (`socialInboxService.ts`)

Key functions:
- `getConversationsByTenant(tenantId, filters)` — Drizzle query with LEFT JOIN to `socialPages`, cursor pagination on `lastMessageAt DESC`
- `getMessagesByConversation(conversationId, tenantId, cursor, limit)` — chronological order
- `createOutboundMessage(params)` — Insert `socialMessages` (direction=outbound, senderType=agent)
- `sendMessageViaPythonBackend(pageId, recipientPsid, text)` — POST `{ page_id, recipient_id, text }` with `X-Internal-Token`. **No token in body.**
- `getPageForConversation(conversationId, tenantId)` — Validates page `status === "active"` and `tokenExpiresAt` not expired

All functions use shared `verifyPageAccess()` from `socialAccessService.ts` (section-04).

### Redis Unread Counters (Interview Q2)
- On `sendReply`: reset Redis `social:unread:{tenantId}:{conversationId}` to 0 AND SQL `unreadCount = 0`
- On `listConversations`: read unread counts from Redis (O(1)) with DB fallback
- Counter is maintained by webhook normalizer (section-05) on inbound messages

### tRPC Router (`socialInbox.ts`)
All procedures use `protectedProcedure` + `META_CHANNELS_ENABLED` middleware.

| Procedure | Type | Input |
|-----------|------|-------|
| listConversations | query | { pageId?, status?, cursor?, limit(max 50) } |
| getConversation | query | { conversationId } |
| listMessages | query | { conversationId, cursor?, limit(max 100) } |
| sendReply | mutation | { conversationId, body(max 2000) } |
| generateDraft | mutation | { conversationId } — delegates to section-08 |
| updateConversationStatus | mutation | { conversationId, status } |

### Cursor Pagination Pattern
```typescript
// Fetch limit+1 rows, determine hasMore
const rows = await db.select().from(socialConversations)
  .where(and(...conditions))
  .orderBy(desc(socialConversations.lastMessageAt))
  .limit(limit + 1);
const hasMore = rows.length > limit;
const items = hasMore ? rows.slice(0, limit) : rows;
const nextCursor = hasMore ? items[items.length - 1].lastMessageAt?.toISOString() : null;
```

### HTTP Call Pattern (to python-backend)
```typescript
const response = await fetch(`${PYTHON_BACKEND_URL}/api/internal/meta/messages/send`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Internal-Token": GATEWAY_TOKEN },
  body: JSON.stringify({ page_id: pageId, recipient_id: psid, text: body }),
  signal: AbortSignal.timeout(30_000),
});
```
