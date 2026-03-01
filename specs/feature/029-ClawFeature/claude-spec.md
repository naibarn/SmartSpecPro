# 02-ClawFeature: Synthesized Implementation Specification

## Source Documents
- **Raw Spec:** `spec.md` (v1.4.0, quad-reviewed, 160 findings resolved)
- **Research:** `claude-research.md` (codebase analysis + web best practices)
- **Interview:** `claude-interview.md` (12 questions on priorities, constraints, preferences)

---

## 1. Project Overview

Implement 10 platform enhancements for SmartSpecPro inspired by OpenClaw feature analysis. All features integrate with existing LLM Gateway, Credit System, Channel Gateway, and multi-tenant architecture.

### Implementation Order (Confirmed: Spec Phase 1-3)
1. **Phase 1 (Weeks 1-3):** F08 Persona System + F07 Cost Display → F04 Canvas → F01-A Channel Refactor
2. **Phase 2 (Weeks 4-7):** F05 Voice Chat → F03 Browser Tool + F09 Cross-Agency → F01-B WhatsApp+LINE → F02 Widget + F06 Webhooks
3. **Phase 3 (Weeks 8-9):** F10 Channel Router → F01-C Slack+Discord

### Key Constraints (from Interview)
- **Resource-constrained server** (limited RAM + CPU) — conservative concurrent session limits, shared workers, lazy initialization
- **Scale target:** Medium (20-100 tenants, 1K-10K concurrent users)
- **All 4 messaging platforms** API credentials available
- **Separate Vite build** for widget
- **Separate subdomain** (`sandbox.smartaihub.app`) for canvas artifacts
- **Multi-provider voice** abstraction (Groq + OpenAI + ElevenLabs)
- **Immediate Telegram migration** to channelConnections + dual-write
- **English-primary** persona seed data

---

## 2. Feature Specifications

### F08: AI Persona System (Week 1)

**Goal:** Multi-layer personality system (Tenant Default → User Default → Conversation Override) consistent across all touchpoints.

**Database:**
- New table `persona_templates` (varchar(36) PK, tenant_id FK nullable, user_id FK nullable, system_prompt_prefix TEXT 2000 max, tone CHECK, scope CHECK, restrictions TEXT[] max 20 entries)
- ALTER users ADD default_persona_id FK
- ALTER tenants ADD default_persona_id FK
- ALTER conversations ADD persona_id FK
- ALTER conversations ADD tenant_id FK (backfill from users.tenantId)

**Implementation:**
- New `personaService.ts` — shared resolution logic callable from chatService and memoryService
- `resolvePersona(conversation, user, tenant, widgetId?)` — 4-level priority chain
- Modify `buildChatContext()` in both chatService.ts AND memoryService.ts (~line 668) to inject persona prefix
- Modify `agencyStreamProxy.ts` to pass persona_prefix to Python backend
- Modify `agency_swarm_adapter.py` to prepend persona to agent instructions
- RBAC: platform→super_admin, tenant→domain_admin, user→self only
- Prompt injection mitigation: sanitize prefix, block jailbreak patterns, structural delimiters

**Seed data (English-primary):**
- SmartSpec Default (friendly), Professional Advisor (formal), Creative Partner (creative), Technical Expert (technical), Concise Bot (casual), Thai Assistant (friendly, th)

**UI:**
- PersonaSelector.tsx — dropdown in conversation header
- PersonaSettings.tsx — user persona management
- AdminPersonas.tsx — admin/domain-admin management

### F07: Per-Response Cost Display (Week 1)

**Goal:** Show token count, credit cost, model, and latency for each AI response in chat UI.

**Database:**
- ALTER messages ADD traceId VARCHAR(32) (matches providerUsageLog.traceId)
- CREATE INDEX idx_messages_traceid ON messages("traceId")

**Implementation:**
- New tRPC query `getMessageCost` — JOIN messages → providerUsageLog via traceId with ownership check
- costUsd omitted for non-admin users (NEW-SEC-04)
- Ensure chatService.ts writes traceId to messages after costTracker.logUsage()

**UI:**
- MessageCostBadge.tsx — compact badge: `Claude Sonnet · 1.2K tokens · 3 credits · 1.4s`
- Lazy-loaded on expand (not on every message load)
- Add to Chat.tsx and AgencyChat.tsx

### F04: Canvas / AI Artifacts (Week 2)

**Goal:** Interactive Canvas pane for AI-generated content: code, React components, charts, tables, Mermaid, HTML, markdown, SVG.

**Database:**
- New table `conversation_artifacts` (varchar(36) PK, conversation_id FK INTEGER, message_id FK INTEGER, artifact_type CHECK, content TEXT 500KB max, version INTEGER, parent_artifact_id self-ref with deferred lambda)

**Architecture:**
- `artifactParser.ts` — parse AI responses for `artifact:TYPE` code fence blocks
- On parse failure: log warning, skip artifact, render raw text (never crash)
- Modify `buildChatContext()` — inject artifact format instruction when canvas feature flag enabled
- Sandbox: `sandbox.smartaihub.app` with iframe `sandbox="allow-scripts"` (NO allow-same-origin)
- CSP: `default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'`
- Dual-store: `messages.artifacts` for simple types, `conversationArtifacts` for versioned/interactive

**UI:**
- CanvasPane.tsx — resizable split pane (chat left, canvas right)
- Per-type renderers: ChartRenderer, CodeRenderer, MermaidRenderer, ReactSandbox, etc.
- ArtifactSandbox.tsx — sandboxed iframe with postMessage communication
- Artifact chips below AI messages

### F01-A: Channel Adapter Refactor (Week 3)

**Goal:** Extract Telegram code into adapter pattern. Prepare for multi-channel.

**Architecture:**
- New `channelAdapters/` directory: types.ts, registry.ts, telegram.ts
- ChannelAdapter interface: validateWebhook, parseInbound, sendMessage, formatMessage, generateLinkToken, handleLinkCallback, testConnection, initialize, shutdown
- ChannelCapabilities interface for per-platform limits
- NormalizedConnection interface (externalChatId: string | null per R4-05)
- Generalize webhook route: `POST /webhooks/:channelType/:connectionId`
- Update DeliveryJob with channelType field
- Delivery worker: `adapterRegistry.get(channelType).sendMessage()` instead of hardcoded Telegram

**Database:**
- New table `channelConnections` (varchar(36) PK, tenant_id FK, user_id FK, channel_type CHECK, external_user_id, status CHECK, UNIQUE(tenant_id, channel_type, external_user_id))
- New table `channelCredentials` (varchar(36) PK, tenant_id FK, channel_type CHECK, credentials_encrypted, webhook_secret_encrypted)
- Migrate telegramConnections data immediately (dual-write from day 1)

**Backward compat:**
- Keep `POST /webhooks/telegram/:botId` as alias
- Keep `users.telegramChatId` dual-write, deprecate in Phase 3

### F05: Voice Chat Mode (Week 4)

**Goal:** Real-time voice conversation: User speaks → STT → LLM → TTS → audio playback.

**Architecture:**
- Chained pipeline (STT → LLM → TTS) for cost predictability
- Provider abstraction layer supporting Groq Whisper, OpenAI Whisper (STT) and ElevenLabs, OpenAI TTS (TTS)
- One-time session token: POST /api/voice/session → 30s TTL, consumed atomically via SET NX
- Max 1 voice session per user (Redis key with TTL=300s)
- 50 audio chunks/sec rate limit per connection
- 60s audio buffer limit, 300s max session
- PDPA/GDPR consent: modal before first use, stored in users.voiceConsentGrantedAt
- Consent withdrawal: Redis pub/sub → immediate session termination

**Credit integration:**
- STT: 3 credits/min (0 for Groq free); TTS: 5 credits/1K chars
- Seed STT/TTS providers in llmProviders table (verify providerId constraint)
- Mid-session credit depletion: complete STT → skip TTS → text fallback → close 4002

**Agency/Workflow tools:**
- builtin-voice tool (medium risk) for TTS/STT
- VoiceExecutor workflow node

### F03: Browser Automation Tool + F09: Cross-Agency (Week 5)

**F03 Browser:**
- builtin-browser tool (high risk → OpenSandbox)
- Set up Docker-based Playwright sandbox with seccomp profile, non-root user
- SSRF: 3-layer protection (app URL check, DNS resolution, container iptables)
- Max 1 session/user, 2/tenant (reduced from spec's 3 due to resource constraints)
- Credit pre-reservation pattern: reserve max 20 → refund unused
- Output limits: 50K chars text, 100K HTML, 200 links, 5 screenshots

**F09 Cross-Agency:**
- builtin-agency-call tool (medium risk)
- Tenant isolation: target agency must be same tenant
- callChain in Redis (key: `agency:callchain:{parentRunId}`, TTL=600s)
- Max depth 3, 500 credit budget cap, max 2 concurrent sub-calls
- allowedAgencies empty = DENY ALL; independent RBAC check on target

### F01-B: WhatsApp + LINE Adapters (Week 6)

**WhatsApp adapter:**
- Official Meta Cloud API only (whatsapp-web.js BANNED)
- HMAC-SHA256 webhook verification (crypto.timingSafeEqual)
- 24h window management: free-form within window, templates outside
- Rate: Start at Tier 1 (1K users/day)

**LINE adapter:**
- HMAC-SHA256 with channel secret (verify BEFORE parsing body)
- Module channels for multi-tenant
- Short-lived tokens with refresh

### F02: Embeddable Chat Widget + F06: Webhooks (Week 7)

**F02 Widget:**
- Separate Vite build (~50KB gzipped), independent bundle
- embed.js loader → iframe → WebSocket to widgetGateway
- HMAC-signed init token (tenantId+widgetId in payload, 24h TTL)
- postMessage security: both sides validate origin
- Per-tenant system user for anonymous sessions
- Per-visitor rate limits: 10 msgs/min, per-session + per-day credit caps

**F06 Webhooks:**
- POST /api/webhooks/trigger/:triggerId
- Auth: token or hmac_sha256 (never 'none')
- HMAC replay: 5-min timestamp window, Redis dedup
- Template: restricted variable substitution (regex, NOT Jinja2)
- Processing order: 1) auth → 2) rate limit → 3) template → 4) dispatch
- Full test UI with request inspector and delivery logs

### F10: Channel Router (Week 8)

**Goal:** Auto-route inbound channel messages to agencies/workflows/personas based on rules.

- channelRoutingRules table with priority-ordered evaluation
- Conditions: channel_type, message_text (contains/startsWith/endsWith, NO regex), sender_email, time_of_day, etc.
- Validate conditions against Zod schema on save
- Hook into channelGateway.ingest() before processing

### F01-C: Slack + Discord (Week 9)

**Slack:**
- Bolt SDK with multi-tenant OAuth installationStore
- Signing secret verification (HMAC-SHA256)
- Block Kit for rich messages

**Discord:**
- discord.js v14 with GatewayIntentBits
- Persistent WebSocket via BullMQ worker (not HTTP route)
- Slash commands preferred over message content
- Shared process to minimize resource overhead

---

## 3. Database Changes Summary

### New Tables (8)
1. `persona_templates` — F08
2. `channel_connections` — F01
3. `channel_credentials` — F01
4. `chat_widgets` — F02
5. `conversation_artifacts` — F04
6. `webhook_triggers` — F06
7. `webhook_trigger_logs` — F06
8. `channel_routing_rules` — F10

### Columns Added to Existing Tables (6)
1. `users.defaultPersonaId` — F08
2. `users.voiceConsentGrantedAt` — F05
3. `tenants.defaultPersonaId` — F08
4. `conversations.personaId` — F08
5. `conversations.tenantId` — F08 (backfill from users.tenantId)
6. `messages.traceId` — F07

### New creditSourceType Enum Values (4)
- `tts` (Voice Chat, TTS)
- `browser_automation` (Browser tool)
- `widget_chat` (Widget conversations)
- `webhook_chat` (Webhook-triggered chat)

Note: `stt` already exists in enum.

### Migration Order
1. persona_templates (no deps)
2. conversations.tenantId + persona FK columns (depends on persona_templates)
3. channel_connections, channel_credentials (no deps)
4. chat_widgets (depends on persona_templates)
5. conversation_artifacts (depends on conversations, messages)
6. webhook_triggers, webhook_trigger_logs (depends on conversations, agencies)
7. channel_routing_rules (depends on agencies, persona_templates)

---

## 4. Credit System Additions

All features use existing `creditService.deductCredits()` flow. New sourceTypes added to enum. Key patterns:

- **Pre-reservation** (browser): Reserve max → execute → refund unused
- **Per-visitor caps** (widget): Redis INCR for atomic budget tracking
- **Voice credit depletion**: Graceful degradation to text-only
- **Cross-agency budget**: Per-chain cap tracked in Redis

---

## 5. Security Requirements (Consolidated)

### Blockers (Must fix before writing code)
- SEC-01: No `auth_type: 'none'` for webhooks
- SEC-02: No Jinja2 in templates (restricted variable substitution only)
- SEC-03: Tenant isolation on cross-agency calls
- SEC-05: No `executeScript(js)` in browser tool
- SEC-11: WebSocket voice auth via one-time session token

### Critical Security Patterns
- All HMAC verification: `crypto.timingSafeEqual()`
- All webhook secrets: stored encrypted via crypto.ts
- Canvas sandbox: `allow-scripts` WITHOUT `allow-same-origin`; `connect-src: 'none'`
- Widget postMessage: both sides validate origin; signed init token
- Browser SSRF: 3-layer protection (app + DNS + container network)
- Feature flags: server-side key allowlist, domain_admin can toggle existing flags only

---

## 6. Resource Optimization Strategy

Given limited RAM + CPU:
- **Browser sessions:** Max 1/user, 2/tenant (reduced from 3)
- **Voice sessions:** Max 1/user, strict 5-min session limit
- **Discord bot:** Shared BullMQ worker process (not dedicated)
- **Widget WebSocket:** Connection pooling, lazy initialization
- **Workers:** Share BullMQ workers across features (no dedicated per-feature workers)
- **Redis:** Efficient key design with TTLs to prevent memory bloat
- **Playwright containers:** 512MB memory limit, session cleanup on timeout
