Now I have all the context I need. Let me compile the section content.

# Section 11: F06 -- Inbound Webhook & Event Triggers

## Overview

This section implements the inbound webhook trigger system that allows external services to programmatically send events into SmartSpecPro conversations, agencies, or workflows. The system provides a public HTTP endpoint per trigger, with HMAC or token-based authentication, rate limiting, template-based variable substitution, credit deduction, and a management UI with delivery logs.

**Feature flag:** `webhookTriggers` (default: `false`) -- must be enabled per tenant before any trigger endpoints become active.

### Dependencies

- **section-01-database** (must be completed first): Provides the `webhook_triggers` and `webhook_trigger_logs` tables, and the `webhook` value in the `creditSourceTypeEnum`.
- **section-14-feature-flags**: Provides the `webhookTriggers` feature flag in `TenantFeatureFlags`. This section can be implemented in parallel, but enforcement at route level references that flag.

### Key Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/routes/webhookTrigger.ts` | Express route: `POST /api/webhooks/trigger/:triggerId` |
| `apps/web/server/services/webhookTriggerService.ts` | Business logic: auth verification, template substitution, dispatch |
| `apps/web/server/routers/webhookTriggers.ts` | tRPC router: CRUD for triggers, delivery logs, test endpoint |
| `apps/web/client/src/pages/WebhookTriggers.tsx` | Admin UI: trigger management, test panel, delivery logs |
| `apps/web/server/routes/__tests__/webhookTrigger.test.ts` | Tests for the Express route and service layer |
| `apps/web/server/routers/__tests__/webhookTriggers.test.ts` | Tests for the tRPC router |

### Key Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Mount the new webhook trigger Express route |
| `apps/web/server/_core/index.ts` | Add CSRF bypass for `/api/webhooks/trigger/` paths |
| `apps/web/client/src/App.tsx` | Add route for WebhookTriggers page |
| `apps/web/client/src/hooks/useMenuItems.ts` | Add menu entry for webhook triggers |

---

## Tests (Write First)

All tests use Vitest with hoisted mocks following existing project conventions.

### File: `apps/web/server/routes/__tests__/webhookTrigger.test.ts`

```typescript
/**
 * Tests for POST /api/webhooks/trigger/:triggerId
 *
 * Covers: token auth, HMAC auth, replay protection, rate limiting,
 * template substitution ordering, credit checks, dedup, secret stripping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies: db, redis, creditService, auditLogger, crypto (decrypt)
// Use vi.hoisted() pattern consistent with existing test files

describe("webhookTrigger route", () => {
  describe("auth_type: token", () => {
    it("validates token with crypto.timingSafeEqual and returns 200 on match", async () => {
      // Setup: trigger with auth_type='token', auth_secret_encrypted stored
      // Send request with Authorization: Bearer <correct-token>
      // Assert: 200 response, processing continues
    });

    it("rejects invalid token with 401", async () => {
      // Send request with wrong token
      // Assert: 401, webhook_trigger_logs entry with status='auth_failed'
    });
  });

  describe("auth_type: hmac_sha256", () => {
    it("validates HMAC signature with timestamp header", async () => {
      // Setup: trigger with auth_type='hmac_sha256'
      // Send request with X-Webhook-Timestamp and X-Webhook-Signature headers
      // HMAC = SHA256(secret, timestamp + "." + JSON.stringify(body))
      // Assert: 200 response
    });

    it("rejects HMAC replay when timestamp is >300s old", async () => {
      // Send request with timestamp from 6 minutes ago
      // Assert: 401, status='auth_failed', error mentions timestamp
    });

    it("rejects HMAC replay when timestamp is >300s in the future", async () => {
      // Send request with timestamp 6 minutes in the future
      // Assert: 401
    });
  });

  describe("processing order", () => {
    it("runs template substitution only AFTER auth succeeds", async () => {
      // Send request with invalid auth but valid template variables
      // Assert: template substitution function was NOT called
      // This prevents oracle attacks where template errors leak info
    });
  });

  describe("deduplication", () => {
    it("dedup key includes body hash to prevent same-second false dedup", async () => {
      // Send two requests within same second with different bodies
      // Assert: both are processed (not deduped)
    });

    it("rejects exact duplicate request within 5-minute window", async () => {
      // Send identical request twice
      // Assert: first succeeds, second returns 200 but is not re-processed
      // Redis key format: webhook:dedup:{triggerId}:{timestamp}:{bodyHash}
    });
  });

  describe("rate limiting", () => {
    it("enforces per-trigger rate_limit_per_minute", async () => {
      // Setup: trigger with rate_limit_per_minute=2
      // Send 3 requests within 1 minute
      // Assert: first two succeed, third returns 429
      // webhook_trigger_logs entry with status='rate_limited'
    });
  });

  describe("credit checks", () => {
    it("returns 402 when tenant has insufficient credits", async () => {
      // Setup: trigger owner has 0 credits
      // Assert: 402 response, status='credit_insufficient' in logs
    });
  });

  describe("secret pattern stripping", () => {
    it("strips values matching secret patterns from extracted_variables before log storage", async () => {
      // Send body with { "api_key": "sk-abc123", "event": "test" }
      // Assert: extracted_variables in webhook_trigger_logs has api_key='[REDACTED]'
      // Patterns: /^(sk-|ghp_|xoxb-|Bearer )/i
    });
  });
});
```

### File: `apps/web/server/routers/__tests__/webhookTriggers.test.ts`

```typescript
/**
 * Tests for webhookTriggers tRPC router
 *
 * Covers: CRUD operations, template validation, delivery log queries,
 * test endpoint, tenant isolation, RBAC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("webhookTriggers router", () => {
  describe("create", () => {
    it("creates a trigger and encrypts the auth secret", async () => {
      // Assert: auth_secret_encrypted is stored via encrypt()
      // Assert: returned trigger has the generated triggerId (UUID)
    });

    it("rejects payload_template with non-allowlisted patterns at save time", async () => {
      // Template containing {{ system.env }} or {{ __proto__ }}
      // Assert: Zod validation error, trigger not created
    });

    it("validates payload_template max length of 2000 chars", async () => {
      // Assert: rejection when template exceeds 2000 chars
    });
  });

  describe("list", () => {
    it("returns only triggers belonging to the caller's tenant", async () => {
      // Assert: no cross-tenant leakage
    });
  });

  describe("update", () => {
    it("allows updating name, rate_limit, template, is_active", async () => {});

    it("rejects update on trigger belonging to different tenant", async () => {
      // Assert: NOT_FOUND or FORBIDDEN
    });
  });

  describe("delete", () => {
    it("deletes trigger and cascading logs", async () => {});
  });

  describe("getLogs", () => {
    it("returns delivery logs for a trigger ordered by created_at DESC", async () => {});

    it("rejects log query for trigger belonging to different tenant", async () => {});
  });

  describe("test", () => {
    it("sends a test payload to the trigger endpoint and returns the result", async () => {
      // Assert: webhook_trigger_logs entry created with test flag
    });
  });
});
```

---

## Implementation Details

### 11.1 Webhook Trigger Express Route

**File:** `apps/web/server/routes/webhookTrigger.ts`

Create an Express Router with a single route: `POST /api/webhooks/trigger/:triggerId`.

The processing order is strictly enforced -- steps must execute in this exact sequence:

1. **Lookup trigger** -- Query `webhook_triggers` by `triggerId` (the UUID PK). Return 404 if not found or `is_active === false`.

2. **Feature flag check** -- Load the trigger's tenant and verify `tenants.settings.featureFlags.webhookTriggers === true`. Return 403 if disabled.

3. **Auth verification** (before any template processing):
   - If `auth_type === 'token'`: Extract the bearer token from the `Authorization` header. Decrypt the stored `auth_secret_encrypted` using `decrypt()` from `apps/web/server/services/crypto.ts`. Compare using `crypto.timingSafeEqual()` (buffer both to equal length first). Return 401 on mismatch.
   - If `auth_type === 'hmac_sha256'`: Read `X-Webhook-Timestamp` and `X-Webhook-Signature` headers. Validate `|Date.now()/1000 - timestamp| <= 300`. Compute `HMAC-SHA256(decrypted_secret, timestamp + "." + rawBody)`. Compare with `crypto.timingSafeEqual()`. Return 401 on mismatch.

4. **Deduplication** -- Compute `SHA-256(rawBody)` as `bodyHash`. Build Redis key: `webhook:dedup:{triggerId}:{timestamp}:{bodyHash}`. Use `SET NX EX 300` (5-minute TTL). If key already exists, log but return 200 without re-processing.

5. **Rate limit check** -- Use Redis `INCR` with a 60-second sliding window key: `webhook:ratelimit:{triggerId}:{minuteBucket}`. Compare against `trigger.rate_limit_per_minute`. Return 429 if exceeded.

6. **Credit check** -- Verify the trigger's owner (`user_id`) has sufficient credits via `creditService.hasEnoughCredits()`. Return 402 if insufficient.

7. **Template substitution** -- Apply restricted variable-only replacement on `trigger.payload_template`. Only allowlisted patterns are substituted (see 11.2 below).

8. **Target dispatch** -- Based on `trigger.target_type`:
   - `'chat'`: Create a user message in the target conversation via `chatService.createMessage()` and trigger LLM response.
   - `'agency'`: Send to the agency via `agencyBridge` with the substituted payload.
   - `'workflow'`: Enqueue a workflow execution with the substituted payload as input.

9. **Logging** -- Insert a row into `webhook_trigger_logs` with processing status, timing, credits consumed, and sanitized variables. Increment `webhook_triggers.total_triggers` and set `last_triggered_at`.

10. **Return 200 immediately** after auth succeeds (before async dispatch). This follows the webhook best practice of fast acknowledgment. The dispatch itself runs asynchronously.

**Mounting the route in `apps/web/server/_core/index.ts`:**

Add the route mount alongside other webhook routes. The route must be mounted before the CSRF middleware, or the CSRF bypass must be extended:

```typescript
// In the csrfCheck middleware's bypass list, add:
req.path.startsWith("/api/webhooks/trigger/") ||
req.originalUrl.startsWith("/api/webhooks/trigger/")
```

Mount the router:

```typescript
import { createWebhookTriggerRouter } from "../routes/webhookTrigger";

// After existing webhook routes
app.use("/api/webhooks/trigger", express.json({ limit: "1mb" }), createWebhookTriggerRouter());
```

### 11.2 Auth & Security

**HMAC Replay Protection:**

The HMAC scheme uses a timestamp-based replay window. The caller must include:
- `X-Webhook-Timestamp`: Unix epoch seconds (integer)
- `X-Webhook-Signature`: Hex-encoded HMAC-SHA256

The HMAC input string is: `timestamp + "." + rawBody` (the raw JSON string, not parsed).

The server verifies:
1. `|Math.floor(Date.now() / 1000) - parseInt(timestamp)| <= 300` (5-minute window)
2. `crypto.timingSafeEqual(computedSignatureBuffer, receivedSignatureBuffer)`

Both the token and HMAC verifications use `crypto.timingSafeEqual()` to prevent timing attacks. When comparing strings of different lengths, pad or reject before comparison -- `timingSafeEqual` throws if buffer lengths differ.

**Dedup key with body hash:**

The Redis dedup key is: `webhook:dedup:{triggerId}:{timestamp}:{SHA256(rawBody)}`.

Including the body hash prevents false dedup when two legitimately different requests arrive within the same second. Without the body hash, two different payloads with the same timestamp would collide.

**Template Substitution (Restricted):**

Template substitution uses a simple regex-based variable replacement -- NOT Jinja2 or any template engine. This eliminates SSTI (Server-Side Template Injection) risk.

Allowlisted variable patterns (validated at save time AND at substitution time):
- `{{event.type}}` -- the webhook event type from the inbound body
- `{{event.data}}` -- the full event data object (JSON stringified)
- `{{event.data.*}}` -- dot-notation access to specific data fields (max 3 levels deep)
- `{{trigger.name}}` -- the trigger's name
- `{{trigger.id}}` -- the trigger's ID
- `{{timestamp}}` -- the request timestamp

Validation rules (enforced at trigger create/update time via Zod):
- Max template length: 2000 characters
- Only `{{...}}` patterns from the allowlist are permitted
- Any pattern not in the allowlist causes a Zod validation error at save time
- No nested templates or expressions

Implementation approach:
```typescript
const ALLOWED_VARS = /^\{\{(event\.type|event\.data(\.\w+){0,3}|trigger\.name|trigger\.id|timestamp)\}\}$/;

function validateTemplate(template: string): boolean {
  const matches = template.match(/\{\{[^}]+\}\}/g) || [];
  return matches.every(m => ALLOWED_VARS.test(m));
}

function substituteTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    // Resolve dot-notation path against vars object
    // Return empty string for unresolved vars (not the raw template)
  });
}
```

**Secret Pattern Stripping:**

Before storing `extracted_variables` in `webhook_trigger_logs`, strip values that match known secret patterns:

```typescript
const SECRET_PATTERNS = [/^sk-/i, /^ghp_/i, /^xoxb-/i, /^Bearer /i, /^gho_/i, /^glpat-/i];

function stripSecrets(vars: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...vars };
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "string" && SECRET_PATTERNS.some(p => p.test(value))) {
      sanitized[key] = "[REDACTED]";
    }
  }
  return sanitized;
}
```

**Request body logging safety:**

- `request_headers_safe` stores only an allowlist of headers: `Content-Type`, `User-Agent`, `X-Forwarded-For`. No auth headers.
- `request_body_hash` stores the SHA-256 hash of the body, not the body itself.
- `request_body_size` stores the byte length.
- `source_ip_masked` stores only the /24 prefix of the source IP (e.g., `192.168.1.0/24`).

### 11.3 tRPC Router for Trigger Management

**File:** `apps/web/server/routers/webhookTriggers.ts`

Create a tRPC router with the following procedures. All procedures use `protectedProcedure` (authenticated user) and enforce tenant isolation.

**Procedures:**

- `list` -- Query: Returns all triggers for the caller's current tenant. Include `total_triggers` and `last_triggered_at` for display.

- `getById` -- Query: Returns a single trigger by ID. Validates tenant ownership. Does NOT return the decrypted secret -- returns `authSecretConfigured: true/false` instead.

- `create` -- Mutation: Creates a new trigger. Input validated via Zod:
  - `name`: string, min 1, max 100
  - `description`: string, optional, max 500
  - `auth_type`: enum `'token' | 'hmac_sha256'`
  - `auth_secret`: string (plaintext, encrypted before storage via `encrypt()`)
  - `target_type`: enum `'chat' | 'agency' | 'workflow'`
  - `target_conversation_id`, `target_agency_id`, `target_workflow_id`: conditional based on target_type
  - `payload_template`: optional JSON object, max 2000 chars when stringified, validated for allowlisted patterns only
  - `rate_limit_per_minute`: integer, min 1, max 1000, default 10
  - `monthly_trigger_budget`: optional integer
  - Returns: the created trigger with its ID and the full webhook URL (`https://smartaihub.app/api/webhooks/trigger/{triggerId}`)

- `update` -- Mutation: Updates an existing trigger. Validates tenant ownership. If `auth_secret` is provided, re-encrypts. Validates template patterns on update.

- `delete` -- Mutation: Soft-deletes (sets `is_active = false`) or hard-deletes. Logs are cascade-deleted by FK constraint.

- `getLogs` -- Query: Returns delivery logs for a trigger, ordered by `created_at DESC`, paginated. Validates trigger belongs to caller's tenant.

- `testTrigger` -- Mutation: Sends a synthetic test request to the trigger's own endpoint and returns the result. Useful for verifying configuration without an external caller. Marks the log entry with a `test: true` metadata flag.

- `regenerateSecret` -- Mutation: Generates a new auth secret, encrypts and stores it, returns the plaintext once (caller must copy). The old secret immediately stops working.

**RBAC:**
- Any authenticated user in the tenant can create/manage their own triggers
- `domain_admin` can view and manage all triggers in their tenant
- `admin` can view and manage all triggers across all tenants

### 11.4 Webhook Trigger Service

**File:** `apps/web/server/services/webhookTriggerService.ts`

Encapsulates business logic that both the Express route and tRPC router share:

```typescript
/**
 * Core service for webhook trigger operations.
 *
 * Handles: auth verification, rate limiting, template substitution,
 * dedup checking, credit verification, target dispatch, and log recording.
 */

export interface WebhookTriggerService {
  /** Verify auth (token or HMAC) for an incoming request */
  verifyAuth(trigger: WebhookTrigger, req: Request): Promise<AuthResult>;

  /** Check and enforce rate limit */
  checkRateLimit(triggerId: string, limit: number): Promise<boolean>;

  /** Check dedup key in Redis */
  checkDedup(triggerId: string, timestamp: string, bodyHash: string): Promise<boolean>;

  /** Validate and substitute template variables */
  substituteTemplate(template: object, body: unknown): Record<string, unknown>;

  /** Dispatch to target (chat/agency/workflow) */
  dispatchToTarget(trigger: WebhookTrigger, payload: Record<string, unknown>): Promise<DispatchResult>;

  /** Record execution in webhook_trigger_logs */
  recordLog(triggerId: string, logData: WebhookLogInput): Promise<void>;

  /** Strip secret patterns from variable values */
  stripSecrets(vars: Record<string, unknown>): Record<string, unknown>;
}
```

### 11.5 Frontend: WebhookTriggers.tsx

**File:** `apps/web/client/src/pages/WebhookTriggers.tsx`

A page-level component for managing webhook triggers. Features:

1. **Trigger List** -- Table showing all triggers for the tenant with columns: name, target type, auth type, status (active/inactive), total triggers count, last triggered time, actions (edit/delete/toggle).

2. **Create/Edit Dialog** -- Form with:
   - Name and description fields
   - Auth type selector (token or HMAC-SHA256) with secret input
   - Target type selector with conditional fields (conversation picker, agency picker, workflow picker)
   - Payload template editor with syntax highlighting for `{{variable}}` patterns
   - Rate limit and monthly budget configuration

3. **Webhook URL Display** -- After creation, show the full URL with copy button: `https://smartaihub.app/api/webhooks/trigger/{triggerId}`

4. **Test Panel** -- Button to send a test payload. Shows the response status, timing, and any error message.

5. **Request Inspector / Delivery Logs** -- Expandable section per trigger showing recent delivery logs: timestamp, status (color-coded), processing time, credits consumed, error message (if any). Paginated.

6. **Payload Preview** -- When editing a template, show a live preview with variable placeholders highlighted in a distinct color.

The page should be gated by the `webhookTriggers` feature flag. If the flag is disabled, show a "Feature not enabled" placeholder with instructions to contact the domain admin.

### Database Schema Reference

These tables are created by section-01-database. Included here for reference only -- do not re-create them.

**Table: `webhook_triggers`**

| Column | Type | Constraints |
|--------|------|------------|
| id | varchar(36) | PK (UUID) |
| tenant_id | varchar(36) | FK tenants NOT NULL ON DELETE CASCADE |
| user_id | integer | FK users NOT NULL ON DELETE CASCADE |
| name | text | NOT NULL |
| description | text | nullable |
| auth_type | text | NOT NULL, default 'token', CHECK ('token', 'hmac_sha256') |
| auth_secret_encrypted | text | NOT NULL |
| target_type | text | NOT NULL, CHECK ('chat', 'agency', 'workflow') |
| target_conversation_id | integer | FK conversations, nullable, ON DELETE SET NULL |
| target_agency_id | varchar(36) | FK agencies, nullable, ON DELETE SET NULL |
| target_workflow_id | integer | FK workflows, nullable, ON DELETE SET NULL |
| payload_template | jsonb | default '{}', max 2000 chars |
| rate_limit_per_minute | integer | default 10 |
| monthly_trigger_budget | integer | nullable |
| is_active | boolean | default true |
| total_triggers | integer | default 0 |
| last_triggered_at | timestamptz | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Index: `(tenant_id, is_active)`

**Table: `webhook_trigger_logs`**

| Column | Type | Constraints |
|--------|------|------------|
| id | varchar(36) | PK (UUID) |
| trigger_id | varchar(36) | FK webhook_triggers NOT NULL ON DELETE CASCADE |
| request_method | text | nullable |
| request_headers_safe | jsonb | allowlist: Content-Type, User-Agent, X-Forwarded-For only |
| request_body_hash | varchar(64) | SHA-256 hex digest |
| request_body_size | integer | byte length |
| extracted_variables | jsonb | secret patterns stripped before storage |
| source_ip_masked | text | /24 prefix only |
| status | text | NOT NULL, CHECK ('success', 'auth_failed', 'rate_limited', 'target_error', 'credit_insufficient') |
| target_execution_id | text | nullable (conversation/agency/workflow execution ID) |
| credits_consumed | numeric(12,4) | default 0 |
| error_message | text | nullable |
| processing_time_ms | integer | nullable |
| created_at | timestamptz | default now() |

Index: `(trigger_id, created_at DESC)`

---

## Implementation Checklist

1. Write all test files first (`webhookTrigger.test.ts`, `webhookTriggers.test.ts`)
2. Create `apps/web/server/services/webhookTriggerService.ts` with the core service logic
3. Create `apps/web/server/routes/webhookTrigger.ts` with the Express route
4. Modify `apps/web/server/_core/index.ts` to mount the route and add CSRF bypass
5. Create `apps/web/server/routers/webhookTriggers.ts` with the tRPC router
6. Register the tRPC router in the app router (merge into existing router tree)
7. Create `apps/web/client/src/pages/WebhookTriggers.tsx` with the management UI
8. Add the page route in `apps/web/client/src/App.tsx`
9. Add menu entry in `apps/web/client/src/hooks/useMenuItems.ts`

---

## As-Built Notes (updated post code review)

### Deviations from Plan

- **`testTrigger` procedure**: Not implemented in this section (deferred). The tRPC router skeleton exists but the procedure is absent. This will be added in a future section once the test infrastructure is clearer.
- **Credit deduction**: `hasEnoughCredits()` check implemented but `deductCredits()` deferred to section 12+ when target dispatch is wired. Credits logged as 0 until then; a TODO comment marks the deduction point.
- **Target dispatch**: Stub only — logs the payload keys to audit log. Real dispatch (chat/agency/workflow) wired in section 12+.
- **Soft-delete only**: `delete` procedure sets `is_active = false`, does not hard-delete. Log cascade-delete deferred.

### Code Review Fixes Applied

- **H1** — `verifyTokenAuth`: Fixed timing oracle. Rejects immediately on length mismatch (before `timingSafeEqual`), eliminating padding trick that leaked secret length.
- **H2** — `verifyHmacAuth`: Added explicit 32-byte length check after hex decode for belt-and-suspenders validation.
- **H3** — Dedup: For token-auth requests, dedup key always uses server-synthesized timestamp (ignores caller-supplied `X-Webhook-Timestamp`), preventing DoS/bypass via crafted dedup keys.
- **H4** — `totalTriggers`: Fixed non-atomic read-modify-write. Now uses SQL expression `totalTriggers + 1` for safe concurrent increment.
- **H5** — Fixed wrong audit `eventType`: was `webhook_ingest_error`, now `webhook_dispatch_stub`.
- **H7** — CSRF bypass: Removed dead `req.path.startsWith('/webhooks/trigger/')` check (missing `/api` prefix). Only `req.originalUrl` check is correct.
- **M2** — `requireTriggerOwnership` now accepts optional `userId`; all mutations pass caller's userId so users can only manage their own triggers.
- **M3** — Feature flag gate added to `list` tRPC procedure (not just the Express route). Page shows a "Feature not enabled" placeholder for FORBIDDEN errors.
- **M4** — Rate limit race fixed: uses Redis `pipeline()` with `INCR + EXPIRE` atomically instead of separate calls.
- **M6** — `list` procedure excludes `authSecretEncrypted` using `getTableColumns()` destructuring (least-privilege).
- **M7** — `stripSecrets` now recursively traverses nested objects and arrays.
- **L1** — Delete confirmation uses Radix `AlertDialog` instead of `window.confirm()`.
- **L2** — Regenerated secret shown in a modal dialog with a copyable `<Input>` field instead of a toast.

### Final Test Count

- `server/routes/__tests__/webhookTrigger.test.ts`: 25 tests (all pass)
- `server/routers/__tests__/webhookTriggers.test.ts`: 12 tests (all pass)
- Total: 37 tests
10. Verify all tests pass with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`