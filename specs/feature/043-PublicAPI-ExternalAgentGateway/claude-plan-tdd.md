# TDD Plan — 043-PublicAPI-ExternalAgentGateway

Testing framework: **Vitest** (TypeScript/Node.js), **pytest** (Python)

Existing conventions:
- TypeScript tests: `*.test.ts` / `*.test.tsx` co-located or in `__tests__/`
- Python tests: `tests/` directory, pytest markers (unit, integration, e2e, auth, credits, llm)
- Vitest config in `apps/web/vitest.config.ts`
- 80% coverage enforced for Python

---

## Domain 1: Database Schema & Foundation

### 3.1 Schema Tests
```
# Test: api_keys table migration creates correct columns and indexes
# Test: api_keys.keyHash unique constraint prevents duplicate inserts
# Test: api_keys.tenantId is varchar(36), not integer
# Test: api_audit_events table accepts inserts with all required fields
# Test: automation_jobs.idempotencyKey unique constraint works
# Test: api_webhook_endpoints.apiKeyId ON DELETE SET NULL works correctly
# Test: conversations gains source, apiKeyId, expiresAt columns
# Test: agencyConversations gains source, apiKeyId, expiresAt columns
```

### 3.3 Feature Flag
```
# Test: publicApi flag defaults to false for new tenants
# Test: publicApi flag is queryable via existing feature flag system
```

### 3.4 CreditSourceType
```
# Test: api_* source types are accepted by creditService.deductCredits()
# Test: TypeScript union includes all 8 new api_* source types
```

---

## Domain 2: Authentication & Authorization

### 4.1 API Key Service
```
# Test: generateKey produces sk-ssp_{tenantShortId}_{random} format
# Test: generateKey returns raw key that matches HMAC hash stored in DB
# Test: validateKey returns AuthContext for valid key
# Test: validateKey rejects expired key
# Test: validateKey rejects inactive key
# Test: validateKey rejects key when tenant publicApi flag is false
# Test: validateKey is timing-safe (constant-time comparison)
# Test: createKey validates scopes against ALLOWED_API_SCOPES
# Test: createKey rejects unknown scopes
# Test: revokeKey sets isActive=false and key becomes invalid
# Test: lastUsedAt is updated after successful validation (async)
# Test: startup assertion throws if API_KEY_HMAC_SECRET is missing
# Test: startup assertion throws if API_KEY_HMAC_SECRET < 32 bytes
```

### 4.2 Auth Extension
```
# Test: authorizeRequest detects sk-ssp_ prefix and routes to API key validation
# Test: authorizeRequest falls through to JWT for non-sk-ssp_ tokens
# Test: authorizeRequest returns mode='api_key' with correct AuthContext fields
# Test: authorizeRequest returns tenantId as string (varchar(36))
# Test: existing session auth still works after API key auth is added
# Test: existing bearer (static token) auth still works
```

### 4.3 AuthContext Refactor
```
# Test: skillExecutor.executeSkill accepts AuthContext with mode='api_key'
# Test: skillExecutor.executeSkill accepts AuthContext with mode='session'
# Test: agencyBridge.executeRun accepts AuthContext
# Test: credit deduction uses correct source type based on AuthContext.mode
```

### 4.4 Scope Enforcement
```
# Test: requireScopes middleware returns 403 for missing scope
# Test: requireScopes middleware passes for matching scope
# Test: requireScopes grants all scopes for session auth (web UI)
# Test: requireScopes checks multiple scopes (AND logic)
```

### 4.5 Rate Limiter
```
# Test: rate limiter allows requests under per-key limit
# Test: rate limiter returns 429 when per-key limit exceeded
# Test: rate limiter returns 429 when per-tenant limit exceeded
# Test: rate limiter sets correct X-RateLimit-* headers
# Test: daily credit limit returns 429 with Retry-After header
# Test: daily credit limit resets at midnight UTC
# Test: null creditLimit means unlimited
```

### 4.6 Audit Logging
```
# Test: API key request creates api_audit_events record
# Test: audit event captures method, path, statusCode, creditsUsed, latencyMs
# Test: audit event sanitizes Bearer tokens from requestMeta
# Test: audit logging is non-blocking (response returns before insert completes)
```

### 4.7 Idempotency
```
# Test: POST with Idempotency-Key returns cached response on second call
# Test: cached response preserves original status code (including 4xx/5xx)
# Test: different Idempotency-Key values are independent
# Test: idempotency keys are tenant-scoped (same key, different tenant = different cache)
# Test: cache expires after 24h
# Test: response > 1MB is not cached
```

---

## Domain 3: Skill Execution API

### 5.2 Endpoints
```
# Test: GET /v1/skills returns skills list with pagination
# Test: GET /v1/skills requires skills:list scope
# Test: GET /v1/skills/:id returns skill detail with inputSchema
# Test: POST /v1/skills/:id/execute validates inputs against JSON Schema
# Test: POST /v1/skills/:id/execute deducts credits with source api_skill
# Test: POST /v1/skills/:id/execute requires skills:execute scope
# Test: POST /v1/skills/:id/execute with stream=true returns SSE
# Test: POST /v1/skills/:id/execute returns X-Credits-Used header
# Test: POST /v1/skills/detect returns matched skill with confidence
# Test: 404 for non-existent skill ID
# Test: skills list respects tenant isolation
```

---

## Domain 4: Agency Invocation API

### 6.2 Endpoints
```
# Test: GET /v1/agencies returns agencies for tenant
# Test: GET /v1/agencies requires agencies:list scope
# Test: POST /v1/agencies/:id/invoke creates conversation and invokes agency
# Test: POST /v1/agencies/:id/invoke with conversation_id reuses existing conversation
# Test: POST /v1/agencies/:id/invoke requires agencies:invoke scope
# Test: POST /v1/agencies/:id/invoke rejects agency from different tenant
# Test: GET /v1/agencies/:id/runs/:runId returns run status
# Test: GET /v1/agencies/:id/runs/:runId/stream returns SSE events
# Test: max_credits budget cap is enforced
# Test: credits are refunded when invocation uses less than max_credits
```

### 6.3 Conversation Management
```
# Test: getOrCreateAgencyApiConversation uses agencyConversations table
# Test: getOrCreateAgencyApiConversation sets source='api' and apiKeyId
# Test: getOrCreateAgencyApiConversation returns existing conversation for same agency+user
# Test: getOrCreateChatApiConversation uses conversations table
# Test: getOrCreateChatApiConversation does NOT require tenantId column
# Test: agencyConversations tenant isolation works via agencies JOIN
```

---

## Domain 5: Presentation API

### 7.2 Endpoints
```
# Test: POST /v1/presentations/generate validates topic length (3-1000 chars)
# Test: POST /v1/presentations/generate requires presentations:create scope
# Test: POST /v1/presentations/generate returns task_id
# Test: GET /v1/presentations/tasks/:taskId/progress returns SSE stream
# Test: GET /v1/presentations/decks/:deckId returns deck data
# Test: GET /v1/presentations/decks/:deckId rejects IDOR (wrong tenant)
# Test: POST /v1/presentations/decks/:deckId/export triggers export
# Test: GET /v1/presentations/decks/:deckId/export/download requires Bearer auth
# Test: GET /v1/presentations/decks/:deckId/export/download verifies ownership
```

### 7.3 Route Ordering
```
# Test: /v1/presentations/tasks/:taskId/progress matches before /v1/presentations/decks/:deckId
```

---

## Domain 6: Video Project & Media APIs

### 8.1 Video Project API
```
# Test: POST /v1/video-projects calculates duration-based credits correctly
# Test: draft quality = 3 credits/min, standard = 5, high = 10
# Test: credit overflow guard rejects > MAX_SINGLE_JOB_CREDITS
# Test: GET /v1/video-projects/:id/export/download requires Bearer auth
```

### 8.2 Media Generation API
```
# Test: POST /v1/media/images/generate accepts prompt and returns task_id
# Test: reference_image_urls validates each URL with sanitizeUri + assertPublicIp
# Test: reference_image_urls rejects internal/localhost URLs
# Test: reference_image_urls max 5 URLs enforced
# Test: assertPublicIp checks all A/AAAA DNS records (not just first)
# Test: GET /v1/media/:taskId/status returns progress
```

---

## Domain 7: MCP Server

### 9.2 Protocol
```
# Test: POST /v1/mcp with initialize method returns server capabilities
# Test: POST /v1/mcp with tools/list returns 25+ tools
# Test: POST /v1/mcp with tools/call executes tool and returns result
# Test: POST /v1/mcp rejects invalid JSON-RPC format
# Test: POST /v1/mcp requires API key with mcp:read or mcp:write scope
```

### 9.3 Session Management
```
# Test: initialize creates Redis session with 30-min TTL
# Test: subsequent requests require Mcp-Session-Id header
# Test: expired session returns error
# Test: failed initialize transitions to error state
```

### 9.4 Tool Registry
```
# Test: each tool has valid inputSchema
# Test: tool call enforces scope requirement (e.g., skills:execute for smartspec.skills.execute)
# Test: tool call timeout at 60s
# Test: tool result > 100KB is truncated/rejected
```

### 9.5 MCP Discovery
```
# Test: GET /.well-known/mcp.json returns valid manifest
# Test: manifest contains correct server URL and auth type
```

---

## Domain 8: Job Automation

### 10.1 Job Service
```
# Test: createJob validates type against VALID_JOB_TYPES
# Test: createJob rejects unknown job type
# Test: createJob rejects estimated credits > MAX_SINGLE_JOB_CREDITS
# Test: createJob reserves credits before enqueueing
# Test: completed job refunds excess reserved credits atomically
# Test: failed job refunds ALL reserved credits atomically
# Test: completed job triggers webhook callback if callbackUrl set
# Test: idempotencyKey prevents duplicate job creation
```

### 10.2 Pipeline Support
```
# Test: pipeline resolves {{steps.stepId.field}} template variables
# Test: pipeline rejects circular step references
# Test: pipeline enforces max depth of 5 template resolution levels
# Test: pipeline steps execute sequentially with correct parentJobId/stepIndex
```

### 10.3 REST Endpoints
```
# Test: POST /v1/jobs requires jobs:create scope
# Test: GET /v1/jobs returns paginated list with status filter
# Test: DELETE /v1/jobs/:id cancels pending job
# Test: DELETE /v1/jobs/:id cannot cancel completed job
```

---

## Domain 9: Webhooks & Event Streaming

### 11.1 Webhook Management
```
# Test: POST /v1/webhooks validates HTTPS URL
# Test: POST /v1/webhooks SSRF-validates URL (rejects localhost, internal IPs)
# Test: POST /v1/webhooks encrypts signing secret
# Test: POST /v1/webhooks returns secret once (not retrievable later)
# Test: DELETE /v1/webhooks/:id verifies tenant ownership
# Test: DELETE /v1/webhooks/:id from different tenant returns 404
```

### 11.2 Webhook Delivery
```
# Test: delivery computes correct HMAC-SHA256 signature
# Test: delivery with retryPolicy='exponential' retries 3 times
# Test: delivery with retryPolicy='none' does not retry
# Test: 3 consecutive failures disables webhook endpoint
# Test: webhook payload does not contain API key secrets
```

### 11.3 SSE Event Stream
```
# Test: GET /v1/events requires events:read scope
# Test: GET /v1/events filters by types query param
# Test: SSE heartbeat sent every 30s
# Test: client disconnect is handled cleanly
```

---

## Domain 10: Admin UI

### 12.1 API Key Management
```
# Test: AdminApiKeys page renders key list
# Test: create key dialog shows scope checkboxes
# Test: one-time key display dialog shows raw key with copy button
# Test: revoke button disables key
# Test: admin sees all tenant keys, user sees only own keys
```

### 12.4 tRPC Router
```
# Test: apiKeys.list returns keys for current user
# Test: apiKeys.list returns all tenant keys for admin
# Test: apiKeys.create generates key and returns prefix
# Test: apiKeys.revoke deactivates key
# Test: apiKeys.getUsageStats aggregates audit events
```

---

## Cross-Cutting Concerns

### 14.0 CORS
```
# Test: OPTIONS preflight returns correct CORS headers
# Test: Access-Control-Allow-Origin is * for /v1/ endpoints
# Test: custom headers are in Access-Control-Expose-Headers
```

### 14.1 Response Headers
```
# Test: X-Request-Id header present on all /v1/ responses
# Test: X-Credits-Used header reflects actual credits consumed
# Test: X-Credits-Remaining shows correct balance after deduction
```

### 14.2 Error Format
```
# Test: invalid API key returns { error: { code: "invalid_api_key", ... } }
# Test: insufficient credits returns billing_error type
# Test: rate limit exceeded returns 429 with correct error format
# Test: disabled publicApi flag returns feature_disabled error
```

### 14.4 Feature Flag Guard
```
# Test: API key auth rejected when tenant publicApi=false
# Test: API key auth passes when tenant publicApi=true
# Test: disabling publicApi immediately blocks existing keys
```
