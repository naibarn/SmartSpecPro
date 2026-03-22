# Feature 048: Auth Token Storage Hardening — Combined Specification

## Problem

SmartSpecPro stores sensitive credentials in browser-accessible storage, creating XSS attack vectors:

1. **JWT auth token in localStorage** (`smartspec_auth_token`) — any XSS on any page grants full session theft. The system already uses httpOnly session cookies (`app_session_id`) as its primary auth mechanism, making the localStorage JWT a redundant attack surface.

2. **User LLM API keys in sessionStorage** (`smartspec_apikey_*`) — user-provided third-party API keys stored in plaintext. Currently, this UI exists but is not active in production (backend uses admin-configured keys only).

## Current Architecture

### Authentication
- **Primary:** httpOnly cookie `app_session_id` (HS256 JWT, 30-day expiry, secure/sameSite)
- **Fallback:** localStorage JWT (Tauri desktop app secure store, with browser localStorage as last resort)
- **Token creation:** Server-side via `sdk.createSessionToken()`, set as httpOnly cookie
- **Token verification:** `jose.jwtVerify()` with HS256, then DB user lookup
- **Request priority:** `Authorization: Bearer` header checked first, then session cookie

### Tauri Desktop App
- Actively used and must be preserved
- Uses Tauri secure store (native OS keychain) via `safeInvoke()`
- Falls back to localStorage when Tauri secure store unavailable
- Needs Bearer token because cookies don't cross webview boundary

### Encryption Infrastructure
- AES-256-GCM via `crypto.ts` (format: `iv:authTag:ciphertext` hex)
- Key derived from `LLM_ENCRYPTION_KEY` env var via SHA-256
- Used for all `*Encrypted` columns: llmProviders, mediaProviders, channelCredentials, etc.
- Pattern well-established with 8+ existing encrypted columns

### API Key Storage (Current)
- **Admin keys:** Database with AES-256-GCM encryption (production, working)
- **User keys:** sessionStorage in browser (UI exists, NOT active in backend)
- `authService.ts` has `setApiKey()`, `getApiKey()`, `deleteApiKey()` functions
- TODO at line 272 acknowledges need for server-side migration

## Requirements

### Phase 1: Remove localStorage JWT Fallback (Browser)
- Remove localStorage reads/writes for auth tokens in browser context
- Preserve Tauri secure store path for desktop app
- Clean up legacy localStorage keys on startup
- Re-login after deployment is acceptable
- No schema changes needed

### Phase 2: Migrate API Keys to Server-Side Encrypted Storage
- New `userLlmApiKeys` table with AES-256-GCM encryption
- tRPC CRUD endpoints (never return decrypted keys)
- Frontend UI updates to use tRPC instead of sessionStorage
- Server-side decryption only when making LLM API calls
- No backward compatibility needed (feature not active in production)

### Constraints
- Tauri secure store must continue working for desktop app
- Both phases ship independently (Phase 1 first)
- Follow existing encryption patterns (crypto.ts)
- Follow existing table patterns in drizzle/schema.ts
- `useAuth()` hook must continue working (it uses tRPC, not localStorage)
- tRPC client auto-attaches cookies — no frontend auth header changes needed

## Affected Files

### Phase 1
- `apps/web/client/src/services/authService.ts` — Main changes
- `apps/web/client/src/App.tsx` — Startup cleanup
- Tests for auth flows

### Phase 2
- `apps/web/drizzle/schema.ts` — New table
- `apps/web/server/routers/userApiKeys.ts` — New router
- `apps/web/server/services/userApiKeyService.ts` — New service
- `apps/web/client/src/services/authService.ts` — Remove sessionStorage
- `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx` — UI changes
- `apps/web/server/services/llmRouter.ts` — Use server-side user keys
