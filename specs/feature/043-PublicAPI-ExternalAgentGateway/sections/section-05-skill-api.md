# Section 05 -- Skill Execution API

## Overview

This section implements the public REST API for skill discovery and execution, exposing SmartSpecPro's skills engine to external agents and automation platforms. Four endpoints are created under `/v1/skills` that wrap the existing `skillRegistry` and `skillExecutor` services.

**Dependencies:**
- Section 01 (database schema) must be complete -- provides `api_audit_events` table and `CreditSourceType` extension with `api_skill`.
- Section 03 (auth extension) must be complete -- provides `authorizeRequest()` API key detection, `AuthContext` type, and `requireScopes()` middleware.
- Section 04 (rate limiter/audit) must be complete -- provides `apiKeyRateLimiter`, audit logging middleware, idempotency middleware, CORS config, and common error format.

**Blocks:**
- Section 10 (job automation) depends on this section for `skill_execution` job type routing.

## Files

| File | Action |
|------|--------|
| `apps/web/server/routes/publicSkillsApi.ts` | **Create** -- Express router with 4 endpoints |
| `apps/web/server/routes/__tests__/publicSkillsApi.test.ts` | **Create** -- Vitest tests |
| `apps/web/server/_core/index.ts` | **Modify** -- Mount the new router |

## Tests (Write First)

Create the test file at `apps/web/server/routes/__tests__/publicSkillsApi.test.ts`. All tests mock the underlying services and middleware. The test structure uses Vitest with the existing project patterns.

### Test Stubs

```typescript
// apps/web/server/routes/__tests__/publicSkillsApi.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock setup:
 * - vi.mock("../../services/skillRegistry") for getAvailableSkillsAsync, getSkillByIdAsync
 * - vi.mock("../../services/skillExecutor") for executeSkill
 * - vi.mock("../../services/skillDetector") for detectSkill
 * - vi.mock("../../services/creditService") for deductCredits, getBalance
 * - Mock Express req/res objects with req.auth populated by auth middleware
 */

describe("GET /v1/skills", () => {
  it("returns skills list with pagination");
  // Call handler with req.auth containing scopes: ["skills:list"]
  // Mock getAvailableSkillsAsync() to return 3 skills
  // Expect response body: { skills: [...], pagination: { page, limit, total } }

  it("requires skills:list scope");
  // Call with scopes: ["agencies:list"] -- missing skills:list
  // Expect 403 with error.code = "insufficient_scopes"

  it("filters by category query param");
  // Pass ?category=image_generation
  // Verify returned skills are filtered

  it("filters by search query param");
  // Pass ?search=prompt
  // Verify returned skills have matching name/description

  it("respects tenant isolation");
  // Skills are loaded from registry which is tenant-scoped
  // Verify the handler passes tenantId to registry calls
});

describe("GET /v1/skills/:skillId", () => {
  it("returns skill detail with inputSchema");
  // Mock getSkillByIdAsync("image_prompt_engineer") to return a skill definition
  // Expect response includes id, name, category, description, inputSchema

  it("returns 404 for non-existent skill ID");
  // Mock getSkillByIdAsync to return undefined
  // Expect 404 with error.code = "not_found"

  it("requires skills:list scope");
  // Missing scope => 403
});

describe("POST /v1/skills/:skillId/execute", () => {
  it("validates inputs against JSON Schema");
  // Skill has inputSchema requiring "prompt" field
  // Send body: { inputs: {} } (missing prompt)
  // Expect 400 with error.code = "invalid_request"

  it("deducts credits with source api_skill");
  // Successful execution
  // Verify deductCredits called with sourceType: "api_skill"

  it("requires skills:execute scope");
  // Missing scope => 403

  it("returns X-Credits-Used header");
  // After successful execution, response headers include X-Credits-Used

  it("returns X-Credits-Remaining header");
  // After successful execution, response headers include remaining balance

  it("with stream=true returns SSE");
  // Body: { inputs: { prompt: "test" }, stream: true }
  // Verify response content-type is text/event-stream

  it("returns 404 for non-existent skill ID");
  // Missing skill => 404

  it("returns error for insufficient credits");
  // Mock hasEnoughCredits to return false
  // Expect 402 with error.code = "insufficient_credits"
});

describe("POST /v1/skills/detect", () => {
  it("returns matched skill with confidence");
  // Body: { prompt: "create an image of a sunset" }
  // Mock detectSkill to return { detected: true, skill: {...}, confidence: 0.9, ... }
  // Expect response: { skill: { id, name, confidence }, suggested_inputs }

  it("requires skills:execute scope");
  // Missing scope => 403

  it("returns null skill when no match");
  // Mock detectSkill to return { detected: false }
  // Expect response: { skill: null, suggested_inputs: null }
});
```

## Implementation Details

### 1. Create the Express Router

**File:** `apps/web/server/routes/publicSkillsApi.ts`

Create an Express Router that exports a factory function `createPublicSkillsRouter()`. This router handles four endpoints. Each endpoint is guarded by `requireScopes()` middleware from section 03.

The router does NOT handle authentication itself -- that is done by the `apiKeyAuthMiddleware` mounted globally for all `/v1/*` routes (section 03). By the time a request reaches this router, `req.auth` is already populated with `userId`, `tenantId`, `scopes`, `apiKeyId`, etc.

#### Endpoint: `GET /v1/skills`

- Scope required: `skills:list`
- Query parameters (all optional):
  - `category` (string) -- filter by skill category
  - `tags` (string) -- comma-separated tags
  - `search` (string) -- search skill name and description
  - `page` (number, default 1) -- pagination page
  - `limit` (number, default 20, max 100) -- page size
- Implementation:
  1. Call `getAvailableSkillsAsync()` from `skillRegistry`
  2. Apply filters in-memory (category, tags, search by substring match on name + description)
  3. Apply pagination (slice the filtered array)
  4. Map each `SkillDefinition` to a public-facing shape: `{ id, name, category, description, tags, icon, inputSchema }`. The `inputSchema` comes from loading the skill's `schemas/input.schema.json` file via the skill's `skillFilePath`, or returning an empty object if not found.
  5. Return `{ skills: [...], pagination: { page, limit, total } }`

#### Endpoint: `GET /v1/skills/:skillId`

- Scope required: `skills:list`
- Implementation:
  1. Call `getSkillByIdAsync(req.params.skillId)` from `skillRegistry`
  2. If not found, return 404 with `{ error: { code: "not_found", message: "Skill not found", type: "invalid_request_error" } }`
  3. Return full skill metadata including `inputSchema`, `executionMode`, `creditMultiplier`, `models`, `defaultModel`

#### Endpoint: `POST /v1/skills/:skillId/execute`

- Scope required: `skills:execute`
- Request body (validated with Zod):
  ```typescript
  {
    inputs: Record<string, unknown>,  // skill-specific inputs
    model?: string,                    // optional model override
    stream?: boolean                   // default false
  }
  ```
- Implementation:
  1. Look up skill via `getSkillByIdAsync(req.params.skillId)` -- 404 if not found
  2. Validate `inputs` against the skill's JSON Schema. Use `ajv` (already a project dependency) or Zod dynamic validation. Return 400 with `invalid_request` if validation fails.
  3. Check credit balance via `hasEnoughCredits(userId, estimatedCost)`. Return 402 with `insufficient_credits` if insufficient.
  4. Build `SkillExecutionParams` from the inputs:
     - `prompt` from `inputs.prompt` (required for most skills)
     - `model` from body or skill default
     - Map other input fields to `extraParams`
  5. Call `executeSkill(skill, params, authContext.userId, userToken, authContext.tenantId)`. Note: the existing `executeSkill` accepts `userToken: string`. Until section 03's AuthContext refactor is complete, derive a synthetic token or pass the API key ID. After the refactor, pass the `AuthContext` directly.
  6. Deduct credits via `deductCredits({ userId, amount, sourceType: "api_skill", ... })`
  7. Set response headers: `X-Credits-Used` and `X-Credits-Remaining`
  8. If `stream: true`:
     - Set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
     - Write SSE events as `data: ${JSON.stringify(chunk)}\n\n`
     - Close with `data: [DONE]\n\n`
  9. If `stream: false`:
     - Return `{ result: { ... }, credits_used: N }`

#### Endpoint: `POST /v1/skills/detect`

- Scope required: `skills:execute`
- Request body (validated with Zod):
  ```typescript
  {
    prompt: string   // the user message to detect skill from
  }
  ```
- Implementation:
  1. Call `detectSkill(body.prompt)` from `skillDetector`
  2. If `result.detected === true`, return:
     ```json
     {
       "skill": { "id": "...", "name": "...", "confidence": 0.9 },
       "suggested_inputs": { "prompt": "..." }
     }
     ```
  3. If `result.detected === false`, return:
     ```json
     { "skill": null, "suggested_inputs": null }
     ```

### 2. Error Format

All errors follow the OpenAI-compatible format established in section 04:

```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "Your account has insufficient credits for this request",
    "type": "billing_error"
  }
}
```

Error code mapping for this router (per section 04 canonical reference):
- Missing/invalid scope: `{ code: "insufficient_scopes", type: "auth_error" }` -- 403
- Skill not found: `{ code: "not_found", type: "not_found_error" }` -- 404
- Input validation failure: `{ code: "invalid_request", type: "invalid_request_error" }` -- 400
- Insufficient credits: `{ code: "insufficient_credits", type: "billing_error" }` -- 402
- Internal error: `{ code: "internal_error", type: "internal_error" }` -- 500

Use a shared `apiError(res, statusCode, code, message, type)` helper (defined in section 04 or locally) to ensure consistent formatting.

### 3. SSE Streaming

For `POST /v1/skills/:skillId/execute` with `stream: true`:

The existing `skillExecutor.executeSkill()` returns a `SkillExecutionResult` object (not a stream). For SSE support, the implementation should:

1. Check if the skill's `executionMode` is `llm-only` or `core-text` (these are text-based and can potentially stream).
2. For streamable skills, use the underlying LLM call with streaming enabled. The `skillModelFallback.executeSkillLlmWithFallback()` function accepts a `stream` parameter.
3. Pipe the stream chunks as SSE `data:` events.
4. For non-streamable skills (media generation), execute normally and return the result as a single SSE event followed by `[DONE]`.

If full streaming is complex to implement immediately, an acceptable v1 approach is:
- Execute the skill normally (non-streaming internally)
- Send the complete result as a single SSE `data:` event
- Close with `data: [DONE]\n\n`

This gives API consumers a consistent SSE interface while the streaming internals can be improved later.

**SSE heartbeat:** When `stream: true`, send heartbeat comments (`: heartbeat\n\n`) every 15 seconds per section 04's SSE standard. Set `X-Accel-Buffering: no` header for Nginx compatibility.

### 4. Input Schema Loading

Skills store their input schemas at `apps/web/skills/{skillSlug}/schemas/input.schema.json`. To expose these via the API:

1. Use the skill's `skillFilePath` to derive the skill directory
2. Read `schemas/input.schema.json` from that directory
3. If the file does not exist, return an empty schema `{ type: "object", properties: {} }`
4. Cache loaded schemas in memory (they change infrequently)

The `resolveSkillManifestPath()` utility from `apps/web/server/services/skillFiles.ts` can help resolve the path.

### 5. Mount the Router

In `apps/web/server/_core/index.ts`, add the router mount:

```typescript
import { createPublicSkillsRouter } from "../routes/publicSkillsApi";

// Mount after apiKeyAuthMiddleware and before catch-all routes
app.use("/v1/skills", createPublicSkillsRouter());
```

The exact placement should be alongside other `/v1/*` route mounts that will be added by sections 06-08. All `/v1/*` routes are covered by the global API key auth middleware and CORS configuration from section 04.

### 6. Credit Source Type

The `CreditSourceType` union in `apps/web/server/services/creditService.ts` must include `api_skill` (added in section 01). This section uses it when calling `deductCredits()` with `sourceType: "api_skill"` to distinguish API-originated skill executions from web UI ones.

### 7. Tenant Isolation

Skills are loaded from the database and filtered by the registry. The current `getAvailableSkillsAsync()` returns all enabled skills globally (skills are not tenant-specific in the current schema). Tenant isolation for the skill API means:
- The API key's tenant must have the `publicApi` feature flag enabled (enforced by auth middleware from section 03)
- Credit deduction is scoped to the API key's user within the tenant
- Audit events are tagged with `tenantId` and `apiKeyId`

If future requirements add tenant-specific skill enablement, the registry filter can be extended without changing the API surface.

### 8. Key Service Interfaces

For reference, these are the existing function signatures this section depends on:

**skillRegistry.ts:**
- `getAvailableSkillsAsync(): Promise<SkillDefinition[]>` -- returns all skills sorted by priority
- `getSkillByIdAsync(id: string): Promise<SkillDefinition | undefined>` -- lookup by slug

**skillExecutor.ts:**
- `executeSkill(skill, params, userId, userToken, tenantId?): Promise<SkillExecutionResult>` -- the current signature takes `userToken: string` (will be refactored to `AuthContext` by section 03)

**skillDetector.ts:**
- `detectSkill(message, conversationId?, skillSettings?, userId?): Promise<SkillDetectionResult>` -- returns `{ detected, skill, confidence, matchedTrigger, suggestedPrompt, patternChainTo }`

**creditService.ts:**
- `hasEnoughCredits(userId, amount): Promise<boolean>`
- `deductCredits(params: DeductCreditsParams): Promise<...>` -- `params.sourceType` accepts `CreditSourceType`

## Security Considerations

- All endpoints require valid API key authentication (handled by section 03 middleware)
- Scope enforcement via `requireScopes()` on each route
- No internal paths, file system paths, or stack traces are exposed in error responses
- Input validation via JSON Schema prevents malformed data from reaching the executor
- Credit checks happen before execution to prevent resource exhaustion
- The `userToken` passed to `executeSkill` must not be the raw API key -- use a derived internal token or the user's session token equivalent