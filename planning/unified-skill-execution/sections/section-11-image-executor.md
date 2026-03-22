I now have all the context needed. Let me write the section.

# Section 11 -- Image Generation Executor

## Goal

Implement `ImageGenerationExecutor`, an adapter that wraps the existing image generation pipeline behind the `CapabilityExecutor` interface defined in section-01. This executor handles the `media.image` capability family by delegating to the existing `executeImageGeneration()` flow in `skillExecutor.ts` and the `mediaGenerationService.generateImage()` method. It does not rewrite any media generation logic.

## Dependencies

- **section-01-types-and-contract** (must be completed): Provides `CapabilityExecutor`, `ExecutorInput`, `ExecutorResult`, `CapabilityFamily`, `RouteDecision` from `apps/web/server/services/executors/types.ts`.
- **section-02-executor-registry** (must be completed): Provides `registerExecutor` from `apps/web/server/services/executors/executorRegistry.ts`. The image executor self-registers at module load.

## Blocks

- **section-13-media-routing-integration**: Depends on this executor being registered and functional.

## Target Files

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/executors/imageExecutor.ts` | Create |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/imageExecutor.test.ts` | Create |

## Existing Code to Wrap

The image executor wraps existing infrastructure without modifying it. Key existing code:

1. **`executeImageGeneration()`** in `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutor.ts` (line 427): Handles model resolution, credit checks, API config building, and calls `mediaGenerationService.generateImage()`. Returns `SkillExecutionResult` with type `"image"`.

2. **`mediaGenerationService.generateImage()`** in `/home/dev/projects/SmartSpecPro/apps/web/server/services/mediaGenerationService.ts` (line 797): Accepts `ImageGenerationRequest` and `userToken`, dispatches to the Python backend at `/api/v1/media/image`, returns `MediaGenerationResponse`.

3. **`SkillExecutionParams`** in `skillExecutor.ts` (line 244): The parameter shape used by `executeImageGeneration()` (prompt, model, aspectRatio, numImages, resolution, referenceImageUrls, apiConfig, extraParams, publicUrl).

4. **`MediaGenerationResponse`** in `mediaGenerationService.ts` (line 369): The response shape with `success`, `data[]`, `creditsUsed`, `creditsBalance`, `model`.

5. **Model registry helpers** from `modelRegistry.ts`: `getModelById()`, `getDefaultModel()`, `mapToApiModelId()`, `getModelsByTypeAsync()`.

6. **`buildMediaApiConfig()`** in `skillExecutor.ts` (line 87): Builds API config from model's `configJson`.

## Tests First

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/imageExecutor.test.ts`

All tests use Vitest. The test file mocks the existing media generation services to test the adapter in isolation.

```
Test: canHandle returns true for media.image capability
  - Create an ImageGenerationExecutor instance.
  - Call canHandle({ capability: "media.image", executorId: "image-generation", reason: "..." }).
  - Assert returns true.

Test: canHandle returns false for non-image capabilities
  - Call canHandle with capability "writing.article".
  - Assert returns false.
  - Call canHandle with capability "media.video".
  - Assert returns false.

Test: executor id is "image-generation"
  - Assert executor.id equals "image-generation".

Test: capabilities array contains exactly media.image
  - Assert executor.capabilities deep equals ["media.image"].

Test: extracts image params from dynamicParams and execution policy
  - Provide ExecutorInput with dynamicParams containing { model: "flux-2.0", aspectRatio: "16:9", numImages: 2 }.
  - Mock mediaGenerationService.generateImage to capture arguments.
  - Call execute().
  - Assert the request passed to generateImage includes the model, aspectRatio, and numImages values.

Test: calls mediaGenerationService.generateImage with correct request shape
  - Provide ExecutorInput with skill definition and messages containing user prompt.
  - Mock mediaGenerationService.generateImage to return a successful MediaGenerationResponse.
  - Call execute().
  - Assert generateImage was called once with an ImageGenerationRequest-shaped object and a userToken string.

Test: returns media_job result with job payload on success
  - Mock generateImage to return { success: true, data: [{ id: "img-1", url: "https://..." }], creditsUsed: 10, creditsBalance: 90, model: "flux-2.0" }.
  - Call execute().
  - Assert result.success is true.
  - Assert result.mediaJob is defined with mediaType "image".
  - Assert result.mediaJob.jobPayload contains the response data (URLs, model, creditsUsed).

Test: handles dispatch failure gracefully
  - Mock generateImage to throw Error("Provider unavailable").
  - Call execute().
  - Assert result.success is false.
  - Assert result.error contains "Provider unavailable".
  - Assert result.mediaJob is undefined.

Test: same routing decision from chat channel and team_room channel
  - Call canHandle with a route from chat channel context.
  - Call canHandle with a route from team_room channel context.
  - Both return true for media.image capability (channel does not affect canHandle).

Test: extracts prompt from messages array
  - Provide ExecutorInput with messages: [{ role: "system", content: "skill prompt" }, { role: "user", content: "Generate a sunset image" }].
  - Mock generateImage.
  - Call execute().
  - Assert the prompt passed to generateImage is "Generate a sunset image" (extracted from the last user message).

Test: resolves model from execution policy when not in dynamicParams
  - Provide ExecutorInput with executionPolicy containing { defaultModel: "google-banana-2" } and no model in dynamicParams.
  - Mock generateImage.
  - Call execute().
  - Assert the model passed to generateImage is "google-banana-2".

Test: passes reference image URLs from dynamicParams
  - Provide ExecutorInput with dynamicParams: { referenceImageUrls: ["https://example.com/ref.jpg"] }.
  - Mock generateImage.
  - Call execute().
  - Assert referenceImageUrls in the request includes the provided URL.
```

### Test Setup Pattern

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExecutorInput, RouteDecision } from "../executors/types";

// Mock mediaGenerationService before importing the executor
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImage: vi.fn(),
  },
}));

// Mock modelRegistry helpers
vi.mock("../modelRegistry", () => ({
  getModelById: vi.fn(),
  getDefaultModel: vi.fn(),
  mapToApiModelId: vi.fn((id: string) => id),
  getModelsByTypeAsync: vi.fn().mockResolvedValue([]),
}));

// Mock executorRegistry to capture registration
vi.mock("../executors/executorRegistry", () => ({
  registerExecutor: vi.fn(),
}));

// Import after mocks
import { ImageGenerationExecutor } from "../executors/imageExecutor";
import { mediaGenerationService } from "../mediaGenerationService";
```

Each test creates a fresh `ImageGenerationExecutor` instance (or uses the module-level singleton). Tests use `vi.fn()` and `vi.mocked()` to assert call arguments on `mediaGenerationService.generateImage`.

## Implementation Guidance

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/executors/imageExecutor.ts`

### Exports

```typescript
export class ImageGenerationExecutor implements CapabilityExecutor {
  readonly id = "image-generation";
  readonly capabilities: readonly CapabilityFamily[] = ["media.image"];

  canHandle(route: RouteDecision): boolean;
  execute(input: ExecutorInput): Promise<ExecutorResult>;
}
```

### Imports

```typescript
import type {
  CapabilityExecutor,
  CapabilityFamily,
  ExecutorInput,
  ExecutorResult,
  RouteDecision,
} from "./types";
import { registerExecutor } from "./executorRegistry";
import {
  mediaGenerationService,
  type MediaGenerationResponse,
} from "../mediaGenerationService";
import {
  getModelById,
  getDefaultModel,
  mapToApiModelId,
  getModelsByTypeAsync,
} from "../modelRegistry";
```

### `canHandle` Logic

Return `true` if and only if `route.capability === "media.image"`. Channel does not affect this decision.

### `execute` Logic

The executor translates `ExecutorInput` into the existing media generation call. Steps:

1. **Extract prompt** from `input.messages` -- find the last message with `role === "user"` and extract its text content. If content is an array (multimodal), find the text entry.

2. **Extract media params** from `input.dynamicParams` and `input.executionPolicy`:
   - `model`: `dynamicParams.model ?? executionPolicy.defaultModel ?? null`
   - `aspectRatio`: `dynamicParams.aspectRatio`
   - `numImages`: `dynamicParams.numImages`
   - `resolution`: `dynamicParams.resolution`
   - `referenceImageUrls`: `dynamicParams.referenceImageUrls`
   - `referenceStyleUrl`: `dynamicParams.referenceStyleUrl`
   - `apiConfig`: `dynamicParams.apiConfig`
   - `extraParams`: remaining dynamicParams fields not consumed above
   - `publicUrl`: `dynamicParams.publicUrl`

3. **Resolve model** -- If model is set, call `mapToApiModelId(model)`. If not, call `getDefaultModel("image")` and use its ID. Call `getModelsByTypeAsync("image")` to ensure the model cache is warm.

4. **Build API config** -- If the resolved model has `configJson` (via `getModelById()`), merge it with any `apiConfig` from dynamicParams. Use the `buildMediaApiConfig()` helper pattern from `skillExecutor.ts`.

5. **Call `mediaGenerationService.generateImage()`** -- Pass an `ImageGenerationRequest`-shaped object with the resolved parameters. The `userToken` is extracted from `input.dynamicParams.userToken` (the orchestrator must pass this through).

6. **Map response to `ExecutorResult`**:
   - On success: `{ success: true, mediaJob: { mediaType: "image", jobPayload: { data: response.data, model: response.model, creditsUsed: response.creditsUsed, urls: [...] } }, inputTokens: 0, outputTokens: 0, attempts: [], totalDurationMs }`.
   - On failure: `{ success: false, error: error.message, inputTokens: 0, outputTokens: 0, attempts: [], totalDurationMs }`.

7. **Track duration** -- Record `Date.now()` at start and end of execute, set `totalDurationMs`.

### Self-Registration

At module level (outside the class), register the executor:

```typescript
const imageExecutor = new ImageGenerationExecutor();
registerExecutor(imageExecutor);
export { imageExecutor };
```

This runs when the module is first imported. The orchestrator (section-06) or the registry setup module (section-13) will import this file, triggering registration.

### userToken Passing

The `ExecutorInput` type (from section-01) does not have a dedicated `userToken` field. The image executor needs the user's auth token to call `mediaGenerationService.generateImage()`. There are two options:

**Option A (preferred):** Pass `userToken` through `input.dynamicParams.userToken`. The orchestrator extracts it from the request context and includes it in dynamicParams before calling the executor.

**Option B:** Extend `ExecutorInput` with an optional `userToken?: string` field. This requires updating section-01's type definition.

Use Option A for now to avoid modifying the types contract. Document that `dynamicParams.userToken` is required for media executors.

### Error Handling

- Wrap the entire `execute()` body in try/catch.
- On any error, return a failed `ExecutorResult` with `success: false` and the error message.
- Do not throw from `execute()` -- the orchestrator expects a result object, not an exception.
- Credit checks are NOT performed by this executor -- the orchestrator handles credits via `creditMode`.

### Estimated Size

~80 lines for the executor class, plus ~10 lines for self-registration.

## Relationship to Section-13

Section-13 (media routing integration) will:
1. Ensure the orchestrator's capability classification maps `image_generation` skills to `media.image`.
2. Ensure the image executor module is imported so self-registration fires.
3. Add integration tests verifying end-to-end routing from both channels through the orchestrator to this executor.

This section (11) only builds and unit-tests the executor in isolation. It does not modify the orchestrator or registry initialization.

## Verification

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/imageExecutor.test.ts
```

All 11 tests listed above must pass. The executor must correctly wrap `mediaGenerationService.generateImage()` and translate between the unified executor interface and the existing media generation types.