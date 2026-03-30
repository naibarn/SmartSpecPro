# SSP Architect Agent — Persistent Memory

## Project Schema Conventions
- `tenants.id` is `VARCHAR(36)` (not UUID type) — all FKs referencing it MUST be `VARCHAR(36)`
- `agencies.id` is `VARCHAR(36)` — same convention
- `workflows.id` is `serial` (INTEGER) — FKs referencing it MUST be `INTEGER`, not UUID
- `conversations.id` is `serial` (INTEGER)
- `messages.id` is `serial` (INTEGER)
- `users.id` is `serial` (INTEGER)
- All `traceId` columns are `VARCHAR(32)` — match this exactly when adding new traceId columns
- `conversations.userId` is NOT NULL — anonymous users need a placeholder userId, not NULL

## Credit System
- `creditSourceTypeEnum` is a real PostgreSQL enum at schema.ts line 99 — adding new values requires `ALTER TYPE ... ADD VALUE` migration (cannot be in a transaction block)
- `refundCredits()` exists in `creditService.ts` line 332 — use for post-execution adjustments
- Pre-reserve + refund pattern already established in `sandbox/costEstimator.ts` — reuse for new tools
- Python tools MUST NOT call credit endpoints directly; Node.js wrapper handles all credit accounting
- `providerUsageLog.providerId` is NOT NULL — STT/TTS providers need `llmProviders` rows or a different audit table

## buildChatContext() Callers (ALL must be updated for signature changes)
- `apps/web/server/routers/chat.ts` line 828
- `apps/web/server/services/channelGateway.ts` line 381
- `apps/web/server/routers/memory.ts` line 179
- Also: a second implementation exists in `memoryService.ts` line 668

## Agency Builtin Tools
- Defined in `apps/web/server/routers/agency.ts` BUILTIN_TOOLS array (no BUILTIN_TOOLS const — inline array)
- Python registration: `_BUILTIN_ENDPOINTS` dict in `python-backend/app/services/agency_tools.py` line 58
- Risk levels: `_BUILTIN_RISK_LEVELS` dict in same file line 69
- Current builtins: builtin-web-search, builtin-code-interpreter, builtin-file-reader, builtin-file-writer, builtin-rag-knowledge, builtin-skill-executor, builtin-cmd-executor, builtin-http-request (and more)

## Workflow Node Registry
- `python-backend/app/orchestrator/node_registry.py` — NodeRegistry singleton
- `get_executor()` function at line 3875 maps node type strings to executor classes
- Existing integration executors: http, email, websocket, graphql, mcp
- `webhook_trigger` is an EXISTING node type (line 1364) — F06 inbound webhooks are a DIFFERENT system

## Key File Locations
- LLM Gateway: `python-backend/app/llm_proxy/unified_client.py`
- Credit service: `apps/web/server/services/creditService.ts`
- Channel gateway: `apps/web/server/services/channelGateway.ts` (exports: emitEgress, handleNonTextMessage, processMessageServerSide, hasActiveChannels)
- Telegram connections: `apps/web/drizzle/schema.ts` — `telegramConnections` table (~line 4238)
- Sandbox cost pattern: `apps/web/server/services/sandbox/costEstimator.ts`

## Schema Safety Rules (from repeated review experience)
- Optional FK columns (e.g., persona references) MUST specify `ON DELETE SET NULL` explicitly — PostgreSQL defaults to RESTRICT
- `tenants.ownerId` IS nullable (no `.notNull()`) — any code path charging credits to tenantOwnerId must handle NULL
- `conversations` has NO `tenantId` column — tenant isolation through conversations must join via `users.currentTenantId`
- `tenantPages.tenantId` is `integer` despite `tenants.id` being `varchar(36)` — do NOT use tenantPages as an FK reference pattern
- Audit tables (`providerUsageLog`) with NOT NULL FKs (e.g., `providerId`) require pre-existing rows for new provider types

## 053-Agency Agentic Intelligence Spec Review (2026-03-22)
- See `project_053_review.md` for full findings
- Critical: `agency_agent_memories.tenant_id` must be VARCHAR(36), not INTEGER
- Critical: ReActExecutor must route LLM calls through adapter/gateway (credit+audit)
- High: Double-loop risk — agency-swarm already has its own internal tool loop
- High: Crash recovery assumption that Redis survives process restarts is unsafe

## 058-Meta Channels Architecture Review (2026-03-23)
- See `project_058_arch_review.md` for full findings
- Critical: `/api/internal/embeddings/batch` does not exist — section-13 RAG archival calls a phantom endpoint
- Critical: Real-time pub/sub trigger subscriber has no valid runtime host in Celery worker context
- Critical: `SocialApprovalGateExecutor` duplicates `ApprovalExecutor` (LangGraph interrupt) — creates two approval systems
- High: `unreadCount` increment has no decrement/reset path in the plan
- High: Dedup key synthesis is not unique for batched Meta payloads

## 061-Upload-Post Gateway Architecture Review (2026-03-24) — SECOND ROUND
- See `project_061_upload_post_arch_review.md` for full findings
- First-round criticals resolved: standalone upload_post_jobs table, JWT/nonce designed, status sync loop added
- Remaining Critical C-01: `SocialProviderAdapter.execute()` interface incompatible with Upload-Post (no userId, no API key in SocialBackgroundActionInput) — Section 4.4 registration call will not compile
- Remaining Critical C-02: `uploadPost.publish` tRPC mutation holds decrypted API key in memory for 30+ seconds for video uploads — delegation token pattern deferred to "future scope" but must be resolved for Phase 2
- High H-01: Unified timeline pagination has no cursor contract — two independent cursors cannot maintain cross-table sort order
- High H-03: Feature flag enforcement pattern unspecified — 17 procedures, no middleware wrapper shown
- High H-04: Workflow/agency user identity undefined — no userId in orchestrator context
- Medium M-02: postMessage uses wildcard targetOrigin `'*'` — must use `'https://smartaihub.app'`
- Medium M-03: Nonce in redirect URL leaks through Nginx/Node.js access logs

## 02-ClawFeature Spec Review (2026-03-01)
- v1.0 review: 43 findings (11 CRITICAL, 14 HIGH, 12 MEDIUM, 6 LOW) — captured in spec Sections 15, 16, 17
- v1.2.0 third-pass review: 29 NEW findings (5 CRITICAL, 9 HIGH, 10 MEDIUM, 5 LOW) — NOT yet in spec
- Key recurring gap: specs defer tRPC router procedure definitions to "handle during build" — must be caught early
- Top third-pass criticals: `conversations` has no `tenantId` (C-05), `memoryService.ts:buildChatContext()` second impl missed (C-02), `providerUsageLog.providerId` NOT NULL blocks STT/TTS logging (C-03)
