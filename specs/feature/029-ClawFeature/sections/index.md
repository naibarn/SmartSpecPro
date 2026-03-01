<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-database
section-02-persona
section-03-cost-display
section-04-canvas
section-05-channel-adapter
section-06-voice
section-07-browser
section-08-cross-agency
section-09-whatsapp-line
section-10-widget
section-11-webhooks
section-12-channel-router
section-13-slack-discord
section-14-feature-flags
section-15-security-infra
END_MANIFEST -->

# 02-ClawFeature: Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-database | - | all others | No (must be first) |
| section-02-persona | 01 | - | Yes |
| section-03-cost-display | 01 | - | Yes |
| section-04-canvas | 01 | - | Yes |
| section-05-channel-adapter | 01 | 09, 12, 13 | Yes |
| section-06-voice | 01 | - | Yes |
| section-07-browser | 01 | - | Yes |
| section-08-cross-agency | 01 | - | Yes |
| section-09-whatsapp-line | 05 | - | Yes |
| section-10-widget | 01 | - | Yes |
| section-11-webhooks | 01 | - | Yes |
| section-12-channel-router | 05 | - | Yes |
| section-13-slack-discord | 05 | - | Yes |
| section-14-feature-flags | 01 | - | Yes |
| section-15-security-infra | 01 | - | Yes (final batch) |

## Execution Order

1. **Batch 1:** section-01-database (foundation — all migrations, enum additions, seed data)
2. **Batch 2:** section-02-persona, section-03-cost-display, section-04-canvas, section-05-channel-adapter, section-06-voice, section-07-browser, section-08-cross-agency, section-10-widget, section-11-webhooks, section-14-feature-flags (parallel — all depend only on DB foundation)
3. **Batch 3:** section-09-whatsapp-line, section-12-channel-router, section-13-slack-discord, section-15-security-infra (parallel — depend on channel adapter or cross-cutting final)

## Section Summaries

### section-01-database
**Plan Sections:** 1.1 – 1.7
Database foundation: new creditSourceType enum values (raw SQL outside transaction), llmProviders seed data for STT/TTS, persona_templates table, conversations.tenantId backfill, messages.traceId column, channel_connections + channel_credentials tables, chat_widgets + conversation_artifacts tables, webhook_triggers + webhook_trigger_logs + channel_routing_rules tables, users.voiceConsentGrantedAt column. Migration ordering and FK dependency management.

### section-02-persona
**Plan Sections:** 2.1 – 2.7
F08 AI Persona System: personaService.ts with 4-level resolution chain, buildChatContext() integration in chatService.ts and memoryService.ts, agencyStreamProxy persona_prefix passthrough, Python agency_swarm_adapter prepend, prompt injection mitigation (blocklist, length limits, structural delimiters), RBAC enforcement (admin/domain_admin/user), seed data (6 English-primary personas), frontend components (PersonaSelector, PersonaSettings, AdminPersonas), tRPC router (list/getById/create/update/delete/setUserDefault/setTenantDefault).

### section-03-cost-display
**Plan Sections:** 3.1 – 3.3
F07 Per-Response Cost Display: traceId propagation through costTracker.logRequest() → providerUsageLog → messages table, tRPC getMessageCost query with JOIN and ownership check (costUsd omitted for non-admin), MessageCostBadge.tsx lazy-loaded component with compact/expanded views, integration into Chat.tsx and AgencyChat.tsx.

### section-04-canvas
**Plan Sections:** 4.1 – 4.6, 18
F04 Canvas/AI Artifacts: artifactParser.ts for code fence artifact blocks, buildChatContext() artifact format injection, dual-store strategy (messages.artifacts for simple types, conversationArtifacts for versioned), definitive type mapping (code/markdown/mermaid/svg → messages, react/html/chart/table → conversationArtifacts), tRPC endpoints (getArtifacts/getArtifactVersions/updateArtifact), sandbox.smartaihub.app domain with CSP and iframe sandbox, CanvasPane split layout, per-type renderers, ArtifactSandbox postMessage integration.

### section-05-channel-adapter
**Plan Sections:** 5.1 – 5.5
F01-A Channel Adapter Refactor: ChannelAdapter interface and ChannelAdapterRegistry, Telegram adapter extraction from telegramService.ts, generalized webhook route POST /webhooks/:channelType/:connectionId, channelGateway.ts emitEgress/queryActiveBindings updates, deliveryQueue.ts adapter-aware delivery, Telegram data migration to channel_connections with dual-write.

### section-06-voice
**Plan Sections:** 6.1 – 6.6
F05 Voice Chat Mode: voiceGateway.ts WebSocket with one-time session token (30s TTL, SET NX), 1 session/user limit, 50 chunks/sec rate limit, 60s buffer / 300s session limits, STT/TTS provider abstraction (Groq Whisper, OpenAI Whisper, ElevenLabs, OpenAI TTS), Python STT endpoint via unified_client, credit integration with seeded provider IDs, mid-session credit depletion graceful degradation, PDPA/GDPR consent flow with Redis pub/sub withdrawal, VoiceChat.tsx with VAD (@ricky0123/vad-web), useVoiceChat hook, builtin-voice agency tool + VoiceExecutor workflow node.

### section-07-browser
**Plan Sections:** 7.1 – 7.4
F03 Browser Automation Tool: Docker Playwright sandbox (non-root, seccomp, 512MB limit, isolated network), browser_tool.py with SSRF 3-layer protection, output limits (50K text, 5 screenshots), credit pre-reservation pattern (reserve 20 → refund unused), concurrent limits (1/user, 2/tenant via Redis semaphore), builtin-browser agency tool (riskLevel: high → _execute_sandbox()), BrowserExecutor workflow node.

### section-08-cross-agency
**Plan Sections:** 8.1
F09 Cross-Agency Communication: agency_call_tool.py with tenant isolation, independent RBAC check on target, depth tracking (max 3), loop prevention via Redis callChain (TTL=600s), budget cap (500 credits), concurrent sub-call limit (2 via Redis semaphore), builtin-agency-call tool registration.

### section-09-whatsapp-line
**Plan Sections:** 9.1 – 9.2
F01-B WhatsApp + LINE Adapters: WhatsApp adapter using Meta Cloud API (HMAC-SHA256 webhook verification, 24h window management, template fallback, Tier 1 rate limits), LINE adapter using @line/bot-sdk (HMAC-SHA256 before body parsing, module channels for multi-tenant, short-lived token refresh).

### section-10-widget
**Plan Sections:** 10.1 – 10.4
F02 Embeddable Chat Widget: separate Vite build (~50KB gzipped), embed.js loader with HMAC-signed init token (24h TTL), widgetGateway.ts WebSocket with origin validation and rate limiting, anonymous user via per-tenant system user (widget-system@{tenantId}.internal, role: user, login prevention), credit deduction from tenant owner with null check, per-visitor Redis caps (session + daily + monthly), AdminWidgets.tsx with embed code generator and theme customization.

### section-11-webhooks
**Plan Sections:** 11.1 – 11.3
F06 Inbound Webhook & Event Triggers: webhookTrigger.ts endpoint POST /api/webhooks/trigger/:triggerId, strict processing order (auth → rate limit → template → dispatch), HMAC replay protection with 5-min timestamp window and dedup key including body hash, restricted variable-only template substitution (no Jinja2), secret pattern stripping from logs, WebhookTriggers.tsx test UI with request inspector and delivery logs.

### section-12-channel-router
**Plan Sections:** 12.1 – 12.3, 20
F10 Channel Router: channelRouterService.ts with priority-ordered rule evaluation (DESC, first-match wins), string operators only (no regex — ReDoS prevention), max 50 rules per tenant, Redis cache (30s TTL) with invalidation, channelGateway.ingest() integration, AdminChannelRouter.tsx with visual rule builder, drag-drop priority ordering, and rule testing sandbox.

### section-13-slack-discord
**Plan Sections:** 13.1 – 13.2
F01-C Slack + Discord Adapters: Slack adapter using @slack/bolt (multi-tenant OAuth installationStore, signing secret HMAC verification, Block Kit formatting, 2025 rate limit awareness), Discord adapter using discord.js v14 (persistent WebSocket via shared BullMQ worker, GatewayIntentBits, slash commands, per-guild config, sharding-aware design).

### section-14-feature-flags
**Plan Sections:** 14.1 – 14.3, 19
Feature Flags & Tenant Configuration: TenantFeatureFlags interface with 10 feature keys, server-side allowlist validation, dedicated updateFeatureFlags tRPC mutation with read-modify-write pattern, RBAC (domain_admin toggles own tenant, admin toggles any), enforcement at tRPC middleware / Express route / UI levels, generic settings mutation audit to prevent featureFlags bypass.

### section-15-security-infra
**Plan Sections:** 15, 16, 17
Security Checklist + Resource Optimization + Nginx: pre-implementation security blockers verification, per-feature security patterns checklist (HMAC timingSafeEqual, secrets encryption, CSP, postMessage, SSRF, feature flags, persona sanitization), conservative concurrency limits, shared BullMQ workers, lazy initialization, caching strategy, Nginx WebSocket proxying for voice/widget, sandbox.smartaihub.app server block, generalized channel webhook route.
