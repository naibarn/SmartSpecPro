# Section 04 — OAuth Connection & Channel Management

## Dependencies
- section-01-db-schema: `socialProviderConnections`, `socialPages`, `socialWebhookSubscriptions` tables
- section-02-feature-flag-menu: `META_CHANNELS_ENABLED` flag, `/social/channels` route
- section-03-meta-graph-client: `MetaGraphClient` class

## Overview
Full OAuth connection flow for Meta Pages: Python FastAPI endpoints, tRPC `metaChannels` router, AuthCallback.tsx extension, and SocialChannels.tsx page.

## Files to Create or Modify
| File | Action |
|------|--------|
| `python-backend/app/api/meta_oauth.py` | Create — OAuth endpoints |
| `python-backend/app/api/meta_pages.py` | Create — Internal page CRUD |
| `python-backend/app/main.py` | Modify — register routers |
| `apps/web/server/routers/metaChannels.ts` | Create — tRPC router |
| `apps/web/server/services/socialAccessService.ts` | Create — shared `verifyPageAccess()` helper |
| `apps/web/server/routers.ts` | Modify — wire router |
| `apps/web/client/src/pages/AuthCallback.tsx` | Modify — Meta provider branch |
| `apps/web/client/src/pages/SocialChannels.tsx` | Modify — full implementation |
| Tests: `test_meta_oauth.py`, `metaChannels.test.ts`, `AuthCallbackMeta.test.tsx`, `SocialChannels.test.tsx` | Create |

## Tests First
```
# OAuth Python Tests:
# Test: /authorize returns Facebook login URL with correct scopes, state stored in Redis (10min TTL)
# Test: /authorize returns 503 when META_APP_ID is not configured
# Test: /callback rejects mismatched state (CSRF — server-side Redis validation, NOT client sessionStorage)
# Test: /callback exchanges code → short-lived → long-lived token, stores encrypted
# Test: /callback returns available pages list
# Test: /status returns "not_connected" or connection info with masked token

# tRPC Router Tests:
# Test: getAuthUrl returns valid Facebook OAuth URL
# Test: completeOAuth validates state server-side (python-backend owns CSRF validation)
# Test: connectPage creates socialPages, subscribes webhooks
# Test: disconnectPage clears token, triggers GDPR cleanup
# Test: updatePageSettings validates aiActionMode enum
# Test: all procedures reject when META_CHANNELS_ENABLED is false
# Test: all procedures scope by tenantId
# Test: completeOAuth is rate-limited (max 10/min per IP)
```

## CRITICAL Security Fixes (from review)

### OAuth CSRF — Server-Side Nonce
`GET /authorize` generates state with `secrets.token_urlsafe(32)`, stores in Redis `meta:oauth:state:{nonce}` with 10min TTL. `POST /callback` validates by looking up and deleting the Redis key (one-time use). The tRPC `completeOAuth` does NOT forward state from client — python-backend owns the validation. Client `sessionStorage` is UX-only.

### META_APP_SECRET Storage
`META_APP_SECRET` is stored in `system_settings` table with `isSensitive=true`. Python-backend reads and decrypts via `smartspecweb_crypto` — NEVER from `os.environ`.

### Token Flow
Node.js NEVER decrypts page tokens. `connectPage` passes `page_id` to python-backend which decrypts from DB. Internal endpoints accept `page_id`, not `page_access_token`.

### Rate Limiting
`completeOAuth` rate-limited to prevent brute-force OAuth code guessing.

## Implementation Guidance

### Python OAuth Endpoints (`meta_oauth.py`)
- `GET /api/oauth/meta/authorize` — Generate FB login URL, store CSRF state in Redis
- `POST /api/oauth/meta/callback` — Validate Redis nonce (one-time), exchange code → short-lived → long-lived token, encrypt via `encrypt_smartspecweb()`, upsert `socialProviderConnections`, fetch pages via `GET /me/accounts`
- `GET /api/oauth/meta/status` — Return masked token status

### Python Page Endpoints (`meta_pages.py`)
- Internal endpoints (X-Internal-Token auth). Accept `page_id`, decrypt token from DB.
- `POST /connect` — Fetch page token from Meta, encrypt, store, subscribe webhooks
- `POST /disconnect` — Unsubscribe, clear token, trigger GDPR cleanup task

### tRPC Router (`metaChannels.ts`)
- Feature flag middleware: check `META_CHANNELS_ENABLED`
- All page operations use shared `verifyPageAccess(pageId, userId, tenantId, db)` helper
- Proxy to python-backend via `fetch()` with `X-Internal-Token`

### AuthCallback.tsx Extension
- Detect `provider === "meta"` → call `metaChannels.completeOAuth` (no session creation)
- On success: redirect to `/social/channels`

### SocialChannels.tsx
- Connect Provider card + Connected Pages table
- Page settings drawer (AI mode, confidence threshold, inbox/publishing/moderation toggles)
- Reconnect button for `needs_reauth` pages
