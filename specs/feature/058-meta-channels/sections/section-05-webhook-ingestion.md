# Section 05 — Webhook Ingestion

## Dependencies
- section-01-db-schema: `socialWebhookEventsRaw`, `socialPages`, `socialConversations`, `socialMessages`, `socialComments`
- section-03-meta-graph-client: `MetaGraphClient`
- section-04-oauth-connection: Connected pages with webhook subscriptions

## Overview
Full webhook ingestion pipeline: FastAPI endpoint (signature validation, raw storage, single Celery dispatch per delivery), async processor (dedup, normalize, pub/sub trigger), and supporting services.

## Files to Create or Modify
| File | Action |
|------|--------|
| `python-backend/app/api/meta_webhooks.py` | Create — GET verification + POST ingestion |
| `python-backend/app/services/social/webhook_validator.py` | Create — HMAC-SHA256 validation |
| `python-backend/app/services/social/webhook_dedup.py` | Create — Redis dedup |
| `python-backend/app/services/social/webhook_normalizer.py` | Create — Raw → DB normalization |
| `python-backend/app/tasks/social_webhook_task.py` | Create — Celery async processor |
| `python-backend/app/core/celery_app.py` | Modify — Add `social` + `social_dlq` queues, beat schedules |
| `python-backend/app/main.py` | Modify — `app.include_router(meta_webhooks_router)` |
| `python-backend/app/tasks/__init__.py` | Modify — Import task |
| Tests: `test_meta_webhooks.py`, `test_webhook_normalizer.py`, `test_webhook_dedup.py`, `test_social_webhook_task.py` | Create |

## Tests First
```
# Webhook Endpoint:
# Test: GET returns hub.challenge when verify_token matches (from system_settings, NOT env var)
# Test: GET returns 403 when verify_token doesn't match
# Test: POST accepts valid X-Hub-Signature-256 and stores raw payload
# Test: POST rejects invalid/missing signature with 403
# Test: POST dispatches ONE Celery task per delivery (not per entry)
# Test: POST returns 200 even on Celery dispatch error
# Test: POST strips X-Hub-Signature-256 from stored headers (replay prevention)
# Test: signature validation uses hmac.compare_digest (constant-time)

# Dedup:
# Test: is_duplicate returns False for new delivery_id
# Test: is_duplicate returns True for already-processed
# Test: mark_processed sets Redis key with 24h TTL
# Test: delivery_id derived from entry.id + "_" + messaging[].message.mid (NOT timestamp)
# Test: fallback when mid absent: entry.id + "_" + timestamp + "_" + index

# Normalizer:
# Test: creates new conversation for unknown sender (ON CONFLICT upsert)
# Test: reuses existing conversation for known sender
# Test: creates socialMessages with correct fields
# Test: increments unreadCount atomically (SQL + Redis counter)
# Test: handles UniqueViolation on providerMessageId as idempotent success
# Test: normalizes feed events into socialComments
# Test: concurrent normalization doesn't create duplicate conversations

# Celery Task:
# Test: loads raw event, checks dedup, resolves page→tenant
# Test: skips events for unknown/disconnected pages (marks "skipped", audit event)
# Test: publishes to Redis Stream social:stream:{pageId} (not pub/sub)
# Test: marks raw event "processed" on success, "failed" on error
# Test: routes to social_dlq after 3 retries
```

## CRITICAL Fixes (from review)

### Dedup Key (DC-01)
Use `entry.id + "_" + messaging[i].message.mid` (Meta's per-message unique ID). Fallback: `entry.id + "_" + str(timestamp) + "_" + str(i)` if `mid` absent. Previous `entry.id + timestamp` caused collisions on rapid messages.

### Webhook Fanout (S-01)
Dispatch ONE Celery task per delivery payload, not per entry. The task unpacks entries internally. Keeps handler O(1).

### Header Sanitization (HIGH-02)
Strip `X-Hub-Signature-256` before persisting to `headers`. Store only allowlist: `content-type`, `x-hub-delivery`.

### Tenant Isolation (HIGH-04)
If no `socialPages` row with `status="active"` matches the incoming `providerPageId`, mark event `"skipped"` and emit `social_webhook_unknown_page` audit event. Validate `recipient.id` against resolved page's `providerPageId`.

### Message Idempotency (DC-02)
Handle `UniqueViolation` on `socialMessages.providerMessageId` insertion as success (message already stored). Log `social_message_already_stored` and continue processing.

### Dead-Letter Queue (R-02)
After 3 Celery retries, route to `social_dlq` queue instead of dropping. Admin can requeue via tRPC mutation.

## Implementation Guidance

### Webhook Endpoint (`meta_webhooks.py`)
- `GET /api/webhooks/meta` — Verify `hub.verify_token` from `system_settings` (encrypted), return `hub.challenge`
- `POST /api/webhooks/meta` — Read raw bytes, validate HMAC, store single raw event per delivery, dispatch ONE Celery task, return 200

### Signature Validator
`validate_meta_webhook_signature(body: bytes, signature_header: str, app_secret: str) -> bool`
- `app_secret` read from `system_settings` via `smartspecweb_crypto`
- HMAC-SHA256 with `hmac.compare_digest()` (constant-time)

### Webhook Normalizer
- `normalize_messaging_event`: `INSERT ... ON CONFLICT (pageId, customerExternalId) DO UPDATE` for conversations. Atomic `unreadCount + 1` via SQL AND Redis `INCR social:unread:{tenantId}:{conversationId}`.
- `normalize_feed_event`: Create `socialComments` records.

### Celery Task
- Queue: `social` (separate worker: `--concurrency=4 --prefetch-multiplier=1 -Q social`)
- DLQ: `social_dlq` after max retries
- Publishes to **Redis Stream** `social:stream:{pageId}` (durable, consumer groups) for workflow triggers
