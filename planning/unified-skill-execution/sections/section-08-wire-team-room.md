# Section 08 — Wire Team Room to Unified Orchestrator

## Overview

Modifies `apps/web/server/services/teamRunSkillExecutor.ts` to check the `unifiedSkillExecution` feature flag and delegate skill execution to the unified orchestrator when enabled. Existing code remains as fallback when flag is `false` or orchestrator fails.

**Depends on:** section-03 (feature flag), section-06 (orchestrator)
**Blocks:** section-10 (parity tests)

## File to Modify

**`apps/web/server/services/teamRunSkillExecutor.ts`** (~198 lines)

Modification at the **top** of `executeTeamRunSkillTurn()`, before existing `resolveTeamRunSkill()` call.

## Implementation Guidance

### 1. Add Imports

Static imports (matching file convention):

```typescript
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { executeUnified } from "./unifiedOrchestrator";
import type { UnifiedExecutionRequest } from "./executors/types";
```

### 2. Build UnifiedExecutionRequest

| Field | Source |
|-------|--------|
| `channel` | `"team_room"` |
| `userId` | `input.userId` |
| `tenantId` | `input.tenantId` |
| `userMessage` | `input.objective` |
| `teamContext.assistantId` | `input.assistantId` |
| `teamContext.roomId` | `input.roomId` |
| `teamContext.teamId` | `input.teamId` |
| `teamContext.runId` | `input.run.id` |
| `teamContext.objective` | `input.objective` |
| `routeHint.selectedSkillId` | `input.route.selectedSkillId` |
| `routeHint.route` | `input.route.route` |
| `routeHint.reason` | `input.route.reason` |
| `creditMode` | `"calculate_only"` |

### 3. Map Result Back

Map `UnifiedExecutionResult` to `TeamRunSkillExecutionResult`:

- `content`: from `result.result.content` (text type)
- `inputTokens`: from `result.tokens.input`
- `outputTokens`: from `result.tokens.output`
- `costCredits`: from `result.costCredits`
- `skillId`: from `result.skillId`
- `nextSpeakerHint`: from `result.nextSpeakerHint`
- `metadata`: include route info, attempts, `unifiedPath: true` marker

### 4. creditMode Justification

Team Room passes `"calculate_only"` because `runEngine.ts` handles credit deduction at run level, not per-turn. Matches existing behavior.

### 5. Fallback Pattern

```
let handledByUnified = false;
try {
  const flags = await getTenantFeatureFlags(input.tenantId);
  if (flags.unifiedSkillExecution) {
    const request: UnifiedExecutionRequest = { ... };
    const result = await executeUnified(request);
    handledByUnified = true;
    if (result.route.reason === "orchestrator_error") throw new Error("...");
    return { ... mapped result ... };
  }
} catch (err) {
  if (!handledByUnified) {
    console.error("[teamRunSkillExecutor] Unified failed, falling back:", err);
  } else {
    throw err;
  }
}
// ... existing code unchanged ...
```

### 6. Existing Code Unchanged

Lines 73-198 remain completely untouched. The unified path is purely additive.

## Key Differences from Section 07 (Chat Wiring)

| Aspect | Chat (section-07) | Team Room (this) |
|--------|-------------------|------------------|
| `creditMode` | `"deduct"` | `"calculate_only"` |
| `channel` | `"chat"` | `"team_room"` |
| Context | `conversationContext` | `teamContext` |
| Attachments | Yes (images) | Not supported |
| Import style | Dynamic `await import()` | Static imports |
| Persistence | Chat persists after result | Caller (`runEngine.ts`) handles |

## TDD Expectations

**File:** `apps/web/server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts`

```
# Test: flag=false — uses existing code, orchestrator NOT called
# Test: flag=true — delegates to orchestrator with correct request shape
# Test: flag=true — request.channel === "team_room", creditMode === "calculate_only"
# Test: flag=true — teamContext populated correctly from input
# Test: flag=true, orchestrator throws — falls back to existing path
# Test: flag=true — nextSpeakerHint forwarded from result
# Test: flag=true — orchestrator error result triggers fallback
```

## Caller Impact

`runEngine.ts` receives `TeamRunSkillExecutionResult` — same shape from both paths. No changes needed.

## Estimated Change Size

- ~40-50 lines added to `teamRunSkillExecutor.ts`
- ~180-220 lines for test file
- No existing lines modified or deleted

## Verification

```bash
cd apps/web && npx vitest run server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts
cd apps/web && npx vitest run server/services/__tests__/teamRunSkillExecutor.test.ts
cd apps/web && pnpm check
```
