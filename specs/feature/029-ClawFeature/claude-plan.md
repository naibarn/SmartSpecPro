# 02-ClawFeature: Implementation Plan

## Overview

This plan covers the implementation of 10 platform enhancement features for SmartSpecPro, organized into 3 phases across approximately 9 weeks. The features close capability gaps identified through analysis of OpenClaw (an open-source AI assistant) while integrating deeply with SmartSpecPro's existing LLM Gateway, Credit System, Channel Gateway, and multi-tenant architecture.

### Guiding Principles
1. **Reuse existing infrastructure** — Every feature plugs into `unified_client.py`, `creditService.ts`, `channelGateway.ts`, and `auditLogger.ts`
2. **Credits for every external call** — All LLM, media, browser, voice, and webhook actions deduct credits through `creditService.deductCredits()`
3. **Tenant isolation** — All features respect multi-tenant boundaries via tenantId checks
4. **Resource efficiency** — The target server has limited RAM and CPU; design for conservative concurrency, shared workers, and lazy initialization
5. **Feature flags** — Every feature gated by `tenants.settings.featureFlags` (existing JSONB column)

### Target Scale
- 20-100 tenants, 1K-10K concurrent users
- Single server with constrained RAM/CPU

---

## Section 1: Database Foundation & Migrations

Before implementing any feature logic, establish all database schema changes in a controlled migration sequence. This prevents FK dependency issues and ensures tables exist before service code references them.

### 1.1 New creditSourceType Enum Values

The `creditSourceTypeEnum` is a PostgreSQL enum defined at `drizzle/schema.ts` line 99. New values require `ALTER TYPE ... ADD VALUE` which **cannot run inside a transaction block** in PostgreSQL.

**Important:** Drizzle's `db:push` may wrap migrations in transactions by default. Create a **separate raw SQL migration file** (not managed by Drizzle) for enum additions. Run it directly via `psql` before the Drizzle-managed migrations:

```sql
-- Run outside transaction (cannot be inside BEGIN/COMMIT)
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'tts';
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'browser_automation';
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'widget_chat';
ALTER TYPE credit_source_type_enum ADD VALUE IF NOT EXISTS 'webhook_chat';
```

Note: `stt` already exists in the enum — no migration needed for STT.

After the migration, update the TypeScript `CreditSourceType` union in `creditService.ts` to include the new values.

### 1.1b Seed STT/TTS Providers in llmProviders Table

**Blocker for F05 (Voice Chat):** `providerUsageLog.providerId` is `integer("providerId").notNull().references(() => llmProviders.id)` — a real integer FK with NOT NULL constraint. Synthetic string IDs like `stt-groq` are impossible. STT/TTS providers **must** be seeded into `llmProviders` before any voice-related usage logging.

Seed the following provider entries:
- Groq Whisper STT (type: 'stt', name: 'Groq Whisper')
- OpenAI Whisper STT (type: 'stt', name: 'OpenAI Whisper')
- ElevenLabs TTS (type: 'tts', name: 'ElevenLabs')
- OpenAI TTS (type: 'tts', name: 'OpenAI TTS')

If the `llmProviders.type` column doesn't support 'stt'/'tts' values, add them or use a generic type and rely on the name/metadata for differentiation.

### 1.2 Migration 1: Persona Foundation

**Table: `persona_templates`** — No dependencies on other new tables.

Schema: varchar(36) PK with gen_random_uuid(), nullable tenant_id FK to tenants(id) ON DELETE CASCADE, nullable user_id FK to users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, system_prompt_prefix TEXT NOT NULL (max 2000 chars enforced at application layer), tone TEXT with CHECK constraint ('formal', 'casual', 'friendly', 'technical', 'creative'), language TEXT default 'auto', response_style JSONB default '{}', restrictions TEXT[] default '{}' (max 20 entries, 500 chars each — app validation), scope TEXT NOT NULL with CHECK ('platform', 'tenant', 'user'), is_default BOOLEAN default false, timestamps.

Indexes: `(tenant_id, scope)` and `(user_id)`.

**Columns on existing tables:**
- `users.defaultPersonaId` — VARCHAR(36), nullable FK to persona_templates ON DELETE SET NULL
- `tenants.defaultPersonaId` — VARCHAR(36), nullable FK to persona_templates ON DELETE SET NULL
- `conversations.personaId` — VARCHAR(36), nullable FK to persona_templates ON DELETE SET NULL
- `conversations.tenantId` — VARCHAR(36), nullable FK to tenants(id) ON DELETE CASCADE. Add index `idx_conversations_tenant ON conversations(tenant_id)`.

**Backfill (CRITICAL — verify column name first):** The `users` table has `currentTenantId` (integer type) referencing `tenants.id` (varchar(36)). Before writing the backfill query, verify the actual database column type and any implicit casts. The backfill must use the correct column name:
```sql
UPDATE conversations SET tenant_id = u."currentTenantId"::text
FROM users u WHERE conversations.user_id = u.id AND conversations.tenant_id IS NULL;
```
If `currentTenantId` is truly integer while `tenants.id` is varchar(36), the cast `::text` will produce the numeric string (e.g., `'5'` not a UUID). Verify this is correct for the project. If there's a separate `tenantId` varchar column on users, use that instead.

**Also:** Grep for all conversation creation sites (`db.insert(conversations)`) and update each to set `tenantId` at creation time. Known sites include: chatService.ts, channelGateway.ts, widgetGateway.ts (new), and any agency conversation creation paths.

### 1.3 Migration 2: Messages TraceId

- `messages.traceId` — VARCHAR(32), nullable (matches `providerUsageLog.traceId` type exactly)
- Index: `idx_messages_traceid ON messages("traceId")`

### 1.4 Migration 3: Channel Infrastructure

**Table: `channel_connections`** — Generalizes `telegramConnections`.

varchar(36) PK, tenant_id FK NOT NULL (CASCADE), user_id FK NOT NULL (CASCADE), channel_type TEXT NOT NULL with CHECK ('telegram', 'whatsapp', 'line', 'slack', 'discord'), external_user_id TEXT NOT NULL, external_chat_id TEXT (nullable — some platforms don't have chat ID at link time), connection_config JSONB default '{}' (may contain encrypted OAuth tokens), status TEXT NOT NULL default 'pending' with CHECK ('active', 'revoked', 'pending', 'blocked'), active_channel_id VARCHAR(36) FK to conversation_channels ON DELETE SET NULL, linked_at/linked_by/revoked_at/revoked_by, UNIQUE(tenant_id, channel_type, external_user_id).

Indexes: `(tenant_id, channel_type, status)` and `(tenant_id, user_id)`.

**Table: `channel_credentials`** — Admin-configured per tenant.

varchar(36) PK, tenant_id FK NOT NULL (CASCADE), channel_type TEXT NOT NULL with CHECK, credentials_encrypted TEXT NOT NULL (AES-256-GCM via crypto.ts), webhook_url TEXT, webhook_secret_encrypted TEXT, is_active BOOLEAN, metadata JSONB, timestamps, UNIQUE(tenant_id, channel_type) — may need relaxation for multi-bot per channel.

Index: `(tenant_id, channel_type)`.

**Data migration:** Copy existing `telegramConnections` data into `channel_connections` with column mapping: `chatId→external_chat_id`, `telegramUserId→external_user_id`, `botId→connection_config.bot_id`, hardcode `channel_type='telegram'`, `conversationChannelId→active_channel_id`. Verify column names against actual schema before running.

### 1.5 Migration 4: Widget & Artifacts

**Table: `chat_widgets`** — Depends on persona_templates for default_persona_id FK.

varchar(36) PK, tenant_id FK NOT NULL (CASCADE), name TEXT NOT NULL, target_type TEXT with CHECK ('chat', 'agency'), target_agency_id FK nullable to agencies ON DELETE SET NULL, default_persona_id FK nullable to persona_templates ON DELETE SET NULL, theme JSONB, allowed_origins TEXT[] (empty = NO origins allowed), rate_limit_per_minute INTEGER default 10, max_conversation_length INTEGER default 100, require_email BOOLEAN default false, credit_source TEXT with CHECK ('tenant', 'visitor'), monthly_credit_budget INTEGER nullable, max_credits_per_visitor_session INTEGER default 50, max_credits_per_visitor_day INTEGER default 100, is_active BOOLEAN, timestamps.

Index: `(tenant_id, is_active)`.

**Table: `conversation_artifacts`** — Depends on conversations and messages.

varchar(36) PK, conversation_id INTEGER NOT NULL FK to conversations ON DELETE CASCADE, message_id INTEGER NOT NULL FK to messages ON DELETE CASCADE, artifact_type TEXT NOT NULL with CHECK ('code', 'react', 'chart', 'table', 'mermaid', 'html', 'markdown', 'svg'), title TEXT, content TEXT NOT NULL (500KB max — app validation), language TEXT, version INTEGER default 1, parent_artifact_id VARCHAR(36) self-referential FK ON DELETE SET NULL (use `(): AnyPgColumn =>` deferred lambda in Drizzle), metadata JSONB, created_at.

Indexes: `(conversation_id)` and `(message_id)`.

### 1.6 Migration 5: Webhooks & Routing

**Table: `webhook_triggers`** — Depends on conversations, agencies, workflows.

varchar(36) PK, tenant_id FK NOT NULL ON DELETE CASCADE, user_id FK NOT NULL ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, auth_type TEXT NOT NULL default 'token' with CHECK ('token', 'hmac_sha256'), auth_secret_encrypted TEXT NOT NULL, target_type TEXT NOT NULL with CHECK ('chat', 'agency', 'workflow'), target_conversation_id INTEGER FK nullable ON DELETE SET NULL, target_agency_id VARCHAR(36) FK nullable ON DELETE SET NULL, target_workflow_id INTEGER FK nullable ON DELETE SET NULL (workflows.id is serial/INTEGER), payload_template JSONB default '{}' (max 2000 chars), rate_limit_per_minute INTEGER default 10, monthly_trigger_budget INTEGER, is_active BOOLEAN, total_triggers INTEGER default 0, last_triggered_at, timestamps.

Index: `(tenant_id, is_active)`.

**Table: `webhook_trigger_logs`** — Consider SERIAL PK for append-heavy table.

varchar(36) PK, trigger_id FK NOT NULL ON DELETE CASCADE, request_method TEXT, request_headers_safe JSONB (allowlist: Content-Type, User-Agent, X-Forwarded-For only), request_body_hash VARCHAR(64) (SHA-256), request_body_size INTEGER, extracted_variables JSONB (strip secret patterns before storage), source_ip_masked TEXT (/24 prefix only), status TEXT NOT NULL with CHECK ('success', 'auth_failed', 'rate_limited', 'target_error', 'credit_insufficient'), target_execution_id TEXT, credits_consumed NUMERIC(12,4) default 0, error_message TEXT, processing_time_ms INTEGER, created_at.

Index: `(trigger_id, created_at DESC)`.

**Table: `channel_routing_rules`** — Depends on agencies, persona_templates.

varchar(36) PK, tenant_id FK NOT NULL (CASCADE), name TEXT NOT NULL, description TEXT, priority INTEGER default 50, is_active BOOLEAN, conditions JSONB NOT NULL (validated against Zod schema on save), target_type TEXT NOT NULL with CHECK ('agency', 'chat', 'workflow'), target_agency_id FK nullable ON DELETE SET NULL, target_persona_id FK nullable ON DELETE SET NULL, target_workflow_id INTEGER FK nullable ON DELETE SET NULL, total_matches INTEGER, last_matched_at, timestamps.

Index: `(tenant_id, is_active, priority DESC)` — **critical** since evaluated on every inbound channel message.

### 1.7 Voice Consent Column

- `users.voiceConsentGrantedAt` — TIMESTAMPTZ, nullable (NULL = not consented)

---

## Section 2: F08 — AI Persona System

### 2.1 Persona Service

Create `apps/web/server/services/personaService.ts` as a shared module. This service provides persona CRUD and the resolution function used by both `chatService.ts` and `memoryService.ts`.

**Resolution function** `resolvePersona(conversation, user, tenant, widgetId?)`:
1. If `conversation.personaId` is set → return that persona
2. If `widgetId` is provided and widget has `defaultPersonaId` → return widget persona
3. If `user.defaultPersonaId` is set → return user's default
4. If `tenant.defaultPersonaId` is set → return tenant's default
5. Return platform default (hardcoded constant)

At each step, when loading a persona by ID, validate `persona.tenantId === conversation.tenantId` for tenant-scoped personas. Platform-scope personas (tenantId=null) are accessible to all tenants.

### 2.2 Chat Context Integration

Modify `buildChatContext()` in `chatService.ts`:
- Add optional `tenantId` parameter to signature
- Call `personaService.resolvePersona()` early in the function
- Prepend `persona.systemPromptPrefix` before existing system prompt
- Append response style instructions based on `persona.responseStyle`
- Append restrictions as bullet points

**Critical: Also modify** `memoryService.ts` which has an independent `buildChatContext()` (~line 668). This function must also resolve and inject persona. Both should call the shared `personaService.resolvePersona()`.

Update all callers of `buildChatContext()`:
- `chatService.ts` (primary)
- `memoryService.ts` (independent copy)
- `channelGateway.ts` (line ~381, passes to chatService version)

### 2.3 Agency Integration

Modify `agencyStreamProxy.ts`: Before calling the Python backend for an agency run, resolve the persona for the current conversation/tenant. Pass `persona_prefix` string in the run config payload.

Modify `python-backend/app/services/agency_swarm_adapter.py`: In `create_agent()`, check for `persona_prefix` in run config. If present, prepend to `agent.instructions`.

### 2.4 Prompt Injection Mitigation

In personaService's CRUD operations:
- `system_prompt_prefix`: Max 2000 chars, strip consecutive newlines >2, block known jailbreak patterns (`[SYSTEM]`, `[INST]`, `---`, `###` at line start)
- `restrictions[]`: Max 20 entries, max 500 chars each, escape YAML separators
- Wrap persona content in structural delimiters: `[PERSONA START]...[PERSONA END]`

RBAC enforcement in tRPC router:
- scope='platform': CREATE/UPDATE/DELETE requires `admin` role (note: `super_admin` does not exist in the current `roleEnum` which only has `user`, `admin`, `domain_admin`)
- scope='tenant': requires `domain_admin` for own tenant
- scope='user': requires owning user

### 2.5 Seed Data

Insert 6 platform-scope personas (English-primary) after migration:
1. SmartSpec Default (friendly, auto) — helpful, concise, markdown-friendly
2. Professional Advisor (formal, auto) — business-appropriate, structured
3. Creative Partner (creative, auto) — imaginative, expressive
4. Technical Expert (technical, auto) — precise, code-heavy
5. Thai Assistant (friendly, th) — always responds in Thai
6. Concise Bot (casual, auto) — ultra-short answers

### 2.6 Frontend Components

- `PersonaSelector.tsx` — Dropdown in conversation header. Lists user's own personas + tenant personas + platform personas. Changes `conversation.personaId` via mutation.
- `PersonaSettings.tsx` — User settings page. CRUD for user-scope personas. Set default persona.
- `AdminPersonas.tsx` — Admin page. Manage tenant-scope personas. Preview token overhead.

### 2.7 tRPC Router

Create `server/routers/persona.ts`:
- `list` — query user's available personas (own + tenant + platform scope)
- `getById` — single persona with ownership check
- `create` — create persona in user/tenant/platform scope (RBAC enforced)
- `update` — update with sanitization
- `delete` — delete with scope-based RBAC
- `setUserDefault` — set user.defaultPersonaId
- `setTenantDefault` — set tenant.defaultPersonaId (domain_admin only)

---

## Section 3: F07 — Per-Response Cost Display

### 3.1 Backend: TraceId Propagation

**CRITICAL (from review):** `costTracker.logRequest()` does NOT accept or generate a traceId. The `providerUsageLog` table has a `traceId` column, but `logRequest()` does not populate it. The traceId is generated elsewhere (likely via `getTraceId()` from trace context or correlation ID middleware).

**Required changes:**
1. Add `traceId: string` parameter to `costTracker.logRequest()` and write it to `providerUsageLog.traceId`
2. Identify where traceId is generated in the request lifecycle (check `correlationIdMiddleware` in `_core/index.ts`)
3. Pass the traceId through: `chatService.processMessage()` → LLM call → `costTracker.logRequest({ ..., traceId })` → also write same traceId to `messages` table
4. The traceId must be the same value in both `providerUsageLog` and `messages` to enable the JOIN for cost display

### 3.2 tRPC Query

Add `getMessageCost` to `server/routers/chat.ts`:
- Input: `{ messageId: z.number() }`
- Join: `messages.traceId → providerUsageLog.traceId`
- **Ownership check:** Verify message belongs to a conversation owned by `ctx.userId` (or ctx.userId has admin role)
- **Role-based response:** If user role is NOT admin/domain_admin, omit `costUsd` from response (return only `creditsUsed`)
- Return `MessageCostInfo` shape: model, provider, inputTokens, outputTokens, totalTokens, creditsUsed, costUsd (admin only), responseTimeMs, wasFallback, fallbackFrom

### 3.3 Frontend Component

Create `MessageCostBadge.tsx`:
- Compact display below AI messages: `Claude Sonnet · 1.2K tokens · 3 credits · 1.4s`
- Expandable: Click to show full breakdown (input/output tokens, cost USD if admin, provider, fallback info)
- **Lazy-loaded:** Only fetches cost data via `getMessageCost` when user clicks/expands (not on every message render)
- Use TanStack Query with `enabled: isExpanded` pattern

Add to `Chat.tsx` and `AgencyChat.tsx`: Render `<MessageCostBadge messageId={msg.id} />` below each assistant message.

---

## Section 4: F04 — Canvas / AI Artifacts

### 4.1 Artifact Parser

Create `apps/web/server/services/artifactParser.ts`:

Parse AI response text for code fence blocks with `artifact:TYPE` markers. Extract each artifact block into a structured object with type, content, title (optional), and language (for code type).

On parse failure: log warning via auditLogger, skip the artifact block, render the raw text. **Never crash the response** due to parsing issues.

### 4.2 Chat Context Modification

Modify `chatService.ts` → `buildChatContext()`: When the canvas feature flag is enabled for the tenant (`tenants.settings.featureFlags.canvas === true`), inject an instruction into the system prompt explaining the artifact format: "When generating charts, tables, code, or interactive content, use the artifact format: \`\`\`artifact:TYPE ... \`\`\`"

### 4.3 Artifact Storage

Dual-store strategy:
- `messages.artifacts` JSONB (existing) — for inline code/markdown/mermaid (simple types that don't need versioning)
- `conversationArtifacts` table (new) — for versioned/interactive types (react, html, chart) that support editing and version history

When an artifact is created from a message:
1. Parse the artifact blocks from the LLM response
2. For simple types: store in `messages.artifacts` as before
3. For versioned types: INSERT into `conversationArtifacts` with version=1
4. When user edits an artifact: INSERT new row with `parent_artifact_id` pointing to previous version, increment version number

### 4.4 tRPC Endpoints

Add to `server/routers/chat.ts` (or create `server/routers/artifact.ts`):
- `getArtifacts` — list artifacts for a conversation. **Must join through conversations and validate tenantId + userId ownership** (never allow artifact retrieval by ID alone)
- `getArtifactVersions` — version history for a specific artifact chain
- `updateArtifact` — create new version with updated content

### 4.5 Sandbox Domain Setup

Configure `sandbox.smartaihub.app` in Nginx:
- Serve the artifact rendering page from a separate origin
- Set response headers: `Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`
- Note: `form-action 'none'` prevents form submission to external URLs (important since iframe sandbox uses `allow-forms`)
- The sandbox page is a minimal HTML shell with a postMessage listener that receives artifact content from the parent

### 4.6 Frontend Components

**CanvasPane.tsx** — Main container:
- Resizable split pane layout (chat left, canvas right)
- Shows latest artifact or user-selected artifact from history
- Only renders when at least one artifact exists in the conversation

**Per-type renderers** (`components/canvas/renderers/`):
- `CodeRenderer.tsx` — Syntax highlighting with copy button (use existing code block styling)
- `ChartRenderer.tsx` — Recharts visualization from JSON data
- `MermaidRenderer.tsx` — Mermaid diagram rendering
- `TableRenderer.tsx` — Sortable/filterable data table
- `MarkdownRenderer.tsx` — Rich markdown with LaTeX support
- `SvgRenderer.tsx` — SVG viewer with zoom/pan

**ArtifactSandbox.tsx** — For `react` and `html` types:
- Creates iframe with `sandbox="allow-scripts allow-forms"` (NO allow-same-origin, NO allow-top-navigation)
- Points to `sandbox.smartaihub.app` or uses blob URL as fallback
- Communicates via postMessage with strict origin validation
- Parent sends artifact content → sandbox renders → sandbox reports height/errors back

**Artifact chips** below AI messages: Clickable badges `[📊 Chart] [📋 Table] [💻 Code]` that open the canvas pane to that artifact.

---

## Section 5: F01-A — Channel Adapter Refactor

### 5.1 Adapter Interface & Registry

Create `apps/web/server/services/channelAdapters/` directory:

**`types.ts`** — Define `ChannelAdapter` interface with methods: validateWebhook, parseInbound, sendMessage, formatMessage, generateLinkToken, handleLinkCallback, testConnection, initialize, shutdown. Define `ChannelCapabilities` interface with per-platform limits (maxMessageLength, supportsButtons, etc.).

**`registry.ts`** — Singleton `ChannelAdapterRegistry` with `register(adapter)`, `get(channelType)`, and `getAll()`. Adapters self-register on initialization. If registration fails, log audit event with specific errorCode.

### 5.2 Telegram Adapter Extraction

Extract `telegramService.ts` into `channelAdapters/telegram.ts` implementing the `ChannelAdapter` interface. The existing service has ~480 lines covering message formatting, rate limiting, retry logic, and settings cache. Preserve all existing behavior — this is a refactor, not a rewrite.

Key mapping:
- `validateWebhook()` → extract X-Telegram-Bot-Api-Secret-Token validation from telegramWebhook.ts
- `parseInbound()` → extract update parsing from webhook handler
- `sendMessage()` → wrap existing `sendTelegramMessage()` function
- `formatMessage()` → existing HTML escape + chunking at 4096 chars

### 5.3 Webhook Router Generalization

Refactor `telegramWebhook.ts` to `channelWebhook.ts`:
- New route: `POST /webhooks/:channelType/:connectionId`
- Flow: lookup adapter → `adapter.validateWebhook(req)` → Redis dedup → return 200 → async `adapter.parseInbound(body)` → `channelGateway.ingest(event)`
- Keep `POST /webhooks/telegram/:botId` as alias that routes through the new handler

### 5.4 Gateway Updates

Modify `channelGateway.ts`:
- `emitEgress()`: Replace hardcoded `channelType: "telegram"` checks with adapter registry lookups
- `queryActiveBindings()`: Query all channel types, not just `"telegram"`
- Add `sourceChannel` routing to `ChatIngressEvent`

Modify `deliveryQueue.ts`:
- Add `channelType` to `DeliveryJob` interface
- Replace `sendTelegramMessage()` call with `adapterRegistry.get(job.channelType).sendMessage()`
- Keep DLQ and retry logic as-is (adapter-agnostic)

### 5.5 Telegram Data Migration

Run migration script to copy `telegramConnections` → `channelConnections`:
- `telegramConnections.chatId` → `channel_connections.external_chat_id`
- `telegramConnections.telegramUserId` → `channel_connections.external_user_id`
- `telegramConnections.botId` → `channel_connections.connection_config.bot_id`
- Hardcode `channel_type = 'telegram'`
- `telegramConnections.conversationChannelId` → `channel_connections.active_channel_id`

Enable dual-write: new connections written to both tables. Deprecate old table in Phase 3.

---

## Section 6: F05 — Voice Chat Mode

### 6.1 Voice Gateway

Create `apps/web/server/routes/voiceGateway.ts`:

**Session token flow:**
1. Client calls `POST /api/voice/session` (authenticated) → server generates one-time token with 30s TTL
2. Client connects: `wss://smartaihub.app/api/voice/stream?token=<token>`
3. Server validates token in WebSocket upgrade handler using `SET voice:token:{token} consumed NX EX 30` (atomic — if SET returns nil, token already used → reject)
4. Voice session inherits authenticated user's tenantId and userId

**Concurrency limit:** Max 1 active voice session per user. Redis key `voice:active:{userId}` with TTL=300s. Reject new session if key exists.

**Per-chunk rate limit:** Max 50 audio chunks/second per connection. Track with sliding window counter. If exceeded: send warning frame. If exceeded 3x within 10s: close with code 4003.

**Audio processing:**
- Accept PCM 16-bit, 16kHz mono audio chunks via binary WebSocket frames
- Buffer limit: Max 60 seconds of audio (~1.9MB) before forced STT dispatch
- Hard reject frames >64KB
- Max session duration: 300s, auto-close after timeout

### 6.2 STT/TTS Provider Abstraction

Create `apps/web/server/services/sttService.ts`:
- Provider interface with `transcribe(audioBuffer, options)` method
- Implementations: GroqWhisperProvider, OpenAIWhisperProvider
- Route through Python backend: `POST /api/internal/stt` → `unified_client.py`
- Returns `{ text, language, confidence, duration }`

Create `apps/web/server/services/ttsService.ts`:
- Provider interface with `synthesize(text, options)` method
- Implementations: ElevenLabsProvider (WebSocket streaming), OpenAITTSProvider
- Route through Python backend or direct API call depending on provider
- Returns audio buffer (MP3/PCM)

Add STT endpoint to Python backend: `python-backend/app/api/llm_proxy.py` → `/api/internal/stt` that routes to Groq/OpenAI Whisper via unified_client.

### 6.3 Credit Integration

Add STT/TTS cost calculation to `costTracker.ts`:
- STT: 3 credits/min (0 for Groq free tier). Log to `providerUsageLog` with `sourceType: 'stt'`
- TTS: 5 credits/1K chars. Log with `sourceType: 'tts'`

**Provider IDs:** `providerUsageLog.providerId` is `integer NOT NULL` with a real FK to `llmProviders.id`. STT/TTS providers **must** be seeded into `llmProviders` table (see Section 1.1b). Use the seeded provider IDs when logging STT/TTS usage.

**Mid-session credit depletion:**
1. Complete current STT (already in-flight)
2. Generate LLM response text but skip TTS
3. Send text-only response with system message
4. Close WebSocket with code 4002 ("credit_exhausted")

### 6.4 PDPA/GDPR Consent

- Before voice mode activation (first time per user): display consent modal explaining audio processing
- Store consent: update `users.voiceConsentGrantedAt` timestamp
- Consent withdrawal: set `voiceConsentGrantedAt` to NULL → publish `voice:consent:revoked:{userId}` via Redis pub/sub → voiceGateway closes matching sessions
- Audio is NOT persisted — only transcribed text stored as conversation message

### 6.5 Frontend

Create `VoiceChat.tsx`:
- MediaRecorder API for audio capture
- WebSocket connection to voice gateway
- VAD using `@ricky0123/vad-web` for auto-detect mode
- Audio playback via `AudioContext` with streaming support
- UI: floating microphone button, waveform visualization during recording/playback
- Modes: push-to-talk (default), auto-detect (VAD), text+voice hybrid

Create `useVoiceChat.ts` hook:
- Voice session lifecycle management
- Mode switching, recording state, playback state
- Credit balance monitoring
- Consent check before activation

### 6.6 Agency/Workflow Tools

Add `builtin-voice` tool to agency.ts BUILTIN_TOOLS:
- toolId: 'builtin-voice', riskLevel: 'medium'
- configSchema: allowedModes (stt/tts), defaultVoice, maxAudioDurationSec, maxTextLength
- Endpoint: `/api/internal/tools/voice`

Register in Python: `_BUILTIN_ENDPOINTS['builtin-voice'] = '/api/internal/tools/voice'`

Create VoiceExecutor workflow node: node type 'voice', inputs (mode, audio_url or text), outputs (text, audio_url, duration, confidence).

---

## Section 7: F03 — Browser Automation Tool

### 7.1 Docker Sandbox Setup

Create a Playwright Docker container configuration:
- Base image: `mcr.microsoft.com/playwright:v1.50.0-noble`
- Run as non-root user (`pwuser`) with seccomp profile for Chromium sandbox
- Required flags: `--init` (zombie prevention), `--ipc=host` (Chromium OOM prevention)
- Memory limit: 512MB per container
- Network: Isolated Docker network with iptables rules blocking RFC-1918 outbound (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)

### 7.2 Browser Tool Implementation

Create `python-backend/app/services/tools/browser_tool.py`:
- Actions: `navigate(url)`, `click(selector)`, `fill(selector, value)`, `screenshot()`, `extractText(selector)`, `extractLinks()`, `waitForSelector(selector)`, `scrollTo(position)`
- **No `executeScript(js)`** — removed per SEC-05
- SSRF protection (3-layer): URL validation (block private IPs), DNS resolution check, container iptables
- Ephemeral sessions (no cookie persistence across runs)
- Timeouts: 60s per action, 300s per session
- Concurrent limit: Max 1/user, 2/tenant (reduced from spec's 3 for resource constraints). Enforce via Redis semaphore.

Output size limits:
- extractedText: 50,000 chars (truncation notice if exceeded)
- html: 100,000 chars
- links: max 200
- screenshots: max 5 per session, max 1MB each
- Total output per call: 200KB hard cap

### 7.3 Credit Pre-Reservation

Implement the pre-reservation pattern in the Node.js endpoint `/api/internal/tools/browser`:
1. Pre-reserve: `creditService.deductCredits({ sourceType: 'browser_automation', amount: 20, traceId })` — atomically reserves max cost
2. Execute browser actions in sandbox
3. Post-execute: if actualCost < 20, `creditService.refundCredits({ userId, amount: 20 - actualCost, description: 'Browser session unused credits refund' })`
4. On total failure: full refund via `creditService.refundCredits()` (note: the actual API requires `userId`, `amount`, and `description` — it does not accept `traceId`)

Failure paths: insufficient credits → error response, sandbox spawn failure → full refund, timeout → partial refund + partial results, concurrent limit → no reservation attempted.

### 7.4 Tool Registration

Add `builtin-browser` to agency.ts BUILTIN_TOOLS with `riskLevel: 'high'` and configSchema for maxPageLoads, timeout, screenshotQuality, allowedDomains (empty = DENY ALL).

Register in Python: `_BUILTIN_ENDPOINTS['builtin-browser'] = '/api/internal/tools/browser'`, `_BUILTIN_RISK_LEVELS['builtin-browser'] = 'high'` (routes to `_execute_sandbox()`).

Create BrowserExecutor workflow node in `python-backend/app/orchestrator/node_executors/integration_executors/browser_executor.py`.

---

## Section 8: F09 — Cross-Agency Communication

### 8.1 Agency Call Tool

Create `python-backend/app/services/tools/agency_call_tool.py`:

1. **Tenant isolation:** Validate target agency belongs to same tenant: `WHERE id = :agencyId AND tenantId = :callerTenantId`. Return generic "Agency not found" if not found (never leak other tenants' agencies).
2. **Permission check:** Independently verify calling user has execute permission on target agency (same RBAC as normal agency run). The `allowedAgencies` list in toolConfig is user-editable and cannot be the sole gate.
3. **Depth tracking:** Check `currentDepth >= maxDepth` (default 3). Reject if exceeded.
4. **Loop prevention:** Track `callChain` in Redis (key: `agency:callchain:{parentRunId}`, TTL=600s). Reject if target agency already in chain. Store in Redis (not in-memory) to survive worker restarts.
5. **Budget cap:** Per-parent-run credit budget of 500 credits. Track cumulative spend across sub-agency calls.
6. **Concurrency:** Max 2 concurrent sub-agency calls per parent run (Redis semaphore).
7. Create sub-run with `parentRunId` tracking, wait for completion with timeout (120s).

Add `builtin-agency-call` to agency.ts BUILTIN_TOOLS. configSchema: allowedAgencies (empty = DENY ALL), maxDepth (default 2), timeout (default 120000ms).

---

## Section 9: F01-B — WhatsApp + LINE Adapters

### 9.1 WhatsApp Adapter

Create `channelAdapters/whatsapp.ts`:
- Uses official Meta Cloud API (HTTP only). **whatsapp-web.js is BANNED** (ToS violation, account ban risk).
- Webhook: HMAC-SHA256 signature verification using `crypto.timingSafeEqual()`
- Inbound: text, image, audio, video, document, location messages
- Outbound: Message templates (required outside 24h window), free-form within window
- Linking: Phone number verification flow
- Rate limit: start at Tier 1 (1K unique users/day)
- ExternalUserId (phone numbers): Consider hashing for privacy (NEW-SEC-16)

### 9.2 LINE Adapter

Create `channelAdapters/line.ts`:
- Uses `@line/bot-sdk` (version pinned)
- Webhook: HMAC-SHA256 with channel secret. **Verify signature BEFORE parsing/deserializing body**
- Module channels for multi-tenant (one app → multiple LINE Official Accounts)
- Short-lived tokens with automatic refresh
- User IDs differ per LINE Official Account (never assume stable across tenants)
- Inbound: text, image, video, audio, sticker, location, flex messages
- Outbound: text, flex messages, quick replies, rich menus

---

## Section 10: F02 — Embeddable Chat Widget

### 10.1 Widget Build

Create `apps/web/client/widget/` as a separate Vite entry point:
- Independent build (~50KB gzipped)
- Minimal React app with chat interface + tenant branding
- Tree-shaken, no dependency on main app bundle
- Configure in `vite.config.ts` as additional build target

### 10.2 Embed Script

`/widget/v1/embed.js` — Lightweight loader:
- Creates iframe pointing to `/widget/v1/chat?token=<signed-init-token>`
- **Signed init token** (not plaintext tenantId/widgetId in URL): client calls `/api/widget/init` → server returns HMAC-signed token containing `{ tenantId, widgetId, visitorSessionId, iat, exp }`
- Token TTL: 24 hours. Stored in iframe's sessionStorage (not localStorage, not parent page).
- postMessage communication between parent and iframe with strict origin validation on both sides

### 10.3 Widget Gateway

Create `apps/web/server/routes/widgetGateway.ts`:
- WebSocket endpoint: `wss://smartaihub.app/widget/v1/ws`
- Rate limiting: per-visitor IP, 10 msgs/min (configurable per widget)
- Messages flow through `channelGateway.ingest()` with `channelType: 'widget'`

**Anonymous user strategy:** Use per-tenant system user (`users.email = 'widget-system@{tenantId}.internal'`, `users.role = 'user'`). Note: `role: 'system'` does not exist in the roleEnum (`user`, `admin`, `domain_admin` only). To prevent login with this account, set a random bcrypt-hashed password that is never revealed, and add application-level checks in the login flow to reject emails matching `widget-system@*.internal` pattern. Auto-created when first widget activated. Visitor tracked via `visitorSessionId` in conversation metadata.

**Credit deduction:**
- `credit_source: 'tenant'`: Deduct from `tenants.ownerId`. **Must check ownerId is not null** before deduction (throw TRPCError PRECONDITION_FAILED if null).
- Per-visitor caps: session cap and daily cap via Redis INCR counters
- Monthly budget: atomic check via Redis INCR

### 10.4 Widget Admin UI

Create `AdminWidgets.tsx`:
- Widget CRUD with embed code generator
- Theme customization (validate against key allowlist, sanitize string values)
- Domain allowlist configuration
- Credit budget settings
- Conversation viewer for widget sessions

---

## Section 11: F06 — Inbound Webhook & Event Triggers

### 11.1 Webhook Endpoint

Create `apps/web/server/routes/webhookTrigger.ts`:
- Route: `POST /api/webhooks/trigger/:triggerId`
- **Processing order (strictly enforced):**
  1. Auth verification (token comparison via `crypto.timingSafeEqual()` or HMAC-SHA256 with timestamp)
  2. Rate limit check
  3. Template substitution (only AFTER auth succeeds — prevents oracle attacks)
  4. Target dispatch (chat/agency/workflow)

### 11.2 Auth & Security

HMAC replay protection:
- Require `X-Webhook-Timestamp` header (unix epoch seconds)
- Reject if `|now - timestamp| > 300` seconds
- HMAC input: `HMAC-SHA256(secret, timestamp + "." + body)`
- Deduplicate: Redis SET NX key `webhook:dedup:{triggerId}:{timestamp}:{bodyHash}` with 5-min TTL (include SHA-256 body hash to avoid dropping legitimate calls within the same second)

Template substitution: Restricted variable-only regex replacement (NOT Jinja2). Allowlisted patterns: `{{event.type}}`, `{{event.data}}`, etc. Max 2000 chars. Reject templates with non-allowlisted patterns at save time.

Extracted variables: Strip values matching secret patterns (`/^(sk-|ghp_|xoxb-|Bearer )/i`) before storage in logs.

### 11.3 Webhook Test UI

Create `WebhookTriggers.tsx` with:
- Trigger CRUD with test endpoint (send a test payload)
- Request inspector showing recent payloads, auth results
- Delivery logs with processing status, credits consumed, timing
- Payload preview with variable highlighting

---

## Section 12: F10 — Channel Router

### 12.1 Router Service

Create `apps/web/server/services/channelRouterService.ts`:
- `evaluateRules(event: ChatIngressEvent, tenantId: string)` → returns matched rule or null
- Load rules for tenant from DB, ordered by priority DESC
- Evaluate conditions (ALL must match for a rule to fire)
- Allowed operators: eq, contains, startsWith, endsWith, in (max 50 values)
- **No regex** (ReDoS risk) — use string matching operators only

### 12.2 Integration Point

Modify `channelGateway.ts` → `ingest()`:
- Before processing: call `channelRouterService.evaluateRules(event, tenantId)`
- If matched: override routing target (agency/persona/workflow)
- Cache active rules per tenant in Redis with short TTL (30s) since this runs on every inbound message

### 12.3 Admin UI

Create `AdminChannelRouter.tsx`:
- Visual rule builder with condition editor
- Priority drag-and-drop ordering
- Rule testing sandbox: paste a sample message → show which rule matches
- Match statistics (total_matches, last_matched_at)

---

## Section 13: F01-C — Slack + Discord Adapters

### 13.1 Slack Adapter

Create `channelAdapters/slack.ts`:
- Uses `@slack/bolt` SDK (version pinned)
- Multi-tenant via OAuth with `installationStore`: storeInstallation, fetchInstallation, deleteInstallation
- Signing secret verification (HMAC-SHA256) using `crypto.timingSafeEqual()`
- Block Kit for rich message formatting
- **Beware 2025 rate limit change**: Non-Marketplace apps limited to 1 req/min for conversations.history. Design around this limitation.

### 13.2 Discord Adapter

Create `channelAdapters/discord.ts`:
- Uses `discord.js` v14 (version pinned)
- **Persistent WebSocket** via BullMQ worker process (not HTTP webhook)
- GatewayIntentBits: Guilds + GuildMessages (only add MessageContent if truly needed)
- Slash commands preferred over message content parsing
- Multi-tenant inherent: one bot serves all guilds, per-guild config in DB keyed by guildId
- Share worker process with other background tasks to minimize resource overhead
- Sharding preparation: not needed until 2,500+ guilds, but design adapter to be sharding-aware

---

## Section 14: Feature Flags & Tenant Configuration

### 14.1 Feature Flag Design

All features gated by `tenants.settings.featureFlags` (existing JSONB column):

```typescript
interface TenantFeatureFlags {
  multiChannel: boolean;     // F01 (default: false)
  chatWidget: boolean;       // F02 (default: false)
  browserTool: boolean;      // F03 (default: false)
  canvas: boolean;           // F04 (default: false)
  voiceChat: boolean;        // F05 (default: false)
  webhookTriggers: boolean;  // F06 (default: false)
  costDisplay: boolean;      // F07 (default: true)
  personaSystem: boolean;    // F08 (default: true)
  crossAgency: boolean;      // F09 (default: false)
  channelRouter: boolean;    // F10 (default: false)
}
```

### 14.2 Security

- Feature flag keys validated against server-side allowlist in tRPC `updateTenantSettings` mutation
- `domain_admin` can toggle existing flags for own tenant only
- Adding NEW flag keys or setting flags on other tenants requires admin/super_admin
- Strip unrecognized keys from featureFlags object before saving

### 14.3 Enforcement

Each feature checks its flag at:
- **tRPC router level**: Middleware checks flag before executing any procedure
- **Express route level**: Webhook and gateway routes check flag early
- **UI level**: Conditionally render feature UI based on flag

When flag is false: UI hidden, endpoints return 403, no new resources created. Existing data preserved for re-enable.

---

## Section 15: Security Checklist

### Pre-Implementation Blockers
- [ ] No `auth_type: 'none'` for webhooks (CHECK constraint)
- [ ] No Jinja2 templates (regex-only variable substitution)
- [ ] Tenant isolation on cross-agency calls (independent RBAC check)
- [ ] No `executeScript(js)` in browser tool (removed entirely)
- [ ] WebSocket voice auth via one-time session token (SET NX atomic)

### Per-Feature Security
- [ ] All HMAC verification uses `crypto.timingSafeEqual()`
- [ ] All secrets stored encrypted via crypto.ts (AES-256-GCM)
- [ ] Canvas iframe: `sandbox="allow-scripts"` without `allow-same-origin`; CSP `connect-src: 'none'`
- [ ] Widget postMessage: both sides validate origin
- [ ] Browser SSRF: 3-layer protection (app + DNS + container network)
- [ ] Feature flags: server-side allowlist prevents privilege escalation
- [ ] Persona prompts: sanitized for injection patterns
- [ ] Webhook logs: secret patterns stripped from extracted_variables
- [ ] Voice consent: PDPA/GDPR compliant with immediate withdrawal support
- [ ] Browser sessions: Redis semaphore for concurrent limits
- [ ] Voice sessions: Redis key for concurrent limits
- [ ] Widget visitor: HMAC-signed session, per-visitor rate limits

---

## Section 16: Resource Optimization

Given the constrained server environment:

### Conservative Concurrency
- Browser sessions: 1/user, 2/tenant max
- Voice sessions: 1/user, strict 5-min limit
- Discord bot: shared BullMQ worker (not dedicated process)

### Shared Workers
- Single BullMQ worker process handles: channel delivery, webhook dispatch, voice processing
- Celery workers: shared across browser automation, media generation, voice

### Lazy Initialization
- Widget WebSocket connections: initialize on first message, not on page load
- Channel adapters: initialize only for configured channels
- Browser sandbox: spin up container on demand, tear down after session

### Caching
- Persona resolution: cache effective persona per conversation (invalidate on change)
- Channel routing rules: Redis cache per tenant (30s TTL)
- Feature flags: cache per request (no additional DB query per feature check)

---

## Section 17: Nginx Configuration Changes

Several features require Nginx routing updates in `nginx/conf.d/dev-host.conf`:

### 17.1 WebSocket Proxying

Add WebSocket upgrade support for voice and widget endpoints:

```nginx
# Voice WebSocket
location /api/voice/stream {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 300s;  # 5-minute voice session max
}

# Widget WebSocket
location /widget/v1/ws {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 600s;  # Widget sessions can be long-lived
}
```

### 17.2 Sandbox Subdomain

Add a server block for `sandbox.smartaihub.app`:

```nginx
server {
    listen 443 ssl;
    server_name sandbox.smartaihub.app;
    # SSL certs (same wildcard cert or separate)
    # Serve the artifact sandbox HTML page
    # Set strict CSP headers at Nginx level as defense-in-depth
}
```

### 17.3 Channel Webhook Route

The new generalized webhook route `POST /webhooks/:channelType/:connectionId` should be proxied alongside the existing Telegram webhook route.

---

## Section 18: Artifact Type Mapping (Definitive)

To resolve the overlap between `messages.artifacts` and `conversationArtifacts`:

| Artifact Type | Storage | Reason |
|---------------|---------|--------|
| `code` | `messages.artifacts` | Simple display, no versioning needed |
| `markdown` | `messages.artifacts` | Simple render, no interactivity |
| `mermaid` | `messages.artifacts` | Static diagram, no editing |
| `svg` | `messages.artifacts` | Static image, no editing |
| `react` | `conversationArtifacts` | Interactive, needs sandboxing + versioning |
| `html` | `conversationArtifacts` | Interactive, needs sandboxing + versioning |
| `chart` | `conversationArtifacts` | Users may edit data, needs versioning |
| `table` | `conversationArtifacts` | Users may sort/filter/edit, needs versioning |

When `artifactParser.ts` encounters an artifact, it checks the type against this mapping to determine storage destination.

---

## Section 19: Feature Flag Mutation Design

The `tenants.settings` column is a loose JSONB with `[key: string]: any` typing. To safely manage feature flags:

Create a dedicated tRPC mutation `updateFeatureFlags` (not reuse the generic settings mutation):
1. Read current `tenants.settings` from DB
2. Validate incoming flag keys against the `TenantFeatureFlags` allowlist
3. Strip any unrecognized keys
4. Merge only the `featureFlags` sub-key (preserving all other settings keys)
5. Write back the full settings object

RBAC:
- `domain_admin` can toggle existing flags for own tenant only
- Adding new flag keys or modifying flags on other tenants requires `admin` role
- The generic `updateTenantSettings` mutation must be audited to ensure it cannot overwrite featureFlags directly

---

## Section 20: Channel Routing Performance

To prevent routing evaluation from becoming a bottleneck on the message processing hot path:

- **Rule count cap:** Max 50 active rules per tenant. Enforce in tRPC create/update mutation.
- **Short-circuit evaluation:** Rules are priority-ordered (DESC). Stop evaluating on first match.
- **Redis cache:** Cache rules per tenant with 30s TTL. Invalidate on rule create/update/delete.
- **Lazy loading:** Only load rules when a tenant actually has the channelRouter feature flag enabled.

---

## Section 21: Review Integration Notes

This plan was updated based on an independent Opus review that identified 29 findings. Key changes:
- Added explicit PostgreSQL enum migration workaround (Section 1.1)
- Added mandatory llmProviders seed data for STT/TTS (Section 1.1b)
- Fixed costTracker traceId propagation (Section 3.1)
- Corrected super_admin → admin for persona RBAC (Section 2.4)
- Added conversations.tenantId backfill verification (Section 1.2)
- Added Nginx configuration section (Section 17)
- Added definitive artifact type mapping (Section 18)
- Added feature flag mutation design (Section 19)
- Added CSP form-action directive (Section 4.5)
- Fixed webhook dedup key with body hash (Section 11.2)
- Fixed refundCredits API calling convention (Section 7.3)
- Fixed widget system user role (Section 10.3)
