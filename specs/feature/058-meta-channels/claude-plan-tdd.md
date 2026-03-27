# TDD Plan — Feature 058: Meta Channels

Testing infrastructure: **Vitest** (TypeScript/apps/web), **pytest** (Python/python-backend). Coverage target: 80% Python.

---

## 2. Database Schema

### Tests (Vitest — `apps/web/server/services/__tests__/socialSchema.test.ts`)
```
# Test: socialProviderConnections table accepts valid insert with all required fields
# Test: socialPages cascade-deletes when connection is deleted
# Test: socialConversations unique constraint on (pageId, customerExternalId) prevents duplicates
# Test: socialMessages unique constraint on providerMessageId prevents duplicates
# Test: socialWebhookEventsRaw unique constraint on (provider, deliveryId)
# Test: socialHumanApprovals defaults status to "pending"
```

---

## 3. Feature Flag & Menu

### Tests (Vitest — `apps/web/server/services/__tests__/metaFeatureFlag.test.ts`)
```
# Test: META_CHANNELS_ENABLED defaults to false
# Test: menu items with requiresFeature="META_CHANNELS_ENABLED" are hidden when flag is false
# Test: menu items are visible when flag is true
# Test: tRPC router middleware returns "feature disabled" when flag is false
```

---

## 4. Meta Graph API Client

### Tests (pytest — `python-backend/tests/unit/services/test_meta_graph_client.py`)
```
# Test: send_message calls correct endpoint with recipient and text
# Test: send_message returns message_id on success
# Test: create_post sends message and link to /{page_id}/feed
# Test: create_post with scheduled_at includes scheduled_publish_time param
# Test: get_comments paginates with after cursor
# Test: reply_to_comment posts to /{object_id}/comments
# Test: hide_comment sends is_hidden=true
# Test: delete_comment sends DELETE request
# Test: subscribe_webhooks posts correct fields to /{page_id}/subscribed_apps
# Test: client retries on HTTP 429 with exponential backoff
# Test: client retries on HTTP 502/503 up to 3 times
# Test: client detects error code 190 and raises TokenExpiredError
# Test: client detects error code 10 and raises PermissionDeniedError
# Test: client respects 30s timeout
```

---

## 5. OAuth & Webhook Endpoints

### OAuth Tests (pytest — `python-backend/tests/unit/api/test_meta_oauth.py`)
```
# Test: /authorize returns Facebook login URL with correct scopes and state
# Test: /authorize stores CSRF state in Redis with 10-minute TTL
# Test: /callback rejects mismatched state (CSRF protection)
# Test: /callback exchanges code for short-lived token
# Test: /callback exchanges short-lived for long-lived token
# Test: /callback stores encrypted token in socialProviderConnections
# Test: /callback returns available pages list
# Test: /status returns "not_connected" when no connection exists
# Test: /status returns connection info with masked token
```

### Webhook Tests (pytest — `python-backend/tests/unit/api/test_meta_webhooks.py`)
```
# Test: GET /webhooks/meta returns hub.challenge when verify_token matches
# Test: GET /webhooks/meta returns 403 when verify_token doesn't match
# Test: POST /webhooks/meta accepts valid X-Hub-Signature-256
# Test: POST /webhooks/meta rejects invalid signature with 403
# Test: POST /webhooks/meta rejects missing signature header
# Test: POST /webhooks/meta stores raw payload in socialWebhookEventsRaw
# Test: POST /webhooks/meta dispatches Celery task for processing
# Test: POST /webhooks/meta returns 200 even on processing error
# Test: signature validation uses constant-time comparison
```

### Webhook Normalizer Tests (pytest — `python-backend/tests/unit/services/test_webhook_normalizer.py`)
```
# Test: normalize_messaging_event creates new conversation for unknown sender
# Test: normalize_messaging_event reuses existing conversation for known sender
# Test: normalize_messaging_event creates socialMessages record with correct fields
# Test: normalize_messaging_event increments unreadCount atomically
# Test: normalize_messaging_event updates lastMessageAt and lastInboundAt
# Test: normalize_feed_event creates socialComments record
# Test: concurrent normalization of same sender doesn't create duplicate conversations
```

### Webhook Dedup Tests (pytest — `python-backend/tests/unit/services/test_webhook_dedup.py`)
```
# Test: is_duplicate returns False for new delivery_id
# Test: is_duplicate returns True for already-processed delivery_id
# Test: mark_processed sets Redis key with 24h TTL
# Test: delivery_id is derived from entry.id + messaging timestamp
```

---

## 6. Celery Tasks

### Tests (pytest — `python-backend/tests/unit/tasks/test_social_tasks.py`)
```
# Test: process_social_webhook_event loads raw event by ID
# Test: process_social_webhook_event skips duplicate events
# Test: process_social_webhook_event resolves page→tenant mapping
# Test: process_social_webhook_event calls normalizer
# Test: process_social_webhook_event publishes to Redis pub/sub for real-time triggers
# Test: process_social_webhook_event marks raw event as "processed"
# Test: process_social_webhook_event marks raw event as "failed" on error

# Test: publish_scheduled_post queries posts with scheduledAt <= now
# Test: publish_scheduled_post calls MetaGraphClient.create_post
# Test: publish_scheduled_post updates status to "published" on success
# Test: publish_scheduled_post updates status to "failed" on error

# Test: refresh_expiring_tokens queries tokens expiring within 7 days
# Test: refresh_expiring_tokens marks status "expired" on refresh failure

# Test: archive_resolved_conversations chunks messages into Q&A pairs
# Test: archive_resolved_conversations generates embeddings
# Test: archive_resolved_conversations sets conversation status to "archived"
```

---

## 7. tRPC Routers

### metaChannels Router Tests (Vitest — `apps/web/server/routers/__tests__/metaChannels.test.ts`)
```
# Test: getConnectionStatus returns connections for current tenant
# Test: getAuthUrl returns valid Facebook OAuth URL
# Test: completeOAuth rejects invalid state parameter
# Test: completeOAuth stores connection and returns page list
# Test: connectPage creates socialPages record with encrypted token
# Test: connectPage subscribes to webhook fields
# Test: disconnectPage clears token and unsubscribes webhooks
# Test: disconnectPage sets status to "disconnected"
# Test: getPageHealth returns webhook subscription status
# Test: updatePageSettings validates aiActionMode enum
# Test: all procedures reject when META_CHANNELS_ENABLED is false
# Test: all procedures reject unauthenticated requests
# Test: all procedures scope by tenantId
```

### socialInbox Router Tests (Vitest — `apps/web/server/routers/__tests__/socialInbox.test.ts`)
```
# Test: listConversations returns paginated results
# Test: listConversations filters by status
# Test: listConversations filters by pageId
# Test: listConversations scopes by tenantId
# Test: getConversation returns conversation with recent messages
# Test: getConversation rejects cross-tenant access
# Test: listMessages returns cursor-paginated messages
# Test: sendReply creates outbound message record
# Test: sendReply calls python-backend send endpoint
# Test: sendReply resets unreadCount
# Test: sendReply writes audit log
# Test: generateDraft returns AI-generated text with confidence
# Test: generateDraft uses RAG context when collection exists
# Test: generateDraft auto-sends when confidence > threshold and mode is auto_send
# Test: generateDraft does NOT auto-send for blocked categories
# Test: updateConversationStatus validates status enum
```

### socialPublishing Router Tests (Vitest — `apps/web/server/routers/__tests__/socialPublishing.test.ts`)
```
# Test: createDraft creates post with status "draft"
# Test: publishNow calls python-backend and updates status
# Test: publishNow stores providerPostId on success
# Test: schedulePost validates scheduledAt is 10min-30days in future
# Test: schedulePost sets status to "scheduled"
# Test: listPosts returns paginated results filtered by status
# Test: cancelScheduledPost sets status to "draft"
# Test: cancelScheduledPost rejects non-scheduled posts
```

### socialModeration Router Tests (Vitest — `apps/web/server/routers/__tests__/socialModeration.test.ts`)
```
# Test: listComments returns paginated comments
# Test: replyToComment calls python-backend and creates action record
# Test: hideComment sends hide request and updates status
# Test: deleteComment sends delete request and updates status
# Test: all actions create socialCommentActions audit record
# Test: all actions reject cross-tenant access
```

---

## 9. Workflow Nodes

### Tests (pytest — `python-backend/tests/unit/orchestrator/test_social_executors.py`)
```
# Test: MetaMessageTriggerExecutor outputs conversationId, messageBody, senderName
# Test: MetaMessageTriggerExecutor filters by keywords when configured
# Test: ClassifyIntentExecutor returns intent, confidence, category, requiresHuman
# Test: ClassifyIntentExecutor marks high-risk intents as requiresHuman=True
# Test: DraftReplyExecutor generates reply text with confidence score
# Test: DraftReplyExecutor queries RAG collection when ragCollectionId provided
# Test: DraftReplyExecutor respects toneGuide in system prompt
# Test: SendReplyExecutor calls MetaGraphClient.send_message
# Test: SendReplyExecutor returns providerMessageId on success
# Test: SendReplyExecutor returns error output on failure
# Test: PublishPostExecutor calls MetaGraphClient.create_post
# Test: PublishPostExecutor handles scheduled posts
# Test: SocialApprovalGateExecutor auto-approves when confidence > threshold
# Test: SocialApprovalGateExecutor pauses when confidence < threshold
# Test: SocialApprovalGateExecutor returns edited content after human review
```

---

## 10. Agency Tool

### Tests (Vitest — `apps/web/server/routers/__tests__/socialAgencyTool.test.ts`)
```
# Test: /api/internal/tools/meta-channels requires X-Internal-Token
# Test: /api/internal/tools/meta-channels rejects actions not in allowedActions
# Test: read_inbox returns recent conversations for configured page
# Test: send_reply sends message via python-backend
# Test: send_reply respects requireApproval config
# Test: publish_post creates and publishes post
# Test: read_comments returns recent comments
# Test: reply_comment replies to specified comment
```

### Tests (pytest — `python-backend/tests/unit/services/test_agency_tools_meta.py`)
```
# Test: builtin-meta-channels is in _BUILTIN_ENDPOINTS
# Test: builtin-meta-channels risk level is "medium"
# Test: tool bridge correctly routes to /api/internal/tools/meta-channels
```

---

## 11. RAG Archival

### Tests (pytest — `python-backend/tests/unit/tasks/test_social_archive.py`)
```
# Test: archive chunks conversation into Q&A turn pairs
# Test: archive concatenates multi-message customer turns
# Test: archive includes metadata (pageId, conversationId, timestamp)
# Test: archive truncates chunks exceeding 1000 tokens
# Test: archive stores embeddings in social-conversations-{tenantId} collection
# Test: archive sets conversation status to "archived"
# Test: archive skips already-archived conversations
```

---

## 12. Security

### Tests (pytest — `python-backend/tests/unit/services/test_meta_security.py`)
```
# Test: encrypted tokens are decryptable with correct key
# Test: encrypted tokens are not decryptable with wrong key
# Test: webhook signature validation rejects tampered payload
# Test: webhook signature validation uses constant-time comparison
# Test: rate limiter blocks >100 events/second per page
# Test: internal endpoints reject requests without X-Internal-Token
# Test: all queries include tenantId filter (verify with SQL inspection)
```
