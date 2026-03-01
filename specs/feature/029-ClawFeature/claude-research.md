# Research Findings: 02-ClawFeature Platform Enhancement

## Part 1: Codebase Analysis

### 1. Channel Gateway & Messaging System

**Entry Point:** `apps/web/server/services/channelGateway.ts`

The channel gateway is already **transport-agnostic** via `ChatIngressEvent`/`ChatEgressEvent` types. Key functions:

- `ingest(event: ChatIngressEvent)` — Validates connection, resolves active channel, routes to chat or agency pipelines
- `emitEgress(event: ChatEgressEvent)` — Queries active bindings, creates `channel_messages` record, splits at 4096-char Telegram limit, enqueues BullMQ delivery
- `queryActiveBindings()` — Currently filters `channelType = "telegram"` + `state = "active"`

**Telegram Adapter:** `apps/web/server/services/telegramService.ts`
- Rate limiting: Token bucket (25 msgs/sec)
- Retry: Exponential backoff with retry-after
- Settings cache: 1-minute TTL

**Delivery Queue:** `apps/web/server/services/deliveryQueue.ts`
- BullMQ worker, concurrency 10
- Rate limit: 25 req/sec
- 5 retries with exponential backoff (1s → 16s)
- Dead-letter queue: `telegram-delivery-dlq`
- Permanent error detection (bot blocked, chat not found, etc.)

**Webhook Handler:** `apps/web/server/routes/telegramWebhook.ts`
- Route: `POST /:botId`
- Validates `X-Telegram-Bot-Api-Secret-Token` (timing-safe)
- Redis dedup on `(botId, update_id)`
- Returns 200 immediately, processes async
- Command handlers: resume, unlink, status, help, start, callback_query

**Shared Types:** `apps/web/shared/channelTypes.ts`
- `ChatIngressEvent` — has `channel.type: "web" | "telegram"`, needs extension
- `ChatEgressEvent` — targets with rendering (plainText, html, truncatedWebUrl)
- `DeliveryJob` — currently lacks `channelType` field (spec addresses this)

### 2. Database Schema Key Tables

**telegramConnections** (schema.ts ~line 4257):
- PK: `varchar(36)`, FKs to tenants/users
- Columns: telegramUserId, telegramChatId, telegramUsername, botId, status, activeChannelId
- UNIQUE on (botId, telegramUserId)

**conversationChannels** (schema.ts ~line 4290):
- Split FK pattern: `chatConversationId` (integer) OR `agencyConversationId` (varchar 36)
- CHECK constraint ensures exactly one is set
- Columns: channelType, channelRefId, connectionId, isPrimary, syncMode, state

**channelMessages** (schema.ts ~line 4329):
- Delivery tracking: deliveryStatus (pending/sent/failed), attemptCount, failureCode
- UNIQUE on (channelType, externalChatId, externalMessageId)

### 3. Credit System

**File:** `apps/web/server/services/creditService.ts`

**Existing `creditSourceTypeEnum`:**
```
chat, skill, media_image, media_video, media_audio, indexing, rag, stt,
translation, brainstorm, scheduler, admin, agency, creator_revenue, other
```
Note: `stt` already exists. New values needed: `tts`, `browser_automation`, `widget_chat`, `webhook_chat`

**Key Functions:**
- `hasEnoughCredits(userId, amount)` — Atomic SELECT check
- `deductCredits(params)` — Atomic UPDATE with idempotencyKey, creates creditTransactions record
- `deductCreditsForModel(params)` — Calculates credits from model pricing, logs to providerUsageLog
- `calculateCreditsForLLM(inputTokens, outputTokens, model)` — Pricing lookup

**creditTransactions table:** serial PK, userId FK, amount, type (purchase/usage/bonus/refund/adjustment/subscription/creator_fee), metadata JSONB, traceId varchar(32), sourceType enum

### 4. Chat Service

**File:** `apps/web/server/services/chatService.ts`

Key functions used by channel gateway:
- `getConversationById(id, userId)` — Ownership-checked lookup
- `createMessage({ conversationId, role, content, sourceChannel?, sourceConnectionId?, externalSourceId? })` — Already supports `sourceChannel`
- `buildChatContext(conversationId, userId, systemPrompt?)` — Returns message history for LLM context
- `updateConversationCredits(conversationId, creditsUsed)`

### 5. Agency System

**File:** `apps/web/server/routers/agency.ts`

12 builtin tools with configSchema and risk levels. Pattern:
```typescript
{ toolId: 'builtin-xxx', name: '...', description: '...', type: 'builtin',
  riskLevel: 'low' | 'medium' | 'high', configSchema: { ... } }
```

**Python bridge:** `python-backend/app/services/agency_tools.py`
- `_BUILTIN_ENDPOINTS` maps toolId → HTTP endpoint
- Risk routing: `high` → `_execute_sandbox()` (OpenSandbox), else → `_execute_http()`
- Medium/high risk requires whitelist check

### 6. Audit Logging

**File:** `apps/web/server/services/auditLogger.ts`

Event types include: llm_request/response, media_request/response, skill_detect/execute, agency_*, channel_gateway_*, error
- JSONL files: `apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`
- Buffered writes, auto-cleanup
- Sanitization removes sensitive keys

### 7. Server Architecture

**File:** `apps/web/server/_core/index.ts`

Middleware stack: correlationIdMiddleware → auditMiddleware → tenantMiddleware → express.json → cookieParser
Routes: /healthz, /readyz, /api/webhooks/telegram/:botId, /trpc, /api/internal/*, /uploads

### 8. Storage

**File:** `apps/web/server/storage.ts`

Priority resolution: FORGE_API_URL env → cache (5-min TTL) → storage_settings DB → R2_* env → local fallback
Supports: s3, r2, forge, local providers
Functions: putObject, getPresignedUrl (max 24hr)

### 9. Voice Transcription (Existing)

**File:** `apps/web/server/_core/voiceTranscription.ts`

Already has Whisper-compatible STT via Forge API:
- `transcribeAudio({ audioUrl, language?, prompt? })` → `TranscriptionResponse`
- Downloads audio (16MB limit), posts to `/v1/audio/transcriptions`
- Returns segments with timing, confidence

### 10. Testing Patterns

**TypeScript (Vitest):**
- Hoisted mocks: `vi.hoisted(() => ({ mockFn: vi.fn() }))`
- Module mocks: `vi.mock("../../db", () => ({ db: { select: mockSelect } }))`
- Drizzle ORM mocked: `eq`, `and`, `inArray` as spy functions
- Run: `pnpm test` or `pnpm vitest run path/to/test`

**Python (pytest):**
- Markers: unit, integration, e2e, llm, auth, credits
- Coverage: 80% minimum (`--cov-fail-under=80`)
- Run: `pytest` with `-v` flag

---

## Part 2: Web Research — Best Practices

### Topic 1: Multi-Channel Messaging SDK Patterns

#### WhatsApp Business Cloud API
- On-Premises API deprecated Oct 2025. **Cloud API is the only option.**
- Webhook: HTTPS endpoint, Meta sends `hub.challenge` verification
- **24-hour window**: Free-form within 24h of last user message; templates only outside window
- Templates: Must be pre-approved by Meta (days to approve)
- Rate: Tier 1 (1K users/day) → Tier 3 (100K). Per-second: 20-50 calls
- Multi-tenant: Each tenant needs own WABA. Use idempotency via message IDs
- Sources: [WhatsApp Business Blog](https://business.whatsapp.com/blog/how-to-use-webhooks-from-whatsapp-business-api), [ChatArchitect](https://www.chatarchitect.com/news/whatsapp-api-rate-limits-what-you-need-to-know-before-you-scale)

#### LINE Messaging API
- Webhook signature: HMAC-SHA256 with channel secret, in `x-line-signature` header
- **Critical**: Verify signature BEFORE parsing/deserializing the body
- Module channels: One app serving multiple LINE Official Accounts
- User IDs differ per LINE Official Account (68-char strings starting with "L")
- Rate: 2,000 req/sec per channel; 370 req/sec for token endpoint
- Short-lived tokens only for module channels — implement token refresh
- Sources: [LINE Developers](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [LINE Reference](https://developers.line.biz/en/reference/messaging-api/)

#### Slack Bolt SDK
- Official framework with built-in token rotation and rate limiting
- Multi-tenant via OAuth: `installationStore` with storeInstallation/fetchInstallation/deleteInstallation handlers
- **2025 Rate Limit Change**: Non-Marketplace commercially distributed apps limited to 1 req/min for conversations.history. Get Marketplace approval or use internal app architecture
- Block Kit for interactive UIs (buttons, menus, rich formatting)
- Sources: [Slack Docs](https://docs.slack.dev/), [Slack Bolt OAuth](https://docs.slack.dev/tools/bolt-js/concepts/authenticating-oauth/)

#### Discord.js
- Gateway v10 with `GatewayIntentBits` for selective event subscription
- Persistent WebSocket — needs BullMQ worker process (not HTTP route)
- Slash commands preferred over message content parsing (MessageContent is privileged intent)
- Sharding required at 2,500+ guilds. Hybrid sharding reduces resource overhead 40-60%
- Multi-tenant inherent: one bot token serves all guilds, per-guild config in DB
- Sources: [Discord.js Guide](https://discordjs.guide/legacy/popular-topics/intents), [discord-hybrid-sharding](https://github.com/meister03/discord-hybrid-sharding)

#### Cross-Platform Security
| Platform | Webhook Verification |
|----------|---------------------|
| WhatsApp | Verify token matching |
| LINE | HMAC-SHA256 with channel secret |
| Slack | Signing secret (HMAC-SHA256) |
| Discord | Ed25519 signature verification |

### Topic 2: WebSocket Audio Streaming + VAD + STT/TTS

#### Architecture Recommendation
Use **chained pipeline** (STT → LLM → TTS) for cost predictability: ~$0.15/min, 500ms-2s latency. Speech-to-speech (OpenAI Realtime) has cost accumulation problem: $0.30/min at 5 min → $1.50+/min at 30 min.

#### VAD: @ricky0123/vad-web
- v0.0.30, uses Silero VAD model (ONNX in browser via WebAssembly)
- 85-100ms latency, returns Float32Array at 16kHz
- Requires copying worklet files, ONNX models, WASM files during build
- Source: [vad-web docs](https://docs.vad.ricky0123.com/user-guide/browser/)

#### STT: Groq Whisper
- Models: `whisper-large-v3` ($0.111/hr) and `whisper-large-v3-turbo` ($0.04/hr)
- OpenAI-compatible API: `POST /v1/audio/transcriptions`
- **No streaming** — final transcriptions only. Send complete VAD-detected utterances
- 25MB file limit (free), 100MB (dev). Minimum billable: 10 seconds
- Source: [Groq Docs](https://console.groq.com/docs/speech-to-text)

#### TTS: ElevenLabs WebSocket
- WebSocket: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`
- Protocol: InitializeConnection → SendText (chunks) → Flush → CloseConnection
- Flash v2.5: ~75ms latency
- Chunk schedule: [120, 160, 250, 290] chars. Min 50 chars, optimal 200-400
- Multi-Context: Multiple streams over single WebSocket (ideal for multi-tenant)
- Source: [ElevenLabs Docs](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input)

#### GDPR/PDPA Compliance
- Explicit opt-in consent before recording
- "Audio processed for transcription only, not stored permanently"
- Real-time mute/stop button, immediate processing cessation on withdrawal
- Process audio in memory, never persist raw audio
- TLS 1.2+ for WebSocket, AES-256 if any audio stored
- Cross-border transfer agreements needed for US-based STT/TTS APIs
- Sources: [Speechmatics](https://www.speechmatics.com/company/articles-and-news/your-essential-guide-to-voice-ai-compliance-in-todays-digital-landscape), [IAPP](https://iapp.org/news/a/how-do-the-rules-on-audio-recording-change-under-the-gdpr)

### Topic 3: Iframe Sandbox Security for AI Artifacts

#### Golden Rule
`sandbox="allow-scripts"` WITHOUT `allow-same-origin` creates a cross-origin context. **NEVER** combine `allow-scripts` + `allow-same-origin` — the iframe can remove its own sandbox attribute.

#### Architecture (Claude Artifacts Pattern)
1. Separate origin domain: `sandbox.smartaihub.app` (like Claude's `claudeusercontent.com`)
2. Strict CSP on sandbox domain:
   ```
   default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
   img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none';
   ```
3. `connect-src 'none'` blocks ALL fetch/XHR/WebSocket — prevents data exfiltration
4. Communication via postMessage with strict origin validation
5. Whitelisted dependencies only: React, ReactDOM, Tailwind, Recharts
6. DOMPurify for HTML sanitization

#### postMessage Security
- ALWAYS specify target origin when posting (never `"*"`)
- ALWAYS validate `event.origin` when receiving
- One-way data flow: parent sends code → sandbox renders → sandbox reports height/errors

#### Key Gotchas
- Scripts in innerHTML don't auto-execute — use bootstrap listener
- No localStorage/sessionStorage in sandboxed iframes without allow-same-origin
- Each iframe = separate browsing context (memory overhead)
- Sources: [Reid Barber](https://www.reidbarber.com/blog/reverse-engineering-claude-artifacts), [Joshua Rogers](https://joshua.hu/rendering-sandboxing-arbitrary-html-content-iframe-interacting)

### Topic 4: Playwright in Sandboxed Containers

#### Docker Setup
- Base image: `mcr.microsoft.com/playwright:v1.50.0-noble`
- **Required flags**: `--init` (zombie prevention), `--ipc=host` (Chromium OOM prevention)
- Non-root user (`pwuser`) with seccomp profile for Chromium sandbox
- Memory: 50-200MB per browser context, 2GB container supports ~5-10 concurrent sessions

#### SSRF Prevention (3-Layer)
1. **Application**: Block localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x at URL validation
2. **DNS Resolution**: Resolve hostname → verify IP is not private before navigation (prevents DNS rebinding)
3. **Container Network**: Separate Docker network, iptables rules blocking RFC-1918 outbound

#### OpenSandbox
- By Alibaba, Apache 2.0, multi-language SDKs
- Pre-built Playwright + Chromium images
- Per-sandbox egress policies, configurable timeouts
- Docker (local) and Kubernetes (production)
- Source: [GitHub](https://github.com/alibaba/OpenSandbox)

#### Resource Management
- Max concurrent sessions per tenant (Redis semaphore)
- Session timeout: 30s per page, 300s per session
- Screenshot limits: max 10/session, auto-expire via S3 lifecycle rules
- Periodically restart browser instance to prevent memory leaks

#### Key Gotchas
- Root user disables Chromium sandbox — use non-root with seccomp
- `--no-sandbox` is NOT safe for untrusted content
- DNS rebinding: resolve hostname AND pin IP before navigation
- JS executes during page load even for screenshots — use `setJavaScriptEnabled(false)` when possible
- Sources: [Playwright Docker Docs](https://playwright.dev/docs/docker), [SSRF Writeup](https://github.com/httpvoid/writeups)
