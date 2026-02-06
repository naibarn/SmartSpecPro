# LLM Multi-Provider System with Fallback & Cost Optimization

## Project Context

SmartSpecPro is a web application built with:
- **Frontend**: React + Vite + TailwindCSS + tRPC client
- **Backend**: Express + tRPC + Drizzle ORM (PostgreSQL)
- **Python Backend**: FastAPI (media generation only)
- **Auth**: JWT (HS256) session-based + Bearer token
- **Domain**: https://smartaihub.app (via Cloudflare Tunnel)

---

## Current LLM Architecture (Detailed Analysis)

### Core Implementation: `llmRoutes.ts` (PRIMARY - Active)

This is the **actual working LLM gateway**, NOT `llm.ts` or `openaiCompatGateway.ts` (both are dead/unused code).

**Key Functions:**
- `getActiveLlmProvider()` — Queries DB for first enabled provider, decrypts API key, caches 60s
- `proxyChatWithCredits()` — Core proxy: forwards request to upstream LLM, handles streaming/JSON, deducts credits
- `resolveChatUrl(baseUrl)` — Resolves provider baseUrl → `/v1/chat/completions`
- `checkCredits(auth, res)` — Validates minimum credits before request
- `deductCreditsForUsage(userId, usage)` — Deducts credits after response

**HTTP Endpoints (registered in Express):**

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

### Provider Selection Logic (CURRENT - Single Provider)

```
getActiveLlmProvider():
  1. Check in-memory cache (60-second TTL)
  2. Query: SELECT * FROM llm_providers
     WHERE isEnabled = true
     ORDER BY sortOrder ASC
     LIMIT 1
  3. Decrypt apiKeyEncrypted
  4. Cache result
  5. Return { providerName, baseUrl, apiKey, defaultModel }
```

**Critical Issue: Provider is resolved in 4 SEPARATE places (duplicated logic):**
1. `llmRoutes.ts` (main, with cache)
2. `routers/skills.ts` (no cache)
3. `routers/translation.ts` (no cache)
4. `services/scheduler.ts` (no cache, duplicated to avoid circular deps)

### Dead/Unused Code

- `llm.ts` — Contains `invokeLLM()` but `resolveApiUrl()` and `assertApiKey()` both throw errors. NOT used by any active endpoint.
- `openaiCompatGateway.ts` — Contains `registerOpenAICompatRoutes()` but is **never registered** in `index.ts`. Dead code.

### Streaming Implementation

**SSE (Server-Sent Events) flow:**
1. Frontend POSTs to `/api/llm/stream`
2. Backend sets headers: `Content-Type: text/event-stream`
3. Reads upstream body via `ReadableStream.getReader()`
4. Writes chunks to response (byte-for-byte relay)
5. Accumulates SSE data lines to extract:
   - `choices[0].delta.content` → for saving assistant message
   - `usage.prompt_tokens`, `usage.completion_tokens` → for credit deduction
   - `usage.cost` → provider-reported cost (OpenRouter)
6. At stream end: deducts credits, saves message, sends `event: message_saved`

### Skill Integration

**Skills use LLM in 2 ways:**
1. **LLM-only mode**: Regular chat with skill's systemPrompt injected (max 12KB prompt + 4KB knowledge)
2. **Media-generate mode**: LLM generates JSON prompt → auto-calls media API (Python backend)
3. **Automation mode**: Chat alerts / scheduled tasks via scheduler

**Skill Detection**: Pattern matching on user message text with confidence scoring (debounced 800ms on frontend).

### Brainstorm Mode

Multi-round debate between two models (max 6 rounds). Each model's output is a separate message. Credits deducted per model output. SSE events: `brainstorm_turn`, `brainstorm_chunk`, `brainstorm_credits`, `brainstorm_done`.

---

## Database Schema (Current)

### `llm_providers` table
```sql
id              SERIAL PRIMARY KEY
providerName    VARCHAR(64) NOT NULL UNIQUE   -- "openrouter", "openai", etc.
displayName     VARCHAR(128) NOT NULL
description     TEXT
baseUrl         VARCHAR(512)                  -- "https://openrouter.ai/api/v1"
apiKeyEncrypted TEXT                          -- Encrypted with LLM_ENCRYPTION_KEY
hasApiKey       BOOLEAN DEFAULT false
defaultModel    VARCHAR(128)                  -- "anthropic/claude-3.5-sonnet"
availableModels JSON                          -- [{id, name, contextLength, pricing: {input, output}}]
configJson      JSON                          -- {maxTokens, temperature, supportsVision, headers, ...}
isEnabled       BOOLEAN DEFAULT false
sortOrder       INTEGER DEFAULT 0
createdAt       TIMESTAMPTZ DEFAULT NOW()
updatedAt       TIMESTAMPTZ DEFAULT NOW()
```

### `users` table (credit fields)
```sql
credits         INTEGER DEFAULT 0             -- Current credit balance
plan            ENUM('free','starter','pro','enterprise') DEFAULT 'free'
```

### `credit_transactions` table
```sql
id              SERIAL PRIMARY KEY
userId          INTEGER REFERENCES users(id)
amount          INTEGER NOT NULL              -- Positive = add, Negative = deduct
type            ENUM('purchase','usage','bonus','refund','adjustment','subscription')
description     VARCHAR(512)
metadata        JSON                          -- {model, provider, tokensUsed, costUsd, endpoint, traceId}
balanceAfter    INTEGER NOT NULL              -- Snapshot after transaction
referenceId     VARCHAR(128)                  -- Stripe payment ID
createdAt       TIMESTAMPTZ DEFAULT NOW()
```

### `credit_packages` table
```sql
id              SERIAL PRIMARY KEY
name            VARCHAR(128)
credits         INTEGER                       -- Credits in package
priceUsd        NUMERIC(10,2)
packageType     ENUM('one_time','subscription','agency')
billingPeriod   ENUM('monthly','quarterly','semi_annual','yearly')
discountPercent INTEGER DEFAULT 0
stripePriceId   VARCHAR(128)
isActive        BOOLEAN DEFAULT true
sortOrder       INTEGER DEFAULT 0
```

### `conversations` table (relevant fields)
```sql
model           VARCHAR(100)                  -- Selected LLM model
totalCreditsUsed NUMERIC(12,4) DEFAULT 0
messageCount    INTEGER DEFAULT 0
```

### `messages` table (relevant fields)
```sql
inputTokens     INTEGER DEFAULT 0
outputTokens    INTEGER DEFAULT 0
creditsUsed     NUMERIC(10,4) DEFAULT 0
modelUsed       VARCHAR(100)
skillUsed       VARCHAR(100)
```

---

## Credit System (Detailed)

### Pricing Model
- **1 credit = $0.001 USD** (1000 credits = $1)
- **Markup model**: No markup on LLM cost; markup is applied only at credit purchase time
- **Minimum**: Always at least 1 credit per request (Math.ceil)

### Model Pricing Table (hardcoded in `creditService.ts`)
```typescript
const MODEL_PRICING = {
  "gpt-4o":           { input: 2.50,  output: 10.00 },   // per 1M tokens
  "gpt-4o-mini":      { input: 0.15,  output: 0.60 },
  "gpt-4-turbo":      { input: 10.00, output: 30.00 },
  "claude-3-5-sonnet": { input: 3.00,  output: 15.00 },
  "claude-3-opus":    { input: 15.00, output: 75.00 },
  "gemini-1.5-pro":   { input: 1.25,  output: 5.00 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  "default":          { input: 1.00,  output: 4.00 },    // Conservative fallback
};
```

### Cost Calculation Priority
1. **Provider-reported cost** (`usage.cost` from OpenRouter) — preferred
2. **Model-based calculation** (`calculateLLMCostUsd(input, output, model)`) — fallback

### Credit Flow
```
Pre-request:  checkCredits() → user.credits >= MIN_CREDITS_REQUIRED (1)
                                → 402 Payment Required if insufficient
Post-request: deductCreditsForUsage() → atomic transaction:
                                         UPDATE users SET credits = credits - N
                                         INSERT INTO credit_transactions (...)
```

---

## Frontend Architecture (Chat)

### Chat Flow (End-to-End)
```
User types message → ChatView.onSend()
  → buildUserContent(text + attachments)
  → detectSkillMutation (pattern matching, 800ms debounce)
  → sendMessageMutation (tRPC: chat.sendMessage → DB insert)
  → Add to local state immediately
  → Fetch chat context (system prompt + memories + summaries + last 20 msgs)
  → POST /api/llm/stream {model, messages, conversationId, skillUsed}
  → Parse SSE chunks → accumulate content
  → Backend saves message + deducts credits
  → Frontend updates state + processes memory
```

### Model Selection (Frontend)
- `llmProviders.availableModels` tRPC query → groups by provider
- Stored per conversation in DB (`conversations.model`)
- Fallback: localStorage `smartspec_lastModel` → first available model
- User can change model mid-conversation

### Memory System
- Entity memories (user, project, preference, technical)
- Top 10 by reinforcement count injected into context
- Conversation summaries for older messages
- Background processing after each response

---

## Goal: Multi-Provider System

Transform the single-provider LLM system into an intelligent multi-provider routing system.

### 1. Add OpenCode Zen Provider
- **Base URL**: `https://opencode.ai/zen/v1/`
- **Auth**: Bearer token (API key)
- **API Format**: OpenAI-compatible (`/chat/completions`)
- **Free Models**:
  - Kimi K2.5 Free (200k+ context, good for Thai/Chinese)
  - MiniMax M2.1 Free (general purpose)
  - GLM 4.7 Free (good for coding)
- **Paid Models**: GPT 5.x, Claude 4.5, Gemini 3, etc.
- **Note**: Free models may have rate limits and may use data for improvements

### 2. Automatic Fallback
- When primary provider fails → retry with next provider
- Track failure reasons: rate_limit, timeout, 500/502/503/504
- Exponential backoff between retries
- Max 3 fallback attempts (configurable)
- Free models (OpenCode Zen) likely to hit rate limits more often

### 3. Cost Optimization
- When same model available from multiple providers → select cheapest
- Free models preferred for non-sensitive tasks
- Admin configurable routing rules

### 4. Priority-Based Routing
- Admin sets global provider priority per model
- Users can override with personal preferences
- Three routing modes:
  - **Cost Optimized**: Always pick cheapest provider
  - **Quality First**: Pick most reliable/fastest
  - **Balanced**: Weight cost and quality

### 5. Budget Controls
- Monthly budget limit per user (optional)
- Max cost per request limit
- Alert when approaching limit
- Block requests when exceeded
- Free model requests = 0 credits

### 6. Real-Time Cost Tracking
- Track costs per request, per user, per provider
- Dashboard for admins
- Integrate with existing credit_transactions table

---

## Technical Constraints

- Must be backward-compatible with ALL existing functionality:
  - Chat flow (streaming + JSON modes)
  - Skill execution (LLM-only, media-generate, automation)
  - Brainstorm mode (dual-model debate)
  - STT transcription
  - Memory system
  - Credit deduction flow
- Must consolidate 4 duplicated `getActiveLlmProvider()` into one service
- Must use existing Drizzle ORM for database operations
- Provider API keys must use existing encryption (`LLM_ENCRYPTION_KEY`)
- Must support SSE streaming responses
- Must handle provider-reported costs (OpenRouter `usage.cost`) and fallback calculation
- PostgreSQL database
- In-memory rate limiting (single instance, Redis not required yet)

## Key Files to Modify

### Backend (must modify):
- `apps/web/server/_core/llmRoutes.ts` — Replace single-provider proxy with multi-provider router
- `apps/web/server/routers/llmProviders.ts` — Add routing rule management
- `apps/web/server/services/creditService.ts` — Handle free model (0 cost), update MODEL_PRICING
- `apps/web/drizzle/schema.ts` — Add new tables/columns

### Backend (must refactor):
- `apps/web/server/routers/skills.ts` — Use shared provider resolution
- `apps/web/server/routers/translation.ts` — Use shared provider resolution
- `apps/web/server/services/scheduler.ts` — Use shared provider resolution

### Backend (new files):
- `apps/web/server/services/llmRouter.ts` — New routing/fallback service
- `apps/web/server/services/costTracker.ts` — New cost tracking service

### Frontend (must modify):
- `apps/web/client/src/pages/AdminLLMProviders.tsx` — Add routing config UI
- `apps/web/client/src/components/chat/ChatView.tsx` — Model selection with provider info

### Dead code (can remove):
- `apps/web/server/_core/llm.ts` — Dead code (throws errors)
- `apps/web/server/_core/openaiCompatGateway.ts` — Never registered, unused

---

## Non-Goals (Out of Scope)

- Changing the credit purchase/top-up flow
- Modifying the chat UI layout (beyond model selection enhancements)
- Supporting non-chat LLM endpoints (embeddings, etc.) in this phase
- Multi-tenant/workspace isolation
- Redis-based rate limiting (future phase)
- Anthropic-format or Google-format API routing (OpenAI-compat only for now)
