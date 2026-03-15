# Section 03: builtin-model-suggest Tool (Node.js Handler)

## Overview

This section implements a read-only HTTP endpoint at `POST /api/internal/tools/model-suggest` that the Auto Draft Agent calls to query available models and get recommendations. The handler queries the existing model registry, filters by purpose (image/video/audio/text), ranks results, and returns a top recommendation plus alternatives with categorical cost tiers (never raw pricing).

## Dependencies

- **Section 01 (shared-infra)** must be completed first. This section uses:
  - `ModelSuggestRequestSchema` and `ModelSuggestResponseSchema` from `apps/web/shared/contentAutomation/types.ts`
  - The `contentAutomationGate` feature flag middleware from `apps/web/server/middleware/contentAutomationGate.ts`

## File to Create

`apps/web/server/routers/modelSuggestTool.ts`

## File to Modify

`apps/web/server/_core/index.ts` -- register the route (or wherever the internal tool routes are mounted, following the same pattern as `browserTool.ts`)

## Background: Existing Model Registry

The model registry lives at `apps/web/server/services/modelRegistry.ts`. Key exports this handler will use:

- `getModelsByType(type: MediaType): ModelDefinition[]` -- synchronous, returns cached or static fallback models filtered by type and enabled status
- `getModelsByTypeAsync(type: MediaType): Promise<ModelDefinition[]>` -- async, forces a cache refresh from the database first
- `ModelDefinition` interface -- includes `id`, `type` (image/video/audio), `name`, `provider`, `description`, `creditCost`, `priority`, `isEnabled`
- `MediaType = "image" | "video" | "audio"` -- the registry does not have a "text" type

The registry supports both a static fallback (hardcoded models) and dynamic models from the `mediaModels` database table. Models have a `priority` field (lower = higher priority) and a `creditCost` field.

## Background: Internal Auth Pattern

Internal tool endpoints use `X-Internal-Token` header verified against `ENV.webGatewayToken` (from `SMARTSPEC_WEB_GATEWAY_TOKEN` env var) using `crypto.timingSafeEqual`. See `apps/web/server/routes/browserTool.ts` lines 99-104 for the canonical pattern. The handler also receives `userId` and `tenantId` in the request body.

## Handler Logic

1. Apply the `contentAutomationGate` middleware (returns 503 when `ENABLE_CONTENT_AUTOMATION` is not "true").
2. Verify `X-Internal-Token` header. Return 401 if missing or invalid.
3. Validate request body against `ModelSuggestRequestSchema`. The schema accepts:
   - `purpose` -- one of `"image"`, `"video"`, `"audio"`, `"text"` (required)
   - `userId` -- number (required)
   - `tenantId` -- string (required)
   - `quality_preference` -- optional string hint like `"high"`, `"balanced"`, `"fast"`
4. **Purpose mapping:** The existing `ModelDefinition.type` is `"image" | "video" | "audio"`. For `purpose: "text"`, return an empty result with a note that text model selection is handled by the LLM router, not the media model registry.
5. Call `getModelsByTypeAsync(purpose)` for image/video/audio to get fresh models from the DB.
6. **Tenant-level model visibility:** The model registry already filters by `isEnabled`. If tenant-specific visibility is needed in the future, this is the hook point. For now, rely on the global `isEnabled` flag.
7. **Rank models:** Sort by `priority` ascending (lower = higher priority). If `quality_preference` is `"high"`, prefer lower-priority (higher quality) models; if `"fast"`, prefer models with lower `creditCost`.
8. **Cost tier mapping:** Convert `creditCost` to a categorical string. Do NOT expose the raw `creditCost` number.
   - `creditCost <= 5` => `"low"`
   - `creditCost <= 20` => `"medium"`
   - `creditCost > 20` => `"high"`
9. Return the top recommendation as `recommended` and up to 3 additional models as `alternatives`.
10. If only 1 model is available, return it as `recommended` with an empty `alternatives` array.
11. If no models are available for the given purpose, return `recommended: null` with an empty `alternatives` array and a `message` field.

## Response Shape

The response from this endpoint (defined in `ModelSuggestResponseSchema` from Section 01) should look like:

```typescript
{
  success: boolean;
  recommended: {
    model_id: string;
    name: string;
    provider: string;
    cost_tier: "low" | "medium" | "high";
    description: string;
  } | null;
  alternatives: Array<{
    model_id: string;
    name: string;
    provider: string;
    cost_tier: "low" | "medium" | "high";
    description: string;
  }>;
  message?: string;
}
```

The `cost_per_unit` or `creditCost` numeric values must NEVER appear in the response. This is a security/business constraint -- the agent should reason about cost tiers, not exact pricing.

## Tests

**File:** `apps/web/server/routers/modelSuggestTool.test.ts`

Write tests FIRST using Vitest. The tests should mock `getModelsByTypeAsync` from `modelRegistry.ts` and the internal token verification. Use `vi.mock()` for module mocking.

### Test List

```
# Test: returns 503 when feature flag is disabled
# Test: returns 401 when X-Internal-Token is missing or invalid
# Test: returns 400 when purpose is not one of image/video/audio/text
# Test: filters models by purpose
# Test: returns recommended model with cost_tier as categorical string
# Test: returns up to 3 alternatives
# Test: returns empty alternatives when only 1 model available
# Test: does NOT expose raw pricing (no cost_per_unit or creditCost field in response)
# Test: respects tenant-level model visibility
# Test: handles empty model list gracefully
```

### Test Structure Guidance

Each test should follow this pattern:

1. Set environment variables as needed (`ENABLE_CONTENT_AUTOMATION`)
2. Create an Express app with the model-suggest route mounted
3. Use `supertest` to send `POST /api/internal/tools/model-suggest` with appropriate headers and body
4. Assert status code and response body shape

Mock the `getModelsByTypeAsync` function from `../services/modelRegistry` using `vi.mock()`. Mock the `verifyInternalToken` helper (or set `SMARTSPEC_WEB_GATEWAY_TOKEN` in the test env and pass the matching `X-Internal-Token` header).

## Implementation Notes

- The handler is an Express `Router` exported as default, following the same pattern as `apps/web/server/routes/browserTool.ts`.
- Use `crypto.timingSafeEqual` for token comparison (same pattern as browserTool.ts lines 99-104).
- The `getModelsByTypeAsync` function forces a cache refresh from the database. This is appropriate for this endpoint since the agent needs current data, and the endpoint is called infrequently (once per draft generation).
- For the "text" purpose: the media model registry does not track text/LLM models. Return a helpful message like `"Text model selection is handled by the LLM router. Use the default model."` with `recommended: null`.
- Export the `verifyInternalToken` helper and the cost-tier mapping function for testability.
- Rate limiting is not required for this read-only endpoint (the rate limit from Section 01 applies to the auto-draft tool, not the model-suggest tool).

## Cost Tier Mapping Function

Export a pure helper function for cost tier calculation so it can be unit-tested independently:

```typescript
export function creditCostToTier(
  creditCost: number
): "low" | "medium" | "high" {
  // creditCost <= 5 => "low"
  // creditCost <= 20 => "medium"
  // creditCost > 20 => "high"
}
```

## Route Registration

The route must be registered in the Express app. Section 01 is responsible for setting up the route mount point in `apps/web/server/routers/presentation.ts` (or the main Express app file). This section only creates the router module itself with the exported `Router` instance.

Export pattern (matching `browserTool.ts`):

```typescript
const router = Router();
// ... route definition ...
export default router;
```

The router will be mounted at the application level so the full path becomes `/api/internal/tools/model-suggest`.
