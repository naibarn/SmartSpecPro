# Research Notes — 043-PublicAPI-ExternalAgentGateway

## 1. Current Infrastructure Analysis

### 1.1 Authentication System (authz.ts)

**File:** `apps/web/server/_core/authz.ts`

Current `authorizeRequest()` supports two modes:
- **Bearer token** — Static tokens (MCP server token, web gateway token) or signed JWT
- **Session cookie** — Browser UI users via `sdk.authenticateRequest(req)`

**Static token scopes:**
- `mcpServerToken` → `["mcp:read", "mcp:write"]`
- `webGatewayToken` → `["llm:chat", "mcp:read", "mcp:write"]`

**Gap:** No support for tenant-scoped API keys with per-key scopes. All static tokens are global server tokens, not tenant-specific.

### 1.2 LLM Gateway (llmRoutes.ts)

**File:** `apps/web/server/_core/llmRoutes.ts`

Key functions:
- `guardWithCredits(req, res)` — Authorizes + checks credit balance
- `guardWithCreditsOrInternalToken(req, res)` — Allows internal `X-Internal-Token` bypass
- `authorizeRequest(req, { allowBearer: true, allowSession: true })` — Used for all LLM endpoints

**Existing OpenAI-compatible endpoints:**
- `POST /v1/chat/completions` — Chat completions (streaming + non-streaming)
- `GET /v1/models` — List models
- `POST /v1/embeddings` — Embeddings
- `POST /v1/images/generations` — Image generation
- `POST /api/voice/transcribe` — STT
- `POST /api/voice/synthesize` — TTS

**Gap:** Bearer auth works but resolves to `sub: "static"` for static tokens. No tenant resolution from API key.

### 1.3 Responses API (responsesRoutes.ts)

**File:** `apps/web/server/_core/responsesRoutes.ts`

- `POST /v1/responses` — OpenAI Responses API proxy
- SSE streaming with tool-call loop (max 10 rounds)
- Web search cost tracking ($0.01 per search call)
- Budget cap: 500 credits default
- Feature flag gated: `responsesApi` per tenant + global flag

**Gap:** Uses same auth as llmRoutes — needs API key extension.

### 1.4 Internal MCP Router (Python)

**File:** `python-backend/app/api/internal_mcp.py`

- `GET /api/internal/mcp/tools` — List tools
- `POST /api/internal/mcp/tools/call` — Execute tool
- Auth: `X-Proxy-Token` header (SMARTSPEC_PROXY_TOKEN, timing-safe compare)

**Registered tools:**
- Google Drive: search, read, list, sheet data, file info
- OneDrive: search, read, list
- Browser: `browser.execute_actions`, `sandbox.exec_command`

**Gap:** Internal-only. No public access. No per-tenant tool filtering.

### 1.5 MCP Routes (Node.js)

**File:** `apps/web/server/_core/mcpRoutes.ts`

- Node-side MCP tools: `artifact_get_url`, file read/write, list, search
- Proxies to Python MCP for Drive/Browser tools
- Auth: `authorizeRequest()` with bearer + session
- Rate limit: 240 RPM

**Gap:** Implements custom JSON protocol, not MCP Streamable HTTP standard.

### 1.6 Skill Execution

**Files:**
- `apps/web/server/services/skillExecutor.ts` — Main execution engine
- `apps/web/server/services/skillRegistry.ts` — Skill discovery and caching
- `apps/web/server/routers/skills.ts` — tRPC router (list, get, execute)

**Gap:** tRPC-only access. No REST API wrapper for external agents.

### 1.7 Agency System

**Files:**
- `apps/web/server/services/agencyBridge.ts` — Node ↔ Python agency bridge
- `apps/web/server/_core/agencyStreamProxy.ts` — SSE streaming proxy
- `python-backend/app/services/agency_orchestrator.py` — LangGraph orchestration
- `python-backend/app/services/agency_tools.py` — Built-in tool registry

**Gap:** Agency invocation requires session auth. No REST API for external agents.

### 1.8 Credit System

**File:** `apps/web/server/services/creditService.ts`

- `deductCredits(userId, tenantId, amount, sourceType, traceId, idempotencyKey)`
- `getCreditBalance(userId)`
- `hasEnoughCredits(userId, amount)`
- Pre-reservation pattern used by browser tool (reserve → execute → refund)

Existing `creditSourceType` values: chat, media, tts, stt, browser_automation, widget_chat, webhook_chat, etc.

**Gap:** No API-specific source types for tracking external API usage separately.

### 1.9 Webhook Triggers (Spec 029)

**File:** `apps/web/server/services/webhookTrigger.ts`

- `POST /api/webhooks/trigger/:triggerId` — Inbound events
- HMAC replay protection, restricted template substitution
- Dispatches to chat/agency

**Gap:** Inbound only. No outbound webhook delivery (callbacks) for job results.

### 1.10 Manus AI Integration

Current Manus integration is OAuth-based:
- `vite-plugin-manus-runtime` — Runtime plugin in Vite config
- `ManusDialog.tsx` — OAuth dialog component
- `server/_core/oauth.ts` — OAuth handler

**Gap:** OAuth is user-interactive. Manus AI as an agent needs API key / MCP server access, not OAuth.

## 2. Key Decisions

### 2.1 API Key Format

Chose `sk-ssp_` prefix format:
- Compatible with OpenAI SDK which expects `sk-` prefix
- `ssp` identifies SmartSpecPro (distinguishes from OpenAI keys)
- Tenant short ID enables fast routing without DB lookup
- 32-char random portion provides 190+ bits of entropy

### 2.2 MCP Transport

Chose Streamable HTTP (POST /v1/mcp) over stdio:
- HTTP is universally accessible (no local process needed)
- SSE allows streaming tool results
- Compatible with remote agents (Manus AI, OpenClaw)
- stdio would require local installation

### 2.3 Job Automation via BullMQ

Reuse existing BullMQ infrastructure:
- Already powers media generation, Celery task bridging
- Proven reliability with retry, backoff, cleanup
- Dashboard available via existing admin tools

### 2.4 Scope Granularity

15 scopes provide fine-grained control:
- Agents can be given minimal permissions (e.g., only `skills:execute`)
- Admin scope (`admin:keys`) is separate from operational scopes
- Read scopes separate from write/execute scopes

## 3. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| API key leak | Unauthorized access | SHA-256 hash at rest, shown once, key rotation |
| DDoS via API | Service degradation | Per-key + per-tenant rate limits, credit limits |
| Cost runaway | Unexpected credit depletion | Daily credit limits per key, pre-reservation |
| Prompt injection via API | Data exfiltration | Same sanitization as UI, no raw eval |
| SSRF via callback URLs | Internal network access | HTTPS-only, no localhost/internal IPs |
| MCP tool abuse | Resource exhaustion | 60s timeout, 100KB result limit, sandboxed browser |
