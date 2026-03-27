---
name: Social Automation System Architecture
description: Comprehensive research of SmartSpecPro's social publishing, inbox, automation, and moderation systems
type: reference
---

# Social Automation System Architecture — Complete Research Brief

## Executive Summary

SmartSpecPro implements a **multi-provider social media automation platform** with support for Meta (Facebook/Instagram), TikTok, and YouTube. The system is built around three core subsystems:

1. **Social Publishing** — Drafts, immediate publish, scheduling, and history
2. **Social Automation** — Rules-based message automation with human approval queues
3. **Social Inbox** — Unified conversation management across providers
4. **Social Moderation** — Comment visibility control

The architecture spans **Node.js/Express backend** (tRPC routers, services) and **Python FastAPI backend** (provider integrations, webhooks, publishing).

---

## Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  SocialPublishing.tsx  SocialChannels.tsx  SocialInbox.tsx   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
        ┌───────▼──────────┐      ┌─────────▼──────────┐
        │  tRPC Routers    │      │  tRPC Routers     │
        │  (Node.js)       │      │  (Node.js)        │
        │                  │      │                   │
        │ socialPublishing │      │ socialAutomation  │
        │ metaChannels     │      │ socialInbox       │
        │ socialModeration │      │ socialModerations │
        └───────┬──────────┘      └─────────┬─────────┘
                │                           │
        ┌───────▼─────────────────────────────▼─────────┐
        │   Express Service Layer (Node.js)             │
        │   socialPublishingService.ts                  │
        │   socialAutomationService.ts                  │
        │   socialInboxService.ts                       │
        │   socialAccessService.ts                      │
        └───────┬───────────────────────────────────────┘
                │
        ┌───────▼──────────────────────────┐
        │ Python FastAPI (:8000)           │
        │                                  │
        │ /api/internal/social/publish     │
        │ /api/meta/*                      │
        │ /api/social_webhook              │
        │                                  │
        │ publish_service.py               │
        │ meta_graph_client.py             │
        │ tiktok_client.py                 │
        │ youtube_client.py                │
        └───────┬──────────────────────────┘
                │
        ┌───────▼─────────┐  ┌──────────────┐
        │  PostgreSQL     │  │  Redis       │
        │                 │  │  (Celery)    │
        │ social_*        │  │              │
        │ tables          │  │ Queue tasks  │
        └─────────────────┘  └──────────────┘
                │
        ┌───────▼──────────────────────────┐
        │  External Providers              │
        │  Meta Graph API (Facebook)       │
        │  TikTok Creator API              │
        │  YouTube Data API v3             │
        └────────────────────────────────┘
```

---

## Database Schema — Social Tables

### Core Connection Tables

#### `socialProviderConnections`
Stores OAuth credentials and connection metadata per provider per user.

```typescript
export const socialProviderConnections = pgTable("social_provider_connections", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),         // FK: tenants
  userId: integer("userId").notNull(),                              // FK: users
  provider: varchar("provider", { length: 50 }).notNull(),          // "meta" | "tiktok" | "youtube"
  providerUserId: varchar("providerUserId", { length: 255 }),       // External user ID from provider
  encryptedAccessToken: text("encryptedAccessToken"),               // AES-256-GCM encrypted (uses LLM_ENCRYPTION_KEY)
  encryptedRefreshToken: text("encryptedRefreshToken"),             // Refresh token (encrypted)
  tokenExpiresAt: timestamp("tokenExpiresAt", { withTimezone: true }),
  encryptedAuthorizationCode: text("encryptedAuthorizationCode"),
  oauthState: varchar("oauthState", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_social_provider_connections_tenant").on(t.tenantId),
  index("idx_social_provider_connections_user").on(t.userId),
]);
```

#### `socialPages`
Represents a connected Facebook Page, TikTok Account, or YouTube Channel.

```typescript
export const socialPages = pgTable("social_pages", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  connectionId: integer("connectionId").notNull(),                  // FK: socialProviderConnections
  providerPageId: varchar("providerPageId", { length: 255 }).notNull(),  // External page ID
  pageName: varchar("pageName", { length: 255 }),
  pageCategory: varchar("pageCategory", { length: 100 }),
  status: varchar("status", { length: 50 }).notNull(),              // "active" | "inactive"
  selectedForInbox: boolean("selectedForInbox").default(false),
  selectedForPublishing: boolean("selectedForPublishing").default(false),
  selectedForModeration: boolean("selectedForModeration").default(false),
  encryptedPageAccessToken: text("encryptedPageAccessToken"),       // Page-level token (Meta only)
  tokenExpiresAt: timestamp("tokenExpiresAt", { withTimezone: true }),
  aiActionMode: varchar("aiActionMode", { length: 50 }).default("off"),  // off | draft_only | approval_required | auto_send
  autoSendConfidenceThreshold: integer("autoSendConfidenceThreshold").default(80),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_social_pages_tenant").on(t.tenantId),
  index("idx_social_pages_connection").on(t.connectionId),
]);
```

### Publishing Tables

#### `socialPosts`
Draft and scheduled posts awaiting publish.

```typescript
export const socialPosts = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  pageId: integer("pageId").notNull(),                              // FK: socialPages
  status: varchar("status", { length: 50 }).notNull(),              // "draft" | "scheduled" | "published" | "failed"
  contentText: text("contentText"),                                  // Max 2000 chars
  contentLink: text("contentLink"),                                  // HTTPS URL to shared link
  mediaRefs: json("mediaRefs").$type<string[]>(),                    // Array of HTTPS URLs to media
  providerPostId: varchar("providerPostId", { length: 255 }),       // External post ID (after publish)
  scheduledAt: timestamp("scheduledAt", { withTimezone: true }),     // Scheduled publish time
  publishedAt: timestamp("publishedAt", { withTimezone: true }),     // Actual publish time
  errorMessage: text("errorMessage"),                                // Error on failed publish
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_social_posts_tenant_status").on(t.tenantId, t.status),
  index("idx_social_posts_page_scheduled").on(t.pageId, t.scheduledAt),
]);
```

### Inbox Tables

#### `socialConversations`
Represents a DM conversation with a customer.

```typescript
export const socialConversations = pgTable("social_conversations", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  pageId: integer("pageId").notNull(),                              // FK: socialPages
  customerExternalId: varchar("customerExternalId", { length: 255 }).notNull(),  // External user ID
  customerDisplayName: varchar("customerDisplayName", { length: 255 }),
  channelType: varchar("channelType", { length: 50 }),              // "messenger" | "instagram_dm" | "comment_reply"
  status: varchar("status", { length: 50 }).notNull().default("open"),  // "open" | "pending" | "closed" | "spam"
  unreadCount: integer("unreadCount").default(0),
  lastMessageAt: timestamp("lastMessageAt", { withTimezone: true }),
  lastInboundAt: timestamp("lastInboundAt", { withTimezone: true }),
  lastOutboundAt: timestamp("lastOutboundAt", { withTimezone: true }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("idx_social_conversations_page_customer").on(t.pageId, t.customerExternalId),
  index("idx_social_conversations_tenant_page").on(t.tenantId, t.pageId),
  index("idx_social_conversations_status_last_msg").on(t.status, t.lastMessageAt),
  index("idx_social_conversations_tenant_status").on(t.tenantId, t.status),
]);
```

#### `socialMessages`
Individual messages within a conversation.

```typescript
export const socialMessages = pgTable("social_messages", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  conversationId: integer("conversationId").notNull(),              // FK: socialConversations
  pageId: integer("pageId").notNull(),                              // FK: socialPages
  direction: varchar("direction", { length: 20 }).notNull(),        // "inbound" | "outbound"
  senderType: varchar("senderType", { length: 20 }),                // "customer" | "business" | "system"
  body: text("body"),                                                // Message text
  messageType: varchar("messageType", { length: 50 }),              // "text" | "image" | "video"
  sentAt: timestamp("sentAt", { withTimezone: true }),
  receivedAt: timestamp("receivedAt", { withTimezone: true }),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  deliveryStatus: varchar("deliveryStatus", { length: 50 }),        // "pending" | "sent" | "delivered" | "read" | "failed"
  workflowTriggerStatus: varchar("workflowTriggerStatus", { length: 20 }),  // automation trigger status
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_social_messages_conversation_created").on(t.conversationId, t.createdAt),
  uniqueIndex("idx_social_messages_provider_msg_id").on(t.providerMessageId),
]);
```

### Automation Tables

#### `socialAutomationRules`
Rules that trigger automated responses.

```typescript
export const socialAutomationRules = pgTable("social_automation_rules", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  pageId: integer("pageId").references(() => socialPages.id, { onDelete: "cascade" }),  // null = applies to all pages
  name: varchar("name", { length: 255 }).notNull(),
  isEnabled: boolean("isEnabled").default(true),
  triggerType: varchar("triggerType", { length: 50 }).notNull(),    // "new_message" | "keyword_match" | "unread_timeout"
  conditions: json("conditions").$type<Record<string, unknown>>(),   // Trigger conditions (keywords, timeout, etc)
  actionMode: varchar("actionMode", { length: 50 }).notNull(),      // "off" | "draft_only" | "approval_required" | "auto_send"
  policyConfig: json("policyConfig").$type<Record<string, unknown>>(),  // Policy-level config
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_social_automation_rules_tenant").on(t.tenantId),
]);
```

#### `socialHumanApprovals`
Queue of automation-generated messages awaiting human approval.

```typescript
export const socialHumanApprovals = pgTable("social_human_approvals", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  pageId: integer("pageId").notNull(),                              // FK: socialPages
  entityType: varchar("entityType", { length: 50 }).notNull(),      // "automation_message" | "automation_reply"
  entityId: integer("entityId").notNull(),                          // ID of the entity (conversation, message, etc)
  proposedContent: text("proposedContent"),                         // The content generated by automation
  confidence: decimal("confidence", { precision: 5, scale: 2 }),    // 0-100 confidence score
  status: varchar("status", { length: 50 }).notNull(),              // "pending" | "approved" | "rejected" | "expired"
  requestedBySystem: boolean("requestedBySystem").default(true),
  reviewedByUserId: integer("reviewedByUserId"),
  decisionNote: text("decisionNote"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_social_human_approvals_tenant_status").on(t.tenantId, t.status, t.createdAt),
]);
```

### Moderation Tables

#### `socialComments`
Comments on posts.

```typescript
export const socialComments = pgTable("social_comments", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  pageId: integer("pageId").notNull(),                              // FK: socialPages
  providerObjectId: varchar("providerObjectId", { length: 255 }),   // Post/object ID on provider
  providerCommentId: varchar("providerCommentId", { length: 255 }).notNull(),
  parentCommentId: integer("parentCommentId"),                      // For nested replies
  authorDisplayName: varchar("authorDisplayName", { length: 255 }),
  body: text("body"),
  status: varchar("status", { length: 50 }).notNull().default("visible"),  // "visible" | "hidden" | "deleted"
  lastAction: varchar("lastAction", { length: 50 }),                // "hidden_by_page" | "deleted_by_page"
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_social_comments_page_created").on(t.pageId, t.createdAt),
  uniqueIndex("idx_social_comments_provider_id").on(t.providerCommentId),
]);
```

#### `socialCommentActions`
Audit log of comment moderation actions.

```typescript
export const socialCommentActions = pgTable("social_comment_actions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  commentId: integer("commentId").notNull(),                        // FK: socialComments
  action: varchar("action", { length: 50 }).notNull(),              // "hidden" | "deleted"
  actionByUserId: integer("actionByUserId"),
  reason: text("reason"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
});
```

### Webhook Tables

#### `socialWebhookSubscriptions`
Tracks which webhooks are active for which pages.

```typescript
export const socialWebhookSubscriptions = pgTable("social_webhook_subscriptions", {
  id: serial("id").primaryKey(),
  pageId: integer("pageId").notNull(),                              // FK: socialPages
  provider: varchar("provider", { length: 50 }).notNull(),
  webhookId: varchar("webhookId", { length: 255 }),
  subscribedAt: timestamp("subscribedAt", { withTimezone: true }).defaultNow(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
});
```

#### `socialWebhookEventsRaw`
Raw webhook payload log.

```typescript
export const socialWebhookEventsRaw = pgTable("social_webhook_events_raw", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 50 }).notNull(),
  deliveryId: varchar("deliveryId", { length: 255 }).notNull(),
  payload: jsonb("payload"),
  processingStatus: varchar("processingStatus", { length: 50 }).notNull(),
  processingError: text("processingError"),
  receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow(),
  processedAt: timestamp("processedAt", { withTimezone: true }),
}, (t) => [
  index("idx_social_webhook_events_raw_status").on(t.processingStatus, t.receivedAt),
  uniqueIndex("idx_social_webhook_events_raw_provider_delivery").on(t.provider, t.deliveryId),
]);
```

---

## Frontend Architecture

### Pages

| Page | File | Purpose |
|------|------|---------|
| **Social Publishing** | `SocialPublishing.tsx` | Draft creation, immediate publish, scheduling |
| **Social Channels** | `SocialChannels.tsx` | OAuth connection, page management |
| **Social Inbox** | `SocialInbox.tsx` | Unified conversation view across providers |
| **Social Moderation** | `SocialModeration.tsx` | Comment visibility control |
| **Social Automation** | `SocialAutomation.tsx` | Rule creation, approval queue |

### Shared Components

- `SocialPageShell.tsx` — Layout wrapper with page selection dropdown

### Type Definitions

File: `types/social.ts` — 500+ lines of interface definitions:

- `SocialInboxConversationSummary`
- `SocialInboxMessage`
- `SocialPublishingPageOption`
- `SocialPublishingPostSummary`
- `SocialAutomationRuleSummary`
- `SocialAutomationApprovalSummary`
- `SocialModerationCommentSummary`

Plus formatting utilities (`formatPublishingStatus`, `formatAutomationActionMode`, etc.)

---

## Backend Architecture (Node.js / Express)

### tRPC Routers

#### `socialPublishing.ts`
```typescript
router({
  listPages(),                                          // Available pages for publishing
  createDraft({pageId, contentText, contentLink, mediaRefs}),
  publishNow({postId}),                                 // Immediate publish
  schedulePost({postId, scheduledAt}),                  // Schedule for future
  listPosts({pageId?, status?, cursor, limit}),         // Paginated history
  cancelScheduledPost({postId}),
})
```

**Entry point for publish flow:**
1. User creates draft via `createDraft` → inserts into `socialPosts` with status="draft"
2. User clicks "Publish Now" → calls `publishNow` → calls Python backend
3. User clicks "Schedule" → sets `scheduledAt` and status="scheduled"
4. Celery task picks up scheduled posts and publishes

#### `socialAutomation.ts`
```typescript
router({
  listPages(),                                          // Pages available for automation
  listRules({pageId?}),                                 // Automation rules for pages
  createRule({name, pageId?, triggerType, conditions, actionMode, policyConfig}),
  updateRule({ruleId, name?, conditions, actionMode, policyConfig}),
  toggleRule({ruleId, isEnabled}),
  deleteRule({ruleId}),

  listApprovals({pageId?, status?, cursor, limit}),    // Human approval queue
  approveAction({approvalId, editedContent?}),         // Approve + optionally edit
  rejectAction({approvalId, note?}),                   // Reject with reason
})
```

#### `socialInbox.ts`
```typescript
router({
  listPages(),                                          // Pages with inbox enabled
  listConversations({pageId?, status?, cursor, limit}), // Paginated conversations
  getConversationMessages({conversationId, cursor, limit}),
  sendMessage({conversationId, body}),                 // Send reply to customer
  setConversationStatus({conversationId, status}),
})
```

#### `socialModeration.ts`
```typescript
router({
  listPages(),
  listComments({pageId?, cursor, limit}),
  updateCommentStatus({commentId, status}),            // visible | hidden | deleted
  getCommentHistory({commentId}),
})
```

#### `metaChannels.ts`
```typescript
router({
  // OAuth flow
  getOAuthUrl({redirectUri}),                          // → Python /api/meta/oauth/authorize
  completeOAuth({code, redirectUri}),                  // → Python /api/meta/oauth/callback
  disconnectProvider(),

  // Page management
  listPages(),                                          // → Python /api/meta/pages
  togglePageForInbox({pageId, enabled}),
  togglePageForPublishing({pageId, enabled}),
  togglePageForModeration({pageId, enabled}),
})
```

### Service Layer

#### `socialPublishingService.ts` (200+ lines)

**Key functions:**

```typescript
createPublishingDraft(input) {
  // 1. Verify page access (user owns the page)
  // 2. Insert into socialPosts table
  // 3. Return post summary
}

publishPublishingPostNow(input) {
  // 1. Verify page access
  // 2. Load post + page + connection
  // 3. Decrypt access tokens
  // 4. Call Python backend: POST /api/internal/social/publish
  // 5. Update socialPosts.status = "published" (or "failed")
  // 6. Extract and store providerPostId
  // 7. Log audit event
}

schedulePublishingPost(input) {
  // 1. Validate scheduledAt (10 min min, 30 days max)
  // 2. Update socialPosts.status = "scheduled"
  // 3. Celery task will pick up later
}

cancelScheduledPublishingPost(input) {
  // 1. Verify post is in "scheduled" state
  // 2. Delete from socialPosts (or mark as "cancelled")
}

listPublishingPages(tenantId, userId) {
  // 1. Query socialPages with selectedForPublishing=true
  // 2. Check token expiration status
  // 3. Return with readiness indicator (ready | page_inactive | missing_access)
}

listPublishingPosts(tenantId, pageId?, status?, cursor, limit) {
  // 1. Pagination with cursor (createdAt)
  // 2. Filter by pageId + status
  // 3. Return with provider + pageName
}
```

#### `socialPublishGateway.ts` (80 lines)

Gateway to Python backend `/api/internal/social/publish` endpoint.

```typescript
interface SocialPublishGatewayRequest {
  provider: "meta" | "tiktok" | "youtube"
  pageId: string
  accessToken: string
  message?: string
  link?: string
  mediaUrls?: string[]
  title?: string
  description?: string
  tags?: string[]
  privacyStatus?: string
  scheduledPublishTime?: number
  publishAt?: string
  videoMetadata?: { width?, height?, durationSeconds? }
}

publishSocialContentViaPythonBackend(payload, timeoutMs = 30_000) {
  // POST to http://localhost:8000/api/internal/social/publish
  // Includes x-internal-token header for auth
  // Returns Response with provider_post_id on success
}
```

#### `socialAutomationService.ts` (300+ lines)

**Key functions:**

```typescript
createAutomationRule(tenantId, userId, input) {
  // 1. Validate page access (if pageId specified)
  // 2. Insert into socialAutomationRules
  // 3. Return rule summary
}

listAutomationPageRules(tenantId, userId, pageId?) {
  // Query socialAutomationRules
  // Join with socialPages for page name + status
}

listAutomationApprovals(tenantId, userId, pageId?, status?, cursor, limit) {
  // 1. Query socialHumanApprovals
  // 2. Paginate by createdAt
  // 3. Include page info via join
}

approveAutomationAction(tenantId, userId, approvalId, editedContent?) {
  // 1. Load approval from DB
  // 2. Update status = "approved"
  // 3. If editedContent provided, store it
  // 4. Create conversation message in socialMessages
  // 5. Call Python backend to send the message via provider
}

rejectAutomationAction(tenantId, userId, approvalId, note?) {
  // 1. Load approval
  // 2. Update status = "rejected"
  // 3. Store rejection note
}
```

#### `socialInboxService.ts` (400+ lines)

**Key functions:**

```typescript
listConversationsByTenant(tenantId, filters) {
  // 1. Query socialConversations
  // 2. Join with socialPages
  // 3. Calculate unreadCount from socialMessages
  // 4. Extract lastMessagePreview (truncated body of last message)
  // 5. Paginate by lastMessageAt (cursor)
}

getConversationWithMessages(tenantId, conversationId, messageFilters) {
  // 1. Load conversation + page + recent messages
  // 2. Calculate unreadCount
  // 3. Return with full context
}

sendMessageViaPythonBackend(tenantId, pageId, conversationId, messageBody) {
  // 1. Load page + conversation context
  // 2. Decrypt access token
  // 3. POST to Python: /api/internal/social/send_message
  // 4. Receive providerMessageId
  // 5. Insert socialMessages record
  // 6. Update conversation lastOutboundAt + lastMessageAt
}

resetConversationUnreadCount(tenantId, conversationId) {
  // Update socialConversations.unreadCount = 0
}
```

#### `socialAccessService.ts` (80 lines)

Permission verification:

```typescript
verifyPageAccess(pageId, userId, tenantId, userCurrentTenantId) {
  // 1. Query socialPages join socialProviderConnections
  // 2. Verify:
  //    - pageId belongs to tenantId
  //    - connection belongs to userId + tenantId
  // 3. Return VerifiedSocialPageAccess with decryption context
  // 4. Throw 404 if not found, else return verified page
}
```

---

## Python Backend Architecture (FastAPI)

### API Endpoints

#### `POST /api/internal/social/publish`
Main endpoint for publishing posts to any provider.

**Request:**
```python
class PublishSocialRequest(BaseModel):
    provider: Literal["meta", "tiktok", "youtube"]
    page_id: str                            # External provider page ID
    access_token: str                       # Decrypted from Node.js
    message: str | None                     # Text content
    link: str | None                        # HTTPS URL to shared link
    media_urls: list[str]                   # Array of media HTTPS URLs
    title: str | None                       # For YouTube
    description: str | None
    tags: list[str]
    privacy_status: str | None              # For YouTube ("public" | "unlisted" | "private")
    scheduled_publish_time: int | None      # Unix timestamp for scheduled publish
    publish_at: str | None                  # ISO datetime string
    video_metadata: VideoMetadata | None    # width, height, duration_seconds
```

**Response:**
```python
{
    "provider": "meta",
    "status": "published" | "scheduled",
    "provider_post_id": "123456789",        # External post ID
    "shorts_candidate": bool,                # YouTube Shorts candidacy
    "result": { ... }                        # Provider response payload
}
```

**Auth:** Internal token via `x-internal-token` or `x-proxy-token` header

**Flow:**
1. Verify internal token
2. Parse request + validate fields
3. Route to provider-specific client
4. Handle errors via exception mapping

#### `POST /api/meta/oauth/authorize`
Generate OAuth authorization URL.

#### `POST /api/meta/oauth/callback`
Complete OAuth flow, store tokens.

#### Webhook Endpoints

- `POST /webhooks/meta` — Receive webhook events from Meta
- Similar for TikTok, YouTube

### Provider Clients

#### `meta_graph_client.py`
```python
class MetaGraphClient(SocialProviderClient):
    async def create_post(
        self,
        message: str,
        link: str | None = None,
        scheduled_at: int | None = None,
    ) -> dict[str, Any]

    async def send_message(self, recipient_id: str, text: str) -> dict[str, Any]

    async def get_comments(self, object_id: str, limit: int = 25) -> dict[str, Any]
```

**Key capabilities:**
- Automatic retry with exponential backoff
- Rate limit handling (429 status)
- Token expiration detection (190)
- Permission error handling (permissions denied)
- Scrub access tokens from logs

#### `tiktok_client.py`
```python
class TikTokContentPostingClient:
    async def create_post(self, video_path: str, caption: str) -> dict[str, Any]
```

#### `youtube_client.py`
```python
class YouTubeVideoClient:
    async def create_video(
        self,
        video_path: str,
        title: str,
        description: str,
        tags: list[str],
        privacy_status: str,
    ) -> dict[str, Any]
```

### Service Layer

#### `publish_service.py` (150+ lines)

Main orchestration:

```python
async def publish_social_content(
    provider: str,
    access_token: str,
    page_id: str,
    message: str | None = None,
    link: str | None = None,
    media_urls: list[str] | None = None,
    title: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
    privacy_status: str | None = None,
    scheduled_publish_time: int | None = None,
    publish_at: str | None = None,
    video_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # 1. Download media URLs to temp files
    # 2. Route to provider:
    #    - "meta": MetaGraphClient.create_post()
    #    - "tiktok": TikTokContentPostingClient.create_post()
    #    - "youtube": YouTubeVideoClient.create_video()
    # 3. Return result with provider_post_id
    # 4. Cleanup temp files
```

**Security validation:**
- `_validate_public_media_url()` — HTTPS only, no private IPs
- `_download_media_url()` — Download to temp, stream read with size limits
- Token is injected server-side (never embedded in client)

### Celery Task

#### `social_publish_task.py`
Scheduled task that publishes posts with future `scheduledAt`.

```python
@celery_app.task
async def publish_scheduled_social_posts():
    # 1. Query: social_posts WHERE status='scheduled' AND scheduledAt <= NOW()
    # 2. For each post:
    #    a. Load page + connection
    #    b. Decrypt tokens
    #    c. Call publish_social_content()
    #    d. Update post.status = "published" + providerPostId
    #    e. On error: post.status = "failed" + errorMessage
    # 3. Max 100 posts per run (prevents long-running task)
```

---

## Data Flow — End-to-End Publishing

### Scenario: User creates draft and publishes immediately

```
1. Frontend (React)
   └─ SocialPublishing.tsx
      └─ createDraftMutation.mutate({
           pageId: 1,
           contentText: "Check this out!",
           mediaRefs: ["https://example.com/image.jpg"]
         })

2. tRPC → Node.js
   └─ socialPublishing.createDraft
      └─ Zod validation
      └─ verifyPageAccess(pageId, userId)
      └─ socialPublishingService.createPublishingDraft
         ├─ INSERT INTO socialPosts (status='draft', ...)
         └─ Return post with id=123

3. Frontend
   └─ User clicks "Publish Now"
      └─ publishNowMutation.mutate({ postId: 123 })

4. tRPC → Node.js
   └─ socialPublishing.publishNow
      └─ socialPublishingService.publishPublishingPostNow
         ├─ Load post + page + connection
         ├─ Decrypt tokens (LLM_ENCRYPTION_KEY)
         ├─ socialPublishGateway.publishSocialContentViaPythonBackend({
         │    provider: "meta",
         │    pageId: "1234567890",
         │    accessToken: "EAA...",
         │    message: "Check this out!",
         │    mediaUrls: ["https://example.com/image.jpg"]
         │  })
         └─ POST http://localhost:8000/api/internal/social/publish

5. Python FastAPI
   └─ POST /api/internal/social/publish
      ├─ Verify x-internal-token
      ├─ Validate request (provider, page_id, message, media_urls)
      ├─ publish_service.publish_social_content
      │  ├─ Download media from https://example.com/image.jpg
      │  ├─ MetaGraphClient.create_post(
      │  │    message="Check this out!",
      │  │    media=[local_file_path]
      │  │  )
      │  └─ Return { provider_post_id: "123456789", status: "published" }
      └─ Return 200 with result

6. Node.js (response handling)
   └─ Extract providerPostId from response
   └─ UPDATE socialPosts SET status='published', providerPostId='123456789', publishedAt=NOW()
   └─ Log audit event
   └─ Return success to client

7. Frontend
   └─ invalidate queries
   └─ Refresh post list
   └─ Show success toast
```

### Scenario: User schedules post for future

```
1-2. User creates draft (same as above)

3. User clicks "Schedule"
   └─ schedulePostMutation.mutate({
        postId: 123,
        scheduledAt: "2026-04-01T15:30:00Z"  // 2 hours from now
      })

4. tRPC → Node.js
   └─ socialPublishing.schedulePost
      ├─ Validate scheduledAt (10 min min, 30 days max)
      ├─ UPDATE socialPosts SET status='scheduled', scheduledAt='2026-04-01T15:30:00Z'
      └─ Return success

5. [Later] Celery Worker
   └─ publish_scheduled_social_posts task (runs every minute)
      ├─ Query: posts WHERE status='scheduled' AND scheduledAt <= NOW()
      ├─ Found post with id=123, scheduledAt=2026-04-01T15:30:00Z
      ├─ Decrypt tokens
      ├─ Call POST /api/internal/social/publish (same as step 5 above)
      ├─ UPDATE socialPosts SET status='published', publishedAt=NOW(), providerPostId='...'
      └─ Task completes

6. Frontend
   └─ Polls listPosts (15 second refetch interval)
   └─ Detects status change from "scheduled" → "published"
   └─ UI updates in real-time
```

---

## Provider Abstraction

### Architecture

**Protocol-based design** (Python):
```python
@runtime_checkable
class SocialProviderClient(Protocol):
    async def send_message(self, recipient_id: str, text: str) -> dict[str, Any]: ...
    async def create_post(self, message: str, link: str | None = None, scheduled_at: int | None = None) -> dict[str, Any]: ...
    async def get_comments(self, object_id: str, limit: int = 25, after: str | None = None) -> dict[str, Any]: ...
    async def close(self) -> None: ...
```

**Implementations:**
- `MetaGraphClient` — Facebook Graph API v25.0
- `TikTokContentPostingClient` — TikTok Creator API
- `YouTubeVideoClient` — YouTube Data API v3

**Error mapping** (provider-specific exceptions → HTTP 502):
- `MetaApiError` (token expired, permission denied, rate limit)
- `TikTokApiError`
- `YouTubeApiError`

**Registry pattern** (Node.js):
```typescript
interface SocialProviderAdapter {
  providerId: string
  label: string
  actions: SocialAction[]              // ["read_inbox", "send_reply", "publish_post", "read_comments", "reply_comment"]
  execute(input: SocialBackgroundActionInput): Promise<Record<string, unknown>>
}

registerSocialProvider(adapter)
executeSocialAction(input)              // Routes to correct provider
```

---

## Integration Points for Upload Post API

### Where Upload Post API Fits

**Option 1: Direct Integration at Publishing Layer**

```
[Frontend] → POST /api/internal/social/publish (existing)
              ↓
         [Python Backend]
              ↓
         [Decision Point]
         /          \
      [Media        [Upload Post API]
       URLs]         (for TikTok/YouTube)
        ↓              ↓
    [MetaGraph]   [TikTok Creator]
                  [YouTube Data]
```

The Upload Post API would be a **new transport choice** alongside direct provider calls. The `publish_social_content()` function would:

1. Check if videos need hosting (TikTok, YouTube)
2. Call Upload Post API to stage files
3. Use returned URLs in provider publish calls

**Option 2: Middleware for Large Media**

Pre-stage all video/media via Upload Post API before calling provider clients:

```python
async def publish_social_content(...):
    if media_urls and any(is_video(url) for url in media_urls):
        # Pre-stage on Upload Post API first
        staged_urls = await upload_post_api.stage_media(media_urls)
        media_urls = staged_urls

    # Then publish using staged URLs
    return await MetaGraphClient.create_post(media_urls=media_urls)
```

### Key Insertion Points

1. **`publish_service.py`** — Wrap `_download_media_url()` call
2. **`meta_graph_client.py`** — Modify `create_post()` to accept pre-staged URLs
3. **Provider-agnostic**: All three providers (Meta, TikTok, YouTube) accept media URLs

### Database Changes Needed

Optional: Add column to `social_posts` to track staging:

```typescript
export const socialPosts = pgTable("social_posts", {
  // ... existing fields ...
  stagedMediaUrls: json("stagedMediaUrls").$type<string[]>(),     // URLs from Upload Post API
  stagingStatus: varchar("stagingStatus", { length: 50 }),         // "pending" | "staged" | "failed"
});
```

But **not required** if Upload Post API is transparent (URLs look like normal HTTPS URLs).

---

## Security & Validation

### Token Management

**Encryption:**
- All tokens encrypted at-rest with `LLM_ENCRYPTION_KEY` (AES-256-GCM)
- Decryption happens server-side only (Python backend)
- **Never returned to frontend** — only `configured: true/false` status

**Expiration:**
- `tokenExpiresAt` tracked per connection + per page
- Before publish, verify tokens not expired
- If expired, return error to frontend (user must re-auth)

### Media URL Validation

**Security checks:**
```python
_validate_public_media_url(url):
    # 1. HTTPS only (no http://)
    # 2. No blocked hosts (localhost, 127.0.0.1, 169.254.169.254, metadata.google.internal)
    # 3. No private IP ranges
    # 4. Download with timeout (10s connect, 60s read)
    # 5. Size limit check (prevent DoS)
```

### SSRF Protection

- Content links validated (HTTPS, public IPs only)
- Media downloads streamed (not stored permanently)
- Temp files cleaned up after publish

### Internal Token Auth

- All Python endpoints protected by `x-internal-token` header
- Token compared via `secrets.compare_digest()` (timing-safe)
- Verified at FastAPI dependency level

---

## Error Handling

### Provider-Specific Exceptions

```python
# Python backend exceptions
raise MetaApiError("Invalid access token")          # 502 BAD_GATEWAY
raise TokenExpiredError("Token has expired")         # 502 BAD_GATEWAY
raise PermissionDeniedError("User denied permission") # 502 BAD_GATEWAY
raise RateLimitExceededError("Rate limit exceeded")  # 502 BAD_GATEWAY

# Mapped to HTTP responses
POST /api/internal/social/publish
  ├─ 200 OK — published successfully
  ├─ 400 BAD_REQUEST — validation error
  ├─ 401 UNAUTHORIZED — missing/invalid internal token
  ├─ 502 BAD_GATEWAY — provider error (token, permission, rate limit)
  └─ 500 INTERNAL_SERVER_ERROR — unexpected error
```

### Node.js Error Handling

```typescript
publishPublishingPostNow(...) {
  try {
    const response = await publishSocialContentViaPythonBackend(...)
    if (!response.ok) {
      const error = await readPythonBackendError(response)
      // Store error in socialPosts.errorMessage
      // Set status = "failed"
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error })
    }
    // Success path
  } catch (error) {
    // Catch timeouts, network errors
    // Store error
    // Set status = "failed"
    throw error
  }
}
```

---

## Feature Flags

### `META_CHANNELS_ENABLED`
Controls access to all social features (publishing, automation, inbox, moderation).

Checked in:
- `socialPublishing` tRPC router
- `socialAutomation` tRPC router
- `socialInbox` tRPC router
- `socialModeration` tRPC router
- `metaChannels` tRPC router

**Flag effect:**
```typescript
if (!enabled) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Meta Channels are disabled for this tenant"
  })
}
```

---

## Testing & Validation

### Unit Tests

- `socialPublishingService.test.ts` — Draft creation, publishing, scheduling
- `socialInboxService.test.ts` — Conversation loading, message sending
- `socialAutomationService.test.ts` — Rule creation, approval workflow
- Provider client tests (meta_graph_client, tiktok_client, youtube_client)

### Integration Tests

- End-to-end publishing flow with real provider mocks
- OAuth callback handling
- Webhook event processing
- Token expiration handling

### Load Testing

- Publish 100+ posts in batch (Celery task)
- Query large conversation histories (pagination)
- Concurrent approval queue updates

---

## Summary: Integration Readiness

**Upload Post API could integrate at these points:**

1. **`python-backend/app/services/social/publish_service.py`** (publish service layer)
   - Before calling MetaGraphClient, TikTokClient, YouTubeClient
   - Stage media on Upload Post API, use returned URLs

2. **`python-backend/app/services/social/meta_graph_client.py`** (Meta provider)
   - Modify `create_post()` to accept pre-staged URLs
   - Add retry logic for Upload Post API failures

3. **Database optional**: Track staging status in `social_posts` table

4. **Error handling**: Map Upload Post API errors to provider errors

**No changes needed to:**
- Frontend flow (works with existing tRPC)
- Authentication (internal token already present)
- Publishing router (transparent to user)
- Scheduling (works with any media URL format)

The **entire system is provider-agnostic** — it expects media as HTTPS URLs. Upload Post API becomes another source of those URLs.

---

## Files Summary

### Node.js Backend
- Routers: `socialPublishing.ts`, `socialAutomation.ts`, `socialInbox.ts`, `socialModeration.ts`, `metaChannels.ts`
- Services: `socialPublishingService.ts`, `socialAutomationService.ts`, `socialInboxService.ts`, `socialPublishGateway.ts`, `socialAccessService.ts`
- Gateway: `socialPublishGateway.ts`
- Types: `types/social.ts`

### Python Backend
- API: `api/social_publish.py`, `api/meta_*.py`
- Services: `services/social/publish_service.py`, `meta_graph_client.py`, `tiktok_client.py`, `youtube_client.py`
- Tasks: `tasks/social_publish_task.py`
- Exceptions: `services/social/exceptions.py`

### Database
- Drizzle Schema: `drizzle/schema.ts` (lines 7505-7746)
- 13 social-related tables

### Frontend
- Pages: `SocialPublishing.tsx`, `SocialChannels.tsx`, `SocialInbox.tsx`, `SocialModeration.tsx`, `SocialAutomation.tsx`
- Types: `types/social.ts`
