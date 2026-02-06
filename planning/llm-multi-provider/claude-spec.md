# Complete Specification: LLM Multi-Provider System

## 1. Overview

Transform SmartSpecPro's single-provider LLM system (currently OpenRouter only) into a multi-provider routing system with intelligent fallback, cost optimization, and provider health tracking. Add OpenCode Zen as the second provider, with architecture supporting additional providers in the future.

**Stack**: React + Vite + TailwindCSS + tRPC (frontend), Express + tRPC + Drizzle ORM + PostgreSQL (backend), FastAPI (Python backend, media only).

**Domain**: https://smartaihub.app (Cloudflare Tunnel)

---

## 2. Current System Analysis

### 2.1 Active LLM Gateway: `llmRoutes.ts`

The ONLY active LLM code. `llm.ts` and `openaiCompatGateway.ts` are dead code (throw errors / never registered).

**Core functions:**
- `getActiveLlmProvider()` — Queries DB for first enabled provider (by sortOrder), decrypts API key, caches 60s in-memory
- `proxyChatWithCredits()` — Forwards request to upstream LLM, handles streaming/JSON, deducts credits
- `resolveChatUrl(baseUrl)` → appends `/v1/chat/completions`
- `checkCredits()` → validates user.credits >= 1, returns 402 if insufficient
- `deductCreditsForUsage()` → atomic UPDATE users + INSERT credit_transactions

**HTTP Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/chat/completions` | POST | OpenAI-compatible gateway |
| `/v1/models` | GET | List available models |
| `/v1/credits` | GET | User credit balance |
| `/api/llm/chat` | POST | REST wrapper (JSON only) |
| `/api/llm/stream` | POST | REST wrapper (SSE streaming) |
| `/api/llm/brainstorm` | POST | Multi-model debate mode |
| `/api/stt/transcribe` | POST | Speech-to-text |
| `/api/llm/save-message` | POST | Save assistant message |
| `/api/chat/save-assistant` | POST | Alternative save endpoint |

### 2.2 Critical Issue: Duplicated Provider Resolution

`getActiveLlmProvider()` is duplicated in 4 places:
1. `llmRoutes.ts` (with 60s cache)
2. `routers/skills.ts` (no cache)
3. `routers/translation.ts` (no cache)
4. `services/scheduler.ts` (no cache, duplicated to avoid circular deps)

**Requirement:** Consolidate into a single shared service.

### 2.3 Streaming SSE Flow

1. Frontend POSTs to `/api/llm/stream`
2. Backend sets `Content-Type: text/event-stream`
3. Reads upstream via `ReadableStream.getReader()`, byte-for-byte relay
4. Accumulates SSE data lines to extract `choices[0].delta.content`, `usage.*`, `usage.cost`
5. At stream end: deducts credits, saves message, sends `event: message_saved`

### 2.4 Skill Integration

Skills use LLM in 3 modes:
- **LLM-only**: Chat with skill systemPrompt (max 12KB + 4KB knowledge)
- **Media-generate**: LLM generates JSON → calls Python media API
- **Automation**: Scheduled tasks via scheduler

### 2.5 Brainstorm Mode

Multi-round debate between two models (max 6 rounds). Credits deducted per model output. SSE events: `brainstorm_turn`, `brainstorm_chunk`, `brainstorm_credits`, `brainstorm_done`.

### 2.6 Credit System

- **1 credit = $0.001 USD** (1000 credits = $1)
- Minimum 1 credit per request (`Math.ceil`)
- Cost priority: provider-reported `usage.cost` (OpenRouter) → fallback to MODEL_PRICING table calculation
- Atomic deduction: `UPDATE users SET credits = credits - N` + `INSERT credit_transactions`
- Pre-request check: 402 if credits < 1

### 2.7 Dead Code to Remove

- `apps/web/server/_core/llm.ts` — `resolveApiUrl()` and `assertApiKey()` both throw errors
- `apps/web/server/_core/openaiCompatGateway.ts` — Never registered in `index.ts`

---

## 3. Database Schema (Current)

### Existing Tables

**`llm_providers`**: id, providerName (unique), displayName, description, baseUrl, apiKeyEncrypted, hasApiKey, defaultModel, availableModels (JSON), configJson (JSON), isEnabled, sortOrder, createdAt, updatedAt

**`users`** (credit fields): credits (INTEGER), plan (ENUM: free/starter/pro/enterprise)

**`credit_transactions`**: id, userId, amount (pos=add, neg=deduct), type (ENUM), description, metadata (JSON: {model, provider, tokensUsed, costUsd, endpoint, traceId}), balanceAfter, referenceId, createdAt

**`conversations`** (relevant): model, totalCreditsUsed, messageCount

**`messages`** (relevant): inputTokens, outputTokens, creditsUsed, modelUsed, skillUsed

---

## 4. Requirements (from Interview)

### 4.1 Provider Routing UI
- **Smart default + override button**: Auto-select cheapest/best provider by default
- User can click to change provider (power user control)
- Show which providers offer a given model with pricing info

### 4.2 Privacy & Admin Control
- Admin decides which models/providers are available system-wide
- Users don't make privacy decisions — admin has already vetted approved models
- Free models (which may use data for training) are enabled/disabled by admin

### 4.3 Fallback Behavior
- **Ask user before fallback from free to paid**: When free model fails (rate limit, error), inform user and ask if they want to switch to paid (costs credits)
- Do NOT silently switch to a paid model
- Fallback between providers of the same tier (free→free, paid→paid) can be automatic/transparent

### 4.4 Budget Control
- **Use existing credit system as budget**: No separate budget layer needed
- Users can only request if credits >= 1
- Free model requests = 0 credits
- The credit balance IS the budget control

### 4.5 Cost Tracking Dashboard
- **Admin**: Full cost breakdown across all providers and users
- **Users**: Own usage statistics (models used, credits consumed)

### 4.6 Migration Strategy
- OpenRouter remains primary provider — must continue working exactly as before
- Add OpenCode Zen as additional provider choice
- Existing functionality must not break (backward compatible)

### 4.7 Scope
- Build all features at once: routing + fallback + cost tracking + UI
- Single implementation phase, not phased MVP

---

## 5. OpenCode Zen Integration

### 5.1 API Details
- **Base URL**: `https://opencode.ai/zen/v1/`
- **Auth**: Bearer token (API key)
- **Endpoint**: `/chat/completions` (OpenAI-compatible, for open-source/free models only)

### 5.2 Critical Finding
Zen is NOT purely OpenAI-compatible — different endpoints per model family:
- OpenAI models → `/responses`
- Anthropic models → `/messages`
- Open-source models → `/chat/completions` ← **use this only**
- Google models → `/models/{model-id}`

**Scope**: Only integrate `/chat/completions` endpoint. Paid models requiring Anthropic/Google format are out of scope.

### 5.3 Free Models (Limited Beta)
| Model | Strengths | Privacy |
|-------|-----------|---------|
| Kimi K2.5 Free | 200k+ context, Asian languages | Data may be used for training |
| MiniMax M2.1 Free | General purpose | Data may be used for training |
| GLM 4.7 Free | Coding specialist | Data may be used for training |

### 5.4 Rate Limits
- Not explicitly documented in public docs
- Free models likely have lower rate limits
- Must handle gracefully with circuit breaker

### 5.5 Billing (for paid models)
- Pay-as-you-go + 4.4% + $0.30 credit card processing
- BYOK option available (bring your own API keys)

---

## 6. Multi-Provider Routing Architecture

### 6.1 Provider Selection Flow
```
Request arrives with {model, messages}
  ↓
Resolve model → list of providers offering this model
  ↓
Filter: enabled providers only, circuit breaker healthy
  ↓
Sort by: routing mode (cost/quality/priority) + admin sortOrder
  ↓
Select primary provider (cheapest by default, or user override)
  ↓
Attempt request
  ↓ (success → return response)
  ↓ (429/5xx → fallback logic)
Check: is fallback same tier (free→free or paid→paid)?
  → Yes: transparent retry on next provider
  → No (free→paid): ask user permission first
  ↓
Max 3 fallback attempts
  ↓ (all failed)
Return error to user
```

### 6.2 Fallback Rules
- Trigger on 429, 500, 502, 503, 504, timeout ONLY
- Never fallback on 400-level client errors (those indicate bugs)
- **Pre-stream fallback**: Before first SSE chunk → transparent retry, client never knows
- **Mid-stream fallback**: After chunks sent → send error event, inform user, offer retry
- **Free→Paid boundary**: Always ask user before crossing (per interview requirement)

### 6.3 Circuit Breaker (In-Memory)
- Track per-provider: success rate (rolling window), failure count, last failure time
- Health states: healthy → degraded (>5% failure) → down (>20% failure)
- Cooldown: 30-60 seconds before retrying downed provider
- Single-instance in-memory (no Redis required)

### 6.4 Routing Modes
- **Cost Optimized** (default): Select cheapest provider for the model
- **Quality First**: Select most reliable/fastest provider
- **Priority-Based**: Admin-configured explicit ordering via sortOrder

---

## 7. New Database Schema

### 7.1 Schema Changes to `llm_providers`
Add columns:
- `providerType` — ENUM: 'primary', 'secondary', 'fallback' (for admin priority classification)
- `healthStatus` — ENUM: 'healthy', 'degraded', 'down' (runtime, managed by circuit breaker)
- `lastHealthCheck` — TIMESTAMPTZ
- `failureCount` — INTEGER DEFAULT 0
- `successCount` — INTEGER DEFAULT 0

### 7.2 New Table: `model_provider_map`
Maps which providers offer which models, with per-provider pricing.
```
modelId         VARCHAR(128)    -- e.g. "kimi-k2.5-free"
providerId      INTEGER REFERENCES llm_providers(id)
modelName       VARCHAR(128)    -- Display name
pricingInput    NUMERIC(10,6)   -- Per 1M tokens (0 for free)
pricingOutput   NUMERIC(10,6)   -- Per 1M tokens (0 for free)
isFree          BOOLEAN DEFAULT false
contextLength   INTEGER
isEnabled       BOOLEAN DEFAULT true
priority        INTEGER DEFAULT 0  -- Lower = higher priority within provider
```

### 7.3 New Table: `provider_usage_log`
Per-request tracking for admin dashboard and cost reconciliation.
```
id              SERIAL PRIMARY KEY
userId          INTEGER REFERENCES users(id)
providerId      INTEGER REFERENCES llm_providers(id)
modelUsed       VARCHAR(128)
inputTokens     INTEGER
outputTokens    INTEGER
costUsd         NUMERIC(10,6)   -- Provider-reported or calculated
creditsCharged  INTEGER
responseTimeMs  INTEGER
statusCode      INTEGER         -- HTTP status from provider
errorType       VARCHAR(64)     -- null, 'rate_limit', 'timeout', 'server_error'
wasFallback     BOOLEAN DEFAULT false
fallbackFrom    INTEGER REFERENCES llm_providers(id)
createdAt       TIMESTAMPTZ DEFAULT NOW()
```

### 7.4 New Table: `routing_rules`
Admin-configured routing preferences.
```
id              SERIAL PRIMARY KEY
modelPattern    VARCHAR(128)    -- Glob pattern: "*", "kimi-*", exact model ID
routingMode     ENUM('cost', 'quality', 'priority')
providerOrder   JSON            -- [providerId1, providerId2, ...] for priority mode
maxFallbacks    INTEGER DEFAULT 3
isActive        BOOLEAN DEFAULT true
createdAt       TIMESTAMPTZ DEFAULT NOW()
```

---

## 8. New Services

### 8.1 `llmRouter.ts` — Provider Resolution & Routing
Replaces all 4 duplicated `getActiveLlmProvider()` calls.

**Responsibilities:**
- Resolve model → list of available providers (from model_provider_map)
- Apply routing rules (cost/quality/priority)
- Execute request with fallback chain
- Circuit breaker management (in-memory health tracking)
- Handle free→paid boundary (return special response asking user)
- Support both streaming and JSON response modes

### 8.2 `costTracker.ts` — Usage Logging & Dashboard Data
**Responsibilities:**
- Log every LLM request to provider_usage_log
- Calculate cost (prefer provider-reported, fallback to model pricing)
- Aggregate data for admin dashboard (per-provider, per-user, per-model)
- Aggregate data for user dashboard (own usage)
- Handle free model requests (0 cost, still log for tracking)

### 8.3 `providerHealth.ts` — Circuit Breaker
**Responsibilities:**
- Track success/failure per provider (in-memory Maps)
- Compute health status (healthy/degraded/down)
- Cooldown management
- Expose health status for routing decisions

---

## 9. Frontend Changes

### 9.1 Model Selection Enhancement
- Show provider badge next to each model (e.g., "via OpenRouter", "via Zen (Free)")
- Smart default: auto-select cheapest provider
- Override button: click to see all providers for a model with pricing
- Show "FREE" badge for zero-cost models

### 9.2 Fallback UI
- When free model fails and paid fallback is available:
  - Show inline notification: "Free model unavailable. Switch to [Model] via [Provider] for X credits?"
  - User clicks "Yes" or "Cancel"
- When all providers fail: show error message

### 9.3 Admin LLM Providers Page
- Provider list with health status indicators (green/yellow/red)
- Per-provider: enable/disable, set priority, configure routing rules
- Model mapping: which models are available from which providers
- Usage dashboard: requests/cost/errors per provider (chart + table)

### 9.4 User Usage Page
- Own usage: models used, credits consumed, request count
- Breakdown by time period

---

## 10. Backward Compatibility Requirements

ALL existing functionality must continue working unchanged:
- Chat flow (streaming + JSON modes)
- Skill execution (LLM-only, media-generate, automation)
- Brainstorm mode (dual-model debate)
- STT transcription
- Memory system
- Credit deduction flow
- `/v1/chat/completions` OpenAI-compatible endpoint
- Provider-reported costs from OpenRouter `usage.cost`

The refactoring must be transparent — if only OpenRouter is configured, behavior must be identical to current system.

---

## 11. Technical Constraints

- PostgreSQL database with Drizzle ORM
- API keys encrypted with `LLM_ENCRYPTION_KEY` (existing pattern)
- In-memory rate limiting and circuit breaker (single instance, no Redis)
- SSE streaming must work through fallback chain
- Pure async function pattern for services (no classes)
- Vitest for testing, co-located `.test.ts` files
- tRPC routers with Zod validation
- Errors propagate to router (no try-catch wrapping in services)

---

## 12. Files to Modify

### Must modify:
- `apps/web/server/_core/llmRoutes.ts` — Replace single-provider proxy with multi-provider router
- `apps/web/server/routers/llmProviders.ts` — Add routing rule management endpoints
- `apps/web/server/services/creditService.ts` — Handle free model (0 cost)
- `apps/web/drizzle/schema.ts` — New tables + columns

### Must refactor:
- `apps/web/server/routers/skills.ts` — Use shared llmRouter
- `apps/web/server/routers/translation.ts` — Use shared llmRouter
- `apps/web/server/services/scheduler.ts` — Use shared llmRouter

### New files:
- `apps/web/server/services/llmRouter.ts`
- `apps/web/server/services/costTracker.ts`
- `apps/web/server/services/providerHealth.ts`

### Frontend:
- `apps/web/client/src/pages/AdminLLMProviders.tsx` — Add routing config, health status, usage dashboard
- `apps/web/client/src/components/chat/ChatView.tsx` — Provider selection UI

### Dead code to remove:
- `apps/web/server/_core/llm.ts`
- `apps/web/server/_core/openaiCompatGateway.ts`

---

## 13. Non-Goals (Out of Scope)

- Changing credit purchase/top-up flow
- Modifying chat UI layout (beyond model selection enhancements)
- Supporting non-chat LLM endpoints (embeddings, etc.)
- Multi-tenant/workspace isolation
- Redis-based rate limiting
- Anthropic-format or Google-format API routing via Zen (only `/chat/completions`)
- Automatic complexity-based model routing (user chooses model manually)
