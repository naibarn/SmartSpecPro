I now have all the context needed. Let me write the section.

# Section 12 -- Video and Audio Generation Executors

## Goal

Implement `VideoGenerationExecutor` and `AudioGenerationExecutor` as adapter executors that wrap the existing media generation pipelines. Each executor implements the `CapabilityExecutor` interface from section-01, registers itself with the executor registry from section-02, and translates between the unified execution contract and the existing `mediaGenerationService` API.

These executors follow the same adapter pattern as the `ImageGenerationExecutor` (section-11). They do not rewrite or modify any existing media pipeline code. They adapt the `ExecutorInput` from the orchestrator into the request types that `mediaGenerationService` already accepts, and map the response back to `ExecutorResult`.

## Dependencies

| Section | What It Provides |
|---------|-----------------|
| section-01-types-and-contract | `CapabilityExecutor`, `CapabilityFamily`, `ExecutorInput`, `ExecutorResult`, `RouteDecision`, `MediaJobResult` types from `apps/web/server/services/executors/types.ts` |
| section-02-executor-registry | `registerExecutor` from `apps/web/server/services/executors/executorRegistry.ts` |

## Blocks

- **section-13-media-routing-integration**: Needs both executors registered so the orchestrator can route media skills to them.

## Files

| File | Action | Estimated Lines |
|------|--------|-----------------|
| `apps/web/server/services/executors/videoExecutor.ts` | Create | ~90 |
| `apps/web/server/services/executors/audioExecutor.ts` | Create | ~85 |
| `apps/web/server/services/__tests__/videoExecutor.test.ts` | Create | ~110 |
| `apps/web/server/services/__tests__/audioExecutor.test.ts` | Create | ~100 |

All paths are under `/home/dev/projects/SmartSpecPro/`.

## Existing Pipeline Reference

Both executors wrap the singleton `mediaGenerationService` exported from `apps/web/server/services/mediaGenerationService.ts`. The key methods and types are:

**Video generation:**
- `mediaGenerationService.generateVideoAsync(request: VideoGenerationRequest, userToken: string): Promise<MediaTask>` -- async dispatch, returns a task with `id`, `taskId`, `status`, `model`, etc.
- `VideoGenerationRequest` fields: `prompt`, `model?`, `duration?`, `aspectRatio?`, `fps?`, `resolution?`, `apiConfig?`, `extraParams?`, `publicUrl?`, `referenceImageUrls?`, `referenceVideoUrl?`, `auditContext?`

**Audio generation:**
- `mediaGenerationService.generateAudioAsync(request: AudioGenerationRequest, userToken: string): Promise<MediaTask>` -- async dispatch for audio.
- `AudioGenerationRequest` fields: `text`, `model?`, `voice?`, `speed?`, `apiConfig?`, `extraParams?`, `publicUrl?`, `auditContext?`

**Shared response:**
- `MediaTask` fields: `id`, `taskId?`, `celeryTaskId?`, `userId`, `mediaType`, `status`, `model`, `prompt`, `parameters?`, `resultUrl?`, `creditsUsed?`, `createdAt`, etc.

**Default models:**
- `DEFAULT_MODELS.video` -- default video model ID (e.g., `"veo-3-1"`)
- `DEFAULT_MODELS.audio` -- default audio model ID

Both executors call the async variant (`generateVideoAsync`/`generateAudioAsync`) because media generation is inherently async (task-based polling). The orchestrator's channel shell handles polling and status updates.

## Tests First

### Video Executor Tests

**File:** `apps/web/server/services/__tests__/videoExecutor.test.ts`

All tests use Vitest. The `mediaGenerationService` is mocked via `vi.mock()`.

```
Test: canHandle returns true for media.video capability
  - Create a VideoGenerationExecutor instance.
  - Call canHandle with a RouteDecision where capability is "media.video".
  - Assert returns true.

Test: canHandle returns false for non-video capabilities
  - Call canHandle with capability "media.image".
  - Assert returns false.
  - Call canHandle with capability "writing.article".
  - Assert returns false.

Test: executor id is "video-generation"
  - Assert executor.id equals "video-generation".

Test: executor capabilities include only media.video
  - Assert executor.capabilities deep equals ["media.video"].

Test: extracts video params from dynamicParams and builds VideoGenerationRequest
  - Provide ExecutorInput with dynamicParams containing: model, duration, aspectRatio, fps, resolution, referenceImageUrls, referenceVideoUrl.
  - Mock mediaGenerationService.generateVideoAsync to resolve with a MediaTask stub.
  - Call execute().
  - Assert generateVideoAsync was called with a request containing the extracted params.

Test: uses prompt from first user message in messages array
  - Provide ExecutorInput with messages: [{ role: "system", content: "..." }, { role: "user", content: "Generate a video of a sunset" }].
  - Call execute().
  - Assert the prompt passed to generateVideoAsync is "Generate a video of a sunset".

Test: returns media_job result with mediaType "video" on success
  - Mock generateVideoAsync to resolve with a MediaTask stub { id: "task-123", model: "veo-3-1", status: "pending" }.
  - Call execute().
  - Assert result.success is true.
  - Assert result.mediaJob.mediaType is "video".
  - Assert result.mediaJob.jobPayload contains the task data.

Test: handles dispatch failure gracefully (returns error result, does not throw)
  - Mock generateVideoAsync to reject with Error("Provider unavailable").
  - Call execute().
  - Assert result.success is false.
  - Assert result.error contains "Provider unavailable".
  - Assert result.mediaJob is undefined.

Test: passes publicUrl from conversationContext through dynamicParams
  - Provide ExecutorInput with dynamicParams containing publicUrl.
  - Call execute().
  - Assert generateVideoAsync receives request.publicUrl matching the provided value.

Test: passes auditContext with traceId when present in input
  - Provide ExecutorInput with traceId: "trace-abc".
  - Call execute().
  - Assert generateVideoAsync receives request.auditContext.traceId equals "trace-abc".
```

### Audio Executor Tests

**File:** `apps/web/server/services/__tests__/audioExecutor.test.ts`

```
Test: canHandle returns true for media.audio capability
  - Call canHandle with capability "media.audio".
  - Assert returns true.

Test: canHandle returns false for non-audio capabilities
  - Call canHandle with capability "media.video".
  - Assert returns false.

Test: executor id is "audio-generation"
  - Assert executor.id equals "audio-generation".

Test: executor capabilities include only media.audio
  - Assert executor.capabilities deep equals ["media.audio"].

Test: extracts audio params from dynamicParams and builds AudioGenerationRequest
  - Provide ExecutorInput with dynamicParams containing: model, voice, speed, text.
  - Mock mediaGenerationService.generateAudioAsync to resolve with a MediaTask stub.
  - Call execute().
  - Assert generateAudioAsync was called with matching params.

Test: uses text/prompt from first user message when dynamicParams.text is absent
  - Provide ExecutorInput with messages containing a user message "Read this aloud".
  - Do not include dynamicParams.text.
  - Call execute().
  - Assert the text passed to generateAudioAsync is "Read this aloud".

Test: prefers dynamicParams.text over user message for audio input
  - Provide ExecutorInput with dynamicParams.text = "Custom text" and messages with user content "Different text".
  - Call execute().
  - Assert text passed to generateAudioAsync is "Custom text".

Test: returns media_job result with mediaType "audio" on success
  - Mock generateAudioAsync to resolve with a MediaTask stub.
  - Call execute().
  - Assert result.success is true.
  - Assert result.mediaJob.mediaType is "audio".

Test: handles dispatch failure gracefully
  - Mock generateAudioAsync to reject with Error("TTS service down").
  - Call execute().
  - Assert result.success is false.
  - Assert result.error contains "TTS service down".

Test: passes auditContext with traceId
  - Provide ExecutorInput with traceId: "trace-xyz".
  - Call execute().
  - Assert generateAudioAsync receives request.auditContext.traceId equals "trace-xyz".
```

### Test Setup Pattern

Both test files follow the same mocking pattern:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecutorInput, RouteDecision } from "../executors/types";

// Mock the media generation service
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateVideoAsync: vi.fn(), // or generateAudioAsync
  },
  DEFAULT_MODELS: { video: "veo-3-1", audio: "openai-tts-1" },
}));

// Import after mock
import { mediaGenerationService } from "../mediaGenerationService";
```

Create a helper `createMinimalExecutorInput(overrides)` that returns a valid `ExecutorInput` with sensible defaults (empty messages, empty policy, stub skill object) so each test only specifies the fields it cares about.

## Implementation Guidance

### VideoGenerationExecutor

**File:** `apps/web/server/services/executors/videoExecutor.ts`

#### Exports

```typescript
export class VideoGenerationExecutor implements CapabilityExecutor {
  readonly id = "video-generation";
  readonly capabilities: readonly CapabilityFamily[] = ["media.video"];

  canHandle(route: RouteDecision): boolean;
  execute(input: ExecutorInput): Promise<ExecutorResult>;
}
```

#### Imports

```typescript
import type { CapabilityExecutor, CapabilityFamily, ExecutorInput, ExecutorResult, RouteDecision } from "./types";
import { registerExecutor } from "./executorRegistry";
import { mediaGenerationService, DEFAULT_MODELS } from "../mediaGenerationService";
import type { VideoGenerationRequest } from "../mediaGenerationService";
```

#### `canHandle` Logic

Return `true` when `route.capability === "media.video"`.

#### `execute` Logic

1. **Extract prompt**: Find the last message with `role === "user"` in `input.messages`. Use its text content as the prompt. Fall back to `input.dynamicParams?.prompt` or empty string.

2. **Build VideoGenerationRequest** from `input.dynamicParams`:
   - `prompt`: extracted above
   - `model`: `input.dynamicParams?.model` or `DEFAULT_MODELS.video`
   - `duration`: `input.dynamicParams?.duration` (number)
   - `aspectRatio`: `input.dynamicParams?.aspectRatio` (string)
   - `fps`: `input.dynamicParams?.fps` (number)
   - `resolution`: `input.dynamicParams?.resolution` (string)
   - `referenceImageUrls`: `input.dynamicParams?.referenceImageUrls` (string[])
   - `referenceVideoUrl`: `input.dynamicParams?.referenceVideoUrl` (string)
   - `publicUrl`: `input.dynamicParams?.publicUrl` (string)
   - `apiConfig`: `input.dynamicParams?.apiConfig` (Record<string, string>)
   - `extraParams`: `input.dynamicParams?.extraParams` (Record<string, any>)
   - `auditContext`: `{ traceId: input.traceId, source: "unified-orchestrator", stage: "video-executor" }`

3. **Generate user token**: The executor needs a user token for the Python backend call. Accept it from `input.dynamicParams?.userToken` (the channel shell is responsible for providing it).

4. **Call** `mediaGenerationService.generateVideoAsync(request, userToken)`.

5. **Map result to ExecutorResult**:
   - On success: `{ success: true, mediaJob: { mediaType: "video", jobPayload: task }, modelUsed: task.model, inputTokens: 0, outputTokens: 0, attempts: [], totalDurationMs: elapsed }`
   - On failure: `{ success: false, error: err.message, inputTokens: 0, outputTokens: 0, attempts: [], totalDurationMs: elapsed }`

6. Media executors always return `inputTokens: 0` and `outputTokens: 0` because media generation does not consume LLM tokens. Credit handling for media is done separately by the orchestrator using the model's credit cost.

#### Self-Registration

At module scope (after class definition):

```typescript
const videoExecutor = new VideoGenerationExecutor();
registerExecutor(videoExecutor);
export { videoExecutor };
```

This registers the executor as soon as the module is imported.

### AudioGenerationExecutor

**File:** `apps/web/server/services/executors/audioExecutor.ts`

#### Exports

```typescript
export class AudioGenerationExecutor implements CapabilityExecutor {
  readonly id = "audio-generation";
  readonly capabilities: readonly CapabilityFamily[] = ["media.audio"];

  canHandle(route: RouteDecision): boolean;
  execute(input: ExecutorInput): Promise<ExecutorResult>;
}
```

#### Imports

```typescript
import type { CapabilityExecutor, CapabilityFamily, ExecutorInput, ExecutorResult, RouteDecision } from "./types";
import { registerExecutor } from "./executorRegistry";
import { mediaGenerationService, DEFAULT_MODELS } from "../mediaGenerationService";
import type { AudioGenerationRequest } from "../mediaGenerationService";
```

#### `canHandle` Logic

Return `true` when `route.capability === "media.audio"`.

#### `execute` Logic

1. **Extract text**: Audio generation uses text input, not a prompt. Check `input.dynamicParams?.text` first (preferred for TTS skills). If absent, fall back to the last user message content from `input.messages`.

2. **Build AudioGenerationRequest** from `input.dynamicParams`:
   - `text`: extracted above
   - `model`: `input.dynamicParams?.model` or `DEFAULT_MODELS.audio`
   - `voice`: `input.dynamicParams?.voice` (string)
   - `speed`: `input.dynamicParams?.speed` (number)
   - `apiConfig`: `input.dynamicParams?.apiConfig` (Record<string, string>)
   - `extraParams`: `input.dynamicParams?.extraParams` (Record<string, any>)
   - `publicUrl`: `input.dynamicParams?.publicUrl` (string)
   - `auditContext`: `{ traceId: input.traceId, source: "unified-orchestrator", stage: "audio-executor" }`

3. **User token**: Same pattern as video -- accept from `input.dynamicParams?.userToken`.

4. **Call** `mediaGenerationService.generateAudioAsync(request, userToken)`.

5. **Map result to ExecutorResult**: Same pattern as video executor but with `mediaType: "audio"`.

#### Self-Registration

```typescript
const audioExecutor = new AudioGenerationExecutor();
registerExecutor(audioExecutor);
export { audioExecutor };
```

### Shared Helpers

Both executors share the same logic for extracting the user message from the messages array and building the audit context. If the duplication is bothersome, extract a small utility:

```typescript
// Can live at the top of each file or in a shared mediaExecutorUtils.ts
function extractUserPrompt(messages: ExecutorInput["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const content = messages[i].content;
      return typeof content === "string" ? content : "";
    }
  }
  return "";
}
```

This is small enough that duplicating it in both files is acceptable. Do not create a separate utils module unless the pattern is used by three or more executors (which it will be once image executor exists from section-11, so at that point a shared extraction is justified).

## Key Design Decisions

1. **Async-only dispatch**: Both executors call the `*Async` variant (`generateVideoAsync`, `generateAudioAsync`) because media generation is task-based. The sync variants (`generateVideo`, `generateAudio`) wait for completion, which blocks the Node.js event loop. The orchestrator returns a `media_job` result and the channel shell handles status polling.

2. **No credit handling**: Media executors do not deduct or calculate credits. The orchestrator handles credit accounting based on the model's `creditCost` from the media model registry. Executors return `inputTokens: 0, outputTokens: 0`.

3. **User token passthrough**: The Python backend requires an auth token. The channel shell (chat.ts or teamRunSkillExecutor) must inject `userToken` into `dynamicParams` before calling the orchestrator. This is not ideal (executors should not need auth details) but is necessary to maintain compatibility with the existing pipeline without refactoring it.

4. **Error containment**: Executors catch all errors from the media service and return them as `{ success: false, error }` results. They never throw. The orchestrator decides how to handle the error (log, retry, or surface to user).

5. **No retry logic in executors**: The existing `mediaGenerationService` has its own retry logic (`submitTaskWithRetry`). Executors do not add another retry layer.

## Verification

```bash
# Run video executor tests
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/videoExecutor.test.ts

# Run audio executor tests
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/audioExecutor.test.ts

# Run both together
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/videoExecutor.test.ts server/services/__tests__/audioExecutor.test.ts
```

All tests listed in the TDD section above must pass. The executors must compile cleanly against the types from section-01 and register successfully with the registry from section-02.