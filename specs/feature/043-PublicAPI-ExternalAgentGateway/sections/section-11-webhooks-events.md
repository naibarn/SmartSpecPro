I now have enough context. Let me produce the section content.

# Section 11 -- Webhooks & Event Streaming

## Overview

This section implements the webhook management REST endpoints, webhook delivery with configurable retry, HMAC-SHA256 signed payloads, and a Server-Sent Events (SSE) stream for real-time event consumption. It covers three route files and a delivery service built on top of the existing BullMQ infrastructure.

**Dependencies:** This section depends on the following completed sections:
- **Section 01** (database schema) -- `api_webhook_endpoints` and `api_webhook_deliveries` tables must exist
- **Section 03** (auth extension) -- `apiKeyAuthMiddleware` and `requireScopes` middleware
- **Section 04** (rate limiter/audit) -- audit logging middleware, common error format, CORS, response headers
- **Section 10** (job automation) -- events emitted by the job system are consumed by webhooks/SSE

**Blocks:** Section 12 (Admin UI) depends on this section for webhook management data.

---

## Tests First

All tests use Vitest. Create the following test files.

### File: `apps/web/server/routes/__tests__/publicWebhooksApi.test.ts`

```typescript
/**
 * Tests for POST /v1/webhooks, GET /v1/webhooks, DELETE /v1/webhooks/:id
 */

// Test: POST /v1/webhooks validates HTTPS URL
// Test: POST /v1/webhooks SSRF-validates URL (rejects localhost, internal IPs)
// Test: POST /v1/webhooks encrypts signing secret
// Test: POST /v1/webhooks returns secret once (not retrievable later)
// Test: POST /v1/webhooks requires webhooks:manage scope
// Test: GET /v1/webhooks returns list of endpoints for tenant
// Test: GET /v1/webhooks does not expose signing secrets
// Test: DELETE /v1/webhooks/:id verifies tenant ownership
// Test: DELETE /v1/webhooks/:id from different tenant returns 404
// Test: POST /v1/webhooks rejects non-HTTPS URLs (http://)
// Test: POST /v1/webhooks rejects URLs resolving to private IP ranges
```

Each test should mock the database layer (Drizzle), the `encrypt` function from `crypto.ts`, and the SSRF validation utilities. Use `supertest` against an Express app that mounts the webhook routes with mocked auth middleware injecting a known `AuthContext`.

### File: `apps/web/server/services/__tests__/webhookDeliveryService.test.ts`

```typescript
/**
 * Tests for webhook delivery: signing, retry, disabling
 */

// Test: delivery computes correct HMAC-SHA256 signature
// Test: signature header is X-SmartSpec-Signature with sha256= prefix
// Test: delivery with retryPolicy='exponential' retries 3 times with backoff
// Test: delivery with retryPolicy='none' does not retry on failure
// Test: 3 consecutive failures disables webhook endpoint (isActive=false)
// Test: webhook payload does not contain API key secrets or raw tokens
// Test: delivery logs success to api_webhook_deliveries table
// Test: delivery logs failure with error message to api_webhook_deliveries
// Test: delivery uses BullMQ delayed jobs for retry scheduling
// Test: tenant ownership is verified before delivery (cross-tenant events blocked)
```

Mock `fetch` (or `undici.request`) for outbound HTTP calls. Mock the BullMQ `Queue.add()` for verifying retry delay calculations. Mock Drizzle for database assertions.

### File: `apps/web/server/routes/__tests__/publicEventsApi.test.ts`

```typescript
/**
 * Tests for GET /v1/events SSE stream
 */

// Test: GET /v1/events requires events:read scope
// Test: GET /v1/events returns Content-Type text/event-stream
// Test: GET /v1/events filters by types query param
// Test: SSE heartbeat sent every 30s (use fake timers)
// Test: client disconnect is handled cleanly (no memory leak, Redis unsubscribe)
// Test: events are scoped to the authenticated tenant
// Test: malformed types param defaults to all events
```

For SSE tests, use a pattern where you create a readable response and assert chunks written to it. Mock the Redis Pub/Sub subscriber. Use `vi.useFakeTimers()` for heartbeat testing.

---

## Implementation Details

### 11.1 Webhook Management Endpoints

**New file:** `apps/web/server/routes/publicWebhooksApi.ts`

Mount at `/v1/webhooks` in `apps/web/server/_core/index.ts`.

This Express router exposes three endpoints, all guarded by `apiKeyAuthMiddleware` and `requireScopes('webhooks:manage')`.

#### POST /v1/webhooks -- Register webhook endpoint

Request body (Zod validated):
- `url` -- string, max 2048 chars, must start with `https://`
- `events` -- array of event type strings (validated against known event types)
- `retry_policy` -- optional, `'exponential'` (default) or `'none'`

Processing:
1. Validate the URL is HTTPS. Reject `http://` with a 400 error.
2. SSRF-validate the URL: parse the hostname, resolve DNS, and verify all A/AAAA records point to public IP addresses (not `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`). The existing codebase has URL validation patterns in other services (e.g., `assetValidationPolicy.ts`). Use `dns.promises.resolve4()` and `dns.promises.resolve6()` and check every returned address. Reject if any address is private.
3. Generate a signing secret: `crypto.randomBytes(32).toString('hex')` -- 64 hex characters.
4. Encrypt the signing secret using `encrypt()` from `apps/web/server/services/crypto.ts` (AES-256-GCM).
5. Insert into `api_webhook_endpoints` with fields: `id` (UUID v4), `tenantId` (from AuthContext), `apiKeyId` (from AuthContext, nullable), `url`, `secretEncrypted`, `events` (JSON array), `retryPolicy`, `isActive: true`.
6. Return the raw signing secret in the response body **exactly once**. Subsequent GET requests must NOT return the secret.

Response: `{ id, url, events, retry_policy, secret, created_at }`

Known event types (define as a const array for validation):
- `job.completed`, `job.failed`, `job.progress`
- `media.ready`
- `agency.message`
- `credits.low` *(deferred — not emitted in this spec version)*
- `key.expiring` *(deferred — not emitted in this spec version)*

#### Event Payload Schemas

Each event type has a defined payload shape. The webhook delivery service sends these as the JSON body of the POST request, and SSE emits them as the `data:` field.

**`job.completed` / `job.failed`** (emitted by section 10):
```json
{ "type": "job.completed", "job_id": "job_abc", "job_type": "skill_execution", "status": "completed", "credits_used": 50, "result": { ... }, "timestamp": "2026-03-14T10:00:00Z" }
```

**`job.progress`** (emitted by section 10, pipeline steps):
```json
{ "type": "job.progress", "job_id": "job_abc", "step_index": 2, "total_steps": 5, "step_status": "completed", "timestamp": "2026-03-14T10:00:30Z" }
```

**`media.ready`** (emitted by section 08):
```json
{ "type": "media.ready", "task_id": "task_xyz", "media_type": "image", "result_url": "https://...", "credits_used": 5, "timestamp": "2026-03-14T10:01:00Z" }
```

**`agency.message`** (emitted by section 06):
```json
{ "type": "agency.message", "agency_id": "agency-1", "run_id": "run_abc", "conversation_id": "conv_123", "status": "completed", "credits_used": 12, "timestamp": "2026-03-14T10:02:00Z" }
```

**`credits.low`** *(deferred)*:
```json
{ "type": "credits.low", "current_balance": 50, "threshold": 100, "timestamp": "..." }
```

**`key.expiring`** *(deferred)*:
```json
{ "type": "key.expiring", "key_id": "key_abc", "key_prefix": "sk-ssp_abc12", "expires_at": "2026-04-01T00:00:00Z", "timestamp": "..." }
```

#### GET /v1/webhooks -- List webhook endpoints

Query the `api_webhook_endpoints` table filtered by `tenantId` from AuthContext. Return an array of endpoints with `id`, `url`, `events`, `retry_policy`, `is_active`, `failure_count`, `last_delivered_at`, `created_at`. Exclude `secretEncrypted`.

Response: `{ webhooks: [...] }`

#### DELETE /v1/webhooks/:id -- Deactivate webhook endpoint

1. Look up the endpoint by `id`.
2. Verify `tenantId` matches the authenticated tenant. If not, return 404 (not 403, to avoid leaking existence).
3. Set `isActive = false` (soft delete, preserves delivery history).
4. Return `{ deleted: true }`.

### 11.2 Webhook Delivery Service

**New file:** `apps/web/server/services/webhookDeliveryService.ts`

This service handles dispatching event payloads to registered webhook endpoints with signing, retry, and failure tracking.

#### Core function: `dispatchWebhookEvent(tenantId, eventType, payload)`

1. Query `api_webhook_endpoints` where `tenantId` matches, `isActive = true`, and the `events` JSON array contains `eventType`.
2. For each matching endpoint, enqueue a delivery job.

#### Delivery execution: `executeWebhookDelivery(endpointId, eventType, payload, attempt)`

1. Load the endpoint from database, decrypt the signing secret using `decrypt()` from `crypto.ts`.
2. Serialize the payload as JSON.
3. Compute the HMAC-SHA256 signature: `crypto.createHmac('sha256', secret).update(jsonBody).digest('hex')`.
4. POST to the endpoint URL with headers:
   - `Content-Type: application/json`
   - `X-SmartSpec-Signature: sha256={hmacHex}`
   - `X-SmartSpec-Event: {eventType}`
   - `X-SmartSpec-Delivery-Id: {deliveryId}`
5. Log the delivery to `api_webhook_deliveries` with: `webhookEndpointId`, `eventType`, `payload`, `statusCode` (from response or null on network error), `attempt`, `deliveredAt` (if successful), `error` (if failed).
6. On success (2xx response): update `api_webhook_endpoints` -- set `lastDeliveredAt`, reset `failureCount` to 0.
7. On failure: increment `failureCount` on the endpoint. Handle retry based on policy.

#### Retry logic

For `retryPolicy: 'exponential'`:
- Max 3 attempts total (initial + 2 retries).
- Backoff delays: attempt 2 at +5 seconds, attempt 3 at +25 seconds.
- Use BullMQ delayed jobs to schedule retries. Create a new BullMQ queue named `webhook-api-delivery` (separate from the existing `webhook-dispatch` queue which handles internal webhook triggers). Add jobs with the `delay` option set to the backoff duration in milliseconds.
- After 3 consecutive failures across any deliveries (not just one event), set `isActive = false` on the endpoint to prevent further deliveries. This auto-disabling protects against persistent failures.

For `retryPolicy: 'none'`:
- Single attempt only. Log success or failure. No retry, no auto-disable.

#### BullMQ queue setup

```typescript
// Queue name: "webhook-api-delivery"
// Use getRealtimeClient() from redisClients.ts for the connection
// defaultJobOptions: { removeOnComplete: 500, removeOnFail: 2000 }
// Worker concurrency: 10
```

Follow the same initialization/shutdown pattern as `webhookDispatchQueue.ts` (the existing internal webhook queue). Provide `initWebhookApiDeliveryQueue()` and `closeWebhookApiDeliveryQueue()` functions. Call init from the server startup in `apps/web/server/_core/index.ts` and close from the graceful shutdown handler.

#### Security requirements for payloads

Before dispatching any webhook payload, sanitize it:
- Strip any `apiKey`, `secret`, `token`, `password`, `authorization` fields from the payload object.
- Never include raw API key values, internal file paths, or database connection strings.
- Include only: event type, resource ID, status, timestamps, and safe metadata.

#### Publishing events from other services

Other sections (job automation, media, agencies) call `dispatchWebhookEvent()` when notable events occur. The function should also publish to Redis Pub/Sub for the SSE stream (see below). Create a unified `emitPublicApiEvent(tenantId, eventType, payload)` function that does both:
1. Calls `dispatchWebhookEvent()` to fan out to registered webhook endpoints.
2. Publishes to Redis channel `events:{tenantId}` for SSE consumers.

### 11.3 SSE Event Stream

**New file:** `apps/web/server/routes/publicEventsApi.ts`

Mount at `/v1/events` in `apps/web/server/_core/index.ts`.

#### GET /v1/events

Guard: `apiKeyAuthMiddleware` + `requireScopes('events:read')`.

Query parameter: `types` -- comma-separated list of event types to filter (e.g., `?types=job.completed,media.ready`). If omitted, receive all event types.

Implementation:
1. Set response headers for SSE: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (for Nginx).
2. Create a new Redis subscriber using `getRealtimeClient().duplicate()` from `redisClients.ts`. Subscribe to channel `events:{tenantId}`.
3. On each message from the channel, parse the JSON payload. If `types` filter is specified, check the event's `type` field against the filter list. If it matches (or no filter), write an SSE event: `data: {jsonPayload}\n\n`.
4. Set up a heartbeat interval at 30 seconds: write `: heartbeat\n\n` (SSE comment, keeps connection alive through proxies).
5. On client disconnect (`req.on('close', ...)`):
   - Unsubscribe from Redis channel.
   - Close the duplicated Redis connection.
   - Clear the heartbeat interval.

Delivery semantics: **At-most-once.** Redis Pub/Sub is fire-and-forget. If the client disconnects, events during disconnection are lost. `Last-Event-Id` reconnection support is not included in this version (would require Redis Streams). Document this in the endpoint's response or error messages.

SSE event format:
```
event: job.completed
data: {"type":"job.completed","job_id":"job_abc123","status":"completed","credits_used":50,"timestamp":"2026-03-14T10:00:00Z"}

: heartbeat

event: media.ready
data: {"type":"media.ready","task_id":"task_xyz","result_url":"https://...","timestamp":"2026-03-14T10:01:00Z"}
```

### 11.4 Route Registration

In `apps/web/server/_core/index.ts`, add the following mounts (after the middleware stack that includes `apiKeyAuthMiddleware`, CORS, audit, and rate limiter):

```typescript
import { publicWebhooksRouter } from "../routes/publicWebhooksApi";
import { publicEventsRouter } from "../routes/publicEventsApi";

app.use("/v1/webhooks", publicWebhooksRouter);
app.use("/v1/events", publicEventsRouter);
```

Also initialize and shut down the delivery queue:
```typescript
import { initWebhookApiDeliveryQueue, closeWebhookApiDeliveryQueue } from "../services/webhookDeliveryService";

// In server startup:
await initWebhookApiDeliveryQueue();

// In graceful shutdown:
await closeWebhookApiDeliveryQueue();
```

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/routes/publicWebhooksApi.ts` | Create | Webhook CRUD endpoints |
| `apps/web/server/routes/publicEventsApi.ts` | Create | SSE event stream endpoint |
| `apps/web/server/services/webhookDeliveryService.ts` | Create | Delivery execution, retry, BullMQ queue, event emission |
| `apps/web/server/_core/index.ts` | Modify | Mount routes, init/shutdown delivery queue |
| `apps/web/server/routes/__tests__/publicWebhooksApi.test.ts` | Create | Webhook endpoint tests |
| `apps/web/server/services/__tests__/webhookDeliveryService.test.ts` | Create | Delivery service tests |
| `apps/web/server/routes/__tests__/publicEventsApi.test.ts` | Create | SSE event stream tests |

---

## Key Design Decisions

1. **Separate queue from existing webhookDispatchQueue.** The existing `webhook-dispatch` BullMQ queue handles internal webhook triggers (agency, chat, workflow dispatch). The new `webhook-api-delivery` queue handles outbound HTTP delivery to external URLs registered via the Public API. They serve different purposes and should not share queue configuration or retry policies.

2. **Auto-disable after 3 consecutive failures.** The `failureCount` on `api_webhook_endpoints` tracks consecutive delivery failures across all events. On each successful delivery, it resets to 0. When it reaches 3, the endpoint is deactivated. This prevents wasting resources on endpoints that are persistently down. Admins can re-enable endpoints from the Admin UI (Section 12).

3. **HMAC-SHA256 signing with encrypted-at-rest secrets.** The signing secret is generated per endpoint, encrypted with AES-256-GCM before storage, and decrypted only at delivery time. The HMAC signature allows consumers to verify payload authenticity and integrity. The `X-SmartSpec-Signature: sha256={hex}` header format is consistent with GitHub and Stripe webhook conventions.

4. **At-most-once SSE delivery.** Redis Pub/Sub provides simple fan-out without persistence. This is appropriate for the initial scale target (<1K req/day). Upgrading to Redis Streams for exactly-once delivery with `Last-Event-Id` support is deferred to a future version.

5. **SSRF validation is mandatory.** External users control the webhook URL. Without SSRF validation, an attacker could register `https://metadata.google.internal/...` or `https://127.0.0.1/admin/...` and exfiltrate internal data via webhook payloads. Every DNS record (A and AAAA) must be checked against private IP ranges before the first delivery. Import `sanitizeUri` and `assertPublicIp` from `apps/web/server/services/ssrfValidation.ts` (implemented in section 08).

---

## Cross-References

- **Event types and emission points:** See section 04's **Event Emission Manifest** for the authoritative list of event types, which sections emit them, and payload field definitions.
- **SSRF validation utilities:** The `sanitizeUri()` and `assertPublicIp()` functions are defined in section 08 at `apps/web/server/services/ssrfValidation.ts`. This section reuses them for webhook URL validation during `POST /v1/webhooks`.

---

## Webhook Re-Enable Procedure

When a webhook endpoint is auto-disabled (after 3 consecutive failures), it can be re-enabled through two paths:

### 1. Admin UI Re-Enable (Section 12)

The Admin UI webhook management tab shows disabled endpoints with their `failureCount`. An admin can click the "Re-enable" button which:
1. Sets `isActive = true` on the `api_webhook_endpoints` row
2. Resets `failureCount` to 0
3. The next event delivery will attempt the endpoint again

### 2. API Re-Enable (PATCH endpoint)

Add a `PATCH /v1/webhooks/:id` endpoint to `publicWebhooksApi.ts`:

- **Scope:** `webhooks:manage`
- **Request body:** `{ is_active: true }`
- **Logic:** Verify tenant ownership, set `isActive = true`, reset `failureCount = 0`
- **Response:** `{ id, url, events, is_active: true, failure_count: 0 }`

This is intentionally limited to only setting `is_active` — URL and events cannot be modified (delete and recreate instead). This minimizes the attack surface for the PATCH endpoint.

### Test for re-enable

```
Test: PATCH /v1/webhooks/:id re-enables a disabled endpoint
  - Create a webhook, set failureCount=3 and isActive=false in DB
  - Send PATCH with { is_active: true }
  - Assert response has is_active: true, failure_count: 0
  - Assert next delivery attempt succeeds (endpoint is active again)

Test: PATCH /v1/webhooks/:id from wrong tenant returns 404
  - Verify tenant isolation on re-enable
```