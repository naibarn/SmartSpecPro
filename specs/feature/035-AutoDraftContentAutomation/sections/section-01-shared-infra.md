# Section 01: Feature Flag and Shared Infrastructure

## Overview

This section establishes the foundational infrastructure that all subsequent Content Automation sections depend on. It includes:

1. **Feature flag middleware** -- an Express middleware that gates all `/api/internal/tools/*` routes behind the `ENABLE_CONTENT_AUTOMATION` environment variable / Redis flag
2. **Shared Zod schemas** -- request/response validation types for all tool endpoints (auto-draft, model-suggest, file-parse, schedule-draft)
3. **Canvas preset mapping** -- server-side mapping from aspect ratio strings to pixel dimensions, reusing the existing `PRESENTATION_CANVAS_PRESETS` from the client
4. **Redis-based rate limiting** -- per-user rate limits for auto-draft operations (hourly cap, concurrent semaphore, daily batch counter)
5. **tRPC feature flag exposure** -- a procedure to let the React frontend check whether Content Automation is enabled

**No other sections should be started until this section is complete.**

---

## Files to Create

- `/home/dev/projects/SmartSpecPro/apps/web/shared/contentAutomation/types.ts` -- All Zod schemas and inferred TypeScript types
- `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/contentAutomationGate.ts` -- Express middleware for feature flag gating
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/contentAutomationRateLimit.ts` -- Redis-backed rate limiting helpers

## Files to Modify

- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts` -- Register new internal tool routes (only the route setup; handlers live in dedicated files created by later sections)

## Test Files to Create

- `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/contentAutomationGate.test.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/shared/contentAutomation/types.test.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/contentAutomationRateLimit.test.ts`

---

## Tests (Write First)

### contentAutomationGate.test.ts

Located at `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/contentAutomationGate.test.ts`.

This tests the Express middleware that blocks content automation routes when the feature flag is disabled. The middleware uses `getFeatureFlag("ENABLE_CONTENT_AUTOMATION")` from `../services/featureFlags.ts`, which checks Redis first, then falls back to `process.env.ENABLE_CONTENT_AUTOMATION`.

```
describe("contentAutomationGate middleware")
  - Test: middleware returns 503 with JSON error body when ENABLE_CONTENT_AUTOMATION is unset (getFeatureFlag returns false)
  - Test: middleware returns 503 when ENABLE_CONTENT_AUTOMATION is "false"
  - Test: middleware calls next() when ENABLE_CONTENT_AUTOMATION is "true"
  - Test: middleware is applied to all 4 internal tool routes (/api/internal/tools/auto-draft, /api/internal/tools/model-suggest, /api/internal/tools/file-parse, /api/internal/tools/schedule-draft)
```

Mock `getFeatureFlag` from `../../services/featureFlags` using `vi.mock`. Create a minimal Express app with the middleware applied, and use supertest or manual request mocking to verify 503 vs pass-through behavior. The 503 response body should be `{ error: "Content automation is not enabled" }`.

### types.test.ts

Located at `/home/dev/projects/SmartSpecPro/apps/web/shared/contentAutomation/types.test.ts`.

These are pure Zod schema validation tests -- no mocking required.

```
describe("AutoDraftRequestSchema")
  - Test: validates a valid request with all required fields
  - Test: rejects missing topic (required field)
  - Test: rejects topic shorter than 3 characters
  - Test: rejects topic longer than 1000 characters
  - Test: rejects invalid canvas_preset values (e.g., "2:1")
  - Test: accepts all valid canvas_preset values ("16:9", "4:3", "1:1", "9:16", "3:4", "4:5", "5:4")
  - Test: rejects num_slides < 1 or > 30
  - Test: rejects invalid language values (not in allowed list)

describe("ModelSuggestRequestSchema")
  - Test: validates purpose enum accepts "image", "video", "audio", "text"
  - Test: rejects unknown purpose value

describe("FileParseRequestSchema")
  - Test: validates file_type enum accepts "csv", "xlsx", "txt"
  - Test: rejects unknown file_type

describe("ScheduleDraftRequestSchema")
  - Test: validates cron_expression is a non-empty string
  - Test: validates schedule_type is "one_time" or "recurring"

describe("InputItemSchema")
  - Test: validates topic is a non-empty string
  - Test: accepts optional custom_article_text, params, attachments

describe("canvasPresetToSize")
  - Test: maps "16:9" to { width: 1280, height: 720 }
  - Test: maps "9:16" to { width: 720, height: 1280 }
  - Test: maps "4:3" to { width: 1024, height: 768 }
  - Test: maps "1:1" to { width: 1080, height: 1080 }
  - Test: returns null for unknown preset string
```

### contentAutomationRateLimit.test.ts

Located at `/home/dev/projects/SmartSpecPro/apps/web/server/services/contentAutomationRateLimit.test.ts`.

Mock `getRedisClient` from `./redis`. The rate limiter uses three Redis key patterns:
- `rate:auto_draft:{userId}` -- INCR + EXPIRE (TTL 3600s), max 10/hour for interactive, max 50/hour for batch
- `rate:concurrent_draft:{userId}` -- max 3 concurrent (SETNX-based or sorted set)
- `daily:batch:{userId}` -- INCR + EXPIREAT midnight, max 100 items/day

```
describe("contentAutomationRateLimit")
  - Test: rate limiter allows first request within limit
  - Test: rate limiter blocks request exceeding 10/hour for interactive
  - Test: rate limiter blocks request exceeding 50/hour for batch
  - Test: concurrent semaphore allows up to 3 simultaneous drafts
  - Test: concurrent semaphore blocks 4th concurrent draft
  - Test: daily batch counter resets at midnight (EXPIREAT verification)
  - Test: daily batch counter blocks after 100 items
  - Test: releaseConcurrentSlot decrements the semaphore correctly
```

All tests should mock the Redis client to return controlled values for INCR, GET, SETNX, etc.

---

## Implementation Details

### 1. Shared Zod Schemas (`types.ts`)

Create `/home/dev/projects/SmartSpecPro/apps/web/shared/contentAutomation/types.ts`.

This file defines all Zod schemas and inferred TypeScript types used across the content automation tool endpoints. Import `z` from `"zod"`.

**Canvas Preset Mapping:**

The existing client-side presets are defined in `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/constants.ts` as `PRESENTATION_CANVAS_PRESETS`. The server-side mapping in this file must use the **same pixel dimensions**:

| Preset | Width | Height |
|--------|-------|--------|
| `"16:9"` | 1280 | 720 |
| `"9:16"` | 720 | 1280 |
| `"4:3"` | 1024 | 768 |
| `"3:4"` | 768 | 1024 |
| `"4:5"` | 960 | 1200 |
| `"5:4"` | 1250 | 1000 |
| `"1:1"` | 1080 | 1080 |

Note: The implementation plan mentioned 1920x1080 for 16:9, but the actual codebase uses 1280x720. Use the **actual codebase values** above.

Export a `CANVAS_PRESET_MAP` record and a `canvasPresetToSize(preset: string)` helper function that returns `{ width, height } | null`.

**Zod Schema Definitions:**

Define the canvas preset as a Zod enum reusing the same values as `presentationCanvasPresetSchema` in `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts`:

```typescript
const canvasPresetSchema = z.enum(["16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1"]);
```

**InputItemSchema** -- represents a single item to draft:
- `topic`: `z.string().min(1).max(5000)` (required)
- `custom_article_text`: `z.string().max(50000).optional()`
- `params`: `z.record(z.unknown()).optional()` -- arbitrary key-value overrides
- `attachments`: `z.array(z.string().url()).max(10).optional()`

**AutoDraftRequestSchema:**
- `topic`: `z.string().min(3).max(1000)` (required)
- `article_skill_slug`: `z.string().min(1).max(100).optional()`
- `media_skill_slug`: `z.string().min(1).max(100).optional()`
- `image_model_id`: `z.string().max(100).optional()`
- `canvas_preset`: `canvasPresetSchema.optional().default("16:9")`
- `num_slides`: `z.number().int().min(1).max(30).optional()`
- `language`: `z.string().min(2).max(10).optional()` -- ISO language code
- `style_preset`: `z.string().max(100).optional()`
- `reference_image_urls`: `z.array(z.string()).max(5).optional()`
- `source`: `z.string().max(200).optional()` -- overridden by handler
- `trace_id`: `z.string().max(100).optional()`

**AutoDraftResponseSchema:**
- `success`: `z.boolean()`
- `deck_id`: `z.number().int().positive().optional()`
- `slide_count`: `z.number().int().min(0).optional()`
- `credits_used`: `z.number().min(0).optional()`
- `warnings`: `z.array(z.string()).optional()`
- `error`: `z.string().optional()`

**ModelSuggestRequestSchema:**
- `purpose`: `z.enum(["image", "video", "audio", "text"])`
- `quality_preference`: `z.enum(["speed", "balanced", "quality"]).optional().default("balanced")`
- `tenant_id`: `z.string().optional()`

**ModelSuggestResponseSchema:**
- `recommended`: model object with `id`, `name`, `provider`, `cost_tier` (enum: "low"/"medium"/"high")
- `alternatives`: array of model objects (max 3)

**FileParseRequestSchema:**
- `file_url`: `z.string().url()`
- `file_type`: `z.enum(["csv", "xlsx", "txt"]).optional()` -- auto-detected if omitted
- `topic_column`: `z.string().min(1).max(100).optional().default("topic")`
- `params_columns`: `z.record(z.string()).optional()` -- maps column names to param keys
- `parse_mode`: `z.enum(["per_line", "single"]).optional().default("per_line")` -- for TXT
- `max_rows`: `z.number().int().min(1).max(100).optional().default(100)`

**FileParseResponseSchema:**
- `items`: array of InputItemSchema results
- `total_rows`: `z.number().int()`
- `parsed_rows`: `z.number().int()`
- `warnings`: `z.array(z.string()).optional()`

**ScheduleDraftRequestSchema:**
- `topic_template`: `z.string().min(3).max(1000)`
- `schedule_type`: `z.enum(["one_time", "recurring"])`
- `cron_expression`: `z.string().max(100).optional()` -- required when `schedule_type` is "recurring"
- `run_at`: `z.string().datetime().optional()` -- required when `schedule_type` is "one_time"
- `timezone`: `z.string().max(50).optional().default("UTC")`
- `draft_params`: a nested object matching AutoDraftRequestSchema (minus topic, which comes from template)
- `notify_email`: `z.string().email().optional()`
- `notify_webhook_url`: `z.string().url().optional()`

**ScheduleDraftResponseSchema:**
- `schedule_id`: `z.number().int().positive()`
- `next_run`: `z.string().datetime()`
- `status`: `z.enum(["active", "paused", "completed"])`

Export all schemas and their inferred types using `z.infer<typeof SchemaName>`.

### 2. Feature Flag Middleware (`contentAutomationGate.ts`)

Create `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/contentAutomationGate.ts`.

This is an Express middleware function (not tRPC middleware). It follows the same pattern as the feature flag check in `agencyStreamProxy.ts` (line 67):

```typescript
const enabled = await getFeatureFlag("AGENCY_SWARM_ENABLED");
```

The middleware:
1. Calls `getFeatureFlag("ENABLE_CONTENT_AUTOMATION")` from `../services/featureFlags`
2. If the flag returns `false`, respond with HTTP 503 and JSON body `{ error: "Content automation is not enabled" }`
3. If the flag returns `true`, call `next()`

The middleware signature is standard Express: `(req: Request, res: Response, next: NextFunction) => void`.

**Why 503 (not 404 or 403)?** The feature is temporarily unavailable, not forbidden or missing. This matches the spec's intent: the feature exists but is gated by configuration.

**Route application:** The middleware should be applied to these path prefixes (registered in `_core/index.ts` or `presentation.ts` route setup):
- `/api/internal/tools/auto-draft`
- `/api/internal/tools/model-suggest`
- `/api/internal/tools/file-parse`
- `/api/internal/tools/schedule-draft`
- `/api/internal/tools/skill-discovery`

Export the middleware as a named function `contentAutomationGate` so it can be applied via `app.use("/api/internal/tools", contentAutomationGate)`.

### 3. Redis-based Rate Limiting (`contentAutomationRateLimit.ts`)

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/contentAutomationRateLimit.ts`.

This differs from the existing in-memory rate limiter at `/home/dev/projects/SmartSpecPro/apps/web/server/_core/rateLimitedProcedure.ts` because it uses Redis for persistence across process restarts and multi-instance deployments.

Import `getRedisClient` from `./redis`.

**Three rate limiting mechanisms:**

1. **Hourly request rate** (`checkHourlyRate`):
   - Redis key: `rate:auto_draft:{userId}`
   - Uses INCR + EXPIRE pattern (TTL 3600s on first increment)
   - Interactive limit: 10 requests/hour
   - Batch limit: 50 requests/hour
   - Accept a `mode: "interactive" | "batch"` parameter to select the limit
   - Returns `{ allowed: boolean, remaining: number, resetIn: number }`

2. **Concurrent semaphore** (`acquireConcurrentSlot` / `releaseConcurrentSlot`):
   - Redis key: `rate:concurrent_draft:{userId}`
   - Max 3 concurrent drafts per user (across both manual and auto-draft)
   - Use INCR to acquire, DECR to release
   - Set a TTL of 600s (10 min safety net) so slots auto-expire if the process crashes
   - `acquireConcurrentSlot`: INCR the key; if value > 3, DECR it back and return `{ allowed: false }`; otherwise return `{ allowed: true }`
   - `releaseConcurrentSlot`: DECR the key (floor at 0)

3. **Daily batch counter** (`checkDailyBatchLimit`):
   - Redis key: `daily:batch:{userId}`
   - INCR + EXPIREAT (next midnight UTC)
   - Max 100 items per day per user
   - Returns `{ allowed: boolean, used: number, limit: number }`

Export all three as async functions. Each function accepts `userId: number` as the first parameter.

### 4. tRPC Feature Flag Exposure

Add a tRPC procedure so the frontend can check if content automation is available. This follows the pattern of how `agencyStreamProxy.ts` checks `getFeatureFlag("AGENCY_SWARM_ENABLED")`.

The simplest approach: add a query to an existing feature flags router (or create a minimal one) that returns `{ contentAutomation: boolean }`. The UI toggle in `AIDraftModal.tsx` (Section 09) will call this to decide whether to show the "Auto" mode.

This can be done as part of the route registration in `presentation.ts` or as a standalone procedure. The key requirement is that it calls `getFeatureFlag("ENABLE_CONTENT_AUTOMATION")` and returns the boolean result.

### 5. Route Registration (modify `presentation.ts`)

The route registration connects the middleware to the Express app. The actual handler functions are created in later sections (02-05, 08), so at this stage, register placeholder routes that return 501 (Not Implemented) behind the feature flag gate.

In `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`, where other route registrations happen (lines 17-20 show `registerLLMRoutes`, `registerMCPRoutes`, `registerMediaJobRoutes`, `registerAgencyStreamRoutes`), add a new registration function. Alternatively, the routes can be set up in `presentation.ts` where the tRPC router already exists.

The registration pattern:
```typescript
// Apply contentAutomationGate to all /api/internal/tools/* paths
app.use("/api/internal/tools", contentAutomationGate);

// Individual tool routes (handlers added by sections 02-05, 08)
// For now, register the gate only -- handlers will be imported later
```

The approach: create a `registerContentAutomationRoutes(app: Express)` function in the gate middleware file (or a new `contentAutomationRoutes.ts`), then call it from `_core/index.ts`.

---

## Dependencies

- **None** -- this is the first section with no dependencies on other sections.

## Downstream Dependents

Sections 02, 03, 04, 05, 08, and 09 all depend on this section:
- Sections 02-05 and 08 import the Zod schemas from `types.ts` for request validation
- Sections 02-05 and 08 are gated by the `contentAutomationGate` middleware
- Section 02 uses the rate limiting functions from `contentAutomationRateLimit.ts`
- Section 09 uses the tRPC feature flag exposure to show/hide the auto mode toggle

## Key Codebase References

- **Feature flag system**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/featureFlags.ts` -- `getFeatureFlag(flagName)` checks Redis key `feature-flag:{flagName}`, falls back to `process.env[flagName]`
- **Existing tenant-scoped flags**: `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts` -- the `ENABLE_CONTENT_AUTOMATION` flag is a global flag (not tenant-scoped), so use `getFeatureFlag` not `requireFeatureFlag`
- **Canvas presets (source of truth)**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/constants.ts` -- `PRESENTATION_CANVAS_PRESETS` array with actual pixel dimensions
- **Canvas preset Zod enum**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts` line 197 -- `presentationCanvasPresetSchema`
- **Token minting pattern**: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/tokens.ts` -- `signBearerToken(claims, expiresIn)`
- **Agency stream feature flag pattern**: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.ts` line 67 -- example of `getFeatureFlag` usage in Express middleware
- **Redis client**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/redis.ts` -- `getRedisClient()` returns IORedis instance
- **Route registration site**: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` lines 17-20 -- where Express route handlers are registered
- **Path alias**: Use `@shared/` for imports from `apps/web/shared/` (configured in vite.config.ts and tsconfig)
