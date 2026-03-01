# 02-ClawFeature: TDD Plan

This document mirrors the structure of `claude-plan.md` and defines test stubs to write BEFORE implementing each section. Tests use **Vitest** for TypeScript and **pytest** for Python, following existing project conventions.

**Existing test conventions (from research):**
- Vitest with hoisted mocks (`vi.hoisted()`)
- Module mocks for DB, services, external APIs
- Drizzle ORM operators mocked as spy functions
- Python: pytest with markers (unit, integration, e2e, auth, credits, llm)
- 80% coverage minimum enforced for both

---

## Section 1: Database Foundation & Migrations

### 1.1 Enum Migration
- Test: New creditSourceType values are accepted by INSERT into creditTransactions
- Test: Existing enum values still work after migration

### 1.1b Provider Seed Data
- Test: llmProviders table has entries for Groq Whisper STT, OpenAI Whisper STT, ElevenLabs TTS, OpenAI TTS after seed
- Test: providerUsageLog INSERT with seeded providerId succeeds

### 1.2-1.7 Schema Migrations
- Test: Each new table can be inserted into with valid data
- Test: FK constraints work (insert with invalid FK fails)
- Test: CHECK constraints reject invalid values (e.g., invalid channel_type, tone, scope)
- Test: conversations.tenantId backfill populates correctly from users.currentTenantId
- Test: Unique constraints prevent duplicate entries (e.g., channel_connections tenant+type+user)
- Test: ON DELETE CASCADE removes child rows when parent deleted
- Test: ON DELETE SET NULL nullifies FK columns when referenced row deleted

---

## Section 2: F08 — AI Persona System

### 2.1 Persona Service
- Test: resolvePersona returns conversation-level persona when personaId is set
- Test: resolvePersona returns widget default persona when widgetId provided and widget has default
- Test: resolvePersona returns user default when no conversation/widget persona
- Test: resolvePersona returns tenant default when no user default
- Test: resolvePersona returns platform default as last fallback
- Test: resolvePersona validates tenant isolation (persona.tenantId must match conversation.tenantId)
- Test: resolvePersona allows platform-scope personas (tenantId=null) for any tenant

### 2.2 Chat Context Integration
- Test: buildChatContext prepends persona systemPromptPrefix to system prompt
- Test: buildChatContext appends response style instructions when persona has responseStyle
- Test: buildChatContext appends restrictions as bullet points
- Test: buildChatContext works when persona system is disabled (no feature flag)
- Test: memoryService buildChatContext also resolves and injects persona

### 2.3 Agency Integration
- Test: agencyStreamProxy passes persona_prefix in run config
- Test (Python): agency_swarm_adapter prepends persona_prefix to agent instructions
- Test (Python): agent instructions unchanged when no persona_prefix in config

### 2.4 Prompt Injection Mitigation
- Test: system_prompt_prefix over 2000 chars is rejected
- Test: known jailbreak patterns in prefix are blocked ([SYSTEM], [INST], etc.)
- Test: consecutive newlines >2 are stripped from prefix
- Test: restrictions array over 20 entries is rejected
- Test: single restriction over 500 chars is rejected

### 2.5 tRPC Router
- Test: list returns user's own + tenant + platform scope personas
- Test: list does NOT return other tenants' personas
- Test: create with scope='platform' requires admin role
- Test: create with scope='tenant' requires domain_admin for own tenant
- Test: create with scope='user' allowed for any authenticated user
- Test: delete persona sets defaultPersonaId to null on affected users/tenants
- Test: setUserDefault updates user.defaultPersonaId

---

## Section 3: F07 — Per-Response Cost Display

### 3.1 TraceId Propagation
- Test: costTracker.logRequest accepts and stores traceId in providerUsageLog
- Test: chatService writes traceId to messages table after LLM call
- Test: traceId in messages matches traceId in providerUsageLog for same request

### 3.2 tRPC Query
- Test: getMessageCost returns cost data for user's own message
- Test: getMessageCost rejects request for another user's message (non-admin)
- Test: getMessageCost omits costUsd for non-admin users
- Test: getMessageCost includes costUsd for admin users
- Test: getMessageCost returns null gracefully when no providerUsageLog entry exists

### 3.3 Frontend
- Test: MessageCostBadge does not fetch cost data until expanded
- Test: MessageCostBadge displays model, tokens, credits, latency in compact view
- Test: MessageCostBadge shows full breakdown when expanded

---

## Section 4: F04 — Canvas / AI Artifacts

### 4.1 Artifact Parser
- Test: parses single artifact:chart block from response text
- Test: parses multiple artifact blocks from single response
- Test: returns empty array for response with no artifact blocks
- Test: handles malformed artifact blocks gracefully (logs warning, returns raw text)
- Test: extracts title from artifact metadata if present
- Test: extracts language for code-type artifacts

### 4.3 Artifact Storage
- Test: code artifact stored in messages.artifacts (simple type)
- Test: react artifact stored in conversationArtifacts table (versioned type)
- Test: chart artifact stored in conversationArtifacts table
- Test: artifact version increments on edit
- Test: parent_artifact_id correctly links version chain
- Test: artifact content over 500KB is rejected

### 4.4 tRPC Endpoints
- Test: getArtifacts validates conversation ownership (tenantId + userId)
- Test: getArtifacts rejects request for other user's conversation artifacts
- Test: getArtifactVersions returns version chain in order
- Test: updateArtifact creates new version, does not modify existing

---

## Section 5: F01-A — Channel Adapter Refactor

### 5.1-5.2 Adapter Interface & Telegram Extraction
- Test: ChannelAdapterRegistry.register adds adapter
- Test: ChannelAdapterRegistry.get returns correct adapter by channelType
- Test: ChannelAdapterRegistry.get returns undefined for unregistered type
- Test: Telegram adapter validates webhook with timing-safe compare
- Test: Telegram adapter parseInbound returns correct ChatIngressEvent structure
- Test: Telegram adapter sendMessage wraps existing sendTelegramMessage
- Test: Telegram adapter formatMessage splits at 4096 chars

### 5.3 Webhook Router
- Test: POST /webhooks/telegram/:connectionId routes to telegram adapter
- Test: POST /webhooks/whatsapp/:connectionId routes to whatsapp adapter
- Test: POST /webhooks/unknown/:connectionId returns 404
- Test: Redis dedup prevents processing same update twice
- Test: Webhook returns 200 immediately before async processing

### 5.4 Gateway Updates
- Test: emitEgress queries bindings for all channel types (not just telegram)
- Test: deliveryQueue uses adapter registry for message delivery
- Test: deliveryQueue falls back correctly when adapter fails

### 5.5 Data Migration
- Test: telegramConnections rows correctly mapped to channelConnections
- Test: row count matches after migration
- Test: unique constraint on (tenant_id, channel_type, external_user_id) enforced

---

## Section 6: F05 — Voice Chat Mode

### 6.1 Voice Gateway
- Test: POST /api/voice/session returns token with 30s TTL
- Test: WebSocket connection succeeds with valid one-time token
- Test: WebSocket connection rejected with already-consumed token
- Test: WebSocket connection rejected with expired token
- Test: Concurrent voice session rejected (1 per user limit)
- Test: Audio chunk rate limit enforced (50 chunks/sec)
- Test: Session auto-closes after 300s timeout
- Test: Audio buffer forced dispatch after 60 seconds

### 6.2 STT/TTS Providers
- Test (Python): STT endpoint routes to correct provider based on config
- Test (Python): STT returns transcript with language and confidence
- Test: TTS endpoint returns audio buffer
- Test: Provider abstraction allows switching between Groq/OpenAI/ElevenLabs

### 6.3 Credit Integration
- Test: STT usage logged with correct sourceType 'stt' and seeded providerId
- Test: TTS usage logged with correct sourceType 'tts'
- Test: Mid-session credit depletion triggers text-only fallback
- Test: Voice WebSocket closes with code 4002 on credit exhaustion

### 6.4 Consent
- Test: Voice mode blocked when voiceConsentGrantedAt is null
- Test: Consent grant sets voiceConsentGrantedAt timestamp
- Test: Consent withdrawal sets voiceConsentGrantedAt to null
- Test: Consent withdrawal publishes Redis event
- Test: Active voice session terminated on consent withdrawal

---

## Section 7: F03 — Browser Automation Tool

### 7.1-7.2 Browser Tool
- Test (Python): navigate blocks private IP ranges (SSRF prevention)
- Test (Python): navigate blocks localhost and 169.254.169.254
- Test (Python): allowedDomains empty = DENY ALL
- Test (Python): allowedDomains whitelist enforced
- Test (Python): extractText truncates at 50,000 characters
- Test (Python): max 5 screenshots per session enforced
- Test (Python): session timeout at 300s enforced
- Test: concurrent session limit per user (1) and per tenant (2) enforced via Redis

### 7.3 Credit Pre-Reservation
- Test: credit reservation of 20 credits deducted before execution
- Test: partial refund issued when actualCost < reservedCost
- Test: full refund issued on total execution failure
- Test: insufficient credits returns error without starting session

### 7.4 Tool Registration
- Test: builtin-browser appears in BUILTIN_TOOLS array
- Test: builtin-browser has riskLevel 'high'
- Test (Python): builtin-browser routes to _execute_sandbox()

---

## Section 8: F09 — Cross-Agency Communication

- Test (Python): tenant isolation validated — cross-tenant agency call rejected
- Test (Python): depth limit enforced (reject at maxDepth)
- Test (Python): loop detection prevents A→B→A cycles via Redis callChain
- Test (Python): callChain persisted in Redis (survives worker restart)
- Test (Python): budget cap (500 credits) enforced across chain
- Test (Python): allowedAgencies empty = DENY ALL
- Test (Python): independent RBAC check on target agency (not just allowedAgencies list)
- Test (Python): concurrent sub-agency limit (2) enforced

---

## Section 9: F01-B — WhatsApp + LINE Adapters

### WhatsApp
- Test: webhook signature verified with HMAC-SHA256 + timingSafeEqual
- Test: invalid signature rejected
- Test: inbound text message parsed correctly
- Test: 24h window tracking (template required outside window)

### LINE
- Test: webhook signature verified with HMAC-SHA256 channel secret
- Test: signature verification runs BEFORE body parsing
- Test: module channel routing based on destination property
- Test: short-lived token refresh works

---

## Section 10: F02 — Embeddable Chat Widget

### Widget Gateway
- Test: HMAC-signed init token validated correctly
- Test: expired init token rejected
- Test: postMessage origin validation (both sides)
- Test: rate limiting enforced (10 msgs/min default)
- Test: messages flow through channelGateway.ingest with channelType 'widget'

### Credit Integration
- Test: tenant credit deduction with ownerId null check (throws PRECONDITION_FAILED)
- Test: per-visitor session cap enforced via Redis
- Test: per-visitor daily cap enforced via Redis
- Test: monthly budget cap enforced via Redis INCR

### System User
- Test: per-tenant system user auto-created on first widget activation
- Test: system user email matches pattern `widget-system@{tenantId}.internal`
- Test: system user cannot login via normal auth flow

---

## Section 11: F06 — Inbound Webhook & Event Triggers

- Test: auth_type 'token' validates with timingSafeEqual
- Test: auth_type 'hmac_sha256' validates HMAC with timestamp
- Test: HMAC replay rejected (timestamp >300s old)
- Test: template substitution only runs AFTER auth succeeds
- Test: template with non-allowlisted patterns rejected at save time
- Test: secret patterns stripped from extracted_variables before storage
- Test: credit insufficient returns 402 with status logged
- Test: dedup key includes body hash (prevents same-second false dedup)

---

## Section 12: F10 — Channel Router

- Test: rules evaluated in priority DESC order
- Test: first matching rule wins (short-circuit)
- Test: all conditions must match for rule to fire
- Test: no regex operator accepted (ReDoS prevention)
- Test: conditions validated against Zod schema on save
- Test: max 50 rules per tenant enforced
- Test: rules cached in Redis with 30s TTL
- Test: cache invalidated on rule create/update/delete

---

## Section 13: F01-C — Slack + Discord Adapters

### Slack
- Test: signing secret verified with HMAC-SHA256 + timingSafeEqual
- Test: installationStore correctly saves/retrieves per-team installations
- Test: Block Kit messages formatted correctly

### Discord
- Test: gateway connection established with correct intents
- Test: slash command interactions routed to correct guild handler
- Test: per-guild configuration loaded from database

---

## Section 14: Feature Flags

- Test: featureFlags mutation validates keys against allowlist
- Test: unrecognized keys stripped before saving
- Test: domain_admin can only toggle own tenant's flags
- Test: admin can modify any tenant's flags
- Test: feature flag false → tRPC endpoint returns 403
- Test: feature flag false → UI component not rendered
- Test: existing settings keys preserved when updating featureFlags
