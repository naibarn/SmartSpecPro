# Research Findings — Feature 058: Meta Channels

## 1. Codebase Integration Patterns

### 1.1 OAuth Flow (Existing Pattern)
- **Frontend**: `apps/web/client/src/pages/AuthCallback.tsx` — extracts `code` from URL, validates CSRF state from sessionStorage, POSTs to backend
- **Backend**: `python-backend/app/api/oauth.py` — `GET /api/oauth/{provider}/authorize` returns auth URL + state, `POST /api/oauth/{provider}/callback` exchanges code for token
- **CSRF protection**: `OAuthService.generate_oauth_state()` creates random state, validated on callback
- **Config storage**: OAuth credentials in `system_settings` table with `isSensitive: true`

### 1.2 Token Encryption
- **Node.js** (`apps/web/server/services/crypto.ts`): AES-256-GCM, key = SHA-256(LLM_ENCRYPTION_KEY), format = `iv_hex:authTag_hex:ciphertext_hex`
- **Python** (`python-backend/app/core/smartspecweb_crypto.py`): Same key derivation, `decrypt_smartspecweb()` / `encrypt_smartspecweb()`
- **System settings**: `systemSettings` table with `isSensitive: true` auto-encrypts via `upsertSystemSetting()`

### 1.3 Webhook Handling (Telegram Pattern)
- **File**: `python-backend/app/api/telegram_webhook.py`
- Validates secret header with `secrets.compare_digest()` (constant-time)
- Rate limiting via Redis per-chat-id counter
- Pydantic models for request validation
- Always returns 200 OK to provider, logs errors internally

### 1.4 Internal Tool Endpoints (Agency Pattern)
- **Mapping**: `python-backend/app/services/agency_tools.py` lines 57-77 — `_BUILTIN_ENDPOINTS` dict maps tool IDs to HTTP paths
- **Auth**: All internal endpoints verify `X-Internal-Token` header via `crypto.timingSafeEqual()`
- **Validation**: Zod schemas on Node.js side
- **Risk levels**: `_BUILTIN_RISK_LEVELS` dict in agency_tools.py

### 1.5 Feature Flags
- **Shared interface**: `apps/web/shared/featureFlags.ts` — `TenantFeatureFlags` interface + `ALLOWED_FEATURE_FLAGS` set + `FEATURE_FLAG_DEFAULTS`
- **Server service**: `apps/web/server/services/featureFlags.ts` — Redis-backed with env var fallback
- **Menu gating**: `requiresFeature` field in menu items, checked by `getVisibleMenuItems()`

### 1.6 Menu Items
- **File**: `packages/shared/src/constants/menu.ts`
- Pattern: `{ id, label, labelTh, icon, path, platforms, group, sortOrder, requiresFeature }`
- Sections: main (sortOrder 0-99), admin (18-32), domain-admin (40-44)

### 1.7 Celery Tasks
- **App**: `python-backend/app/core/celery_app.py` — broker = Redis, JSON serializer
- **Pattern**: `@celery_app.task(bind=True, max_retries=N)` with `_run_async()` wrapper
- **Queues**: celery, video, media, presentation_export (declare new queue for social tasks)
- **Beat**: `celery_app.conf.beat_schedule` for periodic tasks

### 1.8 Workflow Node Registration
- **Registry**: `python-backend/app/orchestrator/node_registry.py` — `NodeTypeSpec` dataclass, `_register_core_nodes()` method
- **Categories**: ai, flow_control, human, media, skills, triggers, inputs, outputs, data, integrations, observability, security
- **Executor protocol**: `async execute(data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]`
- **Frontend auto-discovery**: `useNodeRegistry()` hook fetches `/api/v1/workflows/node-types`

---

## 2. Meta Platform API Research

### 2.1 OAuth Flow
1. Generate login URL: `https://www.facebook.com/v25.0/dialog/oauth?client_id={APP_ID}&redirect_uri={CALLBACK}&state={CSRF}&scope=pages_manage_posts,pages_messaging,pages_read_engagement,pages_show_list&response_type=code`
2. Exchange code for short-lived token: `POST https://graph.facebook.com/v25.0/oauth/access_token` with client_id, client_secret, redirect_uri, code
3. Exchange for long-lived token: `POST https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}`
4. Get page tokens: `GET https://graph.facebook.com/me/accounts?access_token={LONG_LIVED_USER_TOKEN}`

Long-lived tokens last ~60 days. Page tokens from long-lived user tokens are effectively non-expiring.

### 2.2 Required Scopes
- `pages_manage_posts` — Create, edit, delete page posts
- `pages_messaging` — Send Messenger messages
- `pages_read_engagement` — Read comments, reactions, insights
- `pages_read_user_content` — Read user messages
- `pages_show_list` — List accessible pages

### 2.3 Messenger Webhooks

**Verification (GET)**:
```
GET /webhook?hub.mode=subscribe&hub.verify_token={TOKEN}&hub.challenge={CHALLENGE}
→ Respond with hub.challenge value, 200 OK
```

**Event delivery (POST)** with `X-Hub-Signature-256: sha256={HMAC}`:
```json
{
  "object": "page",
  "entry": [{
    "id": "{PAGE_ID}",
    "time": 1458692752478,
    "messaging": [{
      "sender": {"id": "{USER_PSID}"},
      "recipient": {"id": "{PAGE_ID}"},
      "timestamp": 1458692752478,
      "message": {"mid": "{MSG_ID}", "text": "Hello"}
    }]
  }]
}
```

**Signature validation**: HMAC-SHA256 of raw body bytes using app_secret, constant-time comparison.

**Subscribe to fields**: `POST /{PAGE_ID}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,feed&access_token={PAGE_TOKEN}`

### 2.4 Send API
```
POST https://graph.facebook.com/v25.0/{PAGE_ID}/messages
{
  "recipient": {"id": "{USER_PSID}"},
  "messaging_type": "RESPONSE",
  "message": {"text": "Hello!"},
  "access_token": "{PAGE_TOKEN}"
}
```
Response: `{"recipient_id": "...", "message_id": "..."}`
Rate: 250 requests/second safe.

### 2.5 Page Posts API
- Create: `POST /{page_id}/feed` with message, link, scheduled_publish_time
- Read: `GET /{page_id}/feed`
- Delete: `DELETE /{post_id}`
- Scheduled posts: 10 min to 30 days in future (Unix timestamp)

### 2.6 Comments API
- Read: `GET /{comment_id}?fields=message,created_time,from,like_count`
- Reply: `POST /{post_id}/comments?message=...`
- Hide: `POST /{comment_id}?is_hidden=true`
- Delete: `DELETE /{comment_id}`

### 2.7 Rate Limits
- Graph API: 200 × number_of_users calls/hour
- Pages API: 4800 × engaged_users calls/24h
- Messenger: 200 × engaged_users calls/24h, Send API 250 req/s
- Monitor via `X-App-Usage` and `X-Business-Use-Case-Usage` headers

### 2.8 Error Codes
- 100: Invalid parameter
- 190: Invalid/expired OAuth token → trigger re-auth flow
- 429: Rate limit → implement exponential backoff
- 2: Service temporarily unavailable → retry with backoff

### 2.9 Python HTTP Client
- Recommended: **httpx** (async native, connection pooling, timeout handling)
- Pattern: `httpx.AsyncClient(timeout=30.0)` for async Celery tasks

---

## 3. Testing Infrastructure

### 3.1 TypeScript (apps/web)
- **Framework**: Vitest
- **Pattern**: `apps/web/server/routers/__tests__/` for router tests
- **Services**: `apps/web/server/services/__tests__/` for service tests
- **Mocking**: vi.mock() for external dependencies

### 3.2 Python (python-backend)
- **Framework**: pytest with markers (unit, integration, e2e)
- **Pattern**: `python-backend/tests/unit/` and `python-backend/tests/integration/`
- **Coverage**: 80% minimum enforced
- **Fixtures**: AsyncClient for FastAPI, mock DB sessions

---

## 4. Key Design Decisions for Implementation

1. **Token storage**: Use dedicated `socialProviderConnections` and `socialPages` tables with `encryptedAccessToken` columns (not system_settings) since we need per-page, per-tenant token management
2. **Webhook processing**: Async via Celery task queue (new `social` queue) to avoid blocking the webhook endpoint
3. **Deduplication**: Redis-based with `social:dedup:{provider}:{deliveryId}` keys, 24h TTL
4. **Workflow nodes**: New `"social"` category in NodeRegistry with 6 node types
5. **Agency tool**: Single `builtin-meta-channels` tool with `allowedActions` config to control what the agent can do
6. **Python HTTP client**: httpx.AsyncClient for all Meta API calls
7. **Feature flag**: `META_CHANNELS_ENABLED` (default false, opt-in)
