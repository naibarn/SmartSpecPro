# Section 02 -- API Key Service

## Overview

This section implements the core API key lifecycle: generation, HMAC-SHA256 hashing, validation, CRUD operations, and the startup assertion for the HMAC secret. It also defines shared types used across all public API sections.

**Depends on:** Section 01 (database schema -- `api_keys` table, `api_audit_events` table, and the `publicApi` feature flag must exist).

**Blocks:** Section 03 (auth extension) which wires `apiKeyService.validateKey()` into the auth middleware.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/apiKeyService.ts` | Key generation, hashing, validation, CRUD |
| `apps/web/shared/publicApiTypes.ts` | Shared types: `AuthContext`, `ALLOWED_API_SCOPES`, API error codes |
| `apps/web/server/services/__tests__/apiKeyService.test.ts` | Unit tests for the service |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/env.ts` | Add `apiKeyHmacSecret` field |

---

## Tests (Write First)

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/apiKeyService.test.ts`.

The test file should cover these scenarios. Use Vitest. Mock the database (`db`) and Redis. The service is imported from `../apiKeyService`.

### Key generation tests

```
Test: generateKey produces sk-ssp_{tenantShortId}_{random} format
  - Call createKey with a tenantId like "abc12345-...", name "Test Key", scopes ["skills:list"]
  - Assert returned rawKey starts with "sk-ssp_"
  - Assert rawKey contains a tenant short ID segment after the second underscore separator
  - Assert rawKey total length is reasonable (40-60 chars)

Test: generateKey returns raw key that matches HMAC hash stored in DB
  - Call createKey, capture rawKey
  - Compute HMAC-SHA256 of rawKey using the test API_KEY_HMAC_SECRET
  - Assert the hash stored in the mocked DB insert matches the computed hash

Test: createKey validates scopes against ALLOWED_API_SCOPES
  - Call createKey with valid scopes ["skills:list", "skills:execute"]
  - Assert no error thrown

Test: createKey rejects unknown scopes
  - Call createKey with scopes ["skills:list", "invalid:scope"]
  - Assert error thrown with message about invalid scope
```

### Key validation tests

```
Test: validateKey returns AuthContext for valid key
  - Insert a mock api_keys row with matching keyHash, isActive=true, no expiry
  - Mock the tenant feature flag query to return publicApi=true
  - Call validateKey with raw key
  - Assert result contains { userId, tenantId, mode: 'api_key', apiKeyId, scopes }

Test: validateKey rejects expired key
  - Insert mock row with expiresAt in the past
  - Call validateKey
  - Assert returns null or throws with "expired" message

Test: validateKey rejects inactive key
  - Insert mock row with isActive=false
  - Call validateKey
  - Assert returns null or throws

Test: validateKey rejects key when tenant publicApi flag is false
  - Insert valid mock row
  - Mock tenant feature flags to return publicApi=false
  - Call validateKey
  - Assert returns null or throws with "feature disabled" message

Test: validateKey is timing-safe (constant-time comparison)
  - This is a design assertion: verify the implementation uses crypto.timingSafeEqual
    or that the lookup is by hash (which is inherently timing-safe since DB lookup 
    time doesn't leak information about key prefix matching)
  - In practice, verify the code computes HMAC first then does a DB lookup by exact 
    hash match (not iterating and comparing)
```

### Revocation and update tests

```
Test: revokeKey sets isActive=false and key becomes invalid
  - Call revokeKey with keyId and tenantId
  - Assert DB update sets isActive=false
  - Assert subsequent validateKey with same raw key returns null

Test: lastUsedAt is updated after successful validation (async)
  - Call validateKey with valid key
  - Assert a non-blocking UPDATE was issued for lastUsedAt
  - The update should use fire-and-forget pattern (.catch(() => {}))
```

### Startup assertion tests

```
Test: startup assertion throws if API_KEY_HMAC_SECRET is missing
  - Clear the env var
  - Call assertHmacSecretConfigured()
  - Assert it throws with a fatal error message

Test: startup assertion throws if API_KEY_HMAC_SECRET < 32 bytes
  - Set env var to "short"
  - Call assertHmacSecretConfigured()
  - Assert it throws
```

---

## Implementation Details

### 1. Shared Types (`apps/web/shared/publicApiTypes.ts`)

Define the following exports:

**`AuthContext`** -- The unified authentication context used by all public API service functions.

```typescript
export type AuthContext = {
  userId: number;
  tenantId: string;   // varchar(36) UUID -- NOT integer
  mode: 'session' | 'api_key';
  apiKeyId?: string;
  scopes?: string[];
};
```

**`ALLOWED_API_SCOPES`** -- The 15 valid scopes for API keys. Defined as a `ReadonlySet<string>` and also as a const array for iteration in the admin UI.

The scopes are:
- `skills:list`, `skills:execute`
- `agencies:list`, `agencies:invoke`
- `llm:chat`
- `media:generate`
- `presentations:create`
- `video_projects:create`
- `jobs:create`, `jobs:read`
- `webhooks:manage`
- `events:read`
- `mcp:read`, `mcp:write`
- `api_keys:manage` *(reserved for future admin API endpoint — not used by any section 05-11 endpoint in this spec)*

**`ApiErrorCode`** -- String union of standard error codes: `invalid_api_key`, `insufficient_scopes`, `rate_limit_exceeded`, `insufficient_credits`, `daily_credit_limit`, `invalid_request`, `not_found`, `internal_error`, `feature_disabled`.

**`ApiErrorResponse`** -- Type for the OpenAI-compatible error format:
```typescript
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    type: string;  // e.g. "auth_error", "billing_error", "invalid_request_error"
  };
}
```

### 2. Environment Variable (`apps/web/server/_core/env.ts`)

Add to the `ENV` object:

```typescript
apiKeyHmacSecret: process.env.API_KEY_HMAC_SECRET ?? "",
```

This is a server-only variable. It must NOT use the `VITE_` prefix.

### 3. API Key Service (`apps/web/server/services/apiKeyService.ts`)

This is the core file. It exports functions for key lifecycle management.

#### 3a. Constants and Helpers

- `KEY_PREFIX = "sk-ssp_"` -- all generated keys start with this
- Import `crypto` from Node.js standard library
- Import the `api_keys` table from `drizzle/schema`
- Import `ENV` from `_core/env`
- Import `ALLOWED_API_SCOPES` from `shared/publicApiTypes`

**`computeKeyHash(rawKey: string): string`** -- Internal helper:
- Uses `crypto.createHmac('sha256', ENV.apiKeyHmacSecret)` 
- Updates with `rawKey`
- Returns hex digest
- This is the "server pepper" approach: even if the DB is compromised, the hashes cannot be reversed without knowing `API_KEY_HMAC_SECRET`

**`generateRawKey(tenantId: string): string`** -- Internal helper:
- Extracts first 8 chars of tenantId as `tenantShortId`
- Generates 24 random bytes, encodes as base64url (removing padding)
- Returns `sk-ssp_${tenantShortId}_${randomPart}`

#### 3b. `assertHmacSecretConfigured()`

Exported function called during server startup (in `apps/web/server/_core/index.ts`).

- Checks `ENV.apiKeyHmacSecret` exists and has length >= 32
- If not, throws `new Error("FATAL: API_KEY_HMAC_SECRET must be set to a string of at least 32 characters")`
- This prevents the server from starting in an insecure state

#### 3c. `createKey(tenantId, userId, name, scopes, options?)`

Parameters:
- `tenantId: string` -- the tenant UUID
- `userId: number` -- the creating user's ID
- `name: string` -- human-readable label (max 100 chars)
- `scopes: string[]` -- array of scope strings
- `options?: { expiresAt?: Date; rateLimit?: number; creditLimit?: number; metadata?: Record<string, any> }`

Logic:
1. Validate every scope in `scopes` against `ALLOWED_API_SCOPES`. Throw if any unknown scope found.
2. Call `generateRawKey(tenantId)` to get the raw key
3. Call `computeKeyHash(rawKey)` to get the hash
4. Extract `keyPrefix` as first 16 characters of rawKey
5. Generate a UUID for `id`
6. Insert into `api_keys` table with all fields
7. Return `{ id, rawKey, keyPrefix }` -- rawKey is returned exactly once here

#### 3d. `validateKey(rawKey: string): Promise<AuthContext | null>`

This is the **hot path** -- called on every API request. Must be fast.

Logic:
1. Check `rawKey` starts with `KEY_PREFIX`. If not, return `null` immediately.
2. Compute `hash = computeKeyHash(rawKey)`
3. Query `api_keys` WHERE `keyHash = hash AND isActive = true`
4. If no row found, return `null`
5. If `expiresAt` is set and is in the past, return `null`
6. Query tenant feature flags to check `publicApi` is enabled. If not, return `null`.
7. Fire-and-forget update of `lastUsedAt`: `db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {})` -- non-blocking
8. Return `AuthContext` object: `{ userId: row.userId, tenantId: row.tenantId, mode: 'api_key', apiKeyId: row.id, scopes: row.scopes }`

**Security note on timing safety:** Because the lookup is done by exact hash match in the database (not by iterating keys and comparing), there is no timing side-channel. The DB returns 0 or 1 rows; there is no partial match to leak information.

#### 3e. `listKeys(tenantId: string, userId?: number)`

Query `api_keys` WHERE `tenantId = tenantId`. If `userId` is provided, additionally filter by `userId` (for non-admin users who can only see their own keys).

Return rows **without** `keyHash` -- only `id`, `name`, `keyPrefix`, `scopes`, `rateLimit`, `creditLimit`, `expiresAt`, `lastUsedAt`, `isActive`, `createdAt`.

#### 3f. `revokeKey(keyId: string, tenantId: string)`

Update `api_keys` SET `isActive = false, updatedAt = now()` WHERE `id = keyId AND tenantId = tenantId`.

Return `{ revoked: true }` or throw if key not found.

#### 3g. `getKeyUsageStats(keyId: string, tenantId: string)`

Aggregate from `api_audit_events` WHERE `apiKeyId = keyId`:
- Total requests (COUNT)
- Total credits used (SUM of `creditsUsed`)
- Requests by day (for chart data, last 30 days)
- Error count (COUNT WHERE `statusCode >= 400`)

This function is used by the admin UI dashboard (Section 12). It does not need to be highly optimized since it is called infrequently.

### 4. Integration with Server Startup

In `apps/web/server/_core/index.ts`, near the top of the server initialization (before routes are mounted), call:

```typescript
import { assertHmacSecretConfigured } from "../services/apiKeyService";

// Fail fast if HMAC secret is missing
assertHmacSecretConfigured();
```

This ensures the server does not start without the required secret, preventing a scenario where API keys could be created but never validated (or vice versa).

---

## Key Design Decisions

1. **HMAC-SHA256 with server pepper vs plain SHA-256:** Plain SHA-256 hashes are vulnerable to rainbow table attacks if the database is compromised. HMAC with a server-side secret (`API_KEY_HMAC_SECRET`) means the attacker also needs the secret, which is stored only in the `.env` file, not in the database.

2. **`sk-ssp_` prefix:** Makes API keys visually identifiable and allows the auth middleware (Section 03) to quickly route to the API key validation path without attempting JWT verification first.

3. **Fire-and-forget `lastUsedAt`:** Updating the last-used timestamp on every request would add latency to the hot path. Using a non-blocking update with `.catch(() => {})` ensures the response is not delayed.

4. **Scopes as JSON array:** Stored in the `api_keys.scopes` JSON column. This is flexible and avoids the need for a many-to-many join table, which is appropriate given the small number of scopes (15).

5. **`tenantId` is `string` (varchar(36)):** The `tenants` table uses varchar primary keys, not integers. This is a critical detail that affects all queries and types.

---

## Security Considerations

- The raw API key is returned **exactly once** during creation and is never stored. If lost, the user must revoke and create a new key.
- The `keyHash` column has a UNIQUE index, preventing accidental duplicate key insertion.
- The `API_KEY_HMAC_SECRET` environment variable must never be logged, included in error messages, or exposed via API responses.
- The `keyPrefix` (first 16 chars) is stored for display purposes only and cannot be used to derive the full key.