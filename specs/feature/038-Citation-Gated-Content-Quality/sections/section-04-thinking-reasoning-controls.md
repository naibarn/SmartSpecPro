# Section 04 — Provider-Specific Thinking/Reasoning Controls

## Objective

Map task complexity and skill `thinking_level_hint` to provider-specific thinking/reasoning parameters (Gemini `thinking_level`, OpenAI `reasoning.effort`, Claude adaptive thinking, Kimi instant/thinking mode) to reduce cost for simple tasks and increase depth for complex ones.

## Scope

1. Create thinking level mapping configuration
2. Integrate with taskExecutionPlanner to include thinking level in execution plan
3. Pass provider-specific params in llmRoutes and responsesRoutes
4. Allow skill-level override via `thinking_level_hint`

## Primary files

- `apps/web/server/services/thinkingLevelMapper.ts` — NEW: maps complexity → provider params
- `apps/web/server/services/taskExecutionPlanner.ts` — include thinking level in plan
- `apps/web/server/_core/llmRoutes.ts` — pass params to chat completions
- `apps/web/server/_core/responsesRoutes.ts` — pass params to Responses API

## Thinking level mapping

```typescript
export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
export type ProviderFamily = "openai" | "gemini" | "anthropic" | "kimi" | "other";

export interface ProviderThinkingParams {
  openai?: { reasoning?: { effort: string }; };
  gemini?: { thinking_level?: string; };
  anthropic?: { thinking?: { type: string; budget_tokens?: number }; };
  kimi?: { mode?: string; };
}

export function mapThinkingLevel(
  level: ThinkingLevel,
  provider: ProviderFamily
): Record<string, unknown>;

export function resolveThinkingLevel(
  skillHint?: ThinkingLevel,
  taskComplexity?: TaskComplexity
): ThinkingLevel;
```

### Mapping table

| ThinkingLevel | Gemini | OpenAI | Claude | Kimi |
|---------------|--------|--------|--------|------|
| minimal | `thinking_level: "minimal"` | `reasoning: { effort: "low" }` | `thinking: { type: "adaptive", budget_tokens: 512 }` | (no param = instant) |
| low | `thinking_level: "low"` | `reasoning: { effort: "low" }` | `thinking: { type: "adaptive", budget_tokens: 1024 }` | (no param = instant) |
| medium | `thinking_level: "medium"` | `reasoning: { effort: "medium" }` | `thinking: { type: "adaptive", budget_tokens: 4096 }` | (no param = default) |
| high | `thinking_level: "high"` | `reasoning: { effort: "high" }` | `thinking: { type: "adaptive", budget_tokens: 16384 }` | (no param = default) |

### Resolution priority

1. `skill.execution_policy.thinking_level_hint` (explicit skill override)
2. `taskExecutionPlan.complexity` mapped to thinking level (auto-inferred)
3. Default: "medium"

## Integration points

### taskExecutionPlanner.ts

Add `thinkingLevel` to `TaskExecutionPlan`:
```typescript
readonly thinkingLevel?: ThinkingLevel;
```

Set from `executionPolicy.thinking_level_hint` or inferred from complexity.

### llmRoutes.ts

Before sending to provider, merge thinking params:
```typescript
const thinkingParams = mapThinkingLevel(plan.thinkingLevel, detectedProvider);
// Merge into request body
```

Only apply to models that support thinking (check `isThinkingModel` or capability flag).

### responsesRoutes.ts

Same approach — merge params into Responses API request before forwarding.

## Acceptance criteria

1. `mapThinkingLevel("minimal", "openai")` returns `{ reasoning: { effort: "low" } }`
2. `mapThinkingLevel("high", "gemini")` returns `{ thinking_level: "high" }`
3. `resolveThinkingLevel("low", "complex")` returns `"low"` (skill hint wins)
4. `resolveThinkingLevel(undefined, "simple")` returns `"low"` (complexity mapped)
5. Unknown provider returns empty object (no thinking params)
6. Thinking params are only applied to models that support them
7. All existing tests pass (no breaking changes to default behavior)

## Test file

`apps/web/server/services/thinkingLevelMapper.test.ts`

Test cases:
- Map all 4 levels × 4 providers → correct params
- resolveThinkingLevel with skill hint overriding complexity
- resolveThinkingLevel without hint → complexity-based
- Unknown provider → empty params
- Integration: plan with thinkingLevel flows to provider params
