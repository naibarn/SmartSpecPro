# Feature 058 — Meta Channels (Facebook Page & Messenger Integration)

## 1. Overview

Native **Meta Channels** subsystem for SmartSpecPro enabling Facebook Page and Messenger workflows as a secure first-class module. The system owns the full lifecycle: OAuth connection, page management, webhook ingestion, inbox operations, content publishing, comment moderation, and AI-assisted automation.

**Key architectural principle:** SmartSpecPro acts as both **control plane** (config, permissions, UX) and **execution plane** (events, AI decisions, outbound actions). Raw provider tokens never reach the frontend or LLM prompts.

### 1.1 Integration Points

This feature integrates with three existing SmartSpecPro subsystems:

1. **Virtual Workflows** — 6 new node types registered in `NodeRegistry` for social automation flows
2. **Agencies** — 1 new builtin tool (`builtin-meta-channels`) for agent-driven social operations
3. **Skills** — 2 optional skills (`meta-messenger`, `meta-page-manager`) for AI-assisted drafting

---

## 2. Scope

### 2.1 MVP (Phase 1-2)
- Meta OAuth connect/disconnect
- Page selection and permission management
- Secure encrypted token storage (AES-256-GCM via `crypto.ts`)
- Webhook verification and event ingestion
- Unified inbox for Messenger conversations
- Manual reply from SmartSpecPro
- AI-assisted reply drafting (using existing chat/RAG pipeline)
- Page post publishing (text + link)
- Basic comment read/reply
- Audit logging and tenant-scoped access control
- Feature flag: `META_CHANNELS_ENABLED` (default `false`)

### 2.2 Phase 3
- Approval queue for AI-generated replies
- Conversation routing and assignment
- Labels, SLA, inbox filtering
- Scheduled publishing
- Richer moderation actions (hide/delete/flag)
- Knowledge-grounded auto-replies via library/RAG

### 2.3 Phase 4
- Workflow builder nodes for social automation
- Agency builtin tool for agent-driven operations
- Policy-based autonomous execution
- Advanced analytics and insights

### 2.4 Non-Goals
- Clone external product UI
- Expose raw tokens to user or LLM
- Full ad campaign management in MVP
- Support every Meta surface in first release

---

## 3. Architecture

### 3.1 Responsibility Split

```
Browser UI
  -> apps/web React pages (SocialChannels, SocialInbox, SocialPublishing, SocialModeration)
  -> apps/web tRPC routers (metaChannels, socialInbox, socialPublishing, socialModeration)
  -> PostgreSQL / Redis
  -> python-backend provider adapters + webhook endpoints + async jobs
  -> Meta Graph API / Messenger Platform / Webhooks
```

| Layer | Responsibility |
|-------|---------------|
| `apps/web` (React) | Connection UI, inbox UI, post composer, comment management, approval UX, audit surface |
| `apps/web` (tRPC) | Routers for all CRUD operations, tenant-scoped queries, internal API proxy |
| `python-backend` | OAuth callback, token exchange/refresh, webhook verification, event normalization, outbound provider API, retryable async jobs, heavy orchestration |
| PostgreSQL | Durable state (connections, conversations, messages, posts, comments, rules) |
| Redis | Rate limiting, dedupe cache, BullMQ queues, ephemeral coordination |
| Celery | Async webhook processing, scheduled publishing, token refresh, batch operations |

### 3.2 Data Flow Diagram

```
                              +------------------+
                              |    Nginx :443     |
                              +--------+---------+
                       +---------------+---------------+
                       v               v               v
                 +----------+   +----------+   +-----------+
                 | Web :3000|   | Python   |   | Celery    |
                 | React    |   | :8000    |   | Workers   |
                 | tRPC     |   | FastAPI  |   |           |
                 +----+-----+   +----+-----+   +-----+-----+
                      |              |               |
                      v              v               v
                 +----------+  +----------+  +-----------+
                 |PostgreSQL|  |  Redis   |  | Meta API  |
                 |  :5432   |  |  :6379   |  | (Graph)   |
                 +----------+  +----------+  +-----------+

  Inbound:  Meta Webhook -> Python :8000 -> normalize -> PostgreSQL -> tRPC query -> React inbox
  Outbound: React compose -> tRPC -> Python -> Meta Graph API -> status update -> React
```

---

## 4. Module Layout

### 4.1 apps/web — Frontend Pages

```
apps/web/client/src/pages/
  SocialChannels.tsx          # Provider connections, page list, health
  SocialInbox.tsx             # Messenger conversation list + thread view
  SocialPublishing.tsx        # Post draft/schedule/publish
  SocialModeration.tsx        # Comments list, reply/hide/delete actions
```

### 4.2 apps/web — tRPC Routers

```
apps/web/server/routers/
  metaChannels.ts             # OAuth, page connect/disconnect, health
  socialInbox.ts              # Conversations, messages, reply, AI draft
  socialPublishing.ts         # Draft, schedule, publish, cancel
  socialModeration.ts         # Comments, reply, hide, delete, flag
```

### 4.3 apps/web — Services

```
apps/web/server/services/
  metaConnectionService.ts    # OAuth state, token refresh scheduling
  metaCredentialVault.ts      # Encrypt/decrypt tokens via crypto.ts
  socialDispatchService.ts    # Route outbound actions to python-backend
  socialInboxQueryService.ts  # Tenant-scoped conversation/message queries
```

### 4.4 python-backend — API Endpoints

```
python-backend/app/api/
  meta_oauth.py               # GET /api/oauth/meta/authorize, POST callback
  meta_pages.py               # Internal page CRUD + webhook subscribe
  meta_webhooks.py            # GET/POST /api/webhooks/meta (verification + ingestion)
  meta_messages.py            # Internal send message, fetch thread
  meta_posts.py               # Internal publish/schedule post
  meta_comments.py            # Internal reply/hide/delete comment
```

### 4.5 python-backend — Services

```
python-backend/app/services/social/
  __init__.py
  meta_graph_client.py        # Meta Graph API wrapper (rate-limited, retried)
  webhook_normalizer.py       # Raw event -> conversation/message records
  webhook_dedup.py            # Redis-based dedupe with TTL
  inbox_service.py            # Conversation management, assignment, status
  publishing_service.py       # Post lifecycle management
  moderation_service.py       # Comment action execution
```

### 4.6 python-backend — Celery Tasks

```
python-backend/app/tasks/
  social_webhook_task.py      # Async webhook event processing
  social_publish_task.py      # Scheduled post publishing
  social_token_refresh_task.py # Periodic token refresh
  social_cleanup_task.py      # Archive old raw webhooks
```

---

## 5. Database Schema

### 5.1 Drizzle ORM Additions (`apps/web/drizzle/schema.ts`)

All tables follow existing patterns: `serial("id").primaryKey()`, `tenantId` FK, `createdAt`/`updatedAt` timestamps.

#### Connection Tables

```typescript
// Provider authorization per tenant/user
export const socialProviderConnections = pgTable("social_provider_connections", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  userId: integer("userId").references(() => users.id).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // "meta"
  providerUserId: varchar("providerUserId", { length: 255 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
    // "active" | "expired" | "revoked" | "error"
  grantedScopes: json("grantedScopes").$type<string[]>(),
  encryptedAccessToken: text("encryptedAccessToken"),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt", { withTimezone: true }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// Connected Pages
export const socialPages = pgTable("social_pages", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  connectionId: integer("connectionId").references(() => socialProviderConnections.id, { onDelete: "cascade" }).notNull(),
  providerPageId: varchar("providerPageId", { length: 255 }).notNull(),
  pageName: varchar("pageName", { length: 500 }).notNull(),
  pageCategory: varchar("pageCategory", { length: 255 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
    // "active" | "disconnected" | "needs_reauth"
  encryptedPageAccessToken: text("encryptedPageAccessToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt", { withTimezone: true }),
  selectedForInbox: boolean("selectedForInbox").default(true),
  selectedForPublishing: boolean("selectedForPublishing").default(true),
  selectedForModeration: boolean("selectedForModeration").default(false),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// Webhook subscription state
export const socialWebhookSubscriptions = pgTable("social_webhook_subscriptions", {
  id: serial("id").primaryKey(),
  pageId: integer("pageId").references(() => socialPages.id, { onDelete: "cascade" }).notNull(),
  subscriptionStatus: varchar("subscriptionStatus", { length: 20 }).default("pending").notNull(),
  subscribedFields: json("subscribedFields").$type<string[]>(),
  lastVerifiedAt: timestamp("lastVerifiedAt", { withTimezone: true }),
  lastDeliveryAt: timestamp("lastDeliveryAt", { withTimezone: true }),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Inbox Tables

```typescript
export const socialConversations = pgTable("social_conversations", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  pageId: integer("pageId").references(() => socialPages.id).notNull(),
  providerConversationId: varchar("providerConversationId", { length: 255 }),
  channelType: varchar("channelType", { length: 50 }).default("messenger").notNull(),
  customerExternalId: varchar("customerExternalId", { length: 255 }),
  customerDisplayName: varchar("customerDisplayName", { length: 500 }),
  status: varchar("status", { length: 20 }).default("open").notNull(),
    // "open" | "pending" | "resolved" | "archived"
  assignedToUserId: integer("assignedToUserId").references(() => users.id),
  priority: integer("priority").default(0),
  lastMessageAt: timestamp("lastMessageAt", { withTimezone: true }),
  lastInboundAt: timestamp("lastInboundAt", { withTimezone: true }),
  lastOutboundAt: timestamp("lastOutboundAt", { withTimezone: true }),
  unreadCount: integer("unreadCount").default(0),
  labels: json("labels").$type<string[]>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const socialMessages = pgTable("social_messages", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  conversationId: integer("conversationId").references(() => socialConversations.id, { onDelete: "cascade" }).notNull(),
  pageId: integer("pageId").references(() => socialPages.id).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  direction: varchar("direction", { length: 10 }).notNull(), // "inbound" | "outbound"
  senderType: varchar("senderType", { length: 20 }).notNull(),
    // "customer" | "agent" | "ai" | "system"
  senderExternalId: varchar("senderExternalId", { length: 255 }),
  senderUserId: integer("senderUserId").references(() => users.id),
  messageType: varchar("messageType", { length: 30 }).default("text").notNull(),
    // "text" | "attachment" | "quick_reply" | "system_event"
  body: text("body"),
  payload: json("payload").$type<Record<string, unknown>>(),
  deliveryStatus: varchar("deliveryStatus", { length: 20 }).default("sent"),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt", { withTimezone: true }),
  receivedAt: timestamp("receivedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Publishing Tables

```typescript
export const socialPosts = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  pageId: integer("pageId").references(() => socialPages.id).notNull(),
  providerPostId: varchar("providerPostId", { length: 255 }),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
    // "draft" | "scheduled" | "publishing" | "published" | "failed"
  contentText: text("contentText"),
  contentLink: text("contentLink"),
  mediaRefs: json("mediaRefs").$type<string[]>(),
  scheduledAt: timestamp("scheduledAt", { withTimezone: true }),
  publishedAt: timestamp("publishedAt", { withTimezone: true }),
  createdByUserId: integer("createdByUserId").references(() => users.id),
  approvedByUserId: integer("approvedByUserId").references(() => users.id),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Comment Tables

```typescript
export const socialComments = pgTable("social_comments", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  pageId: integer("pageId").references(() => socialPages.id).notNull(),
  providerCommentId: varchar("providerCommentId", { length: 255 }),
  providerObjectId: varchar("providerObjectId", { length: 255 }), // post/photo ID
  parentCommentId: integer("parentCommentId"),
  authorExternalId: varchar("authorExternalId", { length: 255 }),
  authorDisplayName: varchar("authorDisplayName", { length: 500 }),
  body: text("body"),
  status: varchar("status", { length: 20 }).default("visible"),
  lastAction: varchar("lastAction", { length: 20 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const socialCommentActions = pgTable("social_comment_actions", {
  id: serial("id").primaryKey(),
  commentId: integer("commentId").references(() => socialComments.id, { onDelete: "cascade" }).notNull(),
  actionType: varchar("actionType", { length: 20 }).notNull(),
    // "reply" | "hide" | "delete" | "flag"
  performedByUserId: integer("performedByUserId").references(() => users.id),
  performedBySystem: boolean("performedBySystem").default(false),
  providerResult: json("providerResult").$type<Record<string, unknown>>(),
  status: varchar("status", { length: 20 }).default("completed"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Automation Tables

```typescript
export const socialAutomationRules = pgTable("social_automation_rules", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  pageId: integer("pageId").references(() => socialPages.id),
  name: varchar("name", { length: 255 }).notNull(),
  isEnabled: boolean("isEnabled").default(false),
  triggerType: varchar("triggerType", { length: 50 }).notNull(),
    // "new_message" | "keyword_match" | "unread_timeout" | "business_hours"
  conditions: json("conditions").$type<Record<string, unknown>>(),
  actionMode: varchar("actionMode", { length: 20 }).default("draft_only").notNull(),
    // "off" | "draft_only" | "approval_required" | "auto_send"
  policyConfig: json("policyConfig").$type<Record<string, unknown>>(),
  createdByUserId: integer("createdByUserId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const socialHumanApprovals = pgTable("social_human_approvals", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id).notNull(),
  pageId: integer("pageId").references(() => socialPages.id),
  entityType: varchar("entityType", { length: 50 }).notNull(),
    // "reply" | "post" | "comment_action"
  entityId: integer("entityId").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
    // "pending" | "approved" | "rejected" | "expired"
  requestedBySystem: boolean("requestedBySystem").default(true),
  reviewedByUserId: integer("reviewedByUserId").references(() => users.id),
  decisionNote: text("decisionNote"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Operations Tables

```typescript
export const socialWebhookEventsRaw = pgTable("social_webhook_events_raw", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }),
  provider: varchar("provider", { length: 50 }).notNull(),
  pageId: integer("pageId"),
  deliveryId: varchar("deliveryId", { length: 255 }),
  eventType: varchar("eventType", { length: 100 }),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  headers: json("headers").$type<Record<string, string>>(),
  receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull(),
  processingStatus: varchar("processingStatus", { length: 20 }).default("pending"),
    // "pending" | "processed" | "failed" | "skipped"
  errorMessage: text("errorMessage"),
});
```

### 5.2 Indexes

```sql
CREATE INDEX idx_social_pages_tenant ON social_pages("tenantId");
CREATE INDEX idx_social_conversations_tenant_page ON social_conversations("tenantId", "pageId");
CREATE INDEX idx_social_conversations_status ON social_conversations("status", "lastMessageAt" DESC);
CREATE INDEX idx_social_messages_conversation ON social_messages("conversationId", "createdAt");
CREATE INDEX idx_social_messages_provider ON social_messages("providerMessageId");
CREATE INDEX idx_social_posts_tenant_status ON social_posts("tenantId", "status");
CREATE INDEX idx_social_comments_page ON social_comments("pageId", "createdAt" DESC);
CREATE INDEX idx_social_webhook_raw_status ON social_webhook_events_raw("processingStatus", "receivedAt");
CREATE UNIQUE INDEX idx_social_webhook_dedup ON social_webhook_events_raw("provider", "deliveryId");
```

---

## 6. Workflow Integration

### 6.1 New Workflow Node Types

Register in `python-backend/app/orchestrator/node_registry.py` under `_register_core_nodes()`.
Category: `"social"` (new category with icon `share-2`, color `indigo`).

#### Node 1: `incoming_meta_message` (Trigger)

```python
NodeTypeSpec(
    type="incoming_meta_message",
    display_name="Meta Message Trigger",
    description="Triggers when a new Messenger message arrives for a connected Page",
    icon="message-circle",
    color="indigo",
    category="social",
    inputs=[
        InputSpec(name="pageId", display_name="Connected Page", data_type="text",
                  ui_type="select", required=True, accepts_connection=False,
                  options_endpoint="/api/v1/social/connected-pages"),
        InputSpec(name="filterKeywords", display_name="Filter Keywords",
                  data_type="text", ui_type="text", required=False,
                  accepts_connection=False),
    ],
    outputs=[
        OutputSpec(name="conversationId", display_name="Conversation ID", data_type="text"),
        OutputSpec(name="messageBody", display_name="Message Body", data_type="text"),
        OutputSpec(name="senderName", display_name="Sender Name", data_type="text"),
        OutputSpec(name="senderExternalId", display_name="Sender ID", data_type="text"),
        OutputSpec(name="messagePayload", display_name="Full Payload", data_type="json"),
    ],
    executor="app.orchestrator.node_executors.social.meta_message_trigger.MetaMessageTriggerExecutor",
)
```

#### Node 2: `classify_social_intent`

```python
NodeTypeSpec(
    type="classify_social_intent",
    display_name="Classify Social Intent",
    description="Classifies customer message intent (inquiry, complaint, purchase, support, spam)",
    icon="tag",
    color="indigo",
    category="social",
    inputs=[
        InputSpec(name="messageBody", display_name="Message Text", data_type="text",
                  ui_type="textarea", required=True, accepts_connection=True),
        InputSpec(name="conversationHistory", display_name="Conversation History",
                  data_type="json", ui_type="json_editor", required=False,
                  accepts_connection=True),
        InputSpec(name="model", display_name="LLM Model", data_type="text",
                  ui_type="select", required=False, accepts_connection=False,
                  options_endpoint="/api/v1/workflows/available-models"),
    ],
    outputs=[
        OutputSpec(name="intent", display_name="Intent", data_type="text"),
        OutputSpec(name="confidence", display_name="Confidence", data_type="number"),
        OutputSpec(name="category", display_name="Category", data_type="text"),
        OutputSpec(name="requiresHuman", display_name="Requires Human", data_type="boolean"),
    ],
    executor="app.orchestrator.node_executors.social.classify_intent_executor.ClassifyIntentExecutor",
)
```

#### Node 3: `draft_social_reply`

```python
NodeTypeSpec(
    type="draft_social_reply",
    display_name="Draft Social Reply",
    description="Generates an AI draft reply using RAG context and brand guidelines",
    icon="pen-line",
    color="indigo",
    category="social",
    inputs=[
        InputSpec(name="messageBody", display_name="Customer Message", data_type="text",
                  ui_type="textarea", required=True, accepts_connection=True),
        InputSpec(name="intent", display_name="Detected Intent", data_type="text",
                  ui_type="text", required=False, accepts_connection=True),
        InputSpec(name="ragCollectionId", display_name="Knowledge Base",
                  data_type="text", ui_type="select", required=False,
                  accepts_connection=False,
                  options_endpoint="/api/v1/workflows/available-collections"),
        InputSpec(name="toneGuide", display_name="Tone Guide", data_type="text",
                  ui_type="textarea", required=False, accepts_connection=False,
                  default="Professional, friendly, helpful"),
        InputSpec(name="model", display_name="LLM Model", data_type="text",
                  ui_type="select", required=False, accepts_connection=False,
                  options_endpoint="/api/v1/workflows/available-models"),
    ],
    outputs=[
        OutputSpec(name="draftReply", display_name="Draft Reply", data_type="text"),
        OutputSpec(name="confidence", display_name="Confidence", data_type="number"),
        OutputSpec(name="sourceDocuments", display_name="Source Documents", data_type="json"),
    ],
    executor="app.orchestrator.node_executors.social.draft_reply_executor.DraftReplyExecutor",
)
```

#### Node 4: `send_meta_reply`

```python
NodeTypeSpec(
    type="send_meta_reply",
    display_name="Send Meta Reply",
    description="Sends a reply message to a Messenger conversation via Meta API",
    icon="send",
    color="indigo",
    category="social",
    inputs=[
        InputSpec(name="conversationId", display_name="Conversation ID", data_type="text",
                  ui_type="text", required=True, accepts_connection=True),
        InputSpec(name="messageBody", display_name="Message Body", data_type="text",
                  ui_type="textarea", required=True, accepts_connection=True),
        InputSpec(name="pageId", display_name="Connected Page", data_type="text",
                  ui_type="select", required=True, accepts_connection=True,
                  options_endpoint="/api/v1/social/connected-pages"),
    ],
    outputs=[
        OutputSpec(name="providerMessageId", display_name="Message ID", data_type="text"),
        OutputSpec(name="deliveryStatus", display_name="Delivery Status", data_type="text"),
        OutputSpec(name="error", display_name="Error", data_type="text"),
    ],
    executor="app.orchestrator.node_executors.social.send_reply_executor.SendReplyExecutor",
)
```

#### Node 5: `publish_meta_post`

```python
NodeTypeSpec(
    type="publish_meta_post",
    display_name="Publish Meta Post",
    description="Publishes a post to a connected Facebook Page",
    icon="file-text",
    color="indigo",
    category="social",
    inputs=[
        InputSpec(name="pageId", display_name="Connected Page", data_type="text",
                  ui_type="select", required=True, accepts_connection=True,
                  options_endpoint="/api/v1/social/connected-pages"),
        InputSpec(name="contentText", display_name="Post Content", data_type="text",
                  ui_type="textarea", required=True, accepts_connection=True),
        InputSpec(name="contentLink", display_name="Link URL", data_type="text",
                  ui_type="text", required=False, accepts_connection=True),
        InputSpec(name="scheduledAt", display_name="Schedule Time (ISO)", data_type="text",
                  ui_type="text", required=False, accepts_connection=True),
    ],
    outputs=[
        OutputSpec(name="postId", display_name="Post ID", data_type="text"),
        OutputSpec(name="providerPostId", display_name="Provider Post ID", data_type="text"),
        OutputSpec(name="status", display_name="Status", data_type="text"),
        OutputSpec(name="error", display_name="Error", data_type="text"),
    ],
    executor="app.orchestrator.node_executors.social.publish_post_executor.PublishPostExecutor",
)
```

#### Node 6: `approve_social_action`

```python
NodeTypeSpec(
    type="approve_social_action",
    display_name="Social Approval Gate",
    description="Pauses workflow and waits for human approval before sending a social action",
    icon="shield-check",
    color="indigo",
    category="social",
    inputs=[
        InputSpec(name="actionType", display_name="Action Type", data_type="text",
                  ui_type="select", required=True, accepts_connection=False,
                  options=[
                      {"label": "Reply", "value": "reply"},
                      {"label": "Post", "value": "post"},
                      {"label": "Comment Action", "value": "comment_action"},
                  ]),
        InputSpec(name="content", display_name="Content to Approve", data_type="text",
                  ui_type="textarea", required=True, accepts_connection=True),
        InputSpec(name="confidence", display_name="AI Confidence", data_type="number",
                  ui_type="number", required=False, accepts_connection=True),
        InputSpec(name="autoApproveThreshold", display_name="Auto-Approve Threshold",
                  data_type="number", ui_type="slider", required=False,
                  accepts_connection=False, default=0.95,
                  validation={"min": 0, "max": 1}),
    ],
    outputs=[
        OutputSpec(name="approved", display_name="Approved", data_type="boolean"),
        OutputSpec(name="content", display_name="Approved Content", data_type="text"),
        OutputSpec(name="reviewerNote", display_name="Reviewer Note", data_type="text"),
    ],
    executor="app.orchestrator.node_executors.social.approval_gate_executor.SocialApprovalGateExecutor",
)
```

### 6.2 Executor File Structure

```
python-backend/app/orchestrator/node_executors/social/
  __init__.py
  meta_message_trigger.py        # Event-driven trigger (webhook -> workflow)
  classify_intent_executor.py    # LLM-based intent classification
  draft_reply_executor.py        # RAG-grounded reply generation
  send_reply_executor.py         # Outbound message via Meta API
  publish_post_executor.py       # Page post publishing
  approval_gate_executor.py      # Human-in-the-loop gate
```

### 6.3 Example Workflow: Auto-Reply Pipeline

```
[incoming_meta_message] (trigger: pageId=123)
       |
       v
[classify_social_intent] (messageBody <- trigger.messageBody)
       |
       +--[confidence > 0.7]--> [draft_social_reply] (ragCollectionId="faq-kb")
       |                              |
       |                              v
       |                     [approve_social_action] (autoApproveThreshold=0.95)
       |                              |
       |                     +--[approved=true]--> [send_meta_reply]
       |                     |
       |                     +--[approved=false]--> (end, stays in inbox)
       |
       +--[confidence <= 0.7]--> (end, stays in inbox for manual reply)
```

---

## 7. Agency Integration

### 7.1 Builtin Tool: `builtin-meta-channels`

Register in `apps/web/server/routers/agency.ts` `listTools` procedure and add endpoint mapping in `python-backend/app/services/agency_tools.py`.

#### Tool Definition (in `listTools`)

```typescript
{
  id: "builtin-meta-channels",
  name: "Meta Channels",
  description: "Send messages, publish posts, read inbox, and manage comments on connected Facebook Pages",
  toolType: "builtin",
  riskLevel: "medium",
  icon: "share-2",
  category: "social",
  requiresApproval: false,
  configSchema: {
    fields: [
      {
        key: "pageId",
        label: "Connected Page",
        type: "select",
        required: true,
        optionsEndpoint: "/api/v1/social/connected-pages",
        placeholder: "Select a connected Facebook Page",
      },
      {
        key: "allowedActions",
        label: "Allowed Actions",
        type: "multiselect",
        required: true,
        options: [
          { label: "Read Inbox", value: "read_inbox" },
          { label: "Send Reply", value: "send_reply" },
          { label: "Publish Post", value: "publish_post" },
          { label: "Read Comments", value: "read_comments" },
          { label: "Reply to Comments", value: "reply_comment" },
        ],
        default: ["read_inbox"],
      },
      {
        key: "requireApproval",
        label: "Require Human Approval for Outbound",
        type: "toggle",
        default: true,
      },
    ],
  },
}
```

#### Python Backend Registration (`agency_tools.py`)

```python
# In _BUILTIN_ENDPOINTS:
"builtin-meta-channels": "/api/internal/tools/meta-channels",

# In _BUILTIN_RISK_LEVELS:
"builtin-meta-channels": "medium",
```

#### Internal Tool Endpoint

```
POST /api/internal/tools/meta-channels
```

Input schema (what the LLM agent sends):
```json
{
  "action": "send_reply | publish_post | read_inbox | read_comments | reply_comment",
  "pageId": 123,
  "conversationId": 456,
  "messageBody": "Thank you for your inquiry...",
  "contentText": "Post content here",
  "commentId": 789
}
```

The endpoint routes to the appropriate python-backend service function based on `action`, enforces `allowedActions` from tool config, and returns structured results.

### 7.2 Agent Use Case Example

An agency with a "Customer Support" agent could be configured:
- **Model**: claude-sonnet-4-5-20250514
- **Instructions**: "You are a customer support agent for [Brand]. Use Meta Channels to read inbox messages and draft helpful replies. Always check the knowledge base before responding."
- **Tools**:
  - `builtin-rag-knowledge` (config: `{ collectionId: "faq-kb", topK: 5 }`)
  - `builtin-meta-channels` (config: `{ pageId: 123, allowedActions: ["read_inbox", "send_reply"], requireApproval: true }`)

---

## 8. Feature Flags & UI Registration

### 8.1 Feature Flag

Add to `apps/web/shared/featureFlags.ts`:

```typescript
META_CHANNELS_ENABLED: boolean; // default: false
```

### 8.2 Menu Items

Add to `packages/shared/src/constants/menu.ts`:

```typescript
// Main group — Social section
{
  id: "social-channels",
  label: "Social Channels",
  labelTh: "ช่องทางโซเชียล",
  icon: "Share2",
  path: "/social/channels",
  platforms: ["web", "desktop"],
  group: "main",
  section: "social",
  sortOrder: 7.0,
  requiresFeature: "META_CHANNELS_ENABLED",
},
{
  id: "social-inbox",
  label: "Social Inbox",
  labelTh: "กล่องข้อความโซเชียล",
  icon: "MessageCircle",
  path: "/social/inbox",
  platforms: ["web", "desktop"],
  group: "main",
  section: "social",
  sortOrder: 7.1,
  requiresFeature: "META_CHANNELS_ENABLED",
},
{
  id: "social-publishing",
  label: "Publishing",
  labelTh: "เผยแพร่",
  icon: "FileText",
  path: "/social/publishing",
  platforms: ["web", "desktop"],
  group: "main",
  section: "social",
  sortOrder: 7.2,
  requiresFeature: "META_CHANNELS_ENABLED",
},
{
  id: "social-moderation",
  label: "Moderation",
  labelTh: "ตรวจสอบ",
  icon: "Shield",
  path: "/social/moderation",
  platforms: ["web", "desktop"],
  group: "main",
  section: "social",
  sortOrder: 7.3,
  requiresFeature: "META_CHANNELS_ENABLED",
},
```

### 8.3 Routes (App.tsx)

```typescript
const SocialChannels = lazy(() => import("@/pages/SocialChannels"));
const SocialInbox = lazy(() => import("@/pages/SocialInbox"));
const SocialPublishing = lazy(() => import("@/pages/SocialPublishing"));
const SocialModeration = lazy(() => import("@/pages/SocialModeration"));

// In Router():
<Route path="/social/channels"><RequireAuth><SocialChannels /></RequireAuth></Route>
<Route path="/social/inbox"><RequireAuth><SocialInbox /></RequireAuth></Route>
<Route path="/social/publishing"><RequireAuth><SocialPublishing /></RequireAuth></Route>
<Route path="/social/moderation"><RequireAuth><SocialModeration /></RequireAuth></Route>
```

---

## 9. Security Requirements

### 9.1 Credential Handling
- Store provider access tokens using `encrypt()` from `crypto.ts` (AES-256-GCM, key = SHA-256 of `LLM_ENCRYPTION_KEY`)
- Python backend reads tokens via `smartspecweb_crypto.decrypt_smartspecweb()`
- **NEVER** expose raw tokens to frontend, LLM prompts, or agency tool inputs
- Page access tokens stored in `socialPages.encryptedPageAccessToken`

### 9.2 Access Control
- All queries scoped by `tenantId`
- Page-level access checks for inbox/publish/moderate operations
- Role-based restrictions: connect/disconnect requires admin or domain_admin
- Reply/publish/moderate requires authenticated user with page access

### 9.3 Webhook Validation
- Validate Meta `hub.verify_token` on GET challenge
- Validate `X-Hub-Signature-256` HMAC on POST payloads
- Reject invalid signatures with 403
- Log failed validation for security review

### 9.4 AI Safety Guardrails
- Default: `draft_only` mode (AI suggests, human sends)
- `auto_send` only for explicitly approved intents + high confidence
- Per-tenant kill switch: `META_CHANNELS_ENABLED = false`
- Per-page disable switch: `socialPages.status = "disconnected"`
- Blocked categories: billing disputes, legal, refunds, harassment default to escalation

### 9.5 SSRF Protection
- Meta Graph API calls go through `meta_graph_client.py` with allowlisted base URLs only
- Custom webhook URLs validated against private IP ranges (same pattern as `agency_tools.py`)

---

## 10. tRPC Router API Design

### 10.1 metaChannels.ts

```typescript
export const metaChannelsRouter = router({
  getConnectionStatus: protectedProcedure.query(/* ... */),
  getAuthUrl: protectedProcedure.mutation(/* ... */),
  completeOAuth: protectedProcedure.input(z.object({
    code: z.string(), state: z.string()
  })).mutation(/* ... */),
  listAvailablePages: protectedProcedure.query(/* ... */),
  connectPage: protectedProcedure.input(z.object({
    providerPageId: z.string()
  })).mutation(/* ... */),
  disconnectPage: protectedProcedure.input(z.object({
    pageId: z.number()
  })).mutation(/* ... */),
  getPageHealth: protectedProcedure.input(z.object({
    pageId: z.number()
  })).query(/* ... */),
});
```

### 10.2 socialInbox.ts

```typescript
export const socialInboxRouter = router({
  listConversations: protectedProcedure.input(z.object({
    pageId: z.number().optional(),
    status: z.enum(["open", "pending", "resolved", "archived"]).optional(),
    cursor: z.number().optional(),
    limit: z.number().min(1).max(50).default(20),
  })).query(/* ... */),
  getConversation: protectedProcedure.input(z.object({
    conversationId: z.number()
  })).query(/* ... */),
  listMessages: protectedProcedure.input(z.object({
    conversationId: z.number(),
    cursor: z.number().optional(),
    limit: z.number().min(1).max(100).default(50),
  })).query(/* ... */),
  sendReply: protectedProcedure.input(z.object({
    conversationId: z.number(),
    body: z.string().min(1).max(2000),
  })).mutation(/* ... */),
  generateDraft: protectedProcedure.input(z.object({
    conversationId: z.number(),
  })).mutation(/* ... */),
  updateConversationStatus: protectedProcedure.input(z.object({
    conversationId: z.number(),
    status: z.enum(["open", "pending", "resolved", "archived"]),
  })).mutation(/* ... */),
});
```

### 10.3 socialPublishing.ts

```typescript
export const socialPublishingRouter = router({
  createDraft: protectedProcedure.input(z.object({
    pageId: z.number(),
    contentText: z.string().min(1),
    contentLink: z.string().url().optional(),
  })).mutation(/* ... */),
  publishNow: protectedProcedure.input(z.object({
    postId: z.number()
  })).mutation(/* ... */),
  schedulePost: protectedProcedure.input(z.object({
    postId: z.number(),
    scheduledAt: z.string().datetime(),
  })).mutation(/* ... */),
  listPosts: protectedProcedure.input(z.object({
    pageId: z.number().optional(),
    status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
    cursor: z.number().optional(),
    limit: z.number().min(1).max(50).default(20),
  })).query(/* ... */),
  cancelScheduledPost: protectedProcedure.input(z.object({
    postId: z.number()
  })).mutation(/* ... */),
});
```

### 10.4 socialModeration.ts

```typescript
export const socialModerationRouter = router({
  listComments: protectedProcedure.input(z.object({
    pageId: z.number(),
    cursor: z.number().optional(),
    limit: z.number().min(1).max(50).default(20),
  })).query(/* ... */),
  replyToComment: protectedProcedure.input(z.object({
    commentId: z.number(),
    body: z.string().min(1).max(2000),
  })).mutation(/* ... */),
  hideComment: protectedProcedure.input(z.object({
    commentId: z.number()
  })).mutation(/* ... */),
  deleteComment: protectedProcedure.input(z.object({
    commentId: z.number()
  })).mutation(/* ... */),
});
```

---

## 11. Event Processing Flows

### 11.1 OAuth Flow
1. User opens `/social/channels` page
2. Clicks "Connect Meta" -> `metaChannels.getAuthUrl()` -> redirect to Meta consent
3. User grants permissions -> Meta redirects to callback URL
4. `python-backend/api/meta_oauth.py` handles callback, exchanges code for token
5. Token encrypted via `encrypt()` and stored in `socialProviderConnections`
6. Available Pages fetched from Meta API, displayed for selection
7. User selects Pages -> `metaChannels.connectPage()` creates `socialPages` records
8. Webhook subscription created via Meta Subscriptions API
9. Connection health displayed in UI

### 11.2 Inbound Message Flow
1. Meta sends POST to `/api/webhooks/meta`
2. `meta_webhooks.py` validates `X-Hub-Signature-256`
3. Raw payload stored in `socialWebhookEventsRaw`
4. Celery task `social_webhook_task.process_webhook_event` fired
5. Event deduplicated via Redis key (TTL 24h)
6. `webhook_normalizer.py` creates/updates `socialConversations` + `socialMessages`
7. Inbox tRPC queries now show new message
8. If automation rule matches -> trigger workflow or AI draft
9. AI draft queued for approval or suggested to operator
10. Approved/manual reply sent via `meta_graph_client.py`

### 11.3 Post Publish Flow
1. User creates draft in `/social/publishing`
2. Optional: schedule for future (`scheduledAt`)
3. `socialPublishing.publishNow()` or scheduled Celery task fires
4. `publishing_service.py` calls Meta Graph API
5. Result stored on `socialPosts` with `providerPostId`
6. UI shows published state or error

---

## 12. Testing Strategy

### 12.1 Unit Tests
- OAuth state validation and token exchange
- Webhook signature validation (`X-Hub-Signature-256` HMAC)
- Event dedup logic (Redis key generation)
- Message normalization (raw payload -> conversation/message)
- Permission gating (tenant scope, page access)
- Workflow node executor outputs

### 12.2 Integration Tests
- OAuth connect flow (mocked Meta API)
- Webhook ingestion -> DB state transition
- Manual reply -> provider client invocation
- AI draft -> approval queue -> send flow
- Publish and comment reply flows
- Workflow execution with social nodes

### 12.3 Failure Tests
- Provider timeout handling
- Expired token detection and reauth prompt
- Duplicate webhook delivery (idempotency)
- Invalid webhook signature rejection
- Send failure after approval (retry behavior)
- Page disconnected during active conversation

---

## 13. Phased Delivery Plan

### Phase 1 — Foundation (PR 1-2)
- Schema migrations for all `social_*` tables
- Feature flag `META_CHANNELS_ENABLED`
- `metaChannels.ts` router + `meta_oauth.py`
- `meta_webhooks.py` with verification + raw event capture
- `SocialChannels.tsx` UI (connect/disconnect/health)
- Menu items and routes

**Done when:** Tenant can connect a Page, webhook verification works, events stored.

### Phase 2 — Inbox MVP (PR 3)
- Conversation/message normalization service
- `socialInbox.ts` router
- `SocialInbox.tsx` UI (conversation list + thread + reply composer)
- Manual reply path
- Audit logging

**Done when:** Inbound Messenger conversations appear, operator can reply.

### Phase 3 — AI Assist (PR 4)
- AI draft generation (using existing LLM gateway + RAG)
- Approval queue (`socialHumanApprovals` table)
- Draft mode settings (off/draft_only/approval_required)
- `SocialModeration.tsx` approval UI

**Done when:** Operator can request AI draft and send after review.

### Phase 4 — Publishing & Comments (PR 5)
- `socialPublishing.ts` router + `SocialPublishing.tsx`
- `socialModeration.ts` router + `SocialModeration.tsx`
- Post draft/schedule/publish flow
- Comment listing and reply
- Celery task for scheduled posts

**Done when:** Posts published and comments managed from SmartSpecPro.

### Phase 5 — Workflow & Agency Integration (PR 6)
- 6 workflow node types registered in `NodeRegistry`
- 6 node executors implemented
- `builtin-meta-channels` agency tool
- Internal tool endpoint `/api/internal/tools/meta-channels`
- Python tool bridge in `agency_tools.py`

**Done when:** Workflows and agencies can automate social operations.

### Phase 6 — Advanced Automation (PR 7)
- `socialAutomationRules` engine
- Keyword-based auto-routing
- Business hours detection
- Analytics dashboard widgets

---

## 14. Environment Variables

```env
# apps/web/.env
META_APP_ID=                        # Meta App ID
META_APP_SECRET_ENCRYPTED=          # Encrypted via crypto.ts
META_WEBHOOK_VERIFY_TOKEN=          # Random string for webhook verification
META_CHANNELS_ENABLED=false         # Feature flag

# python-backend/.env
META_APP_ID=                        # Same as above
META_APP_SECRET=                    # Plaintext (server-side only, never logged)
META_WEBHOOK_VERIFY_TOKEN=          # Same as above
META_GRAPH_API_VERSION=v25.0        # Meta Graph API version
```

---

## 15. Open Questions

1. Which exact Meta permissions are needed per phase? (`pages_messaging`, `pages_manage_posts`, `pages_read_engagement`, etc.)
2. Should comments be ingested via webhook, polling, or mixed strategy?
3. Will token refresh be handled by a periodic Celery beat task or on-demand?
4. How should conversation ownership map to existing SmartSpecPro roles?
5. Should inbound attachments be persisted to R2/S3 immediately or lazily?
6. Should the approval queue be shared with the existing `socialHumanApprovals` table or integrated with the workflow `approval_gate` node?

---

## 16. Acceptance Criteria

The feature is complete for MVP when:

1. Tenant admin can connect a Facebook Page from SmartSpecPro
2. Credentials remain server-side and encrypted (AES-256-GCM)
3. Webhook events are verified, stored, deduplicated, and normalized
4. Inbox UI shows live Messenger conversations for connected Pages
5. User can manually reply from SmartSpecPro
6. User can request an AI draft and edit before sending
7. User can publish a Page post
8. Audit logs exist for connect, reply, publish, and approval actions
9. All records are tenant-scoped and protected
10. Connection health and webhook status are visible in UI
11. Workflow nodes can be used to build social automation flows
12. Agency agents can use `builtin-meta-channels` tool for social operations
