# Research Findings: Google Drive & Google Workspace Integration

## Part 1: Codebase Analysis

### 1. OAuth Infrastructure (Existing)

**Python Backend:**
- `python-backend/app/api/oauth.py` — Google OAuth provider implemented with `openid email profile` scopes
- `python-backend/app/models/oauth.py` — `OAuthConnection` SQLAlchemy model stores tokens per user
- `python-backend/app/services/oauth_service.py` — Token exchange flow, stores encrypted tokens
- `python-backend/app/core/oauth_config.py` — Loads OAuth config from DB `system_settings` table

**Key Pattern:** OAuth connections are per-user, tokens encrypted with AES-256-GCM, stored in `oauth_connections` table. Token refresh is handled at call time.

**Encryption:** Node.js `crypto.ts` and Python `smartspecweb_crypto.py` share `LLM_ENCRYPTION_KEY` via SHA-256 derivation. Both use AES-256-GCM.

### 2. Library Service Patterns

**File:** `apps/web/server/services/libraryService.ts`

**Key Operations:**
- `createLibraryItem(input, actor, dbClient)` — Creates with `status: "ready"` or `"indexing"`, validates source URL
- `uploadLibraryFile(input, actor, dbClient)` — Validates file type, uploads to S3/R2, creates item with `status: "indexing"`, enqueues `libraryIndexJob`
- `enqueueLibraryIndexJob(input, dbClient)` — Deduplicates pending/processing jobs, creates job with `status: "pending"`
- Permission checks via `getUserEffectivePermission()` with 3-level hierarchy (owner/direct/group/tenant_role)
- Metadata normalization via `normalizeLibraryMetadata()`

**tRPC Router:** `apps/web/server/routers/library.ts` — Uses `protectedProcedure` pattern with Zod validation

**Schema Tables:** `libraryItems`, `libraryChunks`, `libraryIndexJobs`, `libraryLinks`, `libraryPermissions`

**All queries filter by `tenantId`** (defense-in-depth with additional check after fetch).

### 3. Credit System

**Schema Tables:**
- `creditTransactions` — Append-only ledger with `userId`, `tenantId`, `amount`, `type`, `description`, `metadata`
- `providerUsageLog` — Detailed API usage tracking with `traceId`, `modelUsed`, `costUsd`, `creditsCharged`

**Credit Deduction Pattern:**
```typescript
await deductCredits({
  userId,
  amount: Math.ceil(costUsd * 1000),
  description: "LLM API call",
  metadata: { model, provider, tokensUsed, costUsd, traceId }
});
```

**Key Points:**
- Atomic SQL transaction + conditional WHERE clause
- Error on insufficient credits (not silent failure)
- Every deduction creates a transaction record
- Cost calculation: `amount = ceil(costUsd * 1000)` (1 credit = $0.001)

**Current Gaps (from spec):**
- File upload indexing — NOT charged (embedding API cost)
- Markdown save re-indexing — NOT charged
- RAG semantic search — NOT charged (query embedding cost)
- These represent ~$0.05-2.00/user/month revenue leak

### 4. Storage Layer

**File:** `apps/web/server/storage.ts`

Priority-based config resolution:
1. Forge API (legacy env vars)
2. Database `storageSettings` table (active config)
3. Local fallback (filesystem)

**Unified API:** `storagePut(key, buffer, mimeType)` and `storageDelete(key)` abstract provider differences. Supports S3/R2/local.

### 5. MCP Infrastructure

**Python adapter:** `python-backend/app/tools/mcp_adapter.py`
- `list_tools(trace_id)` — Lists available MCP tools via HTTP
- `call_tool(name, arguments, trace_id)` — Executes tool via HTTP

**MCP Executor:** `python-backend/app/orchestrator/node_executors/integration_executors/mcp_executor.py`
- LangGraph integration
- Supports `read_resource`, `list_resources`, `call_tool`
- JSON-RPC 2.0 protocol
- Timeout handling (default 30s)

**HTTP Endpoints (Node.js):**
- `POST /api/mcp/tools/list`
- `POST /api/mcp/tools/call`
- `POST /api/mcp/resources/read`
- `POST /api/mcp/resources/list`

### 6. RAG Pipeline (Existing)

**Python Backend Services:**
- Embedding service using OpenAI/Cohere
- Chunking with 500 char chunks, 80 char overlap
- Vector store: ChromaDB and/or pgvector
- Collection naming: `library_tenant_{tenantId}`

**Index Job Flow:**
1. File uploaded → `libraryIndexJob` created (status: pending)
2. Job processor extracts text, chunks it
3. Embeddings generated via OpenAI API
4. Vectors upserted to ChromaDB/pgvector
5. `libraryChunks` records created in PostgreSQL
6. `libraryItem` status set to "ready"

### 7. Audit & Observability

**Schema:** `apiAuditEvents` table with `traceId` (32-char hex), `eventType`, `userId`, `model`, `provider`, `statusCode`, `responseTimeMs`, `creditsCharged`, `costUsd`, `metadata`

**JSONL Audit Logs:** `apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`

### 8. Async Job Processing

**Pattern:** Jobs enqueued with deduplication, polled for status
- Statuses: `pending` → `processing` → `completed` | `failed`
- Retry with exponential backoff: 30s, 60s, 120s, 240s... max 30m
- Celery for Python tasks, BullMQ for Node.js

### 9. Testing Infrastructure

**TypeScript (Vitest):**
- Files: `apps/web/server/*.test.ts`
- Pattern: `describe` → `it` → `expect` with `vi.mock()` for dependencies
- Database mocked via `vi.mock("../db")`

**Python (pytest):**
- Files: `python-backend/tests/test_*.py`
- Markers: `@pytest.mark.unit`, `.integration`, `.e2e`, `.auth`, `.credits`, `.llm`
- Coverage: 80% minimum enforced
- Async: `@pytest.mark.asyncio`

### 10. Configuration Pattern

**System Settings Table** — Runtime config without code redeploy:
- Category-based grouping (e.g., "oauth", "storage", "stripe")
- `isSensitive: true` → auto-encrypted values
- Admin UI for editing

---

## Part 2: Web Research

### 1. Google Drive API v3 + OAuth

#### 1.1 Incremental Consent
- Request only `openid email profile` on initial login
- When user clicks "Connect Google Drive", request additional scopes with `include_granted_scopes=true`
- Google preserves previously granted scopes and adds new ones
- Set `access_type=offline` to get refresh token, `prompt=consent` to ensure refresh token is returned

#### 1.2 Scope Selection
- **`drive.readonly`** — Reads ALL files in user's Drive (highest sensitivity; triggers Google verification review)
- **`drive.file`** — Only access files created/opened by app (lowest sensitivity but limited)
- **`documents.readonly`** / **`spreadsheets.readonly`** — Structured content extraction
- **Recommendation:** Use `drive.readonly` for RAG indexing (needs to scan all files). The spec's choice is correct.

#### 1.3 Token Refresh Patterns
- Refresh tokens are long-lived (no expiry unless revoked)
- Access tokens expire in 3600s (1 hour)
- Refresh 5 minutes before expiry to avoid race conditions
- Handle `invalid_grant` error → token revoked → prompt user to reconnect
- Use `google.oauth2.credentials.Credentials` with `token_uri` for automatic refresh

#### 1.4 Changes API + Webhooks
- `changes.watch()` creates a webhook channel (max 7 days TTL)
- When files change, Google POSTs to the webhook URL
- Use `startPageToken` for incremental polling
- Must renew channels before expiry (recommend at 80% of TTL = 5.6 days)
- **Webhook requirement:** Must be accessible via HTTPS with valid SSL cert (matches SmartSpecPro's Nginx setup)

#### 1.5 Rate Limiting
- Default quota: 20,000 requests/100 seconds/project
- Per-user limit: 2,500 requests/100 seconds/user
- Exponential backoff: start at 1s, double each retry, add jitter, cap at ~32s
- Use `fields` parameter to reduce payload size
- Batch requests to combine multiple API calls
- Cache aggressively, invalidate via Changes API

Sources:
- [Google Drive API Scopes](https://developers.google.com/identity/protocols/oauth2/scopes#drive)
- [Google OAuth Incremental Authorization](https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth)
- [Google Drive Changes API](https://developers.google.com/drive/api/guides/manage-changes)

### 2. MCP Server Patterns (FastMCP)

#### 2.1 FastMCP 3.x Architecture
- Three abstractions: Components (tools, resources, prompts), Providers (function decorators, OpenAPI specs), Transforms (auth, filtering)
- Every parameter must have explicit type annotation
- Docstrings are critical — LLM uses them to decide when to invoke tools

#### 2.2 Streamable HTTP Transport
- **Replaces deprecated SSE** as of MCP spec March 2025
- Single endpoint (e.g., `/mcp`) handling both POST and GET
- Stateless by default — compatible with ephemeral/serverless infrastructure
- Optional upgrade to SSE for long-running operations
- Built-in stream resumability

#### 2.3 Auth Context Injection
```python
class AuthMiddleware(Middleware):
    async def on_call_tool(self, request, context, next_handler):
        token = context.transport.headers.get("authorization", "").removeprefix("Bearer ")
        user = await validate_jwt(token)
        context.state["user_id"] = user.id
        context.state["tenant_id"] = user.tenant_id
        return await next_handler(request, context)
```
- JWT Bearer tokens with RSA key pairs
- User context stored in middleware state object
- Every tool accesses authenticated user without parameter pollution

#### 2.4 Error Handling
- Use `ToolError` for expected/actionable errors (shown to LLM)
- Use `mask_error_details=True` in production to hide unexpected exceptions
- Make error messages actionable: "Invalid date format. Use YYYY-MM-DD."
- Three-tier model: transport-level, protocol-level (JSON-RPC), application-level (`isError`)
- Implement circuit breaker for external service dependencies

#### 2.5 Resource Exposure
```python
@mcp.resource("gdrive://files/{file_id}")
async def get_drive_file(file_id: str) -> str: ...

@mcp.resource("gdrive://files/{file_id}/metadata")
async def get_drive_metadata(file_id: str) -> str: ...
```
- URI templates with standard `{param}` and wildcard `{param*}` support
- Access control via `tags` and `mcp.disable()`

Sources:
- [FastMCP GitHub](https://github.com/jlowin/fastmcp)
- [MCP Transports Spec](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Error Handling in MCP Servers](https://mcpcat.io/guides/error-handling-custom-mcp-servers/)

### 3. RAG Pipeline + Federated Search

#### 3.1 Multi-Source Architecture
```
User Query → [Query Router] → parallel:
  - [Local Vector Store] (semantic)
  - [Google Drive MCP] (Drive API search)
  - [BM25 Index] (keyword)
→ [RRF Merge] → [Re-Ranker] → [LLM Context Assembly]
```
- Fan out queries to all connected sources in parallel
- Each source returns normalized result format
- Apply RRF (Reciprocal Rank Fusion) to merge into single ranked list

#### 3.2 Deduplication Strategies
1. **Canonical ID dedup** (fast, first pass) — match by `driveFileId` across sources
2. **Content hash dedup** (second pass) — SHA-256 of extracted text for cross-source matches
3. **Semantic dedup** (optional) — cosine similarity > 0.95 = duplicate
4. When merging duplicates: prefer local library for embedding scores, Drive API for freshness

#### 3.3 Hybrid Search with RRF
```python
RRF_score(d) = sum(1 / (k + rank_i(d))) for each ranker i  # k=60 typical
```
- Run BM25 and vector search in parallel
- Apply RRF to merge
- Optional: cross-encoder reranker on top-20 results

#### 3.4 Chunking for Google Docs/Sheets
- **Docs:** Export as markdown, split by headings (`#`, `##`). 200-500 token chunks with 50-100 overlap.
- **Sheets:** Export as CSV, chunk by row with column headers as context. Include sheet name as metadata.
- **Slides:** One chunk per slide with slide number as metadata.
- Preserve heading hierarchy as metadata for each chunk

#### 3.5 Vector Store Partitioning
- **Recommended for SmartSpecPro:** Namespace-per-tenant with per-user filtering within tenant
- Create one vector collection per tenant
- Tag vectors with `user_id` metadata for private document filtering
- For pgvector: consider partitioning by `tenant_id` for large deployments
- Always enforce tenant isolation at query layer

Sources:
- [Federated RAG Architecture (arXiv)](https://arxiv.org/html/2505.18906v1)
- [Hybrid Search - Azure AI Search](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)
- [Multi-Tenant RAG with pgvector](https://www.thenile.dev/blog/multi-tenant-rag)
- [Chunking Strategies for RAG](https://www.multimodal.dev/post/how-to-chunk-documents-for-rag)

### 4. Credit/Usage Billing Systems

#### 4.1 Per-Operation Billing
- **Credit Ledger:** Append-only transaction log as single source of truth
- **Synchronous pre-deduct:** For predictable-cost operations (indexing, RAG queries)
- **Async reservation:** For variable-cost operations (LLM responses with unknown token count)
- SmartSpecPro's existing `creditTransactions` table serves as the ledger

#### 4.2 Pre-Flight Estimation
- Show estimated cost inline near action button
- Display both credit cost and remaining balance
- Small files (<100KB): auto-charge without dialog
- Large files (>1MB): always show estimation dialog
- Show range for variable-cost operations

#### 4.3 Idempotent Charging
- Every transaction needs `idempotency_key` (e.g., `"gdrive_index_{fileId}_{contentHash}"`)
- Redis dedup cache with 24h TTL
- Database UNIQUE constraint on `(tenant_id, idempotency_key)` as final safety net
- Atomic deduction with `SELECT ... FOR UPDATE` or optimistic locking

#### 4.4 Budget Caps and Alerts
- **Tiered thresholds:** 50% (informational), 75% (warning), 90% (urgent), 100% (hard stop or overage)
- Escalating channels: in-app only → in-app + email → in-app + email + webhook
- Hard vs soft caps: hard caps block service, soft caps allow overages with escalating alerts
- Monthly budget reset with rollover option

#### 4.5 Revenue Leak Detection
- Reconciliation jobs: compare usage events against ledger entries
- Anomaly detection: alert when tenant consumes >10x historical average
- Monitoring metrics: transaction success/failure rates, P99 latency, dedup cache hit rate
- The ledger is append-only, immutable. Corrections via compensating transactions.

Sources:
- [SaaS Credits System Guide](https://colorwhistle.com/saas-credits-system-guide/)
- [Rise of AI Credits - Metronome](https://metronome.com/blog/the-rise-of-ai-credits-why-cost-plus-credit-models-work-until-they-dont)
- [Usage Caps in Billing UX](https://kinde.com/learn/billing/pricing/integrating-usage-caps-alerts-and-spend-limits-in-billing-ux/)
- [SaaS Billing Best Practices - Orb](https://www.withorb.com/blog/saas-billing-tips)
