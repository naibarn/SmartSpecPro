# Unified Skill Execution Pipeline — Complete Specification

## Problem Statement

SmartSpecPro currently has **two divergent skill execution pipelines** that handle the same fundamental task — executing LLM skills — through completely different code paths:

1. **Chat pipeline** (`apps/web/server/routers/chat.ts`, lines 1490-1821):
   - ~330 lines of inline skill execution logic
   - Has: multimodal/vision support, dynamic model requirements, artifact classification, credit deduction
   - Missing: persona context, entity memory, scoped memory, web search injection, conversation history

2. **Team Room pipeline** (`apps/web/server/services/teamRunSkillExecutor.ts`, ~200 lines):
   - Has: persona context via `composePrompt()`, entity memory, scoped memory, web search injection, conversation history, next-speaker hints
   - Missing: vision/multimodal support, dynamic model requirements, artifact classification
   - Credits: calculated only (not deducted — orchestrator handles)

This divergence causes:
- Feature drift (capabilities added to one pipeline but not the other)
- Bugs fixed in one place but not the other
- Duplicate test suites
- Behavioral inconsistencies between Chat and Team Room
- Difficult to explain "why does it work differently in different places"

## Solution Architecture

### Core Principle: "One Brain, Two Skins"

Create a **Unified Orchestrator** that owns ALL execution decisions. Both Chat and Team Room become thin channel shells that delegate to this single service.

```
chat.ts (thin shell) ──┐
                       ├──> Unified Orchestrator
team chat (thin shell) ┘
    │
    ├── Intent Parser
    ├── Policy Engine
    ├── Capability Router
    └── Executor Registry
        ├── TextSkillExecutor (LLM-based skills)
        ├── ImageGenerationExecutor (wraps existing media pipeline)
        ├── VideoGenerationExecutor (wraps existing pipeline)
        ├── AudioGenerationExecutor (wraps existing pipeline)
        ├── SwarmExecutor (agency/multi-agent)
        └── CreateSkillExecutor (skill factory)
```

### What Unified Owns (Centralized)

- Intent parsing and task profiling
- Capability routing (which executor handles this request)
- Policy engine (web search, thinking, vision, freshness)
- Media boundary detection
- Fallback rules and confidence thresholds
- Credit accounting (deduct by default, override for special cases)
- Execution contract (request/response types)
- Persona + memory + history context building

### What Channels Own (Per-Channel)

- Authentication and authorization
- Feature flags and entitlements
- Quotas and rate limits
- UI-specific rendering
- Message persistence (via hook/callback from unified)
- Observability tags (channel-specific labels)

### What Executors Own (Per-Capability)

- Modality-specific execution logic
- Provider-specific API calls
- Result formatting and post-processing

## Capability Families

```
writing.article       → TextSkillExecutor
writing.review        → TextSkillExecutor (with web search + thinking)
media.image           → ImageGenerationExecutor
media.video           → VideoGenerationExecutor
media.audio           → AudioGenerationExecutor
orchestration.swarm   → SwarmExecutor
skill_factory.create  → CreateSkillExecutor
```

## Unified Request/Response Contract

### Request

```typescript
interface UnifiedExecutionRequest {
  // Channel identity
  channel: "chat" | "team_room";
  userId: number;
  tenantId: string;

  // User input
  userMessage: string;
  attachments?: Attachment[];        // images, files
  dynamicParams?: Record<string, unknown>;

  // Context (optional, channel provides what it has)
  conversationContext?: {
    conversationId?: number;
    conversationModel?: string;
    activePersonaId?: string | null;
    publicUrl?: string;
  };
  teamContext?: {
    assistantId: string;
    roomId: string;
    teamId: string;
    runId?: string;
    objective: string;
  };

  // Routing hint (from roomIntentRouter or chat detection)
  routeHint?: {
    selectedSkillId?: string;
    route: "chat" | "skill" | "agency";
    reason: string;
    confidence?: number;
  };

  // Execution overrides
  creditMode?: "deduct" | "calculate_only" | "skip";  // default: "deduct"
  capabilitiesAllowed?: CapabilityFamily[];             // restrict what's available
}
```

### Response

```typescript
interface UnifiedExecutionResult {
  // Routing decision
  route: {
    capability: CapabilityFamily;
    executorId: string;
    reason: string;
  };

  // Execution result
  result:
    | { type: "text"; content: string }
    | { type: "media_job"; mediaType: "image" | "video" | "audio"; jobPayload: unknown }
    | { type: "delegated"; target: string; payload: unknown };

  // Token/cost accounting
  tokens: { input: number; output: number };
  costCredits: number;
  creditsDeducted?: number;
  modelUsed: string | null;

  // Metadata
  skillId: string;
  nextSpeakerHint?: string;
  metadata: Record<string, unknown>;

  // Telemetry
  telemetry: {
    routerVersion: string;
    policyVersion: string;
    executorId: string;
    attempts: FallbackAttempt[];
    totalDurationMs: number;
  };
}
```

## Executor Interface

```typescript
interface CapabilityExecutor {
  id: string;
  capabilities: CapabilityFamily[];
  canHandle(route: RouteDecision): boolean;
  execute(input: ExecutorInput): Promise<ExecutorResult>;
}
```

### Executor Registry: Hybrid Discovery

- **Static base**: Known executors registered at startup (text, image, video, audio, swarm, create-skill)
- **Dynamic extension**: Skills can declare capability families in `skill.md` frontmatter; executor matched at runtime via capability tag
- **Fallback**: Unknown capabilities fall back to TextSkillExecutor

## Context Building Strategy

### For Chat Channel (New Enrichments)

When `conversationContext.activePersonaId` is set:
1. Load persona profile (`buildPersonaPromptSegments()`)
2. Retrieve persona-scoped memory (`retrieveForPrompt()`)
3. Retrieve entity memory from conversation (`getEntityMemories()`)
4. Build unified message array with persona + memory + skill prompt

When no persona is set:
- Skill system prompt + user prompt only (current behavior)

### For Team Room Channel (Existing Behavior)

1. Full `composePrompt()` with adaptive token budgets
2. Persona + scoped memory + entity memory + conversation history
3. Skill system prompt prepended

### Dynamic Model Requirements (Both Channels)

Unified service builds dynamic requirements for ALL channels:
- `hasImages` → `supportsVision: true`
- `requires_web_search` → `supportsWebSearch: true`
- `requires_thinking` → `supportsThinking: true`
- Complex/review tasks → enhanced requirements
- Route reason includes "web_search" → `supportsWebSearch: true`

## Credit Handling

**Centralized in unified orchestrator:**
- Default: `deduct` — call `deductCreditsForModel()` immediately after execution
- Override `calculate_only` — call `calculateCreditsForLLMDynamic()` only, return amount
- Override `skip` — for internal/batch/dry-run flows
- Team Room passes `calculate_only` (orchestrator deducts at run level)
- Chat passes `deduct` (default)

## Message Persistence (Hook Pattern)

Unified emits a persistence event after execution:

```typescript
interface PersistenceHook {
  onExecutionComplete(result: UnifiedExecutionResult, context: ExecutionContext): Promise<void>;
}
```

- Chat registers: saves to `conversation_messages` table
- Team Room registers: saves to `team_room_messages` table
- Each channel handles its own format/schema

## Feature Flags

```typescript
// New flag in featureFlags.ts
unifiedSkillExecution: boolean;  // F25 — Unified orchestrator (replaces inline chat.ts logic)
```

- `false` (default): Both channels use their existing pipelines (no change)
- `true`: Both channels route through unified orchestrator
- Phased rollout: enable per-tenant for testing

## Scope (This Plan: Phase 1-3)

### Phase 1: Unified Capability Contract
- Define request/response types
- Define capability families and executor interface
- Create executor registry with hybrid discovery

### Phase 2: Text Skill Executor + Core Orchestrator
- Extract and unify LLM skill execution logic
- Build context enrichment (persona, memory for Chat)
- Build dynamic model requirements (shared)
- Build web search injection (shared)
- Centralize credit handling
- Wire persistence hooks
- Feature flag gating

### Phase 3: Media Executor Adapters
- Wrap existing image generation pipeline as `ImageGenerationExecutor`
- Wrap existing video generation pipeline as `VideoGenerationExecutor`
- Wrap existing audio generation pipeline as `AudioGenerationExecutor`
- Unified routing detects media skills and delegates to adapters
- Adapters call existing service code (no rewrite)

### Out of Scope (Future Phases 4-5)
- Full migration of chat.ts to thin shell
- Removing duplicate logic from callers
- SwarmExecutor implementation
- CreateSkillExecutor implementation

## Parity Testing Strategy

### Dedicated Routing Parity Suite
`channelParityTests.test.ts` — runs identical inputs through both channel paths and asserts:
- Same capability routing decision
- Same executor selection
- Same policy application (web search, thinking, vision)
- Same fallback behavior

### Per-Executor Tests
Each executor test file includes cases for both chat and team contexts:
- Text executor: persona context, memory injection, credit modes
- Image executor: same routing from both channels
- Failure handling: timeouts, unsupported types, moderation blocks

## Files Affected

### New Files
| File | Purpose |
|------|---------|
| `server/services/unifiedOrchestrator.ts` | Core orchestrator: routing, policy, execution |
| `server/services/executors/textSkillExecutor.ts` | LLM/text skill execution |
| `server/services/executors/imageExecutor.ts` | Image generation adapter |
| `server/services/executors/videoExecutor.ts` | Video generation adapter |
| `server/services/executors/audioExecutor.ts` | Audio generation adapter |
| `server/services/executors/executorRegistry.ts` | Hybrid executor discovery |
| `server/services/executors/types.ts` | Shared executor types |
| `server/services/__tests__/unifiedOrchestrator.test.ts` | Orchestrator unit tests |
| `server/services/__tests__/textSkillExecutor.test.ts` | Text executor tests |
| `server/services/__tests__/channelParityTests.test.ts` | Cross-channel parity |

### Modified Files
| File | Change |
|------|--------|
| `server/routers/chat.ts` | Add feature flag check → delegate to unified |
| `server/services/teamRunSkillExecutor.ts` | Add feature flag check → delegate to unified |
| `shared/featureFlags.ts` | Add `unifiedSkillExecution` flag |

### Unchanged (Used By Unified)
- `executeSkillLlmWithFallback()` — reused by TextSkillExecutor
- `resolveSkillExecutionPolicy()` — reused
- `composePrompt()` — reused for team context
- `buildWebSearchParams()` — reused
- `deductCreditsForModel()` / `calculateCreditsForLLMDynamic()` — reused
- `runPlanner()` / `recordStepAttempt()` — reused
- `routeRoomIntent()` — reused (routing input)

## Verification

```bash
# New tests
npx vitest run server/services/__tests__/unifiedOrchestrator.test.ts
npx vitest run server/services/__tests__/textSkillExecutor.test.ts
npx vitest run server/services/__tests__/channelParityTests.test.ts

# Regression (existing tests must pass)
npx vitest run server/services/__tests__/teamRunSkillExecutor.test.ts
npx vitest run server/services/__tests__/promptComposer.test.ts
npx vitest run server/services/__tests__/skillModelFallback.test.ts

# Manual verification
# flag=false → everything unchanged
# flag=true → Chat gets persona + memory + web search, Team Room gets vision + dynamic requirements
```
