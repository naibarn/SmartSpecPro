# Section 15: Security Checklist, Resource Optimization, and Nginx Configuration

This section covers three cross-cutting concerns that apply to the entire ClawFeature implementation: a comprehensive security checklist that must be verified before and during implementation, resource optimization strategies for the constrained server environment, and Nginx configuration changes required by multiple features (voice WebSocket, widget WebSocket, sandbox subdomain, channel webhooks).

**Depends on:** section-01-database (schema must exist), and logically all feature sections (02-14) since this section verifies their security properties.

**Parallelizable:** Yes, but should be implemented as a final validation pass after all feature sections are complete.

---

## Background and Context

SmartSpecPro runs on a single server with constrained RAM and CPU, serving 20-100 tenants and 1K-10K concurrent users. The production domain is `https://smartaihub.app`. Nginx reverse-proxies all traffic from ports 80/443 to the Node.js backend (`:3000`) and Python backend (`:8000`).

Key infrastructure files:
- **Nginx config:** `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf`
- **Rate limit zones:** `/home/dev/projects/SmartSpecPro/nginx/conf.d/00-rate-limits.conf`
- **Encryption utilities:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts` (AES-256-GCM)
- **Redis clients:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/redisClients.ts` (cache + realtime split)
- **Delivery queue (BullMQ):** `/home/dev/projects/SmartSpecPro/apps/web/server/services/deliveryQueue.ts`

The existing Nginx config already has:
- Upstream definitions for `backend_host` (`:8000`) and `web_host` (`:3000`)
- SSL server block for `smartaihub.app` with TLS 1.2/1.3
- Rate limit zones: `api_limit` (10r/s), `web_limit` (20r/s), `conn_limit` (concurrent per IP)
- WebSocket support at `/ws` (generic) and SSE for agency streams
- Internal route blocking at `/internal/`

---

## Tests

There is no TDD stub section explicitly for section 15 in the test plan because this section is a cross-cutting verification layer. However, the following test files must be created to validate the security infrastructure, Nginx configuration correctness, and resource optimization patterns.

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/securityChecklist.test.ts`

This test verifies the security utility functions and patterns that are shared across features.

```typescript
import { describe, it, expect } from "vitest";

describe("Security Checklist — HMAC Verification Patterns", () => {
  it("timingSafeEqual is used for all webhook signature checks (static analysis assertion)");
  // Validate that crypto.timingSafeEqual is imported and used in:
  // - telegramWebhook.ts (or its adapter successor)
  // - whatsapp adapter
  // - LINE adapter
  // - Slack adapter
  // - inbound webhook trigger handler
  // - widget init token verification

  it("rejects HMAC signature with wrong length gracefully (no throw, returns false)");
  // Ensures Buffer length mismatch is handled before timingSafeEqual call

  it("rejects HMAC signature with timestamp outside 5-minute window");
  // For webhook replay protection
});

describe("Security Checklist — Secrets Encryption", () => {
  it("channel_credentials.credentialsEncrypted is stored using encrypt()");
  // Verify insert path uses encrypt() from crypto.ts

  it("decrypted secrets are never included in tRPC responses");
  // Verify admin list endpoints return configured: true/false, not raw values
});

describe("Security Checklist — Feature Flag Enforcement", () => {
  it("disabled feature flag returns 403 from tRPC middleware");
  // Test the middleware guard pattern used across features

  it("disabled feature flag hides UI component (React conditional)");
  // Ensure components check flag before rendering
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/resourceLimits.test.ts`

This test validates the Redis-based concurrency limiting patterns shared across voice, browser, and widget features.

```typescript
import { describe, it, expect } from "vitest";

describe("Resource Limits — Redis Semaphore Pattern", () => {
  it("acquires semaphore slot when count is below limit");
  it("rejects acquisition when semaphore is at capacity");
  it("releases semaphore slot correctly on session end");
  it("semaphore keys have TTL to prevent orphaned locks");
});

describe("Resource Limits — Concurrency Caps", () => {
  it("browser sessions limited to 1 per user, 2 per tenant");
  it("voice sessions limited to 1 per user");
  it("widget connections respect per-visitor session cap");
});

describe("Resource Limits — Lazy Initialization", () => {
  it("channel adapters are not initialized until first use");
  it("widget WebSocket handler initializes on first message, not on page load");
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/nginxConfig.test.ts`

This is a configuration validation test, not a unit test. It reads the Nginx config file and asserts the required location blocks exist.

```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Nginx Configuration Validation", () => {
  const configPath = path.resolve(
    __dirname,
    "../../../../../../nginx/conf.d/dev-host.conf"
  );

  let config: string;

  it("nginx config file exists", () => {
    config = fs.readFileSync(configPath, "utf-8");
    expect(config).toBeTruthy();
  });

  it("has voice WebSocket location with upgrade headers", () => {
    expect(config).toContain("location /api/voice/stream");
    expect(config).toContain('proxy_set_header Upgrade $http_upgrade');
    expect(config).toContain('proxy_set_header Connection "upgrade"');
  });

  it("has widget WebSocket location with upgrade headers", () => {
    expect(config).toContain("location /widget/v1/ws");
    expect(config).toContain('proxy_set_header Upgrade $http_upgrade');
  });

  it("has sandbox.smartaihub.app server block", () => {
    expect(config).toContain("server_name sandbox.smartaihub.app");
  });

  it("has strict CSP for sandbox server block", () => {
    // Sandbox must have connect-src 'none' to prevent data exfiltration
    expect(config).toContain("connect-src 'none'");
  });

  it("has channel webhook route proxied to web_host", () => {
    // Generalized /webhooks/:channelType/:connectionId route
    expect(config).toMatch(/location.*\/webhooks\//);
  });

  it("voice WebSocket has 300s read timeout (5-min session max)", () => {
    // Extract the voice location block and check timeout
    const voiceBlock = config.match(
      /location \/api\/voice\/stream \{[\s\S]*?\}/
    );
    expect(voiceBlock?.[0]).toContain("proxy_read_timeout 300s");
  });

  it("widget WebSocket has 600s read timeout (long-lived sessions)", () => {
    const widgetBlock = config.match(
      /location \/widget\/v1\/ws \{[\s\S]*?\}/
    );
    expect(widgetBlock?.[0]).toContain("proxy_read_timeout 600s");
  });
});
```

---

## Implementation Details

### Part A: Security Checklist Verification

This is a verification pass, not new code. The implementer must audit each feature section's output and confirm these security properties hold. If any property is missing, the deficiency must be fixed in the respective feature section before marking this section complete.

#### A1. Pre-Implementation Security Blockers

These five items are hard requirements that must be true in the codebase before any feature goes live. Each maps to a specific file and code location.

1. **No `auth_type: 'none'` for webhooks** -- The `webhook_triggers` table (created in section-01-database) must have a CHECK constraint ensuring `auth_type` is either `'token'` or `'hmac_sha256'`. The schema definition in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` must include this constraint. Verify by attempting an INSERT with `auth_type = 'none'` and confirming it fails.

2. **No Jinja2 templates** -- The webhook trigger processing (section-11-webhooks) must use regex-only variable substitution (`{{variable_name}}` replaced via string replace), never a template engine. Verify by searching for any `jinja`, `nunjucks`, `handlebars`, or `ejs` imports in the webhook-related files.

3. **Tenant isolation on cross-agency calls** -- The `agency_call_tool.py` (section-08-cross-agency) must perform an independent RBAC check on the target agency. It must not rely solely on the `allowedAgencies` list. Verify by reading the code path in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_call_tool.py` and confirming it queries the target agency's tenant and checks access.

4. **No `executeScript(js)` in browser tool** -- The browser automation tool (section-07-browser) must not expose any JavaScript execution capability. Verify by searching for `executeScript`, `page.evaluate`, or `addScriptTag` in `/home/dev/projects/SmartSpecPro/python-backend/app/services/browser_tool.py` and confirming they are absent.

5. **WebSocket voice auth via one-time session token** -- The voice gateway (section-06-voice) must use Redis `SET NX` (atomic set-if-not-exists) with a 30-second TTL for session tokens. The token must be consumed (deleted) on first WebSocket connection. Verify in the voice gateway file at `/home/dev/projects/SmartSpecPro/apps/web/server/services/voiceGateway.ts`.

#### A2. Per-Feature Security Properties

For each feature, verify these specific security patterns are correctly implemented:

**HMAC Verification (all adapters + webhooks):**
- Every webhook signature check must use `crypto.timingSafeEqual()` from Node.js `crypto` module (not string comparison `===`).
- Files to check: Telegram adapter, WhatsApp adapter, LINE adapter, Slack adapter, widget init token handler, inbound webhook trigger handler.
- The `timingSafeEqual` call must handle Buffer length mismatches gracefully (check lengths before calling, since `timingSafeEqual` throws on length mismatch).

Pattern to verify in each adapter:

```typescript
// CORRECT pattern
const expected = Buffer.from(computedHmac, "hex");
const actual = Buffer.from(providedSignature, "hex");
if (expected.length !== actual.length) return false;
return crypto.timingSafeEqual(expected, actual);

// WRONG — timing attack vulnerable
if (computedHmac === providedSignature) { ... }
```

**Secrets Encryption:**
- All entries in `channel_credentials.credentialsEncrypted` must use `encrypt()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts`.
- Widget HMAC signing keys must be stored encrypted.
- Webhook trigger secrets must be stored encrypted.
- Admin API endpoints that list credentials must return `{ configured: true }` instead of the decrypted value.

**Canvas Iframe Sandboxing (section-04-canvas):**
- The iframe for artifact rendering must have `sandbox="allow-scripts"` WITHOUT `allow-same-origin`.
- CSP header for the sandbox page: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'`.
- The `connect-src: 'none'` prevents the sandboxed code from making any network requests.
- `postMessage` communication: both the parent (main app) and the child (sandbox iframe) must validate the `event.origin` before processing messages.

**Widget PostMessage (section-10-widget):**
- The widget embed code must validate `event.origin` against the parent page's expected origin.
- The host page must validate `event.origin` against `https://smartaihub.app`.
- Never use `event.origin === "*"` for validation.

**Browser SSRF Protection (section-07-browser):**
- Layer 1 (Application): Python code blocks private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.169.254, ::1, fc00::/7).
- Layer 2 (DNS): Resolve hostname and re-check resolved IP against blocklist (prevents DNS rebinding).
- Layer 3 (Container): Docker network isolation — browser container cannot reach internal services.
- If `allowedDomains` is empty, the tool must DENY ALL navigation (not allow all).

**Feature Flag Server-Side Enforcement (section-14-feature-flags):**
- Feature flags must be validated against a server-side allowlist of known keys.
- The `updateFeatureFlags` mutation must strip unrecognized keys.
- The generic `updateTenantSettings` mutation must NOT be able to overwrite the `featureFlags` sub-key (audit this mutation for bypass risk).
- Each feature endpoint must check the relevant flag before processing.

**Persona Prompt Sanitization (section-02-persona):**
- `system_prompt_prefix` must be capped at 2000 characters.
- Known jailbreak patterns (`[SYSTEM]`, `[INST]`, `<<SYS>>`, `### Instruction`, etc.) must be blocked.
- More than 2 consecutive newlines must be stripped.
- Restrictions array capped at 20 entries, each at 500 characters max.

**Webhook Log Sanitization (section-11-webhooks):**
- `extracted_variables` stored in webhook trigger logs must have secret patterns stripped (API keys, tokens, passwords matching common patterns).
- The template substitution must run ONLY after authentication succeeds (never expose variable names to unauthenticated callers).

**Voice Consent (section-06-voice):**
- PDPA/GDPR compliant: consent grant records timestamp, consent withdrawal records null and publishes Redis event.
- Active voice sessions must terminate immediately on consent withdrawal.
- No audio data may be stored after consent withdrawal.

**Redis Semaphore for Concurrent Limits:**
- Browser sessions: Redis key `browser:session:{userId}` with TTL, max 1 per user; `browser:tenant:{tenantId}` with INCR/DECR, max 2 per tenant.
- Voice sessions: Redis key `voice:session:{userId}` with TTL, max 1 per user.
- Widget visitors: per-visitor rate limiting via Redis keys with TTL.

---

### Part B: Resource Optimization

The target server has limited RAM and CPU. All new features must follow these resource-conservation patterns.

#### B1. Conservative Concurrency Limits

These limits must be enforced via Redis, not in-memory counters (which do not survive process restarts and cannot be shared across potential future horizontal scaling).

| Resource | Per-User Limit | Per-Tenant Limit | Enforcement Mechanism |
|----------|---------------|-------------------|----------------------|
| Browser sessions | 1 | 2 | Redis semaphore with TTL |
| Voice sessions | 1 | N/A | Redis key with 300s TTL |
| Cross-agency sub-calls | 2 concurrent | N/A | Redis semaphore with TTL |
| Widget connections | Per-visitor caps (session, daily, monthly) | Monthly budget | Redis INCR with TTL |

Redis semaphore pattern to use (shared across all features):

```typescript
/**
 * Acquire a Redis-based semaphore slot.
 * Returns a release function if acquired, or null if at capacity.
 */
async function acquireSemaphore(
  redis: Redis,
  key: string,
  maxSlots: number,
  ttlSeconds: number
): Promise<(() => Promise<void>) | null> {
  // Use INCR + check pattern with TTL fallback
}
```

This utility should live in `/home/dev/projects/SmartSpecPro/apps/web/server/services/redisSemaphore.ts` and be imported by voice gateway, browser tool integration, and cross-agency tool. It is a shared utility, not feature-specific.

#### B2. Shared Workers

Do NOT create separate BullMQ worker processes for each feature. Instead, extend the existing worker infrastructure:

- **Single BullMQ worker process** handles: channel delivery (existing), webhook dispatch (section-11), voice processing queue items.
- The existing delivery queue at `/home/dev/projects/SmartSpecPro/apps/web/server/services/deliveryQueue.ts` currently uses queue name `telegram-delivery`. When the channel adapter refactor (section-05) generalizes this, the queue should become `channel-delivery` with adapter-aware routing, but remain a single worker.
- **Celery workers** (Python side): The existing Celery app at `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` should share workers across browser automation, media generation, and voice STT/TTS tasks. No dedicated worker processes per feature.
- **Discord bot**: Must NOT run as a dedicated process. Instead, use a shared BullMQ worker that processes Discord events. The persistent WebSocket connection to Discord gateway runs within the existing Node.js process but dispatches work through the shared queue.

#### B3. Lazy Initialization

- **Widget WebSocket connections**: The WebSocket handler at `/widget/v1/ws` must not allocate resources (conversation context, persona resolution, etc.) until the first actual message is received. The WebSocket `connection` event should only validate the auth token and register the socket. Heavy initialization happens on the first `message` event.
- **Channel adapters**: The `ChannelAdapterRegistry` (section-05) must instantiate adapters lazily. Calling `registry.get("whatsapp")` for the first time triggers adapter construction. Adapters for unconfigured channels are never instantiated.
- **Browser sandbox container**: The Docker container for Playwright must be spun up on demand when a browser tool execution is requested, and torn down after the session ends (max 300 seconds). Do not keep a warm container pool.

#### B4. Caching Strategy

| Data | Cache Location | TTL | Invalidation |
|------|---------------|-----|-------------|
| Effective persona per conversation | Redis | Until change | On persona update/delete, or conversation persona change |
| Channel routing rules per tenant | Redis | 30 seconds | On rule create/update/delete via tRPC mutation |
| Feature flags per tenant | In-memory per request | Request lifetime | No caching across requests (flags read from DB once per request via context) |
| Resolved channel adapter config | In-memory | Process lifetime | Process restart |
| Widget HMAC signing key | In-memory | 60 seconds | On key rotation |

Feature flags specifically must NOT be cached across requests. The `tenants.settings.featureFlags` value should be read from the database as part of the tRPC context creation (or fetched once per request) and passed through the context. This ensures flag changes take effect immediately without waiting for cache expiry.

---

### Part C: Nginx Configuration Changes

Modify the file at `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf`.

Changes must be applied to BOTH server blocks: the port-80 block (`listen 80; server_name smartaihub.app localhost;`) and the port-443 SSL block (`listen 443 ssl; server_name smartaihub.app;`).

#### C1. Voice WebSocket Location

Add this location block BEFORE the generic `/ws` location and BEFORE the catch-all `/` location in both server blocks:

```nginx
# Voice WebSocket (section-06-voice)
location /api/voice/stream {
    proxy_pass http://web_host;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;  # 5-minute voice session max
    proxy_send_timeout 300s;
}
```

The `proxy_read_timeout 300s` matches the voice session maximum duration. If the session exceeds 300 seconds, Nginx will close the connection, which acts as a defense-in-depth timeout.

#### C2. Widget WebSocket Location

Add this location block in the same position (before `/ws` and `/`):

```nginx
# Widget WebSocket (section-10-widget)
location /widget/v1/ws {
    proxy_pass http://web_host;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 600s;  # Widget sessions can be long-lived
    proxy_send_timeout 600s;
}
```

The 600-second timeout allows widget chat sessions to remain open during extended user interactions.

#### C3. Channel Webhook Route

Add a location block for the generalized channel webhook endpoint. This must come BEFORE the `/api/` block because `/api/` routes to the Python backend, but channel webhooks are handled by the Node.js web app:

```nginx
# Channel webhooks — generalized route (section-05-channel-adapter)
# Handles: /webhooks/telegram/:connId, /webhooks/whatsapp/:connId, etc.
location /webhooks/ {
    proxy_pass http://web_host;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Rate limiting for webhook ingress
    limit_req zone=api_limit burst=50 nodelay;
    limit_conn conn_limit 30;
}
```

Note: The burst is set to 50 (higher than the default API burst of 20) because webhook providers like Telegram, WhatsApp, and LINE may send bursts of updates during high-activity periods.

#### C4. Sandbox Subdomain Server Block

Add an entirely new `server` block for `sandbox.smartaihub.app`. This serves the artifact sandbox HTML page used by section-04-canvas. It must be added as a separate server block, not within the existing `smartaihub.app` blocks:

```nginx
# Artifact sandbox — isolated domain for untrusted code execution (section-04-canvas)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name sandbox.smartaihub.app;

    ssl_certificate /etc/nginx/ssl/smartaihub.app.crt;
    ssl_certificate_key /etc/nginx/ssl/smartaihub.app.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Defense-in-depth: strict CSP at Nginx level
    # Even if the app forgets to set CSP, Nginx enforces it
    add_header Content-Security-Policy "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-ancestors https://smartaihub.app;" always;
    add_header X-Frame-Options "ALLOW-FROM https://smartaihub.app" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;

    # Serve the sandbox HTML page from the web app
    location / {
        proxy_pass http://web_host;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # No large uploads needed for sandbox
        client_max_body_size 1M;

        # Rate limiting
        limit_req zone=web_limit burst=10 nodelay;
    }
}
```

Key security properties of this block:
- `connect-src 'none'` prevents sandboxed code from making ANY network requests (XHR, fetch, WebSocket).
- `form-action 'none'` prevents form submissions that could exfiltrate data.
- `frame-ancestors https://smartaihub.app` ensures the sandbox can only be embedded by the main app.
- The sandbox domain uses the same wildcard SSL certificate (or a separate certificate for `sandbox.smartaihub.app`).

#### C5. Port-80 Sandbox Redirect

Also add a redirect block for the sandbox subdomain on port 80:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sandbox.smartaihub.app;
    return 301 https://$host$request_uri;
}
```

#### C6. Rate Limit Zone Addition (Optional)

If the existing `api_limit` and `web_limit` zones are insufficient for the new webhook and WebSocket traffic patterns, add a dedicated zone in `/home/dev/projects/SmartSpecPro/nginx/conf.d/00-rate-limits.conf`:

```nginx
# Webhook ingress: 20 requests/second per IP (higher burst for platform webhooks)
limit_req_zone $binary_remote_addr zone=webhook_limit:5m rate=20r/s;

# Widget connections: 5 new connections/second per IP
limit_req_zone $binary_remote_addr zone=widget_limit:5m rate=5r/s;
```

This is optional if the existing zones provide adequate protection.

---

### Part D: Shared Security Utility — Redis Semaphore

Create a shared utility for Redis-based concurrency limiting used by multiple features.

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/redisSemaphore.ts`

```typescript
/**
 * Redis-based semaphore for cross-process concurrency limiting.
 *
 * Used by: voice gateway (1/user), browser tool (1/user, 2/tenant),
 * cross-agency calls (2 concurrent), widget visitor caps.
 *
 * Pattern: INCR key with TTL. Check value against max. DECR on release.
 * TTL acts as safety net — if the process crashes without releasing,
 * the key expires and the slot becomes available.
 */

import type Redis from "ioredis";

export interface SemaphoreHandle {
  /** Release the acquired slot. Safe to call multiple times. */
  release(): Promise<void>;
}

/**
 * Try to acquire a semaphore slot.
 * @returns SemaphoreHandle if acquired, null if at capacity.
 */
export async function acquireSemaphore(
  redis: Redis,
  key: string,
  maxSlots: number,
  ttlSeconds: number
): Promise<SemaphoreHandle | null> {
  // Implementation: INCR key, check if <= maxSlots, set TTL, return handle
  // If over capacity, DECR and return null
}

/**
 * Check current semaphore count without acquiring.
 */
export async function getSemaphoreCount(
  redis: Redis,
  key: string
): Promise<number> {
  // Implementation: GET key, parse as int, default 0
}
```

---

### Part E: Post-Implementation Verification Checklist

After all feature sections (02-14) are implemented, run this verification pass:

1. **Static analysis for `timingSafeEqual`**: Run `grep -r "timingSafeEqual" apps/web/server/` and confirm it appears in every adapter and webhook handler. Run `grep -rn "=== .*signature\|signature.*===" apps/web/server/` and confirm NO string comparisons are used for signature verification.

2. **Static analysis for template engines**: Run `grep -r "jinja\|nunjucks\|handlebars\|ejs\|mustache" apps/web/server/ python-backend/` and confirm no template engine is imported anywhere in webhook processing code.

3. **Encryption verification**: Run `grep -r "credentialsEncrypted\|secretEncrypted\|hmacKeyEncrypted" apps/web/server/` and verify every write path calls `encrypt()` and every read path calls `decrypt()`.

4. **Feature flag bypass audit**: Search the generic `updateTenantSettings` mutation in the tRPC routers and verify it cannot overwrite the `featureFlags` sub-key. The `featureFlags` key must only be writable through the dedicated `updateFeatureFlags` mutation (section-14).

5. **Nginx config validation**: After modifying `dev-host.conf`, run `docker exec smartspec-nginx-dev nginx -t` to validate the configuration syntax. Then reload with `docker exec smartspec-nginx-dev nginx -s reload`.

6. **SSL certificate check**: Verify that `sandbox.smartaihub.app` resolves correctly and the SSL certificate covers it (either a wildcard `*.smartaihub.app` cert or a separate cert).

7. **Redis key namespace audit**: Verify that all Redis keys used by new features follow a consistent namespace pattern and do not collide with existing keys. Recommended pattern: `{feature}:{resource}:{id}` (e.g., `voice:session:user123`, `browser:tenant:tenant456`).

8. **Run full test suite**: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` and `cd /home/dev/projects/SmartSpecPro/python-backend && pytest` to verify no regressions.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf` | Modify | Add voice WS, widget WS, channel webhook, sandbox server blocks |
| `/home/dev/projects/SmartSpecPro/nginx/conf.d/00-rate-limits.conf` | Modify (optional) | Add webhook and widget rate limit zones |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/redisSemaphore.ts` | Create | Shared Redis semaphore utility |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/securityChecklist.test.ts` | Create | Security pattern verification tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/resourceLimits.test.ts` | Create | Concurrency limiting tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/nginxConfig.test.ts` | Create | Nginx config validation tests |

## Dependencies on Other Sections

- **section-01-database**: All tables and constraints must exist before security verification can run.
- **section-02-persona**: Persona sanitization patterns must be implemented for checklist item A2.
- **section-04-canvas**: Canvas CSP and iframe sandbox must be implemented for checklist item A2.
- **section-05-channel-adapter**: Channel adapter registry and webhook router must exist for Nginx webhook route.
- **section-06-voice**: Voice gateway must exist for voice WebSocket Nginx route and security verification.
- **section-07-browser**: Browser SSRF protection must be implemented for checklist item A2.
- **section-08-cross-agency**: Cross-agency RBAC must be implemented for checklist item A1.
- **section-10-widget**: Widget gateway must exist for widget WebSocket Nginx route.
- **section-11-webhooks**: Webhook HMAC and template handling must be implemented for checklist items A1/A2.
- **section-14-feature-flags**: Feature flag allowlist must be implemented for checklist item A2.

---

## What Was Actually Built

### Deviations from Plan

1. **redisSemaphore.ts uses atomic Lua INCR+EXPIRE** instead of two separate redis calls. The plan showed a non-atomic INCR then EXPIRE. Code review identified a crash window between the two calls; fixed with a Lua script that atomically increments and conditionally sets TTL. Also added TTL-expiry guard in `release()` (`redis.exists()` before `redis.decr()`) to avoid creating key at -1 when session runs to full TTL.

2. **nginx port-80 voice WebSocket ordering fixed**. The initial placement of `/api/voice/stream` was after `/api/` in the port-80 block (Nginx prefix matching would route to Python backend). Corrected during code review to place voice WS before the Python `/api/` block.

3. **X-Frame-Options ALLOW-FROM removed from sandbox block**. This header has been unsupported by modern browsers since 2015/2019. CSP `frame-ancestors` provides the actual framing restriction.

4. **/widget/v1/ blocks updated**. Both port-80 and port-443 `/widget/v1/` static asset blocks now include `proxy_http_version 1.1` and `proxy_set_header X-Forwarded-Proto $scheme` to match all other location blocks.

5. **securityChecklist.test.ts uses it.todo() for manual-audit items**. Tests requiring grep-based static analysis of adapter files use `it.todo()` rather than `expect(true).toBe(true)` to accurately signal pending manual verification. The HMAC reference implementation tests the actual pattern behavior (length mismatch handling, correct vs tampered signatures) rather than a trivial `typeof` check.

### Actual Files Created/Modified

| File | Action |
|------|--------|
| `apps/web/server/services/redisSemaphore.ts` | Created |
| `apps/web/server/services/__tests__/securityChecklist.test.ts` | Created |
| `apps/web/server/services/__tests__/resourceLimits.test.ts` | Created |
| `apps/web/server/services/__tests__/nginxConfig.test.ts` | Created |
| `nginx/conf.d/dev-host.conf` | Modified — added voice WS, webhooks, widget WS (443), sandbox server blocks |

### Test Results
- 35 passing, 3 todo (manual audit items for secrets encryption and adapter HMAC usage)