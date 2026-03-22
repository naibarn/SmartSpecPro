# Spec 039: Section 01 - Existing File Signatures & Integration Points

## Executive Summary

Research completed 2026-03-11. All required files exist and signatures documented. Key finding: **taskRuns table has NO traceId column yet** — this must be added as part of implementation.

---

## File Existence Check

| File | Status | Notes |
|------|--------|-------|
| taskExecutionPlanner.ts | ✅ Exists | Complete, well-documented |
| modelResolver.ts | ✅ Exists | Complete, well-documented |
| taskRunStore.ts | ✅ Exists | Complete, database write layer |
| capabilityRegistry.ts | ✅ Exists | Complete, capability filtering |
| featureFlags.ts | ✅ Exists | Complete, Redis-backed flags |
| traceContext.ts | ✅ Exists | Complete, AsyncLocalStorage implementation |
| llmRoutesHandler.ts | ✅ Exists | Complete, thin HTTP handlers |
| llmRoutes.ts | ✅ Exists | Complete, Express routing + OpenAI gateway |
| channelGateway.ts | ✅ Exists | Complete, message bus for channels |
| enabledLlmModels.ts | ✅ Exists | Complete, model resolution helpers |
| memoryService.ts | ✅ Exists | Complete, memory system |
| translation.ts | ✅ Exists | Complete (as /routers/translation.ts) |
| scheduler.ts | ✅ Exists | Complete, scheduled message delivery |
| schema.ts (taskRuns) | ✅ Exists | **Missing traceId column** |

---

## Key Function Signatures

### 1. taskExecutionPlanner.ts

**Location**: `apps/web/server/services/taskExecutionPlanner.ts`

```typescript
// Lines 127-167
export function buildExecutionPlan(input: TaskClassificationInput): TaskExecutionPlan
```

**Parameters**:
```typescript
interface TaskClassificationInput {
  sourceType: string;
  skillSlug?: string;
  userId?: number;
  tenantId?: string;
  conversationModel?: string;
  hasTools?: boolean;
  hasMultipleSteps?: boolean;
  executionPolicy?: SkillExecutionPolicyConfig;
}
```

**Return Type**:
```typescript
interface TaskExecutionPlan {
  readonly version: 1;
  readonly taskType: TaskType;  // "chat" | "skill" | "media" | "responses" | "agency"
  readonly complexity: TaskComplexity;  // "simple" | "moderate" | "complex"
  readonly requirements: Readonly<CapabilityRequirements>;
  readonly strategy: ExecutionStrategy;  // "cheapest" | "fastest" | "best"
  readonly budgetClass?: BudgetClass;
  readonly thinkingLevel?: ThinkingLevel;
  readonly disallowedModels?: readonly string[];
  readonly context?: Readonly<{
    skillSlug?: string;
    conversationModel?: string;
    sourceType?: string;
  }>;
  readonly createdAt: string;  // ISO string
}
```

**Notes**:
- Frozen with `Object.freeze()` — immutable after creation
- Current plan version: `CURRENT_PLAN_VERSION = 1`
- Plan is stored as JSON in `taskRuns.planJson`

### 2. modelResolver.ts

**Location**: `apps/web/server/services/modelResolver.ts`

```typescript
// Lines 42-84
export function resolveModelFromPlan(
  plan: TaskExecutionPlan,
  models: ModelWithPricing[]
): ModelWithPricing | null
```

**Parameters**:
- `plan`: The immutable execution plan
- `models`: Array of enabled models with pricing

**Return**: The best model matching the plan's requirements, or null

**Ranking Strategy**:
- `"cheapest"`: Free models first, then by total cost (input + output)
- `"fastest"`: Preserve input order (pre-sorted by provider priority)
- `"best"`: Reverse cost order (most expensive = highest quality proxy)

```typescript
// Lines 93-112
export function buildModelResolutionSnapshot(
  model: ModelWithPricing,
  attemptIndex: number,
  fallbackReason?: string
): ModelResolutionSnapshot
```

**Return Type**:
```typescript
interface ModelResolutionSnapshot {
  modelId: string;
  providerModelId: string;
  providerName: string;
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
  attemptIndex: number;
  fallbackReason?: string;
  resolvedAt: string;  // ISO string
}
```

### 3. taskRunStore.ts

**Location**: `apps/web/server/services/taskRunStore.ts`

```typescript
// Lines 33-54
export async function createTaskRun(input: CreateTaskRunInput): Promise<{ id: number }>
```

**Parameters**:
```typescript
interface CreateTaskRunInput {
  userId: number;
  tenantId?: string;
  plan: TaskExecutionPlan;
  sourceType: string;
  skillSlug?: string;
  conversationId?: number;
  artifactIntent?: ArtifactIntent;
  executionRoute?: ExecutionRoute;
  routeReason?: string;
}
```

**Returns**: `{ id: number }` — the created taskRunId

**Note**: Does NOT currently accept traceId — will need to add.

```typescript
// Lines 89-108
export async function createStepAttempt(input: CreateStepAttemptInput): Promise<{ id: number }>
```

**Parameters**:
```typescript
interface CreateStepAttemptInput {
  taskRunId: number;
  attemptIndex: number;
  snapshot: ModelResolutionSnapshot;
  strategy: string;
}
```

**Returns**: `{ id: number }` — the created stepAttemptId

```typescript
// Lines 123-158
export async function completeStepAttempt(input: CompleteStepAttemptInput): Promise<void>
```

**Parameters**:
```typescript
interface CompleteStepAttemptInput {
  stepAttemptId: number;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  costUsd: string;
  durationMs: number;
  status: "completed" | "failed";
  errorMessage?: string;
}
```

**Side Effects**: Accumulates credits on parent taskRun

### 4. capabilityRegistry.ts

**Location**: `apps/web/server/services/capabilityRegistry.ts`

```typescript
// Lines 67-105
export async function loadEnabledModelsWithCapabilities(): Promise<EnabledModelWithCapabilities[]>
```

**Returns**: Array of models with their capability metadata from `modelProviderMap` + `llmProviders`

**Capabilities**:
```typescript
interface ModelCapabilities {
  supportsResponses?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  contextLength?: number;
}
```

**Database Columns Used**:
- `modelProviderMap.contextLength`
- `modelProviderMap.supportsResponses`
- `modelProviderMap.supportsStructuredOutputs`
- `modelProviderMap.supportsWebSearch`
- `modelProviderMap.supportsFunctionTools`
- `modelProviderMap.supportsCodeExecution`
- `modelProviderMap.supportsComputerUse`
- `modelProviderMap.supportsBackground`

### 5. featureFlags.ts

**Location**: `apps/web/server/services/featureFlags.ts`

```typescript
// Lines 56-72
export async function getTenantFeatureFlag(
  flagName: string,
  tenantId: string
): Promise<boolean>
```

**Behavior**:
- Checks Redis key `feature-flag:{flagName}:{tenantId}`
- Falls back to global flag via `getFeatureFlag(flagName)`
- Returns boolean (default: false)

### 6. traceContext.ts

**Location**: `apps/web/server/services/traceContext.ts`

```typescript
// Lines 30-32
export function getTraceId(): string | undefined
```

**Returns**: Current traceId from AsyncLocalStorage, or undefined if not in traced context

**Related**:
```typescript
// Lines 20-22
export function runWithTrace<T>(traceId: string, userId: number | null, fn: () => T): T
```

**Usage Pattern**: Wraps entire request processing to propagate traceId through async chain

### 7. llmRoutesHandler.ts

**Location**: `apps/web/server/services/llmRoutesHandler.ts`

```typescript
// Lines 14-21
interface HandlerParams {
  model?: string;
  messages: Message[];
  userId: number;
  conversationId?: number;
  preferredProvider?: number;
  res: Response;
}
```

```typescript
// Lines 26-94
export async function handleChatWithRouter(params: HandlerParams): Promise<void>
```

**Flow**:
1. Line 28: Calls `resolveEnabledLlmModelId([model])`
2. Line 34-41: Calls `executeWithFallback()` from llmRouter
3. Lines 51-60: Calls `deductCreditsForModel()` from creditService

```typescript
// Lines 103-168
export async function handleStreamWithRouter(params: HandlerParams): Promise<void>
```

**Same flow but for streaming responses with SSE headers**

### 8. llmRoutes.ts

**Location**: `apps/web/server/_core/llmRoutes.ts`

**Key Finding**: This file imports and uses the handlers:
```typescript
// Line 18
import { handleChatWithRouter, handleStreamWithRouter } from "../services/llmRoutesHandler";

// Line 23
import { resolveEnabledLlmModelId } from "../services/enabledLlmModels";

// Line 20
import { getTraceId } from "../services/traceContext";
```

**Note**: Currently limited read (150 lines), but shows clear integration points

### 9. channelGateway.ts

**Location**: `apps/web/server/services/channelGateway.ts`

```typescript
// Line 43
import { resolveEnabledLlmModelId } from "./enabledLlmModels";

// Line 50
import { getTenantFeatureFlag } from "./featureFlags";
```

**Usage**:
- Line 43: Used to resolve LLM model for message processing
- Line 50: Used to check tenant-scoped feature flags (e.g., agency orchestrator)

### 10. enabledLlmModels.ts

**Location**: `apps/web/server/services/enabledLlmModels.ts`

```typescript
// Lines 58-80
export function resolveEnabledLlmModelIdFromRows(input: {
  rows: EnabledLlmModelRow[];
  preferredModelIds?: Array<string | null | undefined>;
}): string | null
```

**Logic**:
1. Prefers models matching `preferredModelIds` (in order)
2. Falls back to model matching `row.defaultModel`
3. Falls back to first model in input order

```typescript
// Lines 82-100+ (truncated)
export async function loadEnabledLlmModelRows(): Promise<EnabledLlmModelRow[]>
```

**Query**: Joins `modelProviderMap` + `llmProviders`, filters by `isEnabled=true`, orders by provider sort order + model priority

### 11. memoryService.ts

**Location**: `apps/web/server/services/memoryService.ts`

```typescript
// Line 22
import { resolveEnabledLlmModelId } from "./enabledLlmModels";
```

**Usage**: Line 37-49 shows `getModelContextLength(modelId)` which looks up context length from `modelProviderMap`

### 12. translation.ts (Router)

**Location**: `apps/web/server/routers/translation.ts`

```typescript
// Line 56
const model = await resolveEnabledLlmModelId([prefs.translationModel]);
```

**Pattern**: Resolves model from user preferences, then uses `getProviderForModel(model)` to get credentials

### 13. scheduler.ts (Service)

**Location**: `apps/web/server/services/scheduler.ts`

```typescript
// Line 24
import { resolveEnabledLlmModelId } from "./enabledLlmModels";

// Line 25
import { getProviderForModel } from "./llmRouter";
```

**Usage**:
- Line 24: Used in `deliverScheduledMessage()` to resolve model for scheduled LLM calls
- Line 25: Used to get provider credentials after model resolution

---

## Database Schema

### taskRuns Table

**Location**: `apps/web/drizzle/schema.ts:5017-5045`

**Current Columns**:
```typescript
export const taskRuns = pgTable("task_runs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id),
  taskType: varchar("taskType", { length: 32 }).notNull(),
  sourceType: varchar("sourceType", { length: 32 }).notNull(),
  status: taskRunStatusEnum("status").notNull().default("planned"),
  planJson: jsonb("planJson").notNull(),
  skillSlug: varchar("skillSlug", { length: 100 }),
  conversationId: integer("conversationId"),
  totalCreditsUsed: integer("totalCreditsUsed").default(0),
  artifactIntent: varchar("artifactIntent", { length: 32 }),
  executionRoute: varchar("executionRoute", { length: 32 }),
  routeReason: text("routeReason"),
  presentationDeckId: integer("presentationDeckId"),
  artifactMessageId: integer("artifactMessageId"),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// Indexes
index("task_runs_user_idx").on(t.userId),
index("task_runs_tenant_idx").on(t.tenantId),
index("task_runs_status_idx").on(t.status),
index("task_runs_created_idx").on(t.createdAt),
```

**MISSING COLUMN**: `traceId` (varchar, nullable) — required for section-01

**Type Inference**:
```typescript
export type TaskRun = typeof taskRuns.$inferSelect;
export type InsertTaskRun = typeof taskRuns.$inferInsert;
```

### taskStepAttempts Table

**Location**: `apps/web/drizzle/schema.ts:5050-5071`

```typescript
export const taskStepAttempts = pgTable("task_step_attempts", {
  id: serial("id").primaryKey(),
  taskRunId: integer("taskRunId").notNull().references(() => taskRuns.id, { onDelete: "cascade" }),
  attemptIndex: integer("attemptIndex").notNull().default(0),
  resolvedModelSnapshot: jsonb("resolvedModelSnapshot"),
  effectiveModel: varchar("effectiveModel", { length: 128 }),
  provider: varchar("provider", { length: 128 }),
  strategy: varchar("strategy", { length: 32 }),
  inputTokens: integer("inputTokens").default(0),
  outputTokens: integer("outputTokens").default(0),
  creditsUsed: integer("creditsUsed").default(0),
  costUsd: numeric("costUsd", { precision: 12, scale: 8 }).default("0"),
  durationMs: integer("durationMs"),
  status: stepAttemptStatusEnum("status").notNull().default("pending"),
  fallbackReason: text("fallbackReason"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// Indexes
index("task_step_attempts_run_idx").on(t.taskRunId),
index("task_step_attempts_model_idx").on(t.effectiveModel),
```

**Status Enum**: `"pending" | "running" | "completed" | "failed" | "skipped"`

---

## Integration Points by File

### Where resolveEnabledLlmModelId is Used

| File | Line | Context | Pattern |
|------|------|---------|---------|
| llmRoutesHandler.ts | 28 | handleChatWithRouter | `const effectiveModel = await resolveEnabledLlmModelId([model])` |
| llmRoutesHandler.ts | 105 | handleStreamWithRouter | Same as above |
| channelGateway.ts | 43 | Message ingestion | Resolve model for async message processing |
| memoryService.ts | 22 | Import | Used in context-length lookup |
| translation.ts (router) | 56 | translate mutation | `const model = await resolveEnabledLlmModelId([prefs.translationModel])` |
| scheduler.ts | 24 | Import | Used in scheduled message delivery |
| scheduledMessages.ts | 99 | Create schedule mutation | `await resolveEnabledLlmModelId([input.modelId])` |

### Where traceContext is Used

| File | Usage |
|------|-------|
| llmRoutes.ts | `import { getTraceId } from "../services/traceContext"` (line 20) |
| costTracker.ts | Traces cost transactions |
| auditLogger.ts | Logs events with traceId |

### Where taskRunStore Functions Are Called

**Currently NOT called in any existing code** — this is section-01's implementation responsibility.

---

## Key Implementation Constraints

### 1. Immutability Requirements

- `TaskExecutionPlan` is frozen after creation (Object.freeze)
- Plans stored as JSON in `planJson` column
- Cannot modify plan after creation — any runtime changes require new plan

### 2. Model Resolution is Two-Phase

1. **At plan time** (taskExecutionPlanner): Infer capability requirements from task type + policy
2. **At execution time** (modelResolver): Filter models by capability + strategy, pick best match

This allows plans to be durable (replayable) across model inventory changes.

### 3. Tenant-Scoped Features

- Feature flags support tenant overrides via `getTenantFeatureFlag(flagName, tenantId)`
- Not all features in taskRuns are tenant-scoped yet — verify requirements

### 4. AsyncLocalStorage Pattern

- `traceContext.ts` uses AsyncLocalStorage to propagate traceId without parameter threading
- All async operations within `runWithTrace()` block can access trace via `getTraceId()`
- Pattern is already established — section-01 should reuse it

### 5. Cost Tracking Separation

- `taskRunStore` is read-only for this phase
- Cost deduction happens in handlers (creditService)
- Cost logging happens in costTracker (not in taskRunStore)

---

## Migration Notes

### Required Schema Change

Add `traceId` column to `taskRuns` table:

```typescript
// In drizzle/schema.ts, taskRuns definition, add:
traceId: varchar("traceId", { length: 64 }).notNull(),
```

**Why varchar(64)?** UUID v4 is 36 chars, but hex traceIds can be longer. 64 is safe.

**Migration**:
1. Edit schema.ts to add column
2. Run `pnpm db:push` in apps/web/
3. New migrations will generate automatically

---

## Open Questions for Section 01 Implementation

1. **Tracing initiation point**: Where in the request pipeline should `runWithTrace()` be called? (entry point in llmRoutes.ts or earlier?)

2. **Plan versioning**: Should stored plans be migrated if CURRENT_PLAN_VERSION increases? (Currently version=1 always)

3. **Tenant context**: Should taskRunStore functions require tenantId as parameter, or pull from traceContext?

4. **Error handling**: Should taskRunStore errors bubble up, or be caught and logged?

5. **Backward compatibility**: How to handle requests WITHOUT a traceId (legacy code paths)?

6. **Feature flag naming**: What should be the name of the section-01 feature flag? (e.g., "SPEC_039_SECTION_01"?)

---

## File Paths Summary

**Core Services** (read-only for section-01):
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/taskExecutionPlanner.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/modelResolver.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/capabilityRegistry.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/traceContext.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/enabledLlmModels.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/featureFlags.ts`

**Write Layer** (section-01 will integrate with):
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/taskRunStore.ts`

**HTTP Handlers** (section-01 target for integration):
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRoutesHandler.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts`

**Database**:
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (lines 5017-5071)

**Integration Examples** (reference implementations):
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/translation.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts`
