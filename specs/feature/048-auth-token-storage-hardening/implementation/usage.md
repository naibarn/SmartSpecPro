# Feature 048: Auth Token Storage Hardening — Usage Guide

## What Was Built

This feature hardens authentication token and API key storage across the SmartSpecPro application:

### Phase 1: Browser Auth Hardening (Sections 01-03)
- **authService.ts**: Removed localStorage fallback in browser context — browser auth now uses httpOnly cookies exclusively
- **Startup cleanup**: Legacy `smartspec_*` localStorage keys are cleaned up on app start
- **tRPC credentials**: Verified `credentials: 'include'` on all tRPC requests

### Phase 2: Encrypted API Key Storage (Sections 04-08)
- **Database**: New `userLlmApiKeys` table with AES-256-GCM encrypted key column
- **Service layer**: `userApiKeyService.ts` — encrypt/decrypt CRUD for user LLM API keys
- **tRPC router**: `userApiKeys` — `setKey`, `listKeys`, `deleteKey` with auth gating and rate limiting
- **Frontend**: `UserLlmKeysPanel` component in Settings → API tab for managing LLM provider keys
- **Removed**: All sessionStorage-based API key functions from authService.ts

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/drizzle/schema.ts` (modified) | Added `userLlmApiKeys` table |
| `apps/web/server/services/userApiKeyService.ts` | Encrypted API key CRUD |
| `apps/web/server/routers/userApiKeys.ts` | tRPC router for API key management |
| `apps/web/client/src/components/settings/UserLlmKeysPanel.tsx` | Frontend panel |
| `apps/web/server/services/__tests__/userApiKeyService.test.ts` | 16 service tests |
| `apps/web/server/routers/__tests__/userApiKeys.test.ts` | 14 router tests |
| `apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx` | 10 frontend tests |

## Supported LLM Providers

- OpenAI
- Anthropic
- DeepSeek
- Google AI
- OpenRouter

## Security Properties

1. **API keys encrypted at rest** with AES-256-GCM (via `LLM_ENCRYPTION_KEY`)
2. **Raw keys never returned to client** — only last 4 chars (`keyHint`) visible
3. **Input masked** with `type="password"` during entry
4. **Rate limited** — 10 setKey calls per hour per user
5. **Auth gated** — all endpoints require authenticated session
6. **sessionStorage eliminated** — no more plaintext keys in browser storage

## How to Use (User)

1. Navigate to **Settings → API Keys** tab
2. Scroll to the **LLM API Keys** card
3. Click **Add Key** next to a provider
4. Paste the API key and click **Save**
5. The key is encrypted and stored server-side
6. Only the last 4 characters are shown as confirmation

## How to Extend (Developer)

To add a new LLM provider:
1. Add the provider ID to the `providerEnum` in `apps/web/server/routers/userApiKeys.ts`
2. Add a `{ id, label }` entry to `LLM_PROVIDERS` in `UserLlmKeysPanel.tsx`
3. Use `decryptUserApiKey(userId, provider)` server-side to retrieve the key

## Test Coverage

43 tests total:
- Service layer: 16 tests (encrypt/decrypt, CRUD, edge cases)
- tRPC router: 14 tests (auth gating, validation, delegation, security)
- Frontend: 10 tests (rendering, mutations, toasts, no-leak verification)

Run: `cd apps/web && pnpm vitest run server/services/__tests__/userApiKeyService.test.ts server/routers/__tests__/userApiKeys.test.ts client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx`
