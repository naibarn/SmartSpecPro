# Implementation Plan — Feature 058: Meta Channels

## 1. Overview

This plan describes how to add a native Meta Channels subsystem to SmartSpecPro, enabling tenants to connect Facebook Pages and manage Messenger conversations, content publishing, comment moderation, and AI-assisted automation — all integrated with the existing workflow engine and agency system.

The subsystem spans three layers:
- **apps/web** (React pages + tRPC routers + services) — UI and control plane
- **python-backend** (FastAPI endpoints + services + Celery tasks) — provider communication and async processing
- **Database** (Drizzle ORM schema + migrations) — durable state

### Scale Requirements

Designed for enterprise use: 20+ connected pages per tenant, 1000+ inbound messages per day. This drives architectural choices around partitioned processing, cursor-based pagination, Redis caching, and connection pooling.

### Feature Flag

All Meta Channels functionality is gated by `META_CHANNELS_ENABLED` (default `false`). When disabled, menu items are hidden, tRPC procedures return "feature disabled" errors, and webhook endpoints reject events.

---

## 2. Database Schema

### 2.1 New Tables

All tables use Drizzle ORM `pgTable()` definitions in `apps/web/drizzle/schema.ts`, following existing camelCase column conventions.

#### Provider Connection Layer

**`socialProviderConnections`** — One OAuth authorization per tenant/user/provider.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| userId | integer FK → users | NOT NULL — the user who authorized |
| provider | varchar(50) | "meta" (extensible for future providers) |
| providerUserId | varchar(255) | Meta user ID |
| status | varchar(20) | "active" / "expired" / "revoked" / "error" |
| grantedScopes | json | string[] of granted OAuth scopes |
| encryptedAccessToken | text | AES-256-GCM encrypted long-lived user token |
| encryptedRefreshToken | text | nullable, for providers that support refresh |
| tokenExpiresAt | timestamptz | When long-lived token expires (~60 days for Meta) |
| metadata | json | Provider-specific extra data |
| createdAt / updatedAt | timestamptz | |

**`socialPages`** — One connected Facebook Page per tenant.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| connectionId | integer FK → socialProviderConnections | CASCADE delete |
| providerPageId | varchar(255) | Facebook Page ID |
| pageName | varchar(500) | |
| pageCategory | varchar(255) | |
| status | varchar(20) | "active" / "disconnected" / "needs_reauth" |
| encryptedPageAccessToken | text | AES-256-GCM encrypted page token |
| tokenExpiresAt | timestamptz | Page tokens from long-lived user tokens are typically long-lived but Meta can invalidate them (password change, app removal). The token refresh task monitors this. |
| selectedForInbox | boolean default true | |
| selectedForPublishing | boolean default true | |
| selectedForModeration | boolean default false | |
| aiActionMode | varchar(20) default "draft_only" | "off" / "draft_only" / "approval_required" / "auto_send" |
| autoSendConfidenceThreshold | real default 0.95 | For auto_send mode |
| metadata | json | |
| createdAt / updatedAt | timestamptz | |

**`socialWebhookSubscriptions`** — Tracks webhook subscription state per page.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| pageId | integer FK → socialPages | CASCADE delete |
| subscriptionStatus | varchar(20) | "pending" / "active" / "failed" |
| subscribedFields | json | string[] — e.g. ["messages", "feed"] |
| lastVerifiedAt | timestamptz | |
| lastDeliveryAt | timestamptz | |
| lastError | text | |
| createdAt / updatedAt | timestamptz | |

#### Inbox Layer

**`socialConversations`** — One Messenger thread per customer per page.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| pageId | integer FK → socialPages | NOT NULL |
| providerConversationId | varchar(255) | Synthetic: `{pageId}:{customerExternalId}` |
| channelType | varchar(50) default "messenger" | |
| customerExternalId | varchar(255) | PSID |
| customerDisplayName | varchar(500) | |
| status | varchar(20) default "open" | "open" / "pending" / "resolved" / "archived" |
| assignedToUserId | integer FK → users | nullable |
| priority | integer default 0 | |
| lastMessageAt | timestamptz | |
| lastInboundAt | timestamptz | |
| lastOutboundAt | timestamptz | |
| unreadCount | integer default 0 | |
| labels | json | string[] |
| createdAt / updatedAt | timestamptz | |

**`socialMessages`** — Individual messages within conversations.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| conversationId | integer FK → socialConversations | CASCADE delete |
| pageId | integer FK → socialPages | NOT NULL |
| providerMessageId | varchar(255) | Meta message ID (mid) |
| direction | varchar(10) | "inbound" / "outbound" |
| senderType | varchar(20) | "customer" / "agent" / "ai" / "system" |
| senderExternalId | varchar(255) | |
| senderUserId | integer FK → users | nullable — for outbound agent/ai messages |
| messageType | varchar(30) default "text" | "text" / "attachment" / "quick_reply" / "system_event" |
| body | text | |
| payload | json | Full structured payload for rich messages |
| deliveryStatus | varchar(20) default "sent" | "sent" / "delivered" / "read" / "failed" |
| errorMessage | text | |
| sentAt | timestamptz | |
| receivedAt | timestamptz | |
| workflowTriggerStatus | varchar(20) | null / "dispatched" — for batch workflow triggers |
| createdAt | timestamptz | |

#### Publishing Layer

**`socialPosts`** — Page posts created from SmartSpecPro.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| pageId | integer FK → socialPages | NOT NULL |
| providerPostId | varchar(255) | Facebook post ID |
| status | varchar(20) default "draft" | "draft" / "scheduled" / "publishing" / "published" / "failed" |
| contentText | text | |
| contentLink | text | |
| mediaRefs | json | string[] of asset URLs |
| scheduledAt | timestamptz | For scheduled posts |
| publishedAt | timestamptz | |
| createdByUserId | integer FK → users | |
| approvedByUserId | integer FK → users | nullable |
| errorMessage | text | |
| metadata | json | |
| createdAt / updatedAt | timestamptz | |

#### Comment Layer

**`socialComments`** — Comments on page posts.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| pageId | integer FK → socialPages | NOT NULL |
| providerCommentId | varchar(255) | |
| providerObjectId | varchar(255) | Post/photo ID this comment is on |
| parentCommentId | integer | nullable, self-reference for reply threads |
| authorExternalId | varchar(255) | |
| authorDisplayName | varchar(500) | |
| body | text | |
| status | varchar(20) default "visible" | "visible" / "hidden" / "deleted" |
| lastAction | varchar(20) | "reply" / "hide" / "delete" / "flag" |
| createdAt / updatedAt | timestamptz | |

**`socialCommentActions`** — Audit trail of moderation actions.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| commentId | integer FK → socialComments | CASCADE delete |
| actionType | varchar(20) | "reply" / "hide" / "delete" / "flag" |
| performedByUserId | integer FK → users | nullable |
| performedBySystem | boolean default false | |
| providerResult | json | |
| status | varchar(20) default "completed" | |
| errorMessage | text | |
| createdAt | timestamptz | |

#### Automation Layer

**`socialAutomationRules`** — Per-page automation configuration.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| pageId | integer FK → socialPages | nullable (null = all pages) |
| name | varchar(255) | |
| isEnabled | boolean default false | |
| triggerType | varchar(50) | "new_message" / "keyword_match" / "unread_timeout" |
| conditions | json | Trigger-specific condition config |
| actionMode | varchar(20) default "draft_only" | "off" / "draft_only" / "approval_required" / "auto_send" |
| policyConfig | json | Blocked categories, confidence override, etc. |
| createdByUserId | integer FK → users | |
| createdAt / updatedAt | timestamptz | |

**`socialHumanApprovals`** — Approval queue for AI-generated actions.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) FK → tenants | NOT NULL |
| pageId | integer FK → socialPages | |
| entityType | varchar(50) | "reply" / "post" / "comment_action" |
| entityId | integer | References socialMessages.id, socialPosts.id, etc. |
| proposedContent | text | The AI-generated content awaiting approval |
| confidence | real | AI confidence score |
| status | varchar(20) default "pending" | "pending" / "approved" / "rejected" / "expired" |
| requestedBySystem | boolean default true | |
| reviewedByUserId | integer FK → users | |
| decisionNote | text | |
| createdAt / updatedAt | timestamptz | |

#### Operations Layer

**`socialWebhookEventsRaw`** — Raw webhook payload archive for replay/debugging.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tenantId | varchar(36) | nullable (resolved after parsing) |
| provider | varchar(50) | "meta" |
| pageId | integer | nullable (resolved after parsing) |
| deliveryId | varchar(255) | For dedup — derived from `entry.id + "_" + messaging[].message.mid` (per-message unique). Fallback: `entry.id + "_" + timestamp + "_" + index` if `mid` absent |
| eventType | varchar(100) | "messaging" / "feed" / "mention" |
| payload | json | Full raw POST body |
| headers | json | Sanitized request headers — allowlist only: `content-type`, `x-hub-delivery`. **NEVER store `X-Hub-Signature-256`** (replay attack prevention) |
| receivedAt | timestamptz | |
| processingStatus | varchar(20) default "pending" | "pending" / "processed" / "failed" / "skipped" |
| errorMessage | text | |

### 2.2 Indexes

Critical indexes for enterprise-scale query performance:

```
social_pages: (tenantId), (connectionId)
social_conversations: (tenantId, pageId), (status, lastMessageAt DESC), (tenantId, status)
social_messages: (conversationId, createdAt), (providerMessageId) UNIQUE, (pageId, workflowTriggerStatus)
social_posts: (tenantId, status), (pageId, scheduledAt)
social_comments: (pageId, createdAt DESC), (providerCommentId) UNIQUE
social_webhook_events_raw: (processingStatus, receivedAt), (provider, deliveryId) UNIQUE
social_human_approvals: (tenantId, status, createdAt DESC)
```

### 2.3 Migration

Single migration file `drizzle/NNNN_meta_channels.sql` generated by `drizzle-kit generate`. Run `pnpm db:push` immediately after schema changes. Verify row counts on existing tables after migration (new tables only, no existing table modifications).

---

## 3. Feature Flag & Menu Registration

### 3.1 Feature Flag

Add `META_CHANNELS_ENABLED` to the `TenantFeatureFlags` interface in `apps/web/shared/featureFlags.ts`:

```typescript
META_CHANNELS_ENABLED: boolean;  // default: false
```

Add to `ALLOWED_FEATURE_FLAGS` set and `FEATURE_FLAG_DEFAULTS` (default `false` — opt-in).

### 3.2 Menu Items

Add 4 menu items in `packages/shared/src/constants/menu.ts` under a new `"social"` section in the main group:

| id | label | labelTh | icon | path | sortOrder |
|----|-------|---------|------|------|-----------|
| social-channels | Social Channels | ช่องทางโซเชียล | Share2 | /social/channels | 7.0 |
| social-inbox | Social Inbox | กล่องข้อความ | MessageCircle | /social/inbox | 7.1 |
| social-publishing | Publishing | เผยแพร่ | FileText | /social/publishing | 7.2 |
| social-moderation | Moderation | ตรวจสอบ | Shield | /social/moderation | 7.3 |

All items: `requiresFeature: "META_CHANNELS_ENABLED"`, `platforms: ["web", "desktop"]`, `group: "main"`.

### 3.3 Routes

Add 4 lazy-loaded routes in `apps/web/client/src/App.tsx`:

- `/social/channels` → `SocialChannels.tsx` (RequireAuth)
- `/social/inbox` → `SocialInbox.tsx` (RequireAuth)
- `/social/publishing` → `SocialPublishing.tsx` (RequireAuth)
- `/social/moderation` → `SocialModeration.tsx` (RequireAuth)

---

## 4. Python Backend — Meta API Client

### 4.1 Meta Graph API Client

File: `python-backend/app/services/social/meta_graph_client.py`

Async HTTP client wrapping Meta Graph API v25.0 using `httpx.AsyncClient` with connection pooling.

```python
class MetaGraphClient:
    """Async client for Meta Graph API with rate limiting and retry."""

    def __init__(self, page_access_token: str, page_id: str): ...

    async def send_message(self, recipient_psid: str, text: str) -> dict: ...
    async def create_post(self, message: str, link: str | None, scheduled_at: int | None) -> dict: ...
    async def get_page_feed(self, limit: int, after: str | None) -> dict: ...
    async def get_comments(self, object_id: str, limit: int, after: str | None) -> dict: ...
    async def reply_to_comment(self, object_id: str, message: str) -> dict: ...
    async def hide_comment(self, comment_id: str, is_hidden: bool) -> dict: ...
    async def delete_comment(self, comment_id: str) -> dict: ...
    async def subscribe_webhooks(self, fields: list[str]) -> dict: ...
    async def get_page_info(self) -> dict: ...
    async def close(self): ...
```

Key design points:
- Base URL: `https://graph.facebook.com/v25.0`
- All methods append `access_token` as query param (Meta pattern)
- Retry on 429 (rate limit) with exponential backoff using `X-App-Usage` header
- Retry on 2 (service unavailable) up to 3 times
- Detect 190 (invalid token) → mark page status as `needs_reauth`
- Connection pool: `httpx.AsyncClient(limits=httpx.Limits(max_connections=20, max_keepalive_connections=10))`
- Timeout: 30s default, configurable per method
- All methods log structured events via `structlog`

### 4.2 Webhook Signature Validator

File: `python-backend/app/services/social/webhook_validator.py`

```python
def validate_meta_webhook_signature(body: bytes, signature_header: str, app_secret: str) -> bool:
    """Validate X-Hub-Signature-256 using constant-time comparison."""
```

Uses `hmac.new()` with SHA-256 and `hmac.compare_digest()` for constant-time comparison. The raw body bytes (not decoded JSON) must be used for HMAC computation.

### 4.3 Webhook Normalizer

File: `python-backend/app/services/social/webhook_normalizer.py`

Transforms raw Meta webhook payloads into `socialConversations` + `socialMessages` records:

```python
class WebhookNormalizer:
    async def normalize_messaging_event(self, entry: dict, page_id: int, tenant_id: str) -> NormalizedMessage: ...
    async def normalize_feed_event(self, entry: dict, page_id: int, tenant_id: str) -> NormalizedComment: ...
```

Key logic:
- Extract sender PSID from `entry.messaging[].sender.id`
- Find or create `socialConversations` by `(pageId, customerExternalId)`
- Create `socialMessages` record with direction="inbound", senderType="customer"
- Update conversation `lastMessageAt`, `lastInboundAt`, increment `unreadCount`
- For feed events, create `socialComments` records

### 4.4 Webhook Deduplication

File: `python-backend/app/services/social/webhook_dedup.py`

Redis-based dedup using key pattern `social:dedup:meta:{deliveryId}` with 24h TTL.

```python
class WebhookDedup:
    async def is_duplicate(self, delivery_id: str) -> bool: ...
    async def mark_processed(self, delivery_id: str) -> None: ...
```

`delivery_id` is derived from `entry.id` + `messaging[].timestamp` (Meta doesn't provide a unique delivery ID, so we synthesize one).

---

## 5. Python Backend — API Endpoints

### 5.1 OAuth Endpoints

File: `python-backend/app/api/meta_oauth.py`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/oauth/meta/authorize` | Generate Facebook Login URL with CSRF state |
| POST | `/api/oauth/meta/callback` | Exchange auth code → short-lived → long-lived token → store encrypted |
| GET | `/api/oauth/meta/status` | Return connection status for current user |

OAuth flow:
1. `/authorize` generates URL: `https://www.facebook.com/v25.0/dialog/oauth?client_id=...&scope=pages_manage_posts,pages_messaging,pages_read_engagement,pages_show_list&state={csrf}&redirect_uri=https://smartaihub.app/auth/callback/meta`
2. Meta redirects to `https://smartaihub.app/auth/callback/meta?code=...&state=...`. The existing `AuthCallback.tsx` handles this via the `/auth/callback/:provider` route. For Meta, instead of creating a session, it calls `metaChannels.completeOAuth({ code, state })` which proxies to the python-backend callback.
3. `/callback` receives `code` + `state`, validates CSRF, exchanges code for short-lived token, then exchanges for long-lived token (~60 days), stores encrypted in `socialProviderConnections`
4. After token storage, retrieves available pages via `GET /me/accounts` and returns page list
5. Frontend redirects to `/social/channels` and shows page selection UI

**Important:** The `AuthCallback.tsx` must be extended to detect `provider === "meta"` and handle the Meta-specific flow (no session creation, redirect to Social Channels page instead of dashboard).

### 5.2 Page Management Endpoints

File: `python-backend/app/api/meta_pages.py`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/internal/meta/pages` | List available pages for a connection |
| POST | `/api/internal/meta/pages/connect` | Connect a page (store token, subscribe webhooks) |
| POST | `/api/internal/meta/pages/disconnect` | Disconnect a page (unsubscribe, clear token) |
| POST | `/api/internal/meta/pages/subscribe-webhook` | Subscribe page to webhook fields |

When connecting a page:
1. Retrieve page-specific access token from `GET /me/accounts`
2. Encrypt page token and store in `socialPages.encryptedPageAccessToken`
3. Subscribe to webhook fields: `messages`, `messaging_postbacks`, `feed`
4. Create `socialWebhookSubscriptions` record

### 5.3 Webhook Endpoint

File: `python-backend/app/api/meta_webhooks.py`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/webhooks/meta` | Webhook verification challenge |
| POST | `/api/webhooks/meta` | Receive webhook events |

GET handler: Verify `hub.verify_token` matches `META_WEBHOOK_VERIFY_TOKEN` env var, return `hub.challenge`.

POST handler:
1. Read raw body bytes
2. Validate `X-Hub-Signature-256` header — strip signature from headers before persisting
3. Store **entire payload** as a single `socialWebhookEventsRaw` record (NOT per-entry). Derive `deliveryId` from first entry's `id + "_" + first message mid`.
4. Dispatch **one** Celery task `process_social_webhook_event.delay(raw_event_id)` per delivery — the task unpacks entries internally. This keeps the handler O(1) and prevents burst-induced 200 delays.
5. Return 200 OK immediately (async processing)

### 5.4 Message Endpoints

File: `python-backend/app/api/meta_messages.py`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/internal/meta/messages/send` | Send reply via Messenger Send API |
| POST | `/api/internal/meta/messages/fetch-thread` | Fetch conversation history from Meta |

### 5.5 Post & Comment Endpoints

Files: `python-backend/app/api/meta_posts.py`, `python-backend/app/api/meta_comments.py`

Posts: `publish` (immediate), `schedule` (future timestamp)
Comments: `reply`, `hide`, `delete`

All endpoints verify `X-Internal-Token` header (internal service calls from Node.js).

---

## 6. Celery Tasks

### 6.1 New Queue

Register new Celery queue `social` in `python-backend/app/core/celery_app.py`:

```python
Queue("social"),  # Add to task_queues list
```

Route social tasks to this queue in `task_routes`.

### 6.2 Tasks

File: `python-backend/app/tasks/social_webhook_task.py`

**`process_social_webhook_event`** — Main webhook processor:
1. Load raw event from `socialWebhookEventsRaw` by ID
2. Check dedup (Redis key)
3. Resolve page → tenant mapping
4. Call `WebhookNormalizer` to create conversation/message records
5. Check automation rules for matching triggers
6. If real-time workflow trigger enabled: publish to Redis pub/sub `social:trigger:{pageId}`
7. Mark raw event as "processed"

File: `python-backend/app/tasks/social_publish_task.py`

**`publish_scheduled_post`** — Celery beat task runs every 60s:
1. Query `socialPosts` where `status = "scheduled"` and `scheduledAt <= now()`
2. **Idempotency guard:** For each post, atomically `UPDATE socialPosts SET status = "publishing" WHERE id = ? AND status = "scheduled"` — proceed only if exactly 1 row updated (prevents double-publish on Celery beat restart/clock skew)
3. Call `MetaGraphClient.create_post()` (python decrypts page token from DB)
4. Update status to "published" (with `providerPostId`, `publishedAt`) or "failed" (with `errorMessage`)

**`cleanup_social_webhook_events`** — Celery beat task runs daily at 3 AM:
1. Delete `socialWebhookEventsRaw` WHERE `processingStatus IN ('processed', 'skipped')` AND `receivedAt < now() - 30 days`
2. Retain `processingStatus = 'failed'` events for 90 days (audit)
3. Log count of deleted rows

File: `python-backend/app/tasks/social_token_refresh_task.py`

**`refresh_expiring_tokens`** — Celery beat task runs daily (with jitter 0-300s to prevent thundering herd):
1. Query `socialProviderConnections` where `tokenExpiresAt < now() + 7 days`
2. For each, attempt token refresh via Meta API
3. On success: update encrypted token and `tokenExpiresAt`
4. On failure: mark connection `status = "expired"` AND cascade to all associated `socialPages` → set `status = "needs_reauth"`. Emit `social_token_expired` audit event. Push notification to page-owner user if notification system is available.
5. Also sweep `socialWebhookSubscriptions` for `subscriptionStatus = "failed"` — attempt re-subscription. On second failure, emit `social_webhook_subscription_failed` audit event.

**`poll_social_workflow_triggers`** — Celery beat task runs every 30s:
1. Query `socialMessages` WHERE `workflowTriggerStatus IS NULL` AND `direction = 'inbound'`
2. For each message, check if its `pageId` matches any active batch-trigger workflow configuration
3. Rate limit: check Redis counter `social:trigger:ratelimit:{pageId}`, skip if > 10
4. Dispatch `execute_social_workflow.delay(workflow_id, trigger_data)`
5. Set `workflowTriggerStatus = 'dispatched'`

File: `python-backend/app/tasks/social_archive_task.py`

**`archive_resolved_conversations`** — Celery beat task runs every 6 hours:
1. Query `socialConversations` where `status = "resolved"` and not yet archived
2. Chunk conversation messages into question-answer pairs
3. Generate embeddings via existing embedding pipeline
4. Store in pgvector collection `social-conversations-{tenantId}`
5. Mark conversation as "archived"

---

## 7. tRPC Routers (apps/web)

### 7.1 metaChannels Router

File: `apps/web/server/routers/metaChannels.ts`

All procedures are `protectedProcedure` (authenticated + tenant-scoped). Feature flag check at router level.

| Procedure | Type | Input | Output |
|-----------|------|-------|--------|
| getConnectionStatus | query | none | Connection status + page list |
| getAuthUrl | mutation | none | OAuth URL string |
| completeOAuth | mutation | { code, state } | Success + available pages |
| listAvailablePages | query | none | Page[] from Meta API |
| connectPage | mutation | { providerPageId } | Connected page record |
| disconnectPage | mutation | { pageId } | Success |
| getPageHealth | query | { pageId } | Health status + webhook state |
| updatePageSettings | mutation | { pageId, aiActionMode, autoSendConfidenceThreshold, selectedFor* } | Updated page |

### 7.2 socialInbox Router

File: `apps/web/server/routers/socialInbox.ts`

| Procedure | Type | Input | Output |
|-----------|------|-------|--------|
| listConversations | query | { pageId?, status?, cursor?, limit } | Paginated conversations |
| getConversation | query | { conversationId } | Conversation + recent messages |
| listMessages | query | { conversationId, cursor?, limit } | Paginated messages |
| sendReply | mutation | { conversationId, body } | Sent message record |
| generateDraft | mutation | { conversationId } | AI-generated draft text + confidence |
| updateConversationStatus | mutation | { conversationId, status } | Updated conversation |

`sendReply` flow:
1. Validate tenant owns conversation
2. Look up page → verify `status === "active"` and `tokenExpiresAt` not expired
3. POST to python-backend `/api/internal/meta/messages/send` with `{ page_id, recipient_psid, text }` — **pass only `page_id`, NOT the decrypted token**. Python backend decrypts from DB.
4. Create `socialMessages` record (direction=outbound, senderType=agent)
5. Update conversation `lastOutboundAt`, reset `unreadCount` (DB + Redis counter `social:unread:{tenantId}:{conversationId}` SET 0)
6. Write audit log entry

**SECURITY: Token decryption happens exclusively in python-backend.** Node.js never decrypts page tokens — it passes `page_id` and python-backend reads `socialPages.encryptedPageAccessToken` from DB and decrypts with `smartspecweb_crypto` immediately before the Meta API call. This prevents token exposure in Node.js logs, APM, or proxy layers.

`generateDraft` flow:
1. Load last N messages from conversation
2. Load page's tone guide / policy from `socialAutomationRules`
3. If RAG enabled, query `social-conversations-{tenantId}` collection for similar past conversations
4. Call existing LLM gateway with system prompt + conversation context + RAG results
5. Return draft text + confidence score
6. If page.aiActionMode is "auto_send" and confidence >= threshold and intent is not blocked → auto-send and return sent message

### 7.3 socialPublishing Router

File: `apps/web/server/routers/socialPublishing.ts`

| Procedure | Type | Input | Output |
|-----------|------|-------|--------|
| createDraft | mutation | { pageId, contentText, contentLink? } | Draft post record |
| publishNow | mutation | { postId } | Published post record |
| schedulePost | mutation | { postId, scheduledAt } | Scheduled post record |
| listPosts | query | { pageId?, status?, cursor?, limit } | Paginated posts |
| cancelScheduledPost | mutation | { postId } | Cancelled post record |

`publishNow`: POST to python-backend `/api/internal/meta/posts/publish` with `{ page_id, post_id }` — **pass only `page_id`, NOT the decrypted token**. Python backend decrypts from DB, calls `MetaGraphClient.create_post()`. On success, Node.js updates `socialPosts` with `providerPostId`, status="published".

`schedulePost`: Validate `scheduledAt` is 10 min to 30 days in future (Meta constraint). Set status="scheduled". Celery beat picks up when time arrives.

### 7.4 socialModeration Router

File: `apps/web/server/routers/socialModeration.ts`

| Procedure | Type | Input | Output |
|-----------|------|-------|--------|
| listComments | query | { pageId, cursor?, limit } | Paginated comments |
| replyToComment | mutation | { commentId, body } | Reply result |
| hideComment | mutation | { commentId } | Success |
| deleteComment | mutation | { commentId } | Success |

All mutation procedures:
1. Validate tenant owns the comment's page
2. Call python-backend endpoint
3. Create `socialCommentActions` audit record
4. Update comment status

---

## 8. React Frontend Pages

### 8.1 SocialChannels.tsx

Page layout: Two sections — "Connect Provider" card and "Connected Pages" list.

**Connect Provider card:**
- "Connect Facebook" button → calls `metaChannels.getAuthUrl()` → `window.location.href` redirect
- After OAuth return, URL param triggers `completeOAuth` mutation
- Shows granted scopes and connection status

**Connected Pages list:**
- Table/cards showing page name, status badge, webhook health, AI mode
- Per-page actions: disconnect, configure (opens settings drawer)
- Settings drawer: toggle inbox/publishing/moderation, select AI action mode, set confidence threshold
- Reconnect button for `needs_reauth` pages

### 8.2 SocialInbox.tsx

Two-panel layout (conversation list + message thread) following standard inbox pattern.

**Left panel — Conversation list:**
- Filter tabs: All / Open / Pending / Resolved
- Page filter dropdown
- Each item shows: customer name, last message preview, timestamp, unread badge
- Cursor-based infinite scroll
- Real-time updates via TanStack Query `refetchInterval: 10000` (10s polling; upgrade to WebSocket later)

**Right panel — Message thread:**
- Chronological message bubbles (inbound left, outbound right)
- Sender type indicators (customer, agent, AI)
- Reply composer at bottom with:
  - Text input
  - "AI Draft" button → calls `generateDraft`, populates input, user can edit before sending
  - Send button
- Status bar showing conversation status, page name
- Quick actions: Mark Resolved, Mark Pending

### 8.3 SocialPublishing.tsx

**Draft composer:**
- Page selector dropdown (connected pages with publishing enabled)
- Text area for post content
- Optional URL link field
- "Publish Now" button
- "Schedule" button → date/time picker (min 10 min, max 30 days)
- Character count indicator

**Post history table:**
- Columns: Status badge, Content preview, Page, Created, Published/Scheduled date
- Filter by status (draft/scheduled/published/failed)
- Cancel action for scheduled posts

### 8.4 SocialModeration.tsx

**Comment list:**
- Page filter dropdown
- Columns: Author, Comment text, Post reference, Status, Date
- Inline actions: Reply (opens modal), Hide, Delete (with confirmation)
- Reply modal: text input + send button
- Status badges: visible, hidden, deleted

---

## 9. Workflow Integration

### 9.1 New Node Category

Register `"social"` category in `NodeRegistry._register_core_nodes()` with icon `share-2` and color `indigo`.

### 9.2 Node Types (6 total)

**1. `incoming_meta_message`** (category: social, trigger type)

Trigger node that fires when a new Messenger message arrives. Two modes:
- **Real-time**: Subscribes to Redis pub/sub channel `social:trigger:{pageId}`. When webhook processor publishes an event, this trigger activates the workflow immediately.
- **Batch**: Celery beat polls `socialMessages` where `processingStatus = 'pending_workflow'` every configurable interval.

Inputs: `pageId` (select, required), `triggerMode` (select: "realtime" / "batch", default "batch"), `filterKeywords` (text, optional)
Outputs: `conversationId`, `messageBody`, `senderName`, `senderExternalId`, `messagePayload` (json)

Executor: `app.orchestrator.node_executors.social.meta_message_trigger.MetaMessageTriggerExecutor`

**Real-time trigger runtime wiring:**
The webhook processor (`process_social_webhook_event` Celery task) publishes events to a **Redis Stream** `social:stream:{pageId}` (not pub/sub — streams provide durability and consumer groups). A FastAPI `lifespan` background task (`social_trigger_listener`) runs in the python-backend process and uses `XREADGROUP` to consume events from all active streams. When an event arrives, the listener dispatches a Celery task `execute_social_workflow.delay(workflow_id, trigger_data)` that creates a new `workflowExecutions` record and invokes the compiled LangGraph.

**Rate limiting:** Redis counter `social:trigger:ratelimit:{pageId}` with `INCR` + `EXPIRE 60`. Skip dispatch if value > 10 (max 10 workflow triggers per minute per page). Emit `social_trigger_rate_limited` audit event when limit hit.

**Batch trigger runtime wiring:**
A Celery beat task `poll_social_workflow_triggers` runs every 30s. It queries `socialMessages` where a `workflowTriggerStatus` column (varchar, default null) is null and the message's `pageId` matches a configured batch trigger workflow. For each match, it creates a workflow execution and sets `workflowTriggerStatus = 'dispatched'`. This prevents double-processing.

**2. `classify_social_intent`** (category: social)

Uses LLM to classify customer message intent into categories: inquiry, complaint, purchase_interest, support_request, spam, other. Returns intent label, confidence score, and whether human review is recommended.

Inputs: `messageBody` (text, accepts_connection), `conversationHistory` (json, optional), `model` (select, optional)
Outputs: `intent`, `confidence` (number), `category`, `requiresHuman` (boolean)

Executor: `app.orchestrator.node_executors.social.classify_intent_executor.ClassifyIntentExecutor`

**3. `draft_social_reply`** (category: social)

Generates AI draft reply grounded in RAG knowledge base and page-specific tone guide. Uses the existing LLM gateway for generation.

Inputs: `messageBody` (text, accepts_connection), `intent` (text, optional), `ragCollectionId` (select, optional), `toneGuide` (textarea, optional), `model` (select, optional)
Outputs: `draftReply` (text), `confidence` (number), `sourceDocuments` (json)

Executor: `app.orchestrator.node_executors.social.draft_reply_executor.DraftReplyExecutor`

**4. `send_meta_reply`** (category: social)

Sends a reply message to a Messenger conversation via Meta Send API. Requires conversation context and page access.

Inputs: `conversationId` (text, accepts_connection), `messageBody` (text, accepts_connection), `pageId` (select, accepts_connection)
Outputs: `providerMessageId`, `deliveryStatus`, `error`

Executor: `app.orchestrator.node_executors.social.send_reply_executor.SendReplyExecutor`

**5. `publish_meta_post`** (category: social)

Publishes a post to a connected Facebook Page.

Inputs: `pageId` (select, accepts_connection), `contentText` (textarea, accepts_connection), `contentLink` (text, optional), `scheduledAt` (text, optional)
Outputs: `postId`, `providerPostId`, `status`, `error`

Executor: `app.orchestrator.node_executors.social.publish_post_executor.PublishPostExecutor`

**6. `approve_social_action`** (category: social)

Human-in-the-loop gate. **Reuses the existing `ApprovalExecutor` pattern** (LangGraph `interrupt()`, `approval_requests` DB table, SSE `approval_required` events, resume-from-checkpoint flow). Does NOT create a separate approval system. The `socialHumanApprovals` table is used as an **audit log** for AI-generated content that was auto-approved or auto-send-qualified, not as a parallel approval queue.

If `confidence >= autoApproveThreshold`, auto-approves without human intervention and logs to `socialHumanApprovals` with `status="approved"`.
If `confidence < autoApproveThreshold`, pauses via existing `ApprovalExecutor.interrupt()` and creates an entry in the existing `approval_requests` table.

Inputs: `actionType` (select: reply/post/comment_action), `content` (text, accepts_connection), `confidence` (number, optional), `autoApproveThreshold` (slider 0-1, default 0.95)
Outputs: `approved` (boolean), `content` (text — may be edited by reviewer), `reviewerNote`

Executor: `app.orchestrator.node_executors.social.approval_gate_executor.SocialApprovalGateExecutor` (wraps existing `ApprovalExecutor`)

### 9.3 Executor File Layout

```
python-backend/app/orchestrator/node_executors/social/
  __init__.py
  meta_message_trigger.py
  classify_intent_executor.py
  draft_reply_executor.py
  send_reply_executor.py
  publish_post_executor.py
  approval_gate_executor.py
```

### 9.4 Dynamic Options Endpoint

Add `/api/v1/social/connected-pages` endpoint in python-backend that returns `[{label, value}]` for page selector inputs. Requires user authentication and tenant scoping.

---

## 10. Agency Integration

### 10.1 Builtin Tool Definition

Add `builtin-meta-channels` to the `listTools` procedure in `apps/web/server/routers/agency.ts`:

```typescript
{
  id: "builtin-meta-channels",
  name: "Meta Channels",
  description: "Send messages, publish posts, read inbox, and manage comments on connected Facebook Pages",
  toolType: "builtin",
  riskLevel: "medium",
  icon: "share-2",
  category: "social",
  configSchema: {
    fields: [
      { key: "pageId", label: "Connected Page", type: "select", required: true,
        optionsEndpoint: "/api/v1/social/connected-pages" },
      { key: "allowedActions", label: "Allowed Actions", type: "multiselect", required: true,
        options: ["read_inbox", "send_reply", "publish_post", "read_comments", "reply_comment"],
        default: ["read_inbox"] },
      { key: "requireApproval", label: "Require Approval for Outbound", type: "toggle", default: true },
    ],
  },
}
```

### 10.2 Python Backend Registration

In `python-backend/app/services/agency_tools.py`:

```python
_BUILTIN_ENDPOINTS["builtin-meta-channels"] = "/api/internal/tools/meta-channels"
_BUILTIN_RISK_LEVELS["builtin-meta-channels"] = "medium"
```

### 10.3 Internal Tool Endpoint

**File: `apps/web/server/_core/index.ts`** — Register as an Express route (NOT a tRPC router), following the existing `X-Internal-Token` pattern used by all `/api/internal/tools/*` endpoints.

`POST /api/internal/tools/meta-channels`

**SECURITY — Config injection prevention:**
`allowedActions` and `requireApproval` are **NOT accepted from the request body**. They are loaded from `agencyAgentTools.toolConfig` using the `X-Agent-Tool-Id` header (trusted, set by python-backend `agency_tools.py`). The LLM cannot influence these values.

Request body accepts only:
- `action`: "read_inbox" / "send_reply" / "publish_post" / "read_comments" / "reply_comment"
- `pageId`: number (from tool config, NOT from LLM)
- `conversationId`: number (optional, for send_reply)
- `messageBody`: string (optional, for send_reply / reply_comment)
- `contentText`: string (optional, for publish_post)
- `contentLink`: string (optional, for publish_post — validated as HTTPS-only, RFC 1918 blocked for SSRF prevention)
- `commentId`: number (optional, for reply_comment)

Action routing:
- `read_inbox` → query recent conversations for the configured page
- `send_reply` → if `requireApproval` (from DB config), return `{ status: "approval_needed" }` without sending. Otherwise, POST to python-backend (which decrypts token from DB).
- `publish_post` → same approval check, then publish
- `read_comments` → query recent comments
- `reply_comment` → same approval check, then reply

Validates `action` against `allowedActions` (from DB) before executing. Returns structured JSON response.

---

## 11. RAG Archival Pipeline

### 11.1 Conversation Archival

When a conversation status changes to "resolved":
1. Celery task `archive_resolved_conversations` (runs every 6 hours) picks it up
2. Extracts all messages in chronological order
3. Chunks into Q&A pairs (customer question + agent/AI answer)
4. Generates embeddings via a **new batch endpoint** `POST /api/internal/embeddings/batch` in `python-backend/app/api/internal_embeddings.py` (accepts `texts: list[str]`, `collection: str`, `metadata: list[dict]`). The existing endpoint only handles single texts — this batch route must be added as part of section-13 implementation.
5. Stores in pgvector collection `social-conversations-{tenantId}`
6. Updates conversation status to "archived"

**Chunking strategy:**
- Each conversation is split into turn pairs: (customer message, agent/AI response)
- If a customer sends multiple messages before a response, they are concatenated into one "question" chunk
- Each chunk includes metadata: pageId, conversationId, customerDisplayName, timestamp, intent (if classified)
- Maximum chunk size: 1000 tokens (truncate long messages, keep first + last 200 tokens)
- Embedding model: same as existing document library (configured in `EMBEDDING_MODEL` env var)

### 11.2 Retrieval

The existing `builtin-rag-knowledge` tool and `rag_query` workflow node can query the social conversations collection. No changes needed to the RAG infrastructure — just a new collection per tenant.

Draft generation (`socialInbox.generateDraft`) also queries this collection for similar past conversations to ground the AI response.

---

## 12. Security

### 12.1 Token Lifecycle

1. **Storage**: `encryptedPageAccessToken` column, encrypted with `encrypt()` from `crypto.ts`. `META_APP_SECRET` stored in `system_settings` with `isSensitive=true`.
2. **Decryption**: **Exclusively** in python-backend via `smartspecweb_crypto.decrypt_smartspecweb()` at point of use. Node.js NEVER decrypts page tokens — passes only `page_id` to python-backend.
3. **Refresh**: Daily Celery beat task (with jitter) checks expiring tokens (< 7 days remaining). On failure, cascades to mark `socialPages.status = "needs_reauth"`.
4. **Revocation**: On disconnect, clear encrypted token, unsubscribe webhooks, delete pgvector collection `social-conversations-{tenantId}` (GDPR).
5. **Never exposed**: Tokens never appear in API responses, logs, audit trails, or LLM prompts.
6. **Log scrubbing**: `MetaGraphClient` uses a `scrub_access_tokens` structlog processor that strips `access_token` from all logged URLs. Wrap httpx exceptions to strip URL before re-raising.

### 12.2 Webhook Security

1. Validate `X-Hub-Signature-256` on every POST using constant-time comparison
2. `META_WEBHOOK_VERIFY_TOKEN` stored as env var (not in DB)
3. Rate limit webhook processing: max 100 events/second per page via Redis counter
4. Log failed validation attempts for security review
5. Always return 200 OK (prevent Meta from disabling webhook)

### 12.3 Access Control

1. All database queries include `WHERE tenantId = ?`
2. Page-level access: shared `verifyPageAccess(pageId, userId, tenantId, db)` helper in `apps/web/server/services/socialAccessService.ts` — used by all 4 tRPC routers consistently
3. tRPC procedures: `protectedProcedure` ensures authentication
4. Feature flag check at router middleware level
5. Internal endpoints: `X-Internal-Token` verification
6. Agency tool: `allowedActions` and `requireApproval` loaded from DB (`agencyAgentTools.toolConfig`), never from LLM request body
7. Webhook tenant isolation: events for unknown/disconnected pages marked `"skipped"` with `social_webhook_unknown_page` audit event
8. OAuth rate limiting: `completeOAuth` rate-limited to prevent brute-force code guessing

### 12.4 AI Safety

1. Default `aiActionMode = "draft_only"` — human must review
2. `auto_send` requires explicit opt-in per page + confidence threshold
3. **Blocked category enforcement (3-layer defense):**
   a. **Keyword pre-scan**: Before calling LLM, scan raw `messageBody` for billing/legal/refund/harassment keywords. If found, force `approval_required` regardless of LLM output.
   b. **LLM output validation**: Validate `detected_intent` against strict enum schema (`z.enum(["inquiry", "complaint", "billing", "legal", "harassment", "support", "purchase", "refund", "spam", "other"])`). Reject unparseable output.
   c. **Message role isolation**: Customer message body goes in `HumanMessage` role only — never interpolated into the system prompt string (prevents prompt injection of `detected_intent`).
4. **Blocked categories configurable per tenant**: stored in `socialAutomationRules.policyConfig.blockedCategories` (default: `["billing", "legal", "harassment", "refund"]`)
5. **Auto-send race protection**: Before auto-sending, check `socialConversations.lastOutboundAt` unchanged since draft generation. If changed (another user/agent replied), downgrade to `draft_only`.
6. Per-tenant kill switch: `META_CHANNELS_ENABLED = false`
7. Per-page kill switch: `socialPages.aiActionMode = "off"`
8. Audit trail: every AI-generated message logged with confidence, source documents, detected intent, and approval status
9. **Message idempotency**: Handle `UniqueViolation` on `socialMessages.providerMessageId` as success (message already stored), continue processing rather than raising error

---

## 13. Audit Logging

All high-risk operations emit structured audit events via the existing JSONL audit logger:

| Event Type | Trigger |
|------------|---------|
| `social_connect` | Page connected |
| `social_disconnect` | Page disconnected |
| `social_reply_sent` | Reply sent (manual or AI) |
| `social_post_published` | Post published |
| `social_comment_action` | Comment reply/hide/delete |
| `social_approval_decision` | Approval approved/rejected |
| `social_ai_draft` | AI draft generated |
| `social_auto_send` | AI auto-sent message |
| `social_webhook_failed` | Webhook validation failure |
| `social_token_refresh` | Token refreshed or expired |

Each event includes: tenantId, userId, pageId, entityId, timestamp, details.

---

## 14. Environment Variables

### apps/web/.env
```
META_APP_ID=                         # Meta App ID
META_APP_SECRET_ENCRYPTED=           # Encrypted with crypto.ts
META_WEBHOOK_VERIFY_TOKEN=           # Random string for webhook verification
META_CHANNELS_ENABLED=false          # Feature flag default
```

### python-backend/.env
```
META_APP_ID=                         # Same as above
META_GRAPH_API_VERSION=v25.0         # API version
```

**IMPORTANT — META_APP_SECRET storage:**
`META_APP_SECRET` is stored in the `system_settings` table with `category="meta_channels"`, `key="app_secret"`, `isSensitive=true` (auto-encrypted via AES-256-GCM). The python-backend reads and decrypts it via `smartspecweb_crypto.decrypt_smartspecweb()` at point of use — **never from `os.environ`**. Similarly, `META_WEBHOOK_VERIFY_TOKEN` is stored in `system_settings` with `isSensitive=true`.

This follows the same pattern used for Telegram bot tokens and SMTP credentials in the existing codebase.

---

## 15. Error Handling

### Concurrent Webhook Processing

Multiple webhook events for the same conversation may arrive simultaneously (e.g., customer sends rapid messages). To prevent duplicate conversation creation:
1. `socialConversations` has a unique index on `(pageId, customerExternalId)`
2. The normalizer uses `INSERT ... ON CONFLICT DO UPDATE` (Drizzle's `onConflictDoUpdate`) when creating conversations
3. `unreadCount` is incremented atomically via `sql\`"unreadCount" + 1\`` (not read-then-write)
4. Message insertion is idempotent via unique index on `providerMessageId`

### Provider Errors

| Meta Error Code | SmartSpecPro Response |
|-----------------|----------------------|
| 190 (Invalid token) | Mark page `needs_reauth`, notify user |
| 429 (Rate limit) | Retry with exponential backoff, log warning |
| 2 (Service unavailable) | Retry up to 3 times, then mark as failed |
| 100 (Invalid param) | Log error, return user-facing message |
| 10 (Permission denied) | Mark page `needs_reauth`, prompt re-authorization |

### Outbound Failure Recovery

When a reply or post fails:
1. Store error in `socialMessages.errorMessage` or `socialPosts.errorMessage`
2. Set `deliveryStatus = "failed"` or `status = "failed"`
3. Show error in UI with retry button
4. For scheduled posts: mark failed, do not auto-retry (might be time-sensitive)

---

## 16. Additional Components (from review findings)

### 16.1 OAuth CSRF — Server-Side Nonce (CRITICAL)

The `GET /api/oauth/meta/authorize` endpoint must generate state with `secrets.token_urlsafe(32)` and store in Redis `meta:oauth:state:{nonce}` with 10-minute TTL. On `POST /api/oauth/meta/callback`, the python-backend validates state by looking up and deleting the Redis key (one-time use). The tRPC `completeOAuth` does NOT forward state from client `sessionStorage` — python-backend owns the full validation. Client-side `sessionStorage` state is used only for UX redirect logic, not security.

### 16.2 Provider Abstraction Layer

Define a `SocialProviderClient` abstract interface in `python-backend/app/services/social/base_provider.py`:

```python
class SocialProviderClient(Protocol):
    async def send_message(self, recipient_id: str, text: str) -> dict: ...
    async def create_post(self, message: str, link: str | None) -> dict: ...
    async def get_comments(self, object_id: str) -> dict: ...
    async def reply_to_comment(self, object_id: str, message: str) -> dict: ...
    async def subscribe_webhooks(self, fields: list[str]) -> dict: ...
    async def close(self): ...
```

`MetaGraphClient` implements this protocol. `WebhookNormalizer` dispatches by `provider` field. This enables future Instagram, WhatsApp, and Threads implementations without modifying core logic.

### 16.3 Redis Unread Counters (Interview Q2)

For enterprise-scale reads, maintain Redis counters alongside the DB column:
- Key pattern: `social:unread:{tenantId}:{conversationId}`
- On inbound message: `INCR` Redis counter AND SQL `unreadCount + 1`
- On `sendReply` / `updateConversationStatus`: `SET 0` Redis counter AND SQL `unreadCount = 0`
- `listConversations` reads unread counts from Redis (O(1)) with DB fallback
- DB column remains the durable source of truth; Redis is the fast-read layer

### 16.4 Circuit Breaker on Meta API

Redis-backed circuit breaker per page in `MetaGraphClient`:
- Key: `social:circuit:{pageId}`
- After 5 consecutive failures within 5 minutes: open circuit, set `socialPages.status = "circuit_open"`
- While open: skip API calls, return cached error, check health probe every 2 minutes
- Health probe: lightweight `GET /{page_id}?fields=id` — if succeeds, close circuit

### 16.5 Health Check Endpoint

Add `GET /api/health/social` in python-backend:
- Verifies: Redis reachability, DB query on `socialPages` (latency check), Meta API token validity for one active page
- Returns: `{ status: "healthy" | "degraded" | "unhealthy", details: {...} }`
- Wire into existing monitoring

### 16.6 GDPR Data Deletion

Add `delete_social_tenant_data` Celery task triggered on page disconnect or tenant deletion:
1. Delete all `socialMessages` for the page
2. Delete all `socialConversations` for the page
3. Delete pgvector collection `social-conversations-{tenantId}` (embeddings contain PII)
4. Delete `socialWebhookEventsRaw` for the page
5. Cascade handles the rest via FK constraints

### 16.7 Webhook Gap Recovery

Add `sync_missing_messages` Celery beat task (runs every 4 hours):
1. For each active page, call `GET /{page_id}/conversations?since={lastSyncAt}`
2. Backfill any messages missed during webhook downtime (deployment, restart)
3. Store `lastSyncAt` in `socialPages.metadata` JSON column

### 16.8 Skills Integration (Deferred to Phase 3)

The skills `meta-messenger` and `meta-page-manager` (listed in spec §1.1) are **deferred to Phase 3** (post-MVP). The AI draft pipeline (section-08) and workflow nodes (section-11) cover the same functionality through tRPC and workflow interfaces. Skills can be added later as thin wrappers around the existing services.

### 16.9 Admin Dashboard Integration

Add social health widgets to the existing `AdminQueueDashboard.tsx`:
- Per-page webhook delivery rate and last delivery timestamp
- Approval queue depth (pending count)
- Token expiry countdown for pages approaching reauth
- Failed webhook event count (last 24h)

### 16.10 LLM Gateway Routing for Workflow Executors (H-09)

All LLM calls from social workflow executors (`ClassifyIntentExecutor`, `DraftReplyExecutor`) MUST route through the unified LLM client (`python-backend/app/llm_proxy/unified_client.py`) or through the Node.js gateway with `X-Internal-Token` auth. This ensures:
- Credit accounting (deducted from workflow owner's balance)
- Audit logging in `providerUsageLog`
- Provider routing and rate limiting
- Cost tracking

Direct `POST /api/v1/llm/chat` calls without credit accounting are forbidden.

### 16.11 Celery Worker Configuration

Recommended configuration for the `social` queue:
```
celery -A app.core.celery_app worker --concurrency=4 --prefetch-multiplier=1 -Q social
```

Run as a **separate worker process** from media/video queues to prevent social events being starved during media generation spikes. Add to `docker/systemd/` service files.

### 16.12 Dead-Letter Queue

Add `social_dlq` Celery queue. After `process_social_webhook_event` exhausts its 3 retries, route to DLQ instead of dropping. Admin can inspect and requeue via a tRPC admin mutation `requeueFailedWebhookEvent(rawEventId)` that re-dispatches by raw event ID.

---

## 17. Implementation Order

Sections should be implemented in this dependency order:

1. **Database schema + migration** — Foundation for everything
2. **Feature flag + menu + routes** — Enable UI access
3. **Meta Graph API client** — Provider communication layer
4. **OAuth + page connection** — Backend endpoints + frontend page
5. **Webhook ingestion** — Receive and normalize events
6. **Inbox UI + reply** — Core user-facing feature
7. **AI draft generation** — Leverages existing LLM + RAG
8. **Publishing + comments** — Additional operations
9. **Workflow nodes** — Automation integration
10. **Agency tool** — Agent integration
11. **RAG archival** — Knowledge base integration
12. **Automation rules + approval queue** — Advanced features
