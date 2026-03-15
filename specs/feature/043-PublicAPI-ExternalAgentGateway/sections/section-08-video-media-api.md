# Section 08 -- Video Project and Media Generation API

## Overview

This section builds two new Express route files that expose video project management and media generation (images, video, audio) over the Public API gateway. These endpoints wrap the existing `mediaGenerationService` singleton and apply API-key-scoped authentication, credit deduction, and SSRF validation for user-supplied reference image URLs.

**Files to create:**

- `apps/web/server/routes/publicVideoApi.ts`
- `apps/web/server/routes/publicMediaApi.ts`

**Files to modify:**

- `apps/web/server/_core/index.ts` -- mount both routers under `/v1/video-projects` and `/v1/media`
- `apps/web/server/services/mediaGenerationService.ts` -- accept `AuthContext` (or bridge from it to a `userToken`) in generation methods

**Dependencies on other sections (must be completed first):**

- Section 01 (database schema) -- the `api_keys`, `api_audit_events` tables must exist
- Section 02 (API key service) -- `apiKeyService.validateKey()` used by auth middleware
- Section 03 (auth extension) -- `authorizeRequest()` detects `sk-ssp_` prefix; `AuthContext` type defined in `shared/publicApiTypes.ts`; `requireScopes()` middleware available
- Section 04 (rate limiter / audit) -- rate limiting middleware, audit logging middleware, idempotency middleware, common error format, CORS config, response headers (`X-Request-Id`, `X-Credits-Used`, `X-Credits-Remaining`)

---

## Tests

All tests use Vitest. Create test files co-located with the route files.

### Test file: `apps/web/server/routes/__tests__/publicVideoApi.test.ts`

```typescript
/**
 * Tests for POST /v1/video-projects, GET /v1/video-projects/:id,
 * GET /v1/video-projects/:id/export/download
 */

// Test: POST /v1/video-projects calculates duration-based credits correctly
//   - Send { title, description, duration_minutes: 5, quality: "draft" }
//   - Assert credits deducted = 5 * 3 = 15 (draft = 3 credits/min)

// Test: draft quality = 3 credits/min, standard = 5, high = 10
//   - Parameterized test for each quality tier
//   - duration_minutes: 2 -> draft=6, standard=10, high=20

// Test: credit overflow guard rejects > MAX_SINGLE_JOB_CREDITS
//   - Send duration_minutes: 1001, quality: "high" (= 10,010 credits)
//   - Assert 400 response with error code "credit_overflow"
//   - MAX_SINGLE_JOB_CREDITS = 10,000

// Test: GET /v1/video-projects/:id/export/download requires Bearer auth
//   - Request without Authorization header -> 401
//   - Request with valid API key -> streams file with Content-Disposition

// Test: POST /v1/video-projects requires video_projects:create scope
//   - API key missing that scope -> 403 insufficient_scopes error

// Test: GET /v1/video-projects/:id returns project status and metadata
//   - Mock underlying service, verify response shape
```

### Test file: `apps/web/server/routes/__tests__/publicMediaApi.test.ts`

```typescript
/**
 * Tests for POST /v1/media/images/generate, POST /v1/media/videos/generate,
 * POST /v1/media/audio/generate, GET /v1/media/:taskId/status
 */

// Test: POST /v1/media/images/generate accepts prompt and returns task_id
//   - Body: { prompt: "a sunset" }
//   - Assert response has { task_id, status: "pending" }

// Test: reference_image_urls validates each URL with sanitizeUri + assertPublicIp
//   - Body includes reference_image_urls: ["https://example.com/img.png"]
//   - Mock sanitizeUri and assertPublicIp, assert both called per URL

// Test: reference_image_urls rejects internal/localhost URLs
//   - URLs: ["http://localhost/img.png", "http://127.0.0.1/img.png",
//            "http://169.254.169.254/latest/meta-data/"]
//   - Assert 400 with error code "invalid_request"
//   - Error message should indicate SSRF-blocked URL

// Test: reference_image_urls max 5 URLs enforced
//   - Send 6 URLs -> 400 error
//   - Send 5 URLs -> accepted (passes validation)

// Test: assertPublicIp checks all A/AAAA DNS records (not just first)
//   - Mock DNS resolution returning [public_ip, private_ip]
//   - Assert rejection because one record is private

// Test: GET /v1/media/:taskId/status returns progress
//   - Mock mediaGenerationService.getTask()
//   - Assert response: { status, result_url?, progress_pct }

// Test: POST /v1/media/videos/generate accepts prompt and returns task_id
//   - Body: { prompt: "a cat walking", duration_seconds: 5 }

// Test: POST /v1/media/audio/generate accepts text and returns task_id
//   - Body: { text: "Hello world", voice: "alloy" }

// Test: all media endpoints require media:generate scope
//   - API key without scope -> 403

// Test: credits deducted with source type "api_media"
//   - Mock creditService.deductCredits, verify sourceType arg
```

---

## Implementation Details

### 1. Video Project API (`publicVideoApi.ts`)

Create an Express Router mounted at `/v1/video-projects`.

#### Constants

```typescript
const CREDITS_PER_MINUTE = {
  draft: 3,
  standard: 5,
  high: 10,
} as const;

const MAX_SINGLE_JOB_CREDITS = 10_000;
```

#### Endpoints

**`POST /v1/video-projects`**

- Middleware chain: `requireScopes("video_projects:create")`
- Zod input validation:
  - `title`: string, 1-200 chars
  - `description`: string, optional, max 2000 chars
  - `duration_minutes`: positive number, required
  - `quality`: enum `"draft" | "standard" | "high"`, default `"standard"`
- Calculate credit cost: `duration_minutes * CREDITS_PER_MINUTE[quality]`
- If cost exceeds `MAX_SINGLE_JOB_CREDITS`, return 400 with `{ error: { code: "credit_overflow", message: "...", type: "invalid_request" } }`
- Deduct credits via `deductCredits()` from `creditService.ts` with `sourceType: "api_video_project"`
- Bridge to existing video project creation service (extract logic from tRPC if needed, or call `mediaGenerationService.generateVideoAsync()` for the underlying work)
- Return `{ id, status: "pending", credits_reserved }` with 201 status
- Set `X-Credits-Used` header

**`GET /v1/video-projects/:id`**

- Middleware: `requireScopes("video_projects:create")`
- Look up project by ID, verify tenant ownership through the `AuthContext.tenantId`
- Return project metadata, status, progress

**`GET /v1/video-projects/:id/export/download`**

- Middleware: `requireScopes("video_projects:create")`
- Verify ownership (tenant + user match from AuthContext)
- Stream the export file with `Content-Disposition: attachment; filename="..."`
- Must have Bearer auth (the standard API key middleware handles this)

### 2. Media Generation API (`publicMediaApi.ts`)

Create an Express Router mounted at `/v1/media`.

#### SSRF Validation for Reference Image URLs

This is the most security-critical part of this section. When users supply `reference_image_urls`, each URL must be validated to prevent Server-Side Request Forgery.

Implement two utility functions (or import if they already exist elsewhere in the codebase):

**`sanitizeUri(url: string): string`**
- Parse with `new URL(url)`
- Reject non-HTTPS schemes (allow HTTP only if explicitly configured for dev)
- Strip credentials (`url.username`, `url.password`)
- Return normalized URL string

**`assertPublicIp(hostname: string): Promise<void>`**
- Resolve hostname via `dns.promises.resolve4()` and `dns.promises.resolve6()`
- Check ALL returned A and AAAA records (not just the first one)
- Reject if ANY record falls into private/reserved ranges:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
  - `127.0.0.0/8`
  - `169.254.0.0/16` (link-local / AWS metadata)
  - `0.0.0.0/8`
  - `::1`, `fe80::/10`, `fc00::/7`
- Throw descriptive error if blocked

The validation loop for `reference_image_urls`:

```typescript
// Pseudocode for the validation flow
async function validateReferenceUrls(urls: string[]): Promise<void> {
  if (urls.length > 5) {
    throw new ApiError("invalid_request", "Maximum 5 reference image URLs allowed");
  }
  for (const rawUrl of urls) {
    const sanitized = sanitizeUri(rawUrl);
    const parsed = new URL(sanitized);
    await assertPublicIp(parsed.hostname);
  }
}
```

#### Endpoints

**`POST /v1/media/images/generate`**

- Middleware: `requireScopes("media:generate")`
- Zod input:
  - `prompt`: string, 1-4000 chars
  - `model`: optional string (defaults to system default image model)
  - `width`: optional positive integer
  - `height`: optional positive integer
  - `aspect_ratio`: optional string
  - `reference_image_urls`: optional array of strings, max 5
- If `reference_image_urls` provided, run `validateReferenceUrls()` before proceeding
- Bridge to `mediaGenerationService.generateImageAsync()`:
  - The existing method takes `(request: ImageGenerationRequest, userToken: string)`
  - Build a `userToken` from the `AuthContext` -- use `signBearerToken()` to create a short-lived token for the Python backend (same pattern as the existing `createMediaToken()` helper in `media.ts` tRPC router)
- Deduct credits with `sourceType: "api_media"`
- Return `{ task_id, status: "pending" }` with 202 status

**`POST /v1/media/videos/generate`**

- Middleware: `requireScopes("media:generate")`
- Zod input:
  - `prompt`: string, 1-4000 chars
  - `model`: optional string
  - `duration_seconds`: optional positive number
  - `quality`: optional string
  - `aspect_ratio`: optional string
- Bridge to `mediaGenerationService.generateVideoAsync()`
- Deduct credits with `sourceType: "api_media"`
- Return `{ task_id, status: "pending" }` with 202 status

**`POST /v1/media/audio/generate`**

- Middleware: `requireScopes("media:generate")`
- Zod input:
  - `text`: string, 1-5000 chars
  - `voice`: optional string
  - `model`: optional string
  - `speed`: optional number
- Bridge to `mediaGenerationService.generateAudioAsync()`
- Deduct credits with `sourceType: "api_media"`
- Return `{ task_id, status: "pending" }` with 202 status

**`GET /v1/media/:taskId/status`**

- Middleware: `requireScopes("media:generate")`
- Call `mediaGenerationService.getTask(taskId, userToken, auditContext)`
- The existing `getTask` method takes `(taskId: string, userToken: string, auditContext?: MediaAuditContext)`
- Return `{ status, result_url, progress_pct }` mapped from the `MediaTask` response

### 3. Bridging AuthContext to userToken

The existing `mediaGenerationService` methods accept a `userToken: string` that is passed to the Python backend as a Bearer token. The Public API uses `AuthContext` instead.

Use the shared `createInternalTokenFromAuth()` utility from `_core/tokens.ts` (defined in section 03):

```typescript
import { createInternalTokenFromAuth } from "../_core/tokens";

const userToken = createInternalTokenFromAuth(auth, ["media:generate"]);
```

**Do NOT define a local `createMediaTokenFromAuth()` wrapper.** All sections must use the shared utility from section 03 to avoid duplication.

### 4. Credit Source Types

This section uses two credit source types that must exist in the `CreditSourceType` union (added in section 01):
- `api_media` -- for image/video/audio generation via Public API
- `api_video_project` -- for video project creation via Public API

### 5. Error Format

All errors follow the OpenAI-compatible format established in section 04:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Maximum 5 reference image URLs allowed",
    "type": "invalid_request_error"
  }
}
```

Error codes used by this section:
- `invalid_request` -- validation failures (bad input, SSRF-blocked URL, too many reference URLs)
- `credit_overflow` -- estimated cost exceeds `MAX_SINGLE_JOB_CREDITS`
- `insufficient_credits` -- user balance too low
- `not_found` -- unknown task ID or video project ID
- `insufficient_scopes` -- API key missing required scope (returned by `requireScopes` middleware from section 04)

### 6. Mounting in index.ts

In `apps/web/server/_core/index.ts`, add:

```typescript
import { publicVideoApiRouter } from "../routes/publicVideoApi";
import { publicMediaApiRouter } from "../routes/publicMediaApi";

// Mount after API key auth middleware, alongside other /v1/* routes
app.use("/v1/video-projects", publicVideoApiRouter);
app.use("/v1/media", publicMediaApiRouter);
```

These must be mounted after the API key auth middleware and CORS middleware established in sections 03 and 04.

### 6a. Event Emission

When a media generation task completes (detected via polling or callback from the Python backend), emit a `media.ready` event for webhook delivery and SSE consumers:

```typescript
import { emitPublicApiEvent } from "../services/webhookDeliveryService";

// After task status transitions to "completed"
await emitPublicApiEvent(tenantId, "media.ready", {
  task_id: taskId,
  type: mediaType, // "image" | "video" | "audio"
  result_url: resultUrl,
  credits_used: creditsUsed,
});
```

**Note:** The media generation service runs asynchronously (Celery tasks). Event emission for `media.ready` should be triggered by the task status polling endpoint (`GET /v1/media/:taskId/status`) when it first detects `status === "completed"`, or by a BullMQ job that checks task completion. The exact mechanism depends on the existing media completion callback infrastructure.

### 7. IP Address Validation Details — Reference Implementation

The `assertPublicIp` and `sanitizeUri` functions are the most security-critical utilities in this section. Place them in `apps/web/server/services/ssrfValidation.ts` so they can be shared by sections 08 and 11 (webhook URL validation).

#### `sanitizeUri(url: string): string`

```typescript
import { URL } from "url";

export function sanitizeUri(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError("invalid_request", `Invalid URL: ${rawUrl}`);
  }

  // Only allow HTTPS in production; HTTP allowed if ALLOW_HTTP_URLS env is set (dev only)
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && process.env.ALLOW_HTTP_URLS === "true")) {
    throw new ApiError("invalid_request", "Only HTTPS URLs are allowed");
  }

  // Strip embedded credentials
  parsed.username = "";
  parsed.password = "";

  return parsed.toString();
}
```

#### `assertPublicIp(hostname: string): Promise<void>`

```typescript
import dns from "dns";
import { isIPv4, isIPv6 } from "net";

// IPv4 private range checkers
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true; // reject malformed
  const [a, b] = parts;
  return (
    a === 10 ||                                    // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||           // 172.16.0.0/12
    (a === 192 && b === 168) ||                    // 192.168.0.0/16
    a === 127 ||                                   // 127.0.0.0/8
    (a === 169 && b === 254) ||                    // 169.254.0.0/16 (link-local / metadata)
    a === 0                                        // 0.0.0.0/8
  );
}

// IPv6 private range checkers
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;                              // loopback
  if (lower.startsWith("fe80:")) return true;                    // link-local (fe80::/10)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)

  // IPv4-mapped IPv6 (::ffff:x.x.x.x) -- extract and re-check IPv4 portion
  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(lower);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);

  return false;
}

export async function assertPublicIp(hostname: string): Promise<void> {
  // If hostname is already an IP address, check directly
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) throw new ApiError("invalid_request", `URL resolves to a private IP address`);
    return;
  }
  if (isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) throw new ApiError("invalid_request", `URL resolves to a private IP address`);
    return;
  }

  // Resolve DNS — check ALL records, not just the first
  const allAddresses: string[] = [];
  try {
    const v4 = await dns.promises.resolve4(hostname).catch(() => [] as string[]);
    const v6 = await dns.promises.resolve6(hostname).catch(() => [] as string[]);
    allAddresses.push(...v4, ...v6);
  } catch {
    throw new ApiError("invalid_request", `DNS resolution failed for hostname: ${hostname}`);
  }

  if (allAddresses.length === 0) {
    throw new ApiError("invalid_request", `DNS resolution returned no records for: ${hostname}`);
  }

  // Check EVERY record — one private IP among public ones is still an attack vector
  for (const addr of allAddresses) {
    if (isIPv4(addr) && isPrivateIPv4(addr)) {
      throw new ApiError("invalid_request", `URL resolves to a private IP address`);
    }
    if (isIPv6(addr) && isPrivateIPv6(addr)) {
      throw new ApiError("invalid_request", `URL resolves to a private IP address`);
    }
  }
}
```

#### Key Design Decisions

- **DNS failure = reject:** NXDOMAIN, timeout, or empty records all reject the URL. Fail-closed, never fail-open.
- **All records checked:** An attacker can add `A 8.8.8.8` + `AAAA ::ffff:127.0.0.1` to bypass single-record checks.
- **IPv4-mapped IPv6:** `::ffff:127.0.0.1` is extracted and re-checked as IPv4.
- **DNS timeout:** Node's default `dns.promises.resolve*` timeout applies (~5s). No custom timeout needed.
- **No DNS rebinding protection in v1:** A future enhancement could add a DNS pinning layer (resolve once, use that IP for the actual fetch). For v1, the validation happens at request time which is sufficient.

---

## Relevant Existing Code

Key files the implementer should read before starting:

- `apps/web/server/routers/media.ts` -- the existing tRPC media router; contains `createMediaToken()`, `getUserToken()`, credit deduction patterns, and the full set of Zod schemas for media inputs
- `apps/web/server/services/mediaGenerationService.ts` -- the `MediaGenerationService` class with `generateImageAsync()`, `generateVideoAsync()`, `generateAudioAsync()`, `getTask()` methods; all accept `(request, userToken)` signature
- `apps/web/server/services/creditService.ts` -- `deductCredits()`, `hasEnoughCredits()`, `refundCredits()` functions; `CreditSourceType` union
- `apps/web/server/_core/tokens.ts` -- `signBearerToken()` for creating short-lived JWTs
- `apps/web/shared/publicApiTypes.ts` -- `AuthContext` type (from section 03)
