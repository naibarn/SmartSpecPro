<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-types-and-contract
section-02-executor-registry
section-03-feature-flag
section-04-context-builder
section-05-text-skill-executor
section-06-unified-orchestrator
section-07-wire-chat-router
section-08-wire-team-room
section-09-orchestrator-tests
section-10-parity-tests
section-11-image-executor
section-12-video-audio-executors
section-13-media-routing-integration
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-types-and-contract | - | 02, 04, 05, 06, 11, 12 | Yes |
| section-02-executor-registry | 01 | 06, 11, 12, 13 | Yes |
| section-03-feature-flag | - | 07, 08 | Yes |
| section-04-context-builder | 01 | 06 | Yes |
| section-05-text-skill-executor | 01 | 06 | Yes |
| section-06-unified-orchestrator | 01, 02, 04, 05 | 07, 08, 09, 10, 13 | No |
| section-07-wire-chat-router | 03, 06 | 10 | Yes |
| section-08-wire-team-room | 03, 06 | 10 | Yes |
| section-09-orchestrator-tests | 06 | - | Yes |
| section-10-parity-tests | 07, 08 | - | Yes |
| section-11-image-executor | 01, 02 | 13 | Yes |
| section-12-video-audio-executors | 01, 02 | 13 | Yes |
| section-13-media-routing-integration | 06, 11, 12 | - | No |

## Execution Order

1. **Batch 1** (no dependencies): section-01-types-and-contract, section-03-feature-flag
2. **Batch 2** (after 01): section-02-executor-registry, section-04-context-builder, section-05-text-skill-executor
3. **Batch 3** (after 01, 02, 04, 05): section-06-unified-orchestrator
4. **Batch 4** (after 03, 06): section-07-wire-chat-router, section-08-wire-team-room, section-09-orchestrator-tests, section-11-image-executor, section-12-video-audio-executors
5. **Batch 5** (after 07, 08, 06, 11, 12): section-10-parity-tests, section-13-media-routing-integration

## Section Summaries

### section-01-types-and-contract
Define all shared TypeScript types: `CapabilityFamily`, `UnifiedExecutionRequest`, `UnifiedExecutionResult`, `CapabilityExecutor` interface, `ExecutorInput`, `ExecutorResult`, `PersistenceHook`. File: `executors/types.ts`.

### section-02-executor-registry
Implement the hybrid executor registry with static base executors, dynamic extension via `registerExecutor()`, and capability-based lookup. File: `executors/executorRegistry.ts`.

### section-03-feature-flag
Add `unifiedSkillExecution` boolean flag to `TenantFeatureFlags` in `shared/featureFlags.ts` with default `false`. File: `shared/featureFlags.ts`.

### section-04-context-builder
Implement context enrichment functions: `buildChatContext()` (persona + memory), `buildTeamContext()` (wraps composePrompt), `buildDynamicModelRequirements()`, `buildPromptEnhancementContext()`, `injectWebSearchIfNeeded()`. File: `executors/contextBuilder.ts`.

### section-05-text-skill-executor
Implement `TextSkillExecutor` that wraps `executeSkillLlmWithFallback()` with model selection priority, thinking mode, next-speaker parsing. File: `executors/textSkillExecutor.ts`.

### section-06-unified-orchestrator
Implement the core orchestrator: skill resolution, capability classification, executor selection, context building delegation, policy resolution, planner integration, credit handling, persistence hooks, audit logging. File: `unifiedOrchestrator.ts`.

### section-07-wire-chat-router
Modify `chat.ts` to check `unifiedSkillExecution` flag and delegate to orchestrator with fallback to existing code on failure. File: `routers/chat.ts` (modify).

### section-08-wire-team-room
Modify `teamRunSkillExecutor.ts` to check `unifiedSkillExecution` flag and delegate to orchestrator with fallback. File: `services/teamRunSkillExecutor.ts` (modify).

### section-09-orchestrator-tests
Unit tests for the unified orchestrator, text skill executor, context builder, and executor registry. Files: `__tests__/unifiedOrchestrator.test.ts`, `__tests__/textSkillExecutor.test.ts`, `__tests__/contextBuilder.test.ts`, `__tests__/executorRegistry.test.ts`.

### section-10-parity-tests
Cross-channel parity test suite verifying routing, policy, credit, and failure parity between chat and team_room channels. File: `__tests__/channelParityTests.test.ts`.

### section-11-image-executor
Implement `ImageGenerationExecutor` adapter wrapping existing image generation pipeline. File: `executors/imageExecutor.ts` + `__tests__/imageExecutor.test.ts`.

### section-12-video-audio-executors
Implement `VideoGenerationExecutor` and `AudioGenerationExecutor` adapters wrapping existing pipelines. Files: `executors/videoExecutor.ts`, `executors/audioExecutor.ts` + tests.

### section-13-media-routing-integration
Update orchestrator capability classification to route media skills to media executors. Update registry to include media executors. Integration test verifying media routing from both channels. Modify: `unifiedOrchestrator.ts`, `executorRegistry.ts`. Add: integration test.
