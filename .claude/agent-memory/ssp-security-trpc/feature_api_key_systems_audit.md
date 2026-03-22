---
name: API Key Systems Security Audit (Feature 044 branch)
description: Deep audit of both API key systems — public integration keys (System 1) and user LLM keys (System 2) — covering lifecycle, validation, rate limiting, and gaps
type: project
---

Deep security audit conducted 2026-03-19 on branch codex/feature-044-multimodal-chat-memory.

## System 1: Public Integration API Keys (apiKeyService.ts / apiKeys.ts router)

### Strengths (clean)
- Key generation: `crypto.randomBytes(24)` — cryptographically secure
- Storage: HMAC-SHA256 with server-side pepper (`API_KEY_HMAC_SECRET`, min 32 chars enforced at startup)
- Raw key shown exactly once (not stored) — correct
- `keyHash` has a unique index — no partial collision
- `listKeys` never returns keyHash — only keyPrefix
- `adminListAllKeys` explicitly excludes keyPrefix (admin comment notes this)
- Revocation: immediate; filter is `isActive=true` in validateKey SELECT
- Suspension: separate boolean, returns distinct 403 vs 401
- Expiry check: in-process at validateKey time (no caching)
- lastUsedAt update: fire-and-forget (does not block the hot path)
- Rate limiting on /v1/*: Redis INCR sliding window per-key + per-tenant (600 RPM tenant cap)
- Credit limit: Redis daily counter checked pre-request
- Quota (hourly/daily/weekly/monthly): enforced by quotaMiddleware(), 80% webhook warning
- Tenant isolation: all service functions take `tenantId` and use it in WHERE clauses
- Ownership check: `assertKeyOwnership()` called on revoke, updateSettings, getUsageStats
- Admin procedures use `adminProcedure` (role-gated)

### Gaps / Findings
- **No per-user key count cap**: `create` has no limit on how many keys one user can create (resource exhaustion)
- **No tRPC rate limit on `create` mutation**: The `create` procedure uses bare `protectedProcedure` with no `.use(createRateLimitMiddleware(...))`. A user can spam-create keys until the DB is flooded.
- **No brute-force protection on failed key validation**: `authorizeRequest` calls `validateKey` per request; there is no Redis counter for failed attempts per IP. An attacker can probe arbitrary `sk-ssp_*` strings with no throttle beyond the per-request cost.
- **Validation is NOT timing-safe at the string level**: `validateKey` computes HMAC then does a DB lookup by exact hash. This is safe against partial-match attacks because SQL returns 0 or 1 rows, but there is no `timingSafeEqual` on the final hash comparison — the database index lookup leaks timing info about whether the prefix bytes exist. In practice this is low risk (HMAC output is pseudorandom), but it is inconsistent with the rest of the codebase.
- **Revocation is soft-delete only**: `isActive = false`, keyHash remains in DB permanently. If the HMAC secret is later compromised, all past hashes are durable.
- **deleteWebhook uses `isActive = false` not a real delete**: the webhook URL and secretEncrypted remain in the row. Minor — no functional impact but wastes storage.
- **Key prefix leaks 16 chars of the key**: `keyPrefix = rawKey.slice(0, 16)` = "sk-ssp_XXXXXXXX" — 8 chars of tenantShortId embedded. This is intentional for identification but documents it means the first 16 chars of every key are never secret.
- **No expiry warning mechanism**: users are not notified before key expiry (only the quota system has 80% warnings). Keys silently stop working at `expiresAt`.
- **No atomic rotate endpoint**: there is no single mutation that creates a new key + revokes the old one atomically. Users must do it in two separate calls with a gap where both keys or neither key works.
- **Default expiry in UI is 365 days but optional**: `expiresInDays` is optional; omitting it creates a key that never expires. This is common but worth noting.

## System 2: User LLM API Keys (userApiKeyService.ts / userApiKeys.ts router)

### Strengths (clean)
- Storage: AES-256-GCM via `encrypt()` from crypto.ts — correct algorithm, same key as llmProviders
- Upsert on (userId, provider) — one key per provider per user enforced at DB level
- `listKeys` returns only `{ provider, keyHint }` — raw key never returned
- `decryptUserApiKey` marked "INTERNAL ONLY — never expose via tRPC or HTTP endpoint"
- No tRPC endpoint exposes decryption
- `deleteKey` uses `and(eq(userId), eq(provider))` — scoped to caller
- Rate limit on `setKey` and `deleteKey`: 10 mutations per hour per user (createRateLimitMiddleware)
- Provider is an enum — no arbitrary string injection possible
- tenantId stored alongside but scoping is by userId (user-level isolation)

### Gaps / Findings
- **keyHint is last 4 chars, not first**: `apiKey.slice(-4)` — last 4 chars of e.g. an OpenAI key are from the high-entropy random suffix, which is the right choice for identification. But for Anthropic/DeepSeek keys the last 4 chars may be predictable patterns if key formats are known. Low risk.
- **No key length validation ceiling**: min is 8 chars, max is 500 chars in the Zod schema. A 500-char encrypted blob is valid and would be encrypted/decrypted without error. Acceptable but worth noting.
- **No expiry**: LLM API keys stored for the user never expire within the system (the underlying provider key may expire, but there is no TTL or expiry mechanism in `userLlmApiKeys`).
- **No rotation endpoint**: to rotate, user must call `setKey` again (upsert). The old encrypted value is overwritten atomically by the DB unique constraint — this is actually correct atomic rotation. CLEAN.
- **tenantId is nullable** (`varchar tenantId` with no NOT NULL): for users without a tenant, keys are stored with `tenantId = null`. The lookup in `getUserApiKeys` / `deleteUserApiKey` / `decryptUserApiKey` only scopes by `userId` — not `userId + tenantId`. This means if the same `userId` exists across multiple tenants (unlikely but structurally possible), keys are shared. LOW risk given userId is globally unique in this schema.
- **No admin revocation path**: there is no admin tRPC procedure to revoke a user's LLM key on their behalf (e.g., in response to a security incident). An admin cannot clear a user's stored OpenAI key. The only remediation is direct DB access.
- **No audit logging of key set/delete events**: `setUserApiKey` and `deleteUserApiKey` write no audit trail. If a key is compromised from the DB, there is no log of when it was last set.
- **`getUserApiKeys` has no tenant scoping**: queries by `userId` only — no `tenantId` filter. Cross-tenant access is not possible since `userId` is globally unique, but the query does not match the pattern of other services.

**Why:** Audit conducted as part of Feature 044 pre-merge security review.
**How to apply:** Use findings when reviewing any subsequent changes to apiKeyService.ts, userApiKeyService.ts, or their routers.
