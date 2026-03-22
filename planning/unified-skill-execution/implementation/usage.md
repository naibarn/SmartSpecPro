# Unified Skill Execution — Usage Guide

## Overview

The Unified Skill Execution system provides a single `executeUnified()` entry point that routes skill execution through capability-based executors. It replaces the previous ad-hoc routing in `chat.ts` and `teamRunSkillExecutor.ts` with a structured pipeline.

## Architecture

```
Request (chat or team_room)
  → Skill Resolution (by ID or fallback)
  → Capability Classification (writing, media, orchestration)
  → Executor Selection (from registry)
  → Context Building (persona, memory, or team prompt)
  → Dynamic Model Requirements (vision, web search, thinking)
  → Execution Policy Resolution
  → Task Planner (optional model override)
  → Web Search Injection (provider-specific)
  → Executor Delegation
  → Credit Handling (deduct, calculate, or skip)
  → Persistence Hook (per-channel)
  → Unified Result
```

## Key Files

### Core
| File | Purpose |
|------|---------|
| `server/services/executors/types.ts` | All shared types (CapabilityFamily, ExecutorInput, ExecutorResult, etc.) |
| `server/services/executors/executorRegistry.ts` | Registry for capability-based executor lookup |
| `server/services/unifiedOrchestrator.ts` | Main orchestrator — `executeUnified()` entry point |

### Executors
| File | Capability | Wraps |
|------|-----------|-------|
| `server/services/executors/textSkillExecutor.ts` | writing.article, writing.review | `skillModelFallback.executeSkillLlmWithFallback()` |
| `server/services/executors/imageExecutor.ts` | media.image | `mediaGenerationService.generateImage()` |
| `server/services/executors/videoExecutor.ts` | media.video | `mediaGenerationService.generateVideoAsync()` |
| `server/services/executors/audioExecutor.ts` | media.audio | `mediaGenerationService.generateAudioAsync()` |

### Context Building
| File | Purpose |
|------|---------|
| `server/services/executors/contextBuilder.ts` | Builds chat/team context, dynamic model requirements, prompt enhancement, web search injection |

### Feature Flag
| File | Purpose |
|------|---------|
| `shared/featureFlags.ts` | `unifiedSkillExecution` boolean flag (default: false) |

### Channel Wiring
| File | Purpose |
|------|---------|
| `server/routers/chat.ts` | Checks feature flag, delegates to orchestrator for chat |
| `server/services/runEngine.ts` | Checks feature flag, delegates to orchestrator for team rooms |

## Usage

### Basic Call

```typescript
import { executeUnified } from "./services/unifiedOrchestrator";

const result = await executeUnified({
  channel: "chat",
  userId: 1,
  tenantId: "tenant-1",
  userMessage: "Write an article about AI",
  routeHint: {
    selectedSkillId: "general-article-writer",
    route: "skill",
    reason: "user_selected",
  },
});
```

### Result Handling

```typescript
if (result.result.type === "text") {
  // Text content from LLM
  console.log(result.result.content);
} else if (result.result.type === "media_job") {
  // Media generation job dispatched
  console.log(result.result.mediaType); // "image" | "video" | "audio"
  console.log(result.result.jobPayload); // Provider-specific job data
} else if (result.result.type === "delegated") {
  // Delegated to another system (e.g., agency swarm)
  console.log(result.result.target);
}
```

### Credit Modes

```typescript
// Deduct credits (default for chat)
{ creditMode: "deduct" }

// Calculate cost without deducting (default for team rooms)
{ creditMode: "calculate_only" }

// Skip credit handling entirely
{ creditMode: "skip" }
```

### Adding a New Executor

1. Create `server/services/executors/myExecutor.ts`
2. Implement `CapabilityExecutor` interface
3. Self-register: `registerExecutor(new MyExecutor())`
4. Import in `unifiedOrchestrator.ts` for side-effect registration
5. Add capability family to `types.ts` if new

## Test Suites

| File | Tests | Coverage |
|------|-------|----------|
| `executorRegistry.test.ts` | 11 | Registry CRUD, fallback, override |
| `contextBuilder.test.ts` | 34 | Chat/team context, dynamic reqs, web search |
| `textSkillExecutor.test.ts` | 18 | LLM call, model override, next-speaker parsing |
| `unifiedOrchestrator.test.ts` | 48 | Full orchestration flow, all credit modes |
| `channelParityTests.test.ts` | 15 | Cross-channel routing/policy/credit/failure parity |
| `imageExecutor.test.ts` | 14 | Image generation adapter |
| `videoExecutor.test.ts` | 11 | Video generation adapter |
| `audioExecutor.test.ts` | 10 | Audio generation adapter |
| `mediaRoutingIntegration.test.ts` | 18 | End-to-end media routing, registry verification |

**Total: 179 tests**

Run all: `cd apps/web && npx vitest run server/services/__tests__/{executorRegistry,contextBuilder,textSkillExecutor,unifiedOrchestrator,channelParityTests,imageExecutor,videoExecutor,audioExecutor,mediaRoutingIntegration}.test.ts`

## Feature Flag

The system is gated behind `unifiedSkillExecution` tenant feature flag (default: `false`). Enable per-tenant in admin settings to gradually roll out.

When the flag is off, the existing `chat.ts` and team room routing logic runs unchanged. When on, requests are delegated to `executeUnified()` with automatic fallback to the old path on error.
