Now I have all the context needed. Let me produce the section content.

# Section 13 -- Media Routing Integration

## Overview

This section is the final integration step for Phase 3 (Media Executor Adapters). It connects the media executors built in sections 11 and 12 to the orchestrator built in section 06 by:

1. Ensuring the orchestrator's `classifyCapability()` function correctly routes media skills to the appropriate capability family
2. Ensuring the executor registry has all media executors registered so `getExecutor()` returns the correct adapter
3. Adding an integration test that verifies end-to-end media routing from both chat and team_room channels

**Files modified:**
- `apps/web/server/services/unifiedOrchestrator.ts` (verify/update capability classification)
- `apps/web/server/services/executors/executorRegistry.ts` (verify media executor registration)

**Files created:**
- `apps/web/server/services/__tests__/mediaRoutingIntegration.test.ts`

**Estimated size:** ~20 lines of modifications, ~200 lines of integration tests

## Dependencies

| Section | What It Provides | How This Section Uses It |
|---------|-----------------|------------------------|
| section-01-types-and-contract | `CapabilityFamily`, `UnifiedExecutionRequest`, `UnifiedExecutionResult`, `ExecutorResult` types | All type signatures used in test assertions and orchestrator modifications |
| section-02-executor-registry | `registerExecutor()`, `getExecutor()`, `clearRegistry()`, `getAllExecutors()` | Verifies media executors are registered; uses registry lookup in integration tests |
| section-06-unified-orchestrator | `executeUnified()`, `classifyCapability()` | Tests call `executeUnified()` with media skill requests and verify correct routing; `classifyCapability()` may need updates for edge cases |
| section-11-image-executor | `ImageGenerationExecutor` (self-registers with registry) | Integration tests verify image skills route to this executor |
| section-12-video-audio-executors | `VideoGenerationExecutor`, `AudioGenerationExecutor` (self-register with registry) | Integration tests verify video/audio skills route to these executors |

## Blocked By

Sections 06, 11, and 12 must be fully implemented (or at least have their exports and self-registration working).

## Blocks

Nothing. This is the final section in the dependency graph.

---

## TDD Expectations

### Test File

`apps/web/server/services/__tests__/mediaRoutingIntegration.test.ts`

This is an **integration-level** test suite. Unlike unit tests in sections 09 and 10 that mock all dependencies, these tests import the real orchestrator, real registry, and real executor modules to verify the full routing chain works end-to-end (with only external services like database, LLM APIs, and credit service mocked).

### Test Cases

```
# --- Registry Verification ---
# Test: ImageGenerationExecutor is registered for media.image after module import
# Test: VideoGenerationExecutor is registered for media.video after module import
# Test: AudioGenerationExecutor is registered for media.audio after module import
# Test: getAllExecutors() includes all three media executors plus TextSkillExecutor

# --- Capability Classification for Media Skills ---
# Test: skill with category "image_generation" classifies as media.image
# Test: skill with category "video_generation" classifies as media.video
# Test: skill with category "audio_generation" classifies as media.audio
# Test: skill with capability_family "media.image" in executionPolicy overrides category
# Test: skill with category "prompt_enhancement" does NOT classify as media (stays writing.article)
# Test: ambiguous skill with both text tags and image category uses category (media.image wins)

# --- End-to-End Media Routing (Chat Channel) ---
# Test: chat request with image_generation skill routes to ImageGenerationExecutor
#   - Build a UnifiedExecutionRequest with channel "chat" and a routeHint pointing to an image skill
#   - Call executeUnified()
#   - Assert result.route.capability === "media.image"
#   - Assert result.route.executorId === ImageGenerationExecutor.id
#   - Assert result.result.type === "media_job" and result.result.mediaType === "image"

# Test: chat request with video_generation skill routes to VideoGenerationExecutor
#   - Same pattern with video skill
#   - Assert result.route.capability === "media.video"
#   - Assert result.result.type === "media_job" and result.result.mediaType === "video"

# Test: chat request with audio_generation skill routes to AudioGenerationExecutor
#   - Same pattern with audio skill
#   - Assert result.route.capability === "media.audio"
#   - Assert result.result.type === "media_job" and result.result.mediaType === "audio"

# --- End-to-End Media Routing (Team Room Channel) ---
# Test: team_room request with image_generation skill routes to ImageGenerationExecutor
#   - Build request with channel "team_room" and teamContext
#   - Assert same routing decision as chat channel

# Test: team_room request with video_generation skill routes to VideoGenerationExecutor
# Test: team_room request with audio_generation skill routes to AudioGenerationExecutor

# --- Cross-Channel Parity for Media ---
# Test: same image skill produces identical route decision from chat and team_room
# Test: same video skill produces identical route decision from chat and team_room
# Test: same audio skill produces identical route decision from chat and team_room

# --- Media Executor Failure Handling ---
# Test: image executor dispatch failure returns error result (does not throw)
# Test: media routing falls back gracefully when executor canHandle returns false
# Test: credit mode respected for media jobs (calculate_only returns cost without deduction)
```

### Test Setup Pattern

The integration test needs to:

1. Import real modules to trigger executor self-registration
2. Mock only external I/O services (database queries, Python backend calls, credit service)
3. Create realistic skill definitions matching each media category

```typescript
// Pseudo-structure for test file
import { describe, it, expect, beforeEach, vi } from "vitest";

// Import real orchestrator and registry (triggers executor registration)
import { executeUnified, classifyCapability } from "../unifiedOrchestrator";
import { getExecutor, getAllExecutors } from "../executors/executorRegistry";

// Import executor modules to ensure self-registration happens
import "../executors/imageExecutor";
import "../executors/videoExecutor";
import "../executors/audioExecutor";
import "../executors/textSkillExecutor";

// Import types
import type {
  UnifiedExecutionRequest,
  CapabilityFamily,
} from "../executors/types";

// Mock external services
vi.mock("../../db", () => ({ db: { query: vi.fn(), select: vi.fn() } }));
vi.mock("../creditService", () => ({
  deductCreditsForModel: vi.fn().mockResolvedValue({ creditsUsed: 2 }),
  calculateCreditsForLLMDynamic: vi.fn().mockResolvedValue(2),
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn().mockResolvedValue({
    modelId: "gpt-4o-mini",
    allowFreeModels: true,
    modelSource: "system_default",
  }),
}));
```

### Mock Skill Definitions

Create helper functions for building mock skills that match each media category:

```typescript
function makeImageSkill() {
  return {
    id: "test-image-skill",
    slug: "test-image-generator",
    name: "Test Image Generator",
    category: "image_generation",
    executionMode: "media-generate",
    executionPolicy: {},
    // ... minimal fields required by SkillDefinition
  };
}

function makeVideoSkill() {
  return {
    id: "test-video-skill",
    slug: "test-video-creator",
    name: "Test Video Creator",
    category: "video_generation",
    executionMode: "media-generate",
    executionPolicy: {},
  };
}

function makeAudioSkill() {
  return {
    id: "test-audio-skill",
    slug: "test-audio-composer",
    name: "Test Audio Composer",
    category: "audio_generation",
    executionMode: "media-generate",
    executionPolicy: {},
  };
}

function makeTextSkill() {
  return {
    id: "test-text-skill",
    slug: "general-article-writer",
    name: "General Article Writer",
    category: "prompt_enhancement",
    executionMode: "llm-only",
    executionPolicy: {},
  };
}
```

### Mock Request Builders

```typescript
function makeChatRequest(
  skillId: string,
  overrides?: Partial<UnifiedExecutionRequest>
): UnifiedExecutionRequest {
  return {
    channel: "chat",
    userId: 1,
    tenantId: "test-tenant",
    userMessage: "Generate something for me",
    routeHint: {
      selectedSkillId: skillId,
      route: "skill",
      reason: "user_selected",
    },
    creditMode: "calculate_only",
    ...overrides,
  };
}

function makeTeamRoomRequest(
  skillId: string,
  overrides?: Partial<UnifiedExecutionRequest>
): UnifiedExecutionRequest {
  return {
    channel: "team_room",
    userId: 1,
    tenantId: "test-tenant",
    userMessage: "Generate something for me",
    teamContext: {
      assistantId: "asst-1",
      roomId: "room-1",
      teamId: "team-1",
      objective: "Test objective",
    },
    routeHint: {
      selectedSkillId: skillId,
      route: "skill",
      reason: "user_selected",
    },
    creditMode: "calculate_only",
    ...overrides,
  };
}
```

---

## Implementation Guidance

### 1. Verify `classifyCapability()` in `unifiedOrchestrator.ts`

The `classifyCapability()` function was implemented in section-06. Verify that the media category mappings work correctly for all media skill categories. The classification rules (from section-06) should already handle:

- `skill.category === "image_generation"` maps to `"media.image"`
- `skill.category === "video_generation"` maps to `"media.video"`
- `skill.category === "audio_generation"` maps to `"media.audio"`
- `skill.executionPolicy?.capability_family` overrides category-based mapping

**If the skill category strings in the database use different casing or naming** (e.g., `"image-generation"` vs `"image_generation"`), normalize them. The existing `skillRepositories.ts` (line 69-82 in `apps/web/server/routers/skillRepositories.ts`) shows that both underscore and hyphen variants exist. The `classifyCapability()` function should handle both:

```typescript
// In classifyCapability(), normalize the category before matching
const normalizedCategory = skill.category?.toLowerCase().replace(/-/g, "_");
```

If this normalization is not already present from section-06, add it.

### 2. Verify Media Executor Registration in Registry

Each media executor (from sections 11 and 12) self-registers with the executor registry when its module is imported. The orchestrator module must import these executor modules to trigger registration.

**In `unifiedOrchestrator.ts`**, ensure these imports exist at the top of the file (side-effect imports for registration):

```typescript
// Import executor modules to trigger self-registration with the registry
import "./executors/textSkillExecutor";
import "./executors/imageExecutor";
import "./executors/videoExecutor";
import "./executors/audioExecutor";
```

If the orchestrator already imports `textSkillExecutor` from section-06 wiring, add the three media executor imports alongside it.

### 3. Orchestrator Step 10 (Delegate to Executor) -- Media Result Mapping

When the orchestrator delegates to a media executor (step 10 in section-06), the executor returns an `ExecutorResult` with the `mediaJob` field populated. The orchestrator's step 14 (return unified result) must correctly map this to the `UnifiedExecutionResult.result` discriminated union:

```typescript
// In step 14, when building the result:
if (executorResult.mediaJob) {
  result = {
    type: "media_job",
    mediaType: executorResult.mediaJob.mediaType,
    jobPayload: executorResult.mediaJob.jobPayload,
  };
} else if (executorResult.delegated) {
  result = {
    type: "delegated",
    target: executorResult.delegated.target,
    payload: executorResult.delegated.payload,
  };
} else {
  result = {
    type: "text",
    content: executorResult.content ?? "",
  };
}
```

If this mapping logic is not already present from section-06 (which focused on text execution), it must be added. Section-06 may have only mapped `{ type: "text", content }` since media executors did not exist yet.

### 4. Credit Handling for Media Jobs

Media executors return token counts of `{ inputTokens: 0, outputTokens: 0 }` since media generation is not token-based. Credit cost for media jobs should use a different calculation path. Verify that the orchestrator's step 11 handles this:

- When `executorResult.inputTokens === 0 && executorResult.outputTokens === 0` AND the result is a media job, the credit cost may be determined by the media type and model rather than by token count
- For Phase 3, it is acceptable to return `costCredits: 0` for media jobs and let the existing media pipeline handle its own credit deduction (since the adapters wrap existing code that already deducts credits)
- Add a note in `metadata` indicating `creditHandledByMediaPipeline: true` so the caller knows not to double-deduct

### 5. Chat.ts Integration for Media Results

When `chat.ts` (wired in section-07) receives a `UnifiedExecutionResult` with `result.type === "media_job"`, it must handle the job payload appropriately. The chat router should:

- Extract the `jobPayload` from the result
- Use the existing media job polling/status update logic already in `chat.ts`
- Return the media job information to the client for UI rendering

This does NOT require modifying `chat.ts` in this section -- section-07 already wires the orchestrator delegation. This section only needs to verify that the result shape is correct so section-07's mapping works.

### 6. Team Room Integration for Media Results

Similarly, when `teamRunSkillExecutor.ts` (wired in section-08) receives a media job result, it should:

- Map the `media_job` result to the `TeamRunSkillExecutionResult` format
- Store the media job reference in the team room message

Again, no modification to section-08 is needed here -- only verify the result shape.

---

## File Listing

| Action | File Path |
|--------|-----------|
| MODIFY | `apps/web/server/services/unifiedOrchestrator.ts` -- add media executor imports, verify/add media result mapping in step 14, add category normalization if missing |
| MODIFY | `apps/web/server/services/executors/executorRegistry.ts` -- no changes expected (verify only) |
| CREATE | `apps/web/server/services/__tests__/mediaRoutingIntegration.test.ts` |

---

## Verification

```bash
# Run the integration tests
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/mediaRoutingIntegration.test.ts

# Verify no regressions in orchestrator tests
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/unifiedOrchestrator.test.ts

# Verify no regressions in registry tests
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/executorRegistry.test.ts

# Verify no regressions in parity tests
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/channelParityTests.test.ts
```

All tests from sections 09 and 10 must continue to pass. The new integration tests must pass, confirming that media skills are correctly routed through the full orchestrator pipeline to the appropriate media executor adapters from both chat and team_room channels.