<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-database-schema
section-02-api-key-service
section-03-auth-extension
section-04-rate-limiter-audit
section-05-skill-api
section-06-agency-api
section-07-presentation-api
section-08-video-media-api
section-09-mcp-server
section-10-job-automation
section-11-webhooks-events
section-12-admin-ui
section-13-sdk-documentation
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-database-schema | - | all | Yes (must be first) |
| section-02-api-key-service | 01 | 03 | No |
| section-03-auth-extension | 02 | 04, 05, 06, 07, 08, 09, 10, 11 | No |
| section-04-rate-limiter-audit | 03 | 05, 06, 07, 08 | Yes |
| section-05-skill-api | 03, 04 | 10 | Yes |
| section-06-agency-api | 03, 04 | 10 | Yes |
| section-07-presentation-api | 03, 04 | 10 | Yes |
| section-08-video-media-api | 03, 04 | 10 | Yes |
| section-09-mcp-server | 03 | 13 | Yes |
| section-10-job-automation | 05, 06, 07, 08 | 11 | No |
| section-11-webhooks-events | 10 | 12 | No |
| section-12-admin-ui | 02, 11 | 13 | No |
| section-13-sdk-documentation | 05-12 | - | No (final) |

## Execution Order

1. **Batch 1:** section-01-database-schema (no dependencies — foundation)
2. **Batch 2:** section-02-api-key-service (after 01)
3. **Batch 3:** section-03-auth-extension (after 02)
4. **Batch 4:** section-04-rate-limiter-audit (after 03)
5. **Batch 5:** section-05-skill-api, section-06-agency-api, section-07-presentation-api, section-08-video-media-api (parallel — all depend on 03+04)
6. **Batch 6:** section-09-mcp-server, section-10-job-automation (parallel — MCP depends on 03, jobs depend on 05-08)
7. **Batch 7:** section-11-webhooks-events (after 10)
8. **Batch 8:** section-12-admin-ui (after 02+11)
9. **Batch 9:** section-13-sdk-documentation (final — needs all endpoints defined)

## Section Summaries

### section-01-database-schema
Drizzle schema changes: 5 new tables (api_keys, api_audit_events, api_webhook_endpoints, api_webhook_deliveries, automation_jobs), columns added to conversations and agencyConversations, feature flag, CreditSourceType extension. Migration execution.

### section-02-api-key-service
`apiKeyService.ts`: key generation (sk-ssp_ format), HMAC-SHA256 hashing with server pepper, key validation, CRUD operations, startup assertion for API_KEY_HMAC_SECRET. Shared types in publicApiTypes.ts.

### section-03-auth-extension
Extend `authorizeRequest()` in authz.ts to detect sk-ssp_ prefix and route to API key validation. AuthContext refactor across service functions (skillExecutor, agencyBridge, etc.). Feature flag guard middleware. requireScopes middleware.

### section-04-rate-limiter-audit
Redis sliding window rate limiter (per-key + per-tenant). Daily credit limit enforcement. Audit logging middleware for api_audit_events. Idempotency middleware. CORS configuration for /v1/ endpoints. Common response headers (X-Request-Id, X-Credits-Used, X-Credits-Remaining). Common error format.

### section-05-skill-api
REST endpoints: GET /v1/skills, GET /v1/skills/:id, POST /v1/skills/:id/execute, POST /v1/skills/detect. Wraps skillExecutor and skillRegistry. SSE streaming support. Credit deduction with api_skill source.

### section-06-agency-api
REST endpoints: GET /v1/agencies, POST /v1/agencies/:id/invoke, GET /v1/agencies/:id/runs/:runId, GET /v1/agencies/:id/runs/:runId/stream. Conversation management (getOrCreateAgencyApiConversation using agencyConversations table). Credit budget with max_credits. SSE streaming via agencyStreamProxy.

### section-07-presentation-api
REST endpoints: POST /v1/presentations/generate, GET /v1/presentations/tasks/:taskId/progress, GET /v1/presentations/decks/:deckId, POST /v1/presentations/decks/:deckId/export, GET /v1/presentations/decks/:deckId/export/download. Topic validation (3-1000 chars). IDOR protection. Authenticated download. Route ordering (tasks before decks).

### section-08-video-media-api
Video project endpoints: POST /v1/video-projects, GET /v1/video-projects/:id, GET /v1/video-projects/:id/export/download. Media generation endpoints: POST /v1/media/images/generate, POST /v1/media/videos/generate, POST /v1/media/audio/generate, GET /v1/media/:taskId/status. Duration-based credits. SSRF validation for reference_image_urls (sanitizeUri + assertPublicIp per URL, max 5).

### section-09-mcp-server
MCP Streamable HTTP server at POST /v1/mcp. Protocol v2025-03-26, JSON-RPC 2.0. Redis-backed session state machine. 25+ tool registry across all namespaces. Tool execution with 60s timeout and 100KB result limit. GET /.well-known/mcp.json discovery manifest.

### section-10-job-automation
jobAutomationService.ts: job lifecycle (validate, reserve credits, enqueue, execute, refund). BullMQ automation-jobs queue. VALID_JOB_TYPES enum. Credit overflow guard (MAX_SINGLE_JOB_CREDITS=10,000). Atomic refunds. Pipeline support with template variables, depth limits, cycle detection. REST endpoints: POST/GET/DELETE /v1/jobs.

### section-11-webhooks-events
Webhook management endpoints: POST/GET/DELETE /v1/webhooks. SSRF validation on URLs. Webhook delivery with configurable retry (exponential/none). HMAC-SHA256 signatures. BullMQ delayed jobs for retry. SSE event stream: GET /v1/events with Redis Pub/Sub. At-most-once delivery semantics.

### section-12-admin-ui
AdminApiKeys.tsx page: key list, create dialog with scope checkboxes, one-time key display, revoke. Usage dashboard with per-key analytics. Webhook management tab. tRPC apiKeys router with RBAC. Admin sidebar navigation.

### section-13-sdk-documentation
OpenAPI 3.0 spec at /v1/openapi.json. Swagger UI at /v1/docs. MCP manifest verification. API documentation covering all endpoints. Python and TypeScript SDK stubs (deferred to follow-up for full implementation).
