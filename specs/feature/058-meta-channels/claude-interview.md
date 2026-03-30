# Interview Transcript — Feature 058: Meta Channels

## Auto-Decisions (Technical — based on codebase patterns)

- **HTTP client**: httpx.AsyncClient for all Meta API calls (matches async-first Python backend pattern)
- **Token encryption**: Dedicated `encryptedAccessToken` columns via `crypto.ts` AES-256-GCM (not system_settings, since per-page per-tenant)
- **Webhook dedup**: Redis keys `social:dedup:{provider}:{deliveryId}` with 24h TTL (matches Telegram webhook pattern)
- **Task queue**: New Celery queue `social` for async webhook processing and scheduled publishing
- **Feature flag**: `META_CHANNELS_ENABLED` in `TenantFeatureFlags` interface, default `false` (opt-in)
- **tRPC routers**: `protectedProcedure` with Zod input validation (matches all existing routers)
- **Workflow nodes**: New `"social"` category in `NodeRegistry` with indigo color theme
- **DB schema**: Drizzle ORM `pgTable` definitions following existing camelCase column conventions
- **Tests**: Vitest for tRPC routers/services, pytest for Python backend (80% coverage target)
- **Webhook endpoint**: Python FastAPI, always return 200 OK, process async via Celery (matches Telegram pattern)

---

## Q1: Who is the primary user of Meta Channels?

**Answer:** All users (self-service)

Any authenticated user can connect their own pages and manage everything independently. This means:
- No admin-only gating for connection or operations
- Each user manages their own OAuth connections and page selections
- Tenant scoping still applies (all data tenant-isolated)
- Users see only pages they personally connected

## Q2: Expected scale for connected Pages and daily message volume?

**Answer:** Large (20+ pages, 1000+ msgs/day)

Enterprise-scale design required:
- Partitioned webhook processing (by page ID)
- Aggressive caching for conversation lists and page metadata
- Batch operations for comment fetching and message normalization
- Connection pooling for Meta API calls (httpx connection pool)
- Consider Redis-based inbox counters for fast unread counts
- Pagination with cursor-based queries on all list endpoints

## Q3: AI auto-send in MVP?

**Answer:** Opt-in auto-send with threshold

Allow tenants to enable auto-send for high-confidence replies (>0.95) on specific pages:
- Default mode: `draft_only` (safest)
- Per-page configurable: `off` / `draft_only` / `approval_required` / `auto_send`
- Auto-send requires confidence > configurable threshold (default 0.95)
- Blocked categories still force escalation regardless of confidence (billing, legal, harassment)
- Per-tenant kill switch always available

## Q4: Should social conversations integrate with RAG/library system?

**Answer:** Yes, archive to RAG

Resolved conversations get vectorized and indexed in the document library:
- When conversation status changes to `resolved`, queue for vectorization
- Chunk conversation into question-answer pairs
- Store in existing pgvector infrastructure
- Available for retrieval by agents (via `builtin-rag-knowledge`) and workflow RAG nodes
- Collection per tenant: `social-conversations-{tenantId}`
- Useful for building FAQ knowledge bases from real customer interactions

## Q5: Workflow trigger mode for incoming messages?

**Answer:** Both (configurable per workflow)

Support both real-time and batch triggering:
- **Real-time**: Webhook event publishes to Redis pub/sub channel `social:trigger:{pageId}`, workflow runtime subscribes and fires immediately
- **Batch**: Celery beat task polls `social_messages` where `processingStatus = 'pending_workflow'` every 30-60s
- Configuration via `incoming_meta_message` node's `triggerMode` input: `"realtime"` or `"batch"`
- Real-time needs rate limiting per workflow (max N triggers per minute) to prevent webhook floods
- Batch mode is default for safety
