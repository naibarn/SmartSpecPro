<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-db-schema
section-02-feature-flag-menu
section-03-meta-graph-client
section-04-oauth-connection
section-05-webhook-ingestion
section-06-inbox-backend
section-07-inbox-frontend
section-08-ai-draft
section-09-publishing
section-10-comments-moderation
section-11-workflow-nodes
section-12-agency-tool
section-13-rag-archival
section-14-automation-rules
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-db-schema | - | all | Yes |
| section-02-feature-flag-menu | - | 04, 06, 07, 09, 10 | Yes |
| section-03-meta-graph-client | - | 04, 05, 06, 09, 10, 11, 12 | Yes |
| section-04-oauth-connection | 01, 02, 03 | 05, 06, 07 | No |
| section-05-webhook-ingestion | 01, 03, 04 | 06, 07, 11 | No |
| section-06-inbox-backend | 01, 03, 04, 05 | 07, 08 | No |
| section-07-inbox-frontend | 02, 06 | 08 | No |
| section-08-ai-draft | 06, 07 | 14 | No |
| section-09-publishing | 01, 02, 03 | - | Yes (with 10) |
| section-10-comments-moderation | 01, 02, 03 | - | Yes (with 09) |
| section-11-workflow-nodes | 01, 03, 05, 06 | - | Yes (with 12) |
| section-12-agency-tool | 01, 03, 06 | - | Yes (with 11) |
| section-13-rag-archival | 01, 06 | 14 | Yes (with 11, 12) |
| section-14-automation-rules | 01, 06, 08, 13 | - | No |

## Execution Order

1. **Batch 1** (no dependencies — parallel): section-01-db-schema, section-02-feature-flag-menu, section-03-meta-graph-client
2. **Batch 2** (after batch 1): section-04-oauth-connection
3. **Batch 3** (after 04): section-05-webhook-ingestion
4. **Batch 4** (after 05): section-06-inbox-backend
5. **Batch 5** (after 06 — parallel): section-07-inbox-frontend, section-09-publishing, section-10-comments-moderation
6. **Batch 6** (after 07): section-08-ai-draft
7. **Batch 7** (after 06 — parallel): section-11-workflow-nodes, section-12-agency-tool, section-13-rag-archival
8. **Batch 8** (after 08, 13): section-14-automation-rules

## Section Summaries

### section-01-db-schema
All `social_*` table definitions in `drizzle/schema.ts`, migration generation, and schema verification tests.

### section-02-feature-flag-menu
`META_CHANNELS_ENABLED` feature flag registration, 4 menu items in `menu.ts`, 4 lazy routes in `App.tsx`.

### section-03-meta-graph-client
`MetaGraphClient` async class in python-backend: send_message, create_post, get_comments, reply/hide/delete comments, subscribe_webhooks. Includes retry logic, rate limit handling, and token expiration detection.

### section-04-oauth-connection
Python OAuth endpoints (authorize, callback, status), frontend AuthCallback extension for Meta provider, `SocialChannels.tsx` page with connect/disconnect/health UI, `metaChannels.ts` tRPC router.

### section-05-webhook-ingestion
Python webhook endpoint (GET verification + POST ingestion), signature validator, dedup service, normalizer service, `socialWebhookEventsRaw` processing, Celery task for async processing.

### section-06-inbox-backend
`socialInbox.ts` tRPC router with conversation list, message list, sendReply mutation, tenant-scoped queries with cursor pagination, outbound message flow via python-backend.

### section-07-inbox-frontend
`SocialInbox.tsx` two-panel layout: conversation list (left) + message thread (right), reply composer, real-time polling, filter tabs, unread badges.

### section-08-ai-draft
`generateDraft` tRPC mutation: load conversation context, query RAG collection, call LLM gateway, return draft + confidence. Auto-send logic for high-confidence replies in auto_send mode.

### section-09-publishing
`socialPublishing.ts` tRPC router, `SocialPublishing.tsx` page with draft composer, schedule controls, post history. Celery task for scheduled post publishing.

### section-10-comments-moderation
`socialModeration.ts` tRPC router, `SocialModeration.tsx` page with comment list, reply modal, hide/delete actions. `socialCommentActions` audit trail.

### section-11-workflow-nodes
6 workflow node types registered in `NodeRegistry` under `"social"` category. 6 executor classes in `node_executors/social/`. Dynamic options endpoint for connected pages. Real-time and batch trigger wiring.

### section-12-agency-tool
`builtin-meta-channels` tool definition in `listTools`, `_BUILTIN_ENDPOINTS` registration in `agency_tools.py`, `/api/internal/tools/meta-channels` endpoint with action routing and `allowedActions` enforcement.

### section-13-rag-archival
Celery task to archive resolved conversations: chunk into Q&A pairs, generate embeddings, store in pgvector collection `social-conversations-{tenantId}`. Integration with existing embedding pipeline.

### section-14-automation-rules
`socialAutomationRules` CRUD, `socialHumanApprovals` queue, approval/rejection flow, blocked category enforcement, kill switch controls.
