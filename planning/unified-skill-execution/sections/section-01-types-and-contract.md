Now I have enough context to write the section. Here is the content:

# Section 01 — Types and Contract

## Goal

Define all shared TypeScript types for the Unified Skill Execution Pipeline in a single file: `apps/web/server/services/executors/types.ts`. This file has **no runtime logic** -- it contains only type definitions, interfaces, and a const enum for capability families. Every downstream section (02 through 13) imports from this file.

## Dependencies

- None (this is the root of the dependency graph).

## Blocks

- section-02 (executor registry)
- section-04 (context builder)
- section-05 (text skill executor)
- section-06 (unified orchestrator)
- section-11 (image executor)
- section-12 (video/audio executors)

## Target File

**Create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/executors/types.ts`

The `executors/` directory does not exist yet. It must be created under `apps/web/server/services/`.

## External Types Referenced

The new types file imports from these existing modules (do not modify them):

| Import | Source |
|--------|--------|
| `FallbackAttempt` | `../skillModelFallback.ts` (line 51) |
| `SkillDefinition` | `@smartspec/skills` (re-exported from `packages/skills/src/types.ts`) |

## TDD Plan

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/executorTypes.test.ts`

Since `types.ts` is pure type definitions with one runtime constant (`CAPABILITY_FAMILIES`), the test file is minimal but ensures the runtime export is correct and the module is importable without errors.

```
# Test: CAPABILITY_FAMILIES array contains all expected family strings
# Test: CAPABILITY_FAMILIES is frozen (Object.isFrozen)
# Test: module exports CapabilityFamily, UnifiedExecutionRequest, UnifiedExecutionResult types (compile-time; test confirms import does not throw)
# Test: DEFAULT_CREDIT_MODE equals "deduct"
```

Write the test file first. It should:
1. Import `CAPABILITY_FAMILIES` and `DEFAULT_CREDIT_MODE` from `../executors/types`.
2. Assert `CAPABILITY_FAMILIES` includes `"writing.article"`, `"writing.review"`, `"media.image"`, `"media.video"`, `"media.audio"`, `"orchestration.swarm"`, `"skill_factory.create"`.
3. Assert `Object.isFrozen(CAPABILITY_FAMILIES)` is `true`.
4. Assert `DEFAULT_CREDIT_MODE === "deduct"`.

## Type Definitions to Implement

Below is the contract each type must satisfy. Do not write full implementations; use interface/type declarations and brief JSDoc docstrings.

### 1. `CapabilityFamily` (string union)

```typescript
type CapabilityFamily =
  | "writing.article"
  | "writing.review"
  | "media.image"
  | "media.video"
  | "media.audio"
  | "orchestration.swarm"
  | "skill_factory.create";
```

Also export `CAPABILITY_FAMILIES` as a `readonly CapabilityFamily[]` runtime constant (frozen array) so downstream code can iterate over valid families without hardcoding strings.

### 2. `Attachment` (interface)

Represents an image or file attachment sent with the user message. Used for vision/multimodal support.

Fields:
- `type`: `"image" | "file"`
- `url`: `string` -- may be relative (`/uploads/...`) or absolute
- `mimeType?`: `string`
- `name?`: `string`

### 3. `ConversationContext` (interface)

Chat-channel-specific context provided by the caller.

Fields:
- `conversationId?`: `number`
- `conversationModel?`: `string`
- `activePersonaId?`: `string | null`
- `publicUrl?`: `string` -- base URL for resolving relative attachment paths

### 4. `TeamContext` (interface)

Team-room-channel-specific context provided by the caller.

Fields:
- `assistantId`: `string`
- `roomId`: `string`
- `teamId`: `string`
- `runId?`: `string`
- `objective`: `string`

### 5. `RouteHint` (interface)

Routing hint from `routeRoomIntent()` or chat skill detection.

Fields:
- `selectedSkillId?`: `string`
- `route`: `"chat" | "skill" | "agency"`
- `reason`: `string`
- `confidence?`: `number`

### 6. `CreditMode` (type)

```typescript
type CreditMode = "deduct" | "calculate_only" | "skip";
```

Export `DEFAULT_CREDIT_MODE: CreditMode = "deduct"` as a runtime constant.

### 7. `UnifiedExecutionRequest` (interface)

The single input type for the orchestrator. All fields documented with JSDoc.

Fields:
- `channel`: `"chat" | "team_room"`
- `userId`: `number`
- `tenantId`: `string`
- `userMessage`: `string`
- `attachments?`: `Attachment[]`
- `dynamicParams?`: `Record<string, unknown>`
- `conversationContext?`: `ConversationContext`
- `teamContext?`: `TeamContext`
- `routeHint?`: `RouteHint`
- `creditMode?`: `CreditMode` (defaults to `DEFAULT_CREDIT_MODE` at runtime, not in the type)
- `capabilitiesAllowed?`: `CapabilityFamily[]`
- `traceId?`: `string` -- for audit log correlation

### 8. `RouteDecision` (interface)

Describes how the orchestrator classified and routed the request.

Fields:
- `capability`: `CapabilityFamily`
- `executorId`: `string`
- `reason`: `string`

### 9. `UnifiedExecutionResult` (interface)

The single output type from the orchestrator.

Fields:
- `route`: `RouteDecision`
- `result`: `TextResult | MediaJobResult | DelegatedResult` (discriminated union on `type` field)
- `tokens`: `{ input: number; output: number }`
- `costCredits`: `number`
- `creditsDeducted?`: `number`
- `modelUsed`: `string | null`
- `skillId`: `string`
- `nextSpeakerHint?`: `string`
- `metadata`: `Record<string, unknown>`
- `telemetry`: `ExecutionTelemetry`

Where the result discriminated union members are:
- `TextResult`: `{ type: "text"; content: string }`
- `MediaJobResult`: `{ type: "media_job"; mediaType: "image" | "video" | "audio"; jobPayload: unknown }`
- `DelegatedResult`: `{ type: "delegated"; target: string; payload: unknown }`

### 10. `ExecutionTelemetry` (interface)

Fields:
- `routerVersion`: `string`
- `policyVersion`: `string`
- `executorId`: `string`
- `attempts`: `FallbackAttempt[]` (imported from `../skillModelFallback`)
- `totalDurationMs`: `number`

### 11. `ExecutorInput` (interface)

The subset of the unified request that is relevant to an executor's `execute()` method. Executors should not need to know about routing, credits, or persistence.

Fields:
- `messages`: `Array<{ role: string; content: string | unknown[] }>` -- prepared message array
- `executionPolicy`: `Record<string, unknown>` -- resolved policy from `resolveSkillExecutionPolicy()`
- `extraBodyParams?`: `Record<string, unknown>` -- web search tools, thinking params, etc.
- `enableThinking?`: `boolean`
- `dynamicModelOverride?`: `string` -- model ID from planner or dynamic requirements; executor uses this over executionPolicy.modelId
- `dynamicParams?`: `Record<string, unknown>`
- `skill`: `SkillDefinition` (imported from `@smartspec/skills`)
- `skillSlug`: `string` -- skill ID for audit logging
- `userId`: `number` -- requesting user ID
- `channel`: `"chat" | "team_room"`
- `traceId?`: `string`
- `stream?`: `boolean` -- whether to stream the response (default false)

### 12. `ExecutorResult` (interface)

What an executor returns to the orchestrator.

Fields:
- `success`: `boolean`
- `content?`: `string` -- for text results
- `mediaJob?`: `{ mediaType: "image" | "video" | "audio"; jobPayload: unknown }` -- for media results
- `delegated?`: `{ target: string; payload: unknown }` -- for delegation results
- `modelUsed?`: `string`
- `inputTokens`: `number`
- `outputTokens`: `number`
- `attempts`: `FallbackAttempt[]`
- `totalDurationMs`: `number`
- `error?`: `string`
- `nextSpeakerHint?`: `string`

### 13. `CapabilityExecutor` (interface)

The contract that all executors must implement.

Fields/methods:
- `id`: `string` -- unique identifier (e.g., `"text-skill"`, `"image-generation"`)
- `capabilities`: `readonly CapabilityFamily[]` -- which families this executor handles
- `canHandle(route: RouteDecision): boolean` -- fine-grained acceptance check
- `execute(input: ExecutorInput): Promise<ExecutorResult>` -- perform the execution

### 14. `PersistenceHook` (interface)

Hook for channel-specific message persistence after execution.

Fields/methods:
- `channel`: `"chat" | "team_room"`
- `onExecutionComplete(result: UnifiedExecutionResult, context: PersistenceContext): Promise<void>`

Where `PersistenceContext` is:
- `conversationId?`: `number`
- `roomId?`: `string`
- `runId?`: `string`

## Implementation Notes

1. The file should export every type and interface listed above, plus the two runtime constants (`CAPABILITY_FAMILIES`, `DEFAULT_CREDIT_MODE`).
2. Use `as const` with `Object.freeze()` for `CAPABILITY_FAMILIES` to get both the literal type and runtime immutability.
3. The discriminated union for `result` in `UnifiedExecutionResult` should use named type aliases (`TextResult`, `MediaJobResult`, `DelegatedResult`) that are also exported so downstream sections can narrow on them.
4. Keep imports minimal. Only two external imports are needed: `FallbackAttempt` from `../skillModelFallback` and `SkillDefinition` from `@smartspec/skills`.
5. Estimated size: ~120 lines.

## Verification

```bash
# Run the types test
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/executorTypes.test.ts

# Confirm the module compiles
cd /home/dev/projects/SmartSpecPro/apps/web && npx tsc --noEmit server/services/executors/types.ts
```